// --- Inisialisasi Variabel Global ---
let worker;
let isProcessing = false;
let isLocked = false; // Flag biar nggak jepret berkali-kali dalam satu sesi
let isCameraActive = false;
const debugLog = true;

const processingCanvas = document.createElement('canvas');
const processingContext = processingCanvas.getContext('2d');

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
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    
    if (isCameraActive) {
        logKeLayar("⚠️ Kamera masih aktif");
        return;
    }
    const btnScan = document.getElementById('btnScanAction');
    btnScan.disabled = true;
    document.getElementById('scan-status').innerText = "🔍 Scanning...";
    
    // 🔥 RESET TOTAL
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
    const MAX_WIDTH = 800; 
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
    }

    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d');

    // 1. Set filter DULU sebelum drawImage
    fullCtx.filter = 'grayscale(1) contrast(1.3) brightness(1.1)';
    
    // 2. Gambar ke canvas
    fullCtx.drawImage(video, 0, 0, width, height);
    
    // 3. (Opsional) Re-apply filter untuk memastikan browser lama juga nurut
    // Kalau mau sangat ekstrim kecilnya, bisa turunkan kualitas ke 0.4
    const finalBlob = fullCanvas.toDataURL('image/jpeg', 0.4);

    closeCamera();
    uploadKeGemini(finalBlob);
    logKeLayar("Ukuran Base64 (karakter):", finalBlob.length);
    
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
        } else {
            logKeLayar("❌ Gagal: " + result.error);
        }

    } catch (err) {
        logKeLayar("‼️ Fetch Error: " + err.message);
        console.error(err);
    } finally {
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
    if (!debugLog) return;
    const logBoxes = document.querySelectorAll('#debug-log');
    logBoxes.forEach(box => {
        const div = document.createElement('div');
        div.style.borderBottom = "1px solid #333";
        div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    });
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
