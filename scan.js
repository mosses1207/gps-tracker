// --- Inisialisasi Variabel Global ---
let worker;
let isProcessing = false;
const debugLog = true;

// Satu canvas permanen untuk proses OCR
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
        worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status.includes('loading')) {
                    const prog = Math.round(m.progress * 100);
                    progressText.innerText = `Mengunduh Data OCR (${prog}%)`;
                }
            },
            workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
        });

        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/- ',
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
    
    if (!worker) {
        alert("Sistem belum siap.");
        return;
    }

    container.style.display = 'block';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });

        video.srcObject = stream;
        video.oncanplay = async () => {
            await video.play();
            logKeLayar("Mencari Target...");
            startValidasiProses();
        };
    } catch (err) {
        alert("Kamera Error: " + err.message);
    }
}

async function startValidasiProses() {
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    
    if (isProcessing || container.style.display === 'none') return;
    isProcessing = true;

    if (!video.videoWidth) {
        setTimeout(startValidasiProses, 500);
        isProcessing = false;
        return;
    }

    // 🔥 AREA DIPERSEMPIT (lebih fokus ke teks)
    const scanWidth = video.videoWidth * 0.9;
    const scanHeight = video.videoHeight * 0.35;
    const startX = (video.videoWidth - scanWidth) / 2;
    const startY = (video.videoHeight - scanHeight) / 2;

    processingCanvas.width = scanWidth;
    processingCanvas.height = scanHeight;

    // 🔥 DELAY biar frame gak blur
    await new Promise(r => setTimeout(r, 250));

    // --- TAMPILAN NORMAL ---
    processingContext.filter = 'none'; 
    processingContext.drawImage(video, startX, startY, scanWidth, scanHeight, 0, 0, scanWidth, scanHeight);

    // --- OCR CANVAS ---
    const tempOcrCanvas = document.createElement('canvas');
    tempOcrCanvas.width = scanWidth;
    tempOcrCanvas.height = scanHeight;
    const tempOcrCtx = tempOcrCanvas.getContext('2d');

    // 🔥 FILTER DIPERKUAT
    tempOcrCtx.filter = 'grayscale(1) contrast(2.2) brightness(1.2)';
    tempOcrCtx.drawImage(processingCanvas, 0, 0);

    // 🔥 THRESHOLD (GAME CHANGER)
    const imageData = tempOcrCtx.getImageData(0, 0, tempOcrCanvas.width, tempOcrCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i+1] + data[i+2]) / 3;
        const val = avg > 150 ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = val;
    }

    tempOcrCtx.putImageData(imageData, 0, 0);

    try {
        const result = await worker.recognize(tempOcrCanvas); 
        const text = result.data.text.toUpperCase();
        const cleanText = text.replace(/[^A-Z0-9]/g, '');
        
        logKeLayar("Bidikan: " + text.substring(0, 20).trim()); 

        // 🔥 REGEX LEBIH KUAT (anti typo OCR)
        const isMatch = /M[O0]T[O0]R/.test(cleanText) &&
                        /(TUJUAN|TUJ|UAN|KET|PEN|PEM)/.test(cleanText);

        if (isMatch) {
            logKeLayar("✅ TARGET TERKUNCI!");
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setTimeout(() => ambilFotoFinal(video), 200);
        } else {
            isProcessing = false;
            setTimeout(startValidasiProses, 700); 
        }

    } catch (err) {
        logKeLayar("‼️ OCR ERROR: " + err.message);
        isProcessing = false;
        setTimeout(startValidasiProses, 1500);
    }
}
function ambilFotoFinal(videoElement) {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = videoElement.videoWidth;
    finalCanvas.height = videoElement.videoHeight;
    const ctx = finalCanvas.getContext('2d');
    
    // Matikan filter agar gambar tidak item/kontras (Natural)
    ctx.filter = 'none'; 
    ctx.drawImage(videoElement, 0, 0);
    
    const base64Image = finalCanvas.toDataURL('image/jpeg', 0.8);
    logKeLayar("📸 Foto jernih berhasil diambil!");
    
    closeCamera(); // Pastikan panggil ini agar titik hijau mati
    uploadKeGemini(base64Image); 
}


async function uploadKeGemini(base64Data) {
    logKeLayar("🤖 AI sedang menganalisis foto asli...");
    const btnScan = document.getElementById('btnScanAction');
    if(btnScan) btnScan.disabled = true;

    const pureBase64 = base64Data.split(',')[1];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch('https://api.anda.com/v1/analyze-sjkb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({ 
                image: pureBase64, 
                timestamp: new Date().toISOString() 
            })
        });

        clearTimeout(timeoutId);
        const result = await response.json();

        if (result.success) {
            logKeLayar("✅ Validasi Berhasil!");
            alert("SJKB Valid: " + result.no_sjkb);
        } else {
            logKeLayar("❌ Validasi Gagal: " + result.message);
            alert("Gagal: " + result.message);
        }
    } catch (err) {
        logKeLayar(err.name === 'AbortError' ? "‼️ Timeout (15 detik)" : "‼️ Error: " + err.message);
    } finally {
        // Beri jeda 2 detik agar sistem benar-benar bersih sebelum bisa scan lagi
        setTimeout(resetSistemScan, 2000);
    }
}

function resetSistemScan() {
    logKeLayar("🔄 Sistem Standby...");
    isProcessing = false; 
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
    
    //const debugView = document.getElementById('debug-canvas-view');
    //if (debugView) {
    //    debugView.getContext('2d').clearRect(0, 0, debugView.width, debugView.height);
    //}
}

function closeCamera() {
    isProcessing = false;
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    
    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    
    container.style.display = 'none';
    logKeLayar("🔴 Kamera dimatikan total.");
}

function logKeLayar(msg) {
    if (!debugLog) return;
    // Pakai querySelectorAll supaya semua elemen dengan ID debug-log dapet pesannya
    const logBoxes = document.querySelectorAll('#debug-log');
    if (logBoxes.length > 0) {
        logBoxes.forEach(box => {
            const newLog = document.createElement('div');
            newLog.style.borderBottom = "1px solid #333";
            newLog.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
            box.appendChild(newLog);
            box.scrollTop = box.scrollHeight;
        });
    }
}
