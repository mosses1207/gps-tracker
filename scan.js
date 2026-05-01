// --- Inisialisasi Variabel Global ---
let worker;
let isProcessing = false;
const debugLog = true; // Set false jika ingin mematikan log di layar nanti

// --- Gabungkan DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loading-satpam');
    if (loader) {
        loader.style.setProperty('display', 'flex', 'important');
        logKeLayar("Sistem dimulai...");
    }

    // Listener Tombol Scan
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) {
        btnScan.addEventListener('click', (e) => {
            e.preventDefault();
            logKeLayar("Membuka Kamera...");
            openScanner();
        });
    }

    // Jalankan Inisialisasi Tesseract
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

        // Pemanasan & Whitelist (Hanya Huruf, Angka, dan simbol SJKB)
        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/- ',
        });

        logKeLayar("Satpam Siap!");

        // Efek transisi tutup loading
        setTimeout(() => {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 500);
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
        video.muted = true;
        
        video.oncanplay = async () => {
            await video.play();
            logKeLayar("Mencari Target...");
            startValidasiProses(); // Mulai loop pendeteksian
        };
    } catch (err) {
        alert("Kamera Error: " + err.message);
    }
}

// Gunakan satu canvas permanen untuk menghemat memori
const processingCanvas = document.createElement('canvas');
const processingContext = processingCanvas.getContext('2d');

async function startValidasiProses() {
    // Stop jika proses sedang jalan atau kamera ditutup
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    if (isProcessing || container.style.display === 'none') return;
    
    isProcessing = true;

    if (!video.videoWidth) {
        setTimeout(startValidasiProses, 500);
        isProcessing = false;
        return;
    }

    processingCanvas.width = video.videoWidth;
    processingCanvas.height = video.videoHeight;

    // Filter untuk meningkatkan akurasi baca
    processingContext.filter = 'grayscale(1) contrast(1.5)';
    processingContext.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);

    try {
        const result = await worker.recognize(processingCanvas);
        const text = result.data.text.toUpperCase();
        
        logKeLayar("Read: " + text.substring(0, 25).replace(/\n/g, ' ')); 

        // Logika Validasi Utama
        if (text.includes("NVDC") || text.includes("SJKB") || text.includes("TUJUAN")) {
            logKeLayar("✅ TARGET DITEMUKAN!");
            if (navigator.vibrate) navigator.vibrate(200);
            
            // Beri jeda sebentar agar user tahu ada yang terdeteksi
            setTimeout(() => ambilFotoFinal(video), 300);
        } else {
            isProcessing = false;
            // Loop setiap 1 detik agar tidak panas
            setTimeout(startValidasiProses, 1000); 
        }
    } catch (err) {
        logKeLayar("‼️ OCR ERROR: " + err.message);
        isProcessing = false;
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
    
    // PANGGIL FUNGSI KIRIM KE AI
    uploadKeGemini(base64Image); 
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

// 7. Fungsi Kirim ke Gemini (AI Analysis)
async function uploadKeGemini(base64Data) {
    logKeLayar("🤖 AI sedang menganalisis foto...");
    
    // Hilangkan prefix "data:image/jpeg;base64,"
    const pureBase64 = base64Data.split(',')[1];

    try {
        // Contoh pemanggilan API (Ganti URL dengan endpoint backend Abang)
        const response = await fetch('https://api.anda.com/v1/analyze-sjkb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: pureBase64,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();

        if (result.success) {
            logKeLayar("✅ AI: Data SJKB Berhasil diverifikasi!");
            // Lanjut ke proses update sheet atau dashboard
        } else {
            logKeLayar("❌ AI: Data tidak valid. Coba foto lagi.");
        }
    } catch (err) {
        logKeLayar("‼️ API ERROR: " + err.message);
    }
}
