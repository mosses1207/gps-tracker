// --- Inisialisasi Variabel Global ---
let worker;
let isProcessing = false;
let isLocked = false;
const debugLog = true;

// Canvas utama
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

// --- INIT OCR ---
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
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            tessedit_pageseg_mode: '7'
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

// --- BUKA KAMERA ---
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

// --- LOOP OCR ---
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

    await new Promise(r => setTimeout(r, 250));

    processingContext.filter = 'none';
    processingContext.drawImage(video, startX, startY, scanWidth, scanHeight, 0, 0, scanWidth, scanHeight);

    // OCR canvas
    const scale = 2;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = scanWidth * scale;
    tempCanvas.height = scanHeight * scale;

    const ctx = tempCanvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.filter = 'grayscale(1) contrast(3) brightness(1.4)';
    ctx.drawImage(processingCanvas, 0, 0);

    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i+1] + data[i+2]) / 3;
        const val = avg > 130 ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = val;
    }

    ctx.putImageData(imageData, 0, 0);

    try {
        const result = await worker.recognize(tempCanvas);
        const text = result.data.text.toUpperCase();
        const cleanText = text.replace(/[^A-Z0-9]/g, '');

        logKeLayar("Bidikan: " + text.substring(0, 30).trim());

        const sjkbPattern = /NVD[C0]C[I1]B[A-Z0-9]{4,}/;
        const tujuanPattern = /(TUJUAN|TUJ|TUIUAN|TUJAN|UAN|KET|PEN|PEM)/;

        const hasSJKB = sjkbPattern.test(cleanText);
        const hasTujuan = tujuanPattern.test(cleanText);

        logKeLayar(`SJKB:${hasSJKB} | TUJUAN:${hasTujuan}`);

        const sjkbMatch = cleanText.match(sjkbPattern);
        const isMatch = sjkbMatch && sjkbMatch[0].length >= 10;

        if (isMatch && !isLocked) {
            isLocked = true;

            logKeLayar("✅ SJKB TERDETEKSI!");
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            setTimeout(() => ambilFotoFinal(video), 200);
            return;
        }

        isProcessing = false;
        setTimeout(startValidasiProses, 350);

    } catch (err) {
        logKeLayar("‼️ OCR ERROR: " + err.message);
        isProcessing = false;
        setTimeout(startValidasiProses, 1200);
    }
}

// --- AMBIL FOTO ---
function ambilFotoFinal(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0);

    const base64Image = canvas.toDataURL('image/jpeg', 0.8);

    logKeLayar("📸 Foto diambil!");

    closeCamera();
    uploadKeGemini(base64Image);
}

// --- API ---
async function uploadKeGemini(base64Data) {
    logKeLayar("🤖 AI menganalisis...");
    const btn = document.getElementById('btnScanAction');
    if (btn) btn.disabled = true;

    const pureBase64 = base64Data.split(',')[1];

    try {
        const res = await fetch('https://api.anda.com/v1/analyze-sjkb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: pureBase64 })
        });

        const result = await res.json();

        if (result.success) {
            alert("SJKB: " + result.no_sjkb);
        } else {
            alert("Gagal: " + result.message);
        }

    } catch (err) {
        logKeLayar("‼️ ERROR: " + err.message);
    } finally {
        setTimeout(resetSistemScan, 2000);
    }
}

// --- RESET ---
function resetSistemScan() {
    logKeLayar("🔄 Standby...");
    isProcessing = false;
    isLocked = false;

    const btn = document.getElementById('btnScanAction');
    if (btn) btn.disabled = false;
}

// --- TUTUP KAMERA ---
function closeCamera() {
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');

    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }

    container.style.display = 'none';
    logKeLayar("🔴 Kamera off");
}

// --- LOG ---
function logKeLayar(msg) {
    if (!debugLog) return;

    document.querySelectorAll('#debug-log').forEach(box => {
        const el = document.createElement('div');
        el.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
    });
}
