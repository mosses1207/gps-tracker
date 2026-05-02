// --- Inisialisasi Variabel Global ---
let worker;
let isProcessing = false;
let isLocked = false; // Flag biar nggak jepret berkali-kali dalam satu sesi
let isCameraActive = false;
const debugLog = true;
const processingCanvas = document.createElement('canvas');
const processingContext = processingCanvas.getContext('2d');
const ALLOWED_LOCATIONS = [
    { name: "Lokasi 1", lat: -6.449595660933786, lng: 107.00540022618232 },
    { name: "Lokasi 2", lat: -6.314941380764999, lng: 107.08465396420782 },
    { name: "Lokasi 3", lat: -6.35781170272672, lng: 107.25441893645797 },
    { name: "Lokasi 4", lat: -6.13823075256515, lng: 106.88354566724894 }
];
const MAX_RADIUS_KM = 1; // Radius 1 KM

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Jari-jari bumi dalam KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Hasilnya dalam KM
}

function isDriverInZone(userLat, userLng) {
    // Cari apakah ada salah satu lokasi di array yang jaraknya < 1 KM
    const nearbyLocation = ALLOWED_LOCATIONS.find(loc => {
        const distance = calculateDistance(userLat, userLng, loc.lat, loc.lng);
        return distance <= MAX_RADIUS_KM;
    });

    return nearbyLocation || null; // Balikin data lokasi kalau ketemu, atau null kalau jauh
}

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loading-satpam');
    if (loader) {
        loader.style.setProperty('display', 'flex', 'important');
        logKeLayar("Sistem dimulai...");
    }

    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) {
        btnScan.addEventListener('click', (e) => {
            e.preventDefault();
            isLocked = false; // Reset lock setiap kali tombol scan ditekan
            logKeLayar("Membuka Kamera...");
            openScanner();
        });
    }
    initSatpam();
});

async function initSatpam() {
    const progressText = document.getElementById('load-progress');
    const loadingOverlay = document.getElementById('loading-satpam');

    try {
        logKeLayar("Menyiapkan Tesseract...");

        worker = await Tesseract.createWorker('eng');

        progressText.innerText = "OCR Siap";

        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ',
            tessedit_pageseg_mode: '3'
        });

        logKeLayar("Satpam Siap!");

        setTimeout(() => {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
        }, 1000);

    } catch (e) {
        logKeLayar("‼️ GAGAL INIT: " + e.message);
        progressText.innerText = "Error Sistem. Cek Koneksi.";
    }
}

async function openScanner() {
    requestWakeLock().catch(err => console.error("WakeLock Error:", err)); 
    logKeLayar("Mengecek GPS..."); // Cek apakah log ini muncul?
    const video = document.getElementById('video');
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    const btnScan = document.getElementById('btnScanAction');

    if (currentPos.lat === 0 || currentPos.lng === 0) {
        alert("⚠️ GPS belum siap atau koordinat belum terbaca.");
        return;
    }
    const zone = isDriverInZone(currentPos.lat, currentPos.lng);
    if (!zone) {
        logKeLayar("❌ Akses Ditolak: Anda di luar radius 1 KM");
        alert("Harap mulai perjalanan dari lokasi tempat anda bekerja.");
        return;
    }

    if (isCameraActive) {
        logKeLayar("⚠️ Kamera masih aktif");
        return;
    }

    btnScan.disabled = true;
    document.getElementById('scan-status').innerText = "🔍 Scanning...";
    logKeLayar(`✅ Lokasi Terverifikasi: ${zone.name}`);
    
    isLocked = false;
    isProcessing = false;
    isCameraActive = true;

    if (!worker) {
        alert("Sistem belum siap.");
        const btnScan = document.getElementById('btnScanAction');
        if (btnScan) btnScan.disabled = false;
        return;
    }

    container.style.display = 'block';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });

        video.srcObject = stream;
        video.onloadeddata = null;
        video.onloadeddata = async () => {
            await video.play();
            logKeLayar("Mencari Target...");
            startValidasiProses();
        };

    } catch (err) {
    const btnScan = document.getElementById('btnScanAction');
    btnScan.disabled = false;
    isCameraActive = false;
    alert("Kamera Error: " + err.message);
    }
}

async function startValidasiProses() {

    if (!worker) {
        logKeLayar("⚠️ Worker belum siap");
        return;
    }

    const video = document.getElementById('video');

    if (isProcessing || !isCameraActive || isLocked) return;
    isProcessing = true;

    const scanBox = document.getElementById('scan-box');
    const rect = scanBox.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();

    // ✅ kalau video belum siap, jangan spam
    if (!video.videoWidth || !video.videoHeight || !videoRect.width || video.readyState < 2 ) {
        isProcessing = false;
        setTimeout(() => requestAnimationFrame(startValidasiProses), 300);
        return;
    }

    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    const startX = (rect.left - videoRect.left) * scaleX;
    const startY = (rect.top - videoRect.top) * scaleY;
    const scanWidth = rect.width * scaleX;
    const scanHeight = rect.height * scaleY;

    // 🔥 BALIKIN KE RESOLUSI FULL (ini penting)
    processingCanvas.width = scanWidth;
    processingCanvas.height = scanHeight;

    // 🔥 FILTER JANGAN TERLALU KERAS
    processingContext.filter = 'grayscale(1) contrast(1.2)';

    processingContext.drawImage(
        video,
        startX, startY, scanWidth, scanHeight,
        0, 0, scanWidth, scanHeight
    );

    try {
        const result = await worker.recognize(processingCanvas);
        const rawText = result.data.text
            .toUpperCase()
            .replace(/O/g, '0')
            .replace(/\s+/g, ' ');

        logKeLayar("👁️ Anchor: " + rawText.substring(0, 30));

        const hasToyota = /TOYOTA|T0YOTA|TOY0TA|T0Y0TA/.test(rawText);
        const hasAstra  = /ASTRA/.test(rawText);
        const hasMotor  = /M0T0R|MOTOR|M0TOR|MOT0R/.test(rawText);

        if (hasToyota && hasAstra && hasMotor) {
            isLocked = true;
            showLoading("Mengambil gambar...");
            document.getElementById('scan-status').innerText = "🎯 MATCH! CAPTURING...";

            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

setTimeout(() => {
    const fullCanvas = document.createElement('canvas');
    const MAX_WIDTH = 1280; 
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
    }

    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d');

    // 🔥 STEP 1: Filter Standar (Tanpa Grayscale biar detail warna tetap ada)
    fullCtx.filter = 'contrast(1.4) brightness(1.1)';
    fullCtx.drawImage(video, 0, 0, width, height);

    // 🔥 STEP 2: Cek Kondisi Awal (JPEG 0.9)
    let finalBlob = fullCanvas.toDataURL('image/jpeg', 0.9);
    let currentLength = finalBlob.length;

    logKeLayar(`Cek awal: ${currentLength} karakter`);

    // 🔥 STEP 3: Logika Keputusan (Anti-Burik)
    if (currentLength < 70000) {
        // KONDISI: Gambar terlalu enteng/pecah/burik
        // KEPUTUSAN: Jangan dikompres, kirim format PNG (Lossless)
        finalBlob = fullCanvas.toDataURL('image/png');
        logKeLayar("⚠️ Burik Terdeteksi! Force PNG (Detail Maksimal)");
    } 
    else if (currentLength > 300000) {
        // KONDISI: Gambar terlalu raksasa (bisa bikin GAS timeout)
        // KEPUTUSAN: Kompres dikit ke 0.7
        finalBlob = fullCanvas.toDataURL('image/jpeg', 0.7);
        logKeLayar("⚡ Kegedean! Kompres ke JPEG 0.7");
    }
    else {
        // KONDISI: Ukuran sudah pas (70k - 500k)
        logKeLayar("✅ Ukuran Ideal, kirim JPEG 0.9");
    }

    // 🔥 STEP 4: Kirim!
    closeCamera();
    uploadKeGemini(finalBlob);
    logKeLayar("🚀 Final Payload: " + finalBlob.length + " karakter");
    
}, 300);
        }

    } catch (err) {
        logKeLayar("OCR error: " + err.message);
    } finally {
        if (!isLocked && isCameraActive) {
            isProcessing = false;

            // 🔥 DELAY BALANCE (cepet tapi gak brutal)
            setTimeout(() => requestAnimationFrame(startValidasiProses), 800);
        }
    }
}

async function uploadKeGemini(base64Data) {
    showLoading(" membaca data...");
    logKeLayar("🚀 Mengirim ke Gemini via GAS...");
    
    document.getElementById('no_sjkb').value = "Loading...";
    document.getElementById('tujuan_dealer').value = "Loading...";

    const pureBase64 = base64Data.split(',')[1];
    const gasUrl = "https://script.google.com/macros/s/AKfycbzJqgr_NoIACivq5IWwPyFKVFKmYgaTBkFjNwymBA7mPRC0vVKn8UN9mVPZZERPjZzr/exec";

    try {
        const response = await fetch(gasUrl, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain", // 🔥 FIX DISINI
            },
            body: JSON.stringify({ image: pureBase64 })
        });

        const result = await response.json();

    if (result.success) {
        logKeLayar("✅ Data diterima dari GAS");

        document.getElementById('no_sjkb').value = result.no_sjkb || "-";
        document.getElementById('tujuan_dealer').value = result.tujuan || "-";
        const deliveryData = await fetchSpreadsheetData(result.tujuan);

        if (deliveryData) {
            console.log("FINAL DATA:", deliveryData);
            logKeLayar("🚚 Data siap dipakai");
            updateRuteUI();
            logKeLayar(JSON.stringify(window.deliveryData));
        }

    } else {
        logKeLayar("❌ Gagal: " + result.error);
    }

        } catch (err) {
            logKeLayar("‼️ Fetch Error: " + err.message);
            console.error(err);
    }finally {
    setTimeout(() => {
        isProcessing = false;
        isLocked = false;
        logKeLayar("✅ Selesai. Siap scan lagi.");
        hideLoading();
        }, 1000);
    }
}

function isiHasilScan(data) {
    const inputSJKB = document.getElementById('no_sjkb');
    const inputTujuan = document.getElementById('tujuan_dealer');

    if (inputSJKB) inputSJKB.value = data.no_sjkb || "";
    if (inputTujuan) inputTujuan.value = data.tujuan || "";

    logKeLayar("✅ Input terisi otomatis");
}

function closeCamera() {
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');

    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }

    // 🔥 HARD RESET
    isProcessing = false;
    isLocked = false;
    isCameraActive = false;

    container.style.display = 'none';

    logKeLayar("🔴 Kamera Mati Total.");
}

function logKeLayar(msg) {
    const logDiv = document.getElementById('debug-log');
    if (!logDiv) return;

    const entry = document.createElement('div');
    const waktu = new Date().toLocaleTimeString('id-ID', { hour12: false });
    entry.innerText = `> [${waktu}] ${msg}`;
    
    logDiv.appendChild(entry);

    // AUTO SCROLL: Otomatis geser ke baris paling baru
    logDiv.scrollTop = logDiv.scrollHeight;
}

function showLoading(text = "Memproses...") {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');

    textEl.innerText = text;
    overlay.style.display = 'flex';

    // 🔥 KUNCI SCROLL
    document.body.style.overflow = 'hidden';
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'none';

    // 🔥 BALIKIN SCROLL
    document.body.style.overflow = '';
}

async function fetchSpreadsheetData(tujuanGemini) {
    if (!currentPos || !currentPos.lat || !currentPos.lng) {
        logKeLayar("⚠️ GPS belum tersedia");
        return null;
    }

    const zone = isDriverInZone(currentPos.lat, currentPos.lng);
    const lokasiSheet = zone ? zone.name.replace("Lokasi ", "") : "1";

    const tujuanClean = (tujuanGemini || "")
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, "")
        .trim();

    logKeLayar(`🚀 REQ | tujuan: ${tujuanClean} | lokasi: ${lokasiSheet}`);

    try {
        const response = await fetch("https://script.google.com/macros/s/AKfycbxwMg2ne9r7ViTTppPhV5qPrb-S35kQf_xEH_R7VZllP_uuTiwV6TM-p7vyw8gME1zn/exec", {
            method: "POST",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                tujuan: tujuanClean,
                lokasi: lokasiSheet
            })
        });

        logKeLayar(`📡 STATUS: ${response.status}`);

        const text = await response.text();

        // 🔥 potong biar ga kepanjangan di UI
        const shortText = text.length > 100 ? text.substring(0, 500) + "..." : text;
        logKeLayar(`📦 RAW: ${shortText}`);

        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            logKeLayar("❌ JSON PARSE ERROR");
            return null;
        }

        if (result.success) {
            logKeLayar(`✅ SUCCESS | ${result.data.nama}`);
            logKeLayar(` ${result.data.nama}`);
            logKeLayar(` ${result.data.durasi}`);
            logKeLayar(` ${result.data.koordinat}`);
            logKeLayar(` ${result.data.jarak}`);
            logKeLayar(` ${result.data.rute}`);

            window.deliveryData = result.data;
            return result.data;

        } else {
            logKeLayar(`❌ GAS ERROR: ${result.error}`);
            return null;
        }

    } catch (err) {
        logKeLayar(`‼️ FETCH ERROR: ${err.message}`);
        return null;
    }
}

function updateRuteUI() {
    const container = document.getElementById('ruteButtons');
    const area = document.getElementById('ruteSelectionArea');
    
    if (!container || !area || !window.deliveryData) return;

    container.innerHTML = ''; 

    // Ambil data rute dari properti yang ada di log gambar
    let ruteList = window.deliveryData.polylines || window.deliveryData.rute;

    // Pastikan ruteList adalah array. Jika string tunggal, bungkus jadi array.
    if (typeof ruteList === 'string') {
        ruteList = [ruteList];
    }

    if (Array.isArray(ruteList) && ruteList.length > 0) {
        logKeLayar(`✨ Menampilkan ${ruteList.length} opsi rute`);
        area.style.display = 'block'; 

        ruteList.forEach((poly, index) => {
            // Pastikan data poly tidak kosong/null
            if (!poly) return;

            const btn = document.createElement('button');
            btn.innerText = `Rute ${index + 1}`;
            btn.className = "btn-rute"; 

            btn.onclick = () => {
                document.querySelectorAll('.btn-rute').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (typeof drawRouteOnMap === "function") {
                    drawRouteOnMap(poly);
                } else {
                    logKeLayar("⚠️ Fungsi drawRouteOnMap belum ada");
                }
            };
            container.appendChild(btn);
        });

        // Klik otomatis rute pertama
        if (container.firstChild) container.firstChild.click();

    } else {
        logKeLayar("⚠️ Data rute tidak ditemukan atau kosong");
        area.style.display = 'none';
    }
}
