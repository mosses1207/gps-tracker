// --- Inisialisasi Variabel Global ---
let worker;
let isProcessing = false;
let isLocked = false; // Flag biar nggak jepret berkali-kali dalam satu sesi
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
    
    if (isProcessing || container.style.display === 'none' || isLocked) return;
    isProcessing = true;

    if (!video.videoWidth) {
        setTimeout(startValidasiProses, 500);
        isProcessing = false;
        return;
    }

    const scanBox = document.getElementById('scan-box');
    const rect = scanBox.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();

    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    // Tetap ambil sesuai box hijau (biar user bebas bidiknya)
    const startX = (rect.left - videoRect.left) * scaleX;
    const startY = (rect.top - videoRect.top) * scaleY;
    const scanWidth = rect.width * scaleX;
    const scanHeight = rect.height * scaleY;

    processingCanvas.width = scanWidth;
    processingCanvas.height = scanHeight;
    processingContext.drawImage(video, startX, startY, scanWidth, scanHeight, 0, 0, scanWidth, scanHeight);

    // 🔥 STRATEGI: SUPER-RESOLUTION (UPSCALE 4X)
    // Teks kecil di SJKB butuh pixel yang banyak biar karakternya kebentuk sempurna.
    const scale = 4; 
    const tempOcrCanvas = document.createElement('canvas');
    tempOcrCanvas.width = scanWidth * scale;
    tempOcrCanvas.height = scanHeight * scale;
    const tempOcrCtx = tempOcrCanvas.getContext('2d');
    
    // Matikan smoothing biar pixel-nya tajam pas di-resize (Pixelated Look)
    tempOcrCtx.imageSmoothingEnabled = false;
    
    // Filter: Grayscale + Contrast Tinggi banget biar teks kecil "nendang" keluar
    tempOcrCtx.filter = 'grayscale(1) contrast(3) brightness(0.9)';
    tempOcrCtx.drawImage(processingCanvas, 0, 0, scanWidth * scale, scanHeight * scale);

    try {
        // Kita panggil recognize
        const result = await worker.recognize(tempOcrCanvas);
        
        // Ambil SEMUA teks yang berhasil dibaca (bukan cuma rawText)
        // Kita join semua baris teks yang ditemukan
        const allDetectedText = result.data.text.toUpperCase();
        
        logKeLayar("👁️ OCR Catch: " + allDetectedText.substring(0, 50).replace(/\n/g, " "));

        // --- VALIDASI GLOBAL ---
        // Kita cek keberadaan kata kunci di manapun posisinya dalam box hijau
        const hasNVDC = allDetectedText.includes("NVDC") || allDetectedText.includes("CIBITUNG");
        const hasForm = /SJKB|NO|TUJUAN|MOTOR/.test(allDetectedText);

        // Jika salah satu dari NVDC ketemu, atau kombinasi Form & Motor, langsung jepret
        if (hasNVDC && hasForm) {
            isLocked = true;
            logKeLayar("✅ TARGET VALID (Full Area)!");
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setTimeout(() =>  300); //ambilFotoFinal(video),
        } else {
            isProcessing = false;
            setTimeout(startValidasiProses, 400); 
        }
    } catch (err) {
        logKeLayar("‼️ OCR ERROR: " + err.message);
        isProcessing = false;
        setTimeout(startValidasiProses, 1000);
    }
}

function ambilFotoFinal(videoElement) {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = videoElement.videoWidth;
    finalCanvas.height = videoElement.videoHeight;
    const ctx = finalCanvas.getContext('2d');
    
    ctx.filter = 'none'; 
    ctx.drawImage(videoElement, 0, 0);
    
    const base64Image = finalCanvas.toDataURL('image/jpeg', 0.8);
    logKeLayar("📸 Foto Jernih Diambil!");
    
    closeCamera(); 
    uploadKeGemini(base64Image); 
}

async function uploadKeGemini(base64Data) {
    logKeLayar("🤖 AI sedang menganalisis...");
    const btnScan = document.getElementById('btnScanAction');
    if(btnScan) btnScan.disabled = true;

    const pureBase64 = base64Data.split(',')[1];
    
    try {
        const response = await fetch('https://api.anda.com/v1/analyze-sjkb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: pureBase64, timestamp: new Date().toISOString() })
        });

        const result = await response.json();
        if (result.success) {
            logKeLayar("✅ Berhasil: " + result.no_sjkb);
        } else {
            logKeLayar("❌ Gagal: " + result.message);
        }
    } catch (err) {
        logKeLayar("‼️ Error: " + err.message);
    } finally {
        setTimeout(() => {
            isLocked = false;
            isProcessing = false;
            if (btnScan) btnScan.disabled = false;
            logKeLayar("🔄 Sistem Standby...");
        }, 2000);
    }
}

function closeCamera() {
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    container.style.display = 'none';
    logKeLayar("🔴 Kamera Mati.");
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
