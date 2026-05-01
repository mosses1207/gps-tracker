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
    
    // Stop kalau sedang proses, kamera tutup, atau sudah terkunci
    if (isProcessing || container.style.display === 'none' || isLocked) return;
    isProcessing = true;

    if (!video.videoWidth) {
        setTimeout(startValidasiProses, 500);
        isProcessing = false;
        return;
    }

    // --- AMBIL AREA DARI KOTAK HIJAU ---
    const scanBox = document.getElementById('scan-box');
    const rect = scanBox.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();

    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    const startX = (rect.left - videoRect.left) * scaleX;
    const startY = (rect.top - videoRect.top) * scaleY;
    const scanWidth = rect.width * scaleX;
    const scanHeight = rect.height * scaleY;

    processingCanvas.width = scanWidth;
    processingCanvas.height = scanHeight;

    // --- CAPTURE ---
    processingContext.filter = 'none'; 
    processingContext.drawImage(video, startX, startY, scanWidth, scanHeight, 0, 0, scanWidth, scanHeight);

    // --- OCR CANVAS (UPSCALE 2X + OPTIMASI FILTER) ---
    const scale = 2;
    const tempOcrCanvas = document.createElement('canvas');
    tempOcrCanvas.width = scanWidth * scale;
    tempOcrCanvas.height = scanHeight * scale;
    const tempOcrCtx = tempOcrCanvas.getContext('2d');
    
    // 🔥 Pake kontras tinggi tapi jangan binarization manual (biar Tesseract yang olah)
    tempOcrCtx.filter = 'grayscale(1) contrast(2.5) brightness(1.2)';
    tempOcrCtx.drawImage(processingCanvas, 0, 0, scanWidth * scale, scanHeight * scale);

    try {
        const result = await worker.recognize(tempOcrCanvas);
        const rawText = result.data.text.toUpperCase() || "";
        
        // Log buat intip apa yang kebaca sama Tesseract
        logKeLayar("👁️ Scan: " + rawText.substring(0, 30).replace(/\n/g, " "));

        // --- LOGIKA VALIDASI FUZZY (GAMPANG NEMPEL) ---
        // Kita cari kata kunci tanpa hapus spasi/simbol dulu biar nggak nempel semua
        const hasSJKB  = /SJKB|NO\.|DOC/.test(rawText);
        const hasNVDC  = /NVDC|NVD|CIBITUNG|CIB/.test(rawText);
        const hasMotor = /MOTOR|MOT0R|M0TOR|M0T0R|ASTRA|TOYOTA/.test(rawText);

        // Syarat: Ada tulisan NVDC ATAU (ada Motor DAN SJKB)
        if (hasNVDC || (hasMotor && hasSJKB)) {
            isLocked = true; // Kunci agar tidak looping lagi
            logKeLayar("✅ TARGET TERKUNCI!");
            
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            
            // Jeda dikit biar user tau udah kekunci
            setTimeout(() => ambilFotoFinal(video), 300);
        } else {
            isProcessing = false;
            // Scan lagi dengan jeda tipis biar nggak nge-lag
            setTimeout(startValidasiProses, 300); 
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
