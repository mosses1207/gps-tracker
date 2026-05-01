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

    const scanWidth = video.videoWidth * 0.7;
    const scanHeight = video.videoHeight * 0.2;
    const startX = (video.videoWidth - scanWidth) / 2;
    const startY = (video.videoHeight - scanHeight) / 2;

    processingCanvas.width = scanWidth;
    processingCanvas.height = scanHeight;

    // --- DEBUG VIEW ---
    let debugView = document.getElementById('debug-canvas-view');
    if (!debugView) {
        processingCanvas.id = 'debug-canvas-view';
        processingCanvas.style.cssText = `position:fixed;top:10px;left:10px;z-index:9999;border:2px solid red;width:150px;background:black;pointer-events:none;`;
        document.body.appendChild(processingCanvas);
    }

    processingContext.filter = 'grayscale(1) contrast(2) brightness(1.1)';
    processingContext.drawImage(video, startX, startY, scanWidth, scanHeight, 0, 0, scanWidth, scanHeight);

    try {
        const result = await worker.recognize(processingCanvas);
        const text = result.data.text.toUpperCase();
        const cleanText = text.replace(/[^A-Z0-9]/g, '');
        
        logKeLayar("Bidikan: " + text.substring(0, 15).trim()); 

        const isMatch = cleanText.includes("NVDC") || cleanText.includes("SJKB") || 
                        cleanText.includes("TUJUAN") || cleanText.includes("TOYOTA");

        if (isMatch) {
            logKeLayar("✅ TARGET TERKUNCI!");
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setTimeout(() => ambilFotoFinal(video), 200);
        } else {
            isProcessing = false;
            setTimeout(startValidasiProses, 800); 
        }
    } catch (err) {
        logKeLayar("‼️ OCR ERROR: " + err.message);
        isProcessing = false;
        setTimeout(startValidasiProses, 2000);
    }
}

function ambilFotoFinal(videoElement) {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = videoElement.videoWidth;
    finalCanvas.height = videoElement.videoHeight;
    finalCanvas.getContext('2d').drawImage(videoElement, 0, 0);
    
    const base64Image = finalCanvas.toDataURL('image/jpeg', 0.8);
    logKeLayar("📸 Foto Disimpan!");
    
    closeCamera();
    uploadKeGemini(base64Image); 
}

async function uploadKeGemini(base64Data) {
    logKeLayar("🤖 AI sedang menganalisis...");
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
            body: JSON.stringify({ image: pureBase64, timestamp: new Date().toISOString() })
        });

        clearTimeout(timeoutId);
        const result = await response.json();

        if (result.success) {
            logKeLayar("✅ AI Valid: " + result.no_sjkb);
            alert("Berhasil Verifikasi: " + result.no_sjkb);
        } else {
            logKeLayar("❌ AI Gagal: " + result.message);
            alert("Gagal: " + result.message);
        }
    } catch (err) {
        logKeLayar(err.name === 'AbortError' ? "‼️ Timeout" : "‼️ API Error: " + err.message);
    } finally {
        // Reset sistem setelah jeda 2 detik agar siap scan dokumen berikutnya
        setTimeout(resetSistemScan, 2000);
    }
}

function resetSistemScan() {
    logKeLayar("🔄 Sistem Standby...");
    isProcessing = false; 
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
    
    const debugView = document.getElementById('debug-canvas-view');
    if (debugView) {
        debugView.getContext('2d').clearRect(0, 0, debugView.width, debugView.height);
    }
}

function closeCamera() {
    isProcessing = false;
    const video = document.getElementById('video');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    document.getElementById('camera-container').style.display = 'none';
}

function logKeLayar(msg) {
    if (!debugLog) return;
    const logBox = document.getElementById('debug-log');
    if (logBox) {
        const newLog = document.createElement('div');
        newLog.style.borderBottom = "1px solid #333";
        newLog.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logBox.appendChild(newLog);
        logBox.scrollTop = logBox.scrollHeight;
    }
}
