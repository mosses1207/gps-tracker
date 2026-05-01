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
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    if (isProcessing || container.style.display === 'none') return;
    
    isProcessing = true;

    if (!video.videoWidth) {
        setTimeout(startValidasiProses, 500);
        isProcessing = false;
        return;
    }

    // 1. Tentukan area kotak hijau (misal: di tengah layar, ambil 60% lebar & 40% tinggi)

    const scanWidth = video.videoWidth * 0.9;   // Hampir full lebar
    const scanHeight = video.videoHeight * 0.5;  // Ambil setengah tinggi layar
    const startX = (video.videoWidth - scanWidth) / 2;
    const startY = (video.videoHeight - scanHeight) / 2;

    processingCanvas.width = scanWidth;
    processingCanvas.height = scanHeight;

    // 2. Crop gambar: drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
    processingContext.filter = 'grayscale(1) contrast(1.8) brightness(1.2)';
    processingContext.drawImage(
        video, 
        startX, startY, scanWidth, scanHeight, // Sumber (Crop)
        0, 0, scanWidth, scanHeight            // Hasil di canvas
    );

    try {
        // 3. Scan area kecil saja (Jauh lebih cepat!)
        const result = await worker.recognize(processingCanvas);
        const text = result.data.text.toUpperCase();
        
        // Bersihkan teks dari spasi berlebih untuk pencarian
        const cleanText = text.replace(/\s+/g, '');
        logKeLayar("Scan Area: " + text.substring(0, 20)); 

        // 4. Logika cek: Gunakan regex atau includes yang lebih fleksibel
        if (cleanText.includes("NVDC") || cleanText.includes("SJKB") || cleanText.includes("TUJUAN")) {
            logKeLayar("✅ TARGET MATCH!");
            if (navigator.vibrate) navigator.vibrate(200);
            setTimeout(() => ambilFotoFinal(video), 300);
        } else {
            isProcessing = false;
            // Interval dipercepat ke 500ms karena area scan sudah kecil (ringan)
            setTimeout(startValidasiProses, 500); 
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
    const statusBox = document.getElementById('scan-status'); // Jika ada element status
    logKeLayar("🤖 AI sedang menganalisis foto...");
    
    // 1. Matikan tombol agar tidak double-click
    const btnScan = document.getElementById('btnScanAction');
    if(btnScan) btnScan.disabled = true;

    const pureBase64 = base64Data.split(',')[1];

    // 2. Setup Timeout (Batal otomatis jika > 15 detik tidak ada respon)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch('https://api.anda.com/v1/analyze-sjkb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal, // Pasang signal timeout
            body: JSON.stringify({
                image: pureBase64,
                timestamp: new Date().toISOString()
            })
        });

        clearTimeout(timeoutId); // Hapus timer jika respon datang tepat waktu
        const result = await response.json();

        if (result.success) {
            logKeLayar("✅ AI: SJKB " + (result.no_sjkb || "") + " Valid!");
            // Panggil fungsi sukses (misal: refresh dashboard atau tutup modal)
            alert("Berhasil Verifikasi: " + result.no_sjkb);
        } else {
            logKeLayar("❌ AI: " + (result.message || "Data tidak valid"));
            alert("Gagal: " + result.message);
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            logKeLayar("‼️ ERROR: Koneksi Lemot (Timeout)");
        } else {
            logKeLayar("‼️ API ERROR: " + err.message);
        }
    } finally {
        // 3. Nyalakan kembali tombol setelah selesai (baik sukses/gagal)
        if(btnScan) btnScan.disabled = false;
        isProcessing = false; // Reset flag agar bisa scan lagi jika gagal
    }
}
