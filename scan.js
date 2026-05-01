// Paksa munculin loading begitu script dibaca
document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loading-satpam');
    if(loader) {
        loader.style.setProperty('display', 'flex', 'important');
        console.log("Loading Screen dipaksa muncul!");
    }
});

let worker;
let scanInterval;
let isProcessing = false;

// 1. Inisialisasi Satpam (Langsung jalan begitu script keload)
console.log("Script dimuat, memulai initSatpam...");
async function initSatpam() {
    const progressText = document.getElementById('load-progress');
    const loadingOverlay = document.getElementById('loading-satpam');

    try {
        logKeLayar("Memulai inisialisasi worker...");
        loadingOverlay.style.display = 'flex';

        // Inisialisasi Tesseract v5
        worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'loading eng.traineddata' || m.status === 'loading tesseract core') {
                    const prog = Math.round(m.progress * 100);
                    progressText.innerText = `Mengunduh Ilmu OCR (${prog}%)`;
                    if (prog === 100) progressText.innerText = "Menyusun Data...";
                }
            },
            workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
        });

        // --- PENTING: PROSES PEMANASAN ---
        logKeLayar("Melakukan pemanasan sistem...");
        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/- ',
        });
        logKeLayar("Satpam Ready!");
        // ---------------------------------

        setTimeout(() => {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 500);
        }, 1000);

    } catch (e) {
        logKeLayar("‼️ GAGAL INIT: " + e.message);
        progressText.innerText = "Gagal memuat sistem. Cek koneksi internet.";
    }
}

// Panggil fungsi inisialisasi
initSatpam();

// 2. Event Listener Tombol (Cukup satu di sini)
document.addEventListener('DOMContentLoaded', () => {
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) {
        btnScan.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Tombol Foto diklik, memanggil kamera...");
            openScanner(e);
        });
    }
});

// 3. Fungsi Buka Kamera
async function openScanner(e) {
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    
    // Pastikan worker sudah ada sebelum buka kamera
    if (!worker) {
        alert("Sistem OCR belum siap. Tunggu loading selesai.");
        return;
    }

    container.style.display = 'block';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });

        video.srcObject = stream;
        video.muted = true;
        
        // Gunakan event 'canplay' daripada langsung play()
        video.oncanplay = async () => {
            try {
                await video.play();
                startValidasiProses();
            } catch (pErr) {
                console.log("Play interrupted: ", pErr);
            }
        };
    } catch (err) {
        alert("Kamera Error: " + err.message);
    }
}

// 4. Proses Scan (Mata Satpam)
async function startValidasiProses() {
    if (isProcessing) return;
    isProcessing = true;
    
    const video = document.getElementById('video');
    if (!video.videoWidth) {
        // Video belum siap, tunggu sebentar
        setTimeout(startValidasiProses, 500);
        isProcessing = false;
        return;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Pakai resolusi video asli
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // TRIK: Kasih filter sedikit agar teks lebih hitam putih (Grayscale & Contrast)
    context.filter = 'grayscale(1) contrast(1.5)';
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
        logKeLayar("Sedang membaca teks...");
        
        // recognize() butuh waktu, log ini untuk memastikan dia tidak hang
        const result = await worker.recognize(canvas);
        const text = result.data.text;
        
        logKeLayar("Hasil: " + text.substring(0, 30).replace(/\n/g, ' ')); 

        // Logika pencarian kode
        const txt = text.toUpperCase();
        if (txt.includes("NVDC") || txt.includes("SJKB") || txt.includes("TUJUAN")) {
            logKeLayar("✅ TARGET TERDETEKSI!");
            if (navigator.vibrate) navigator.vibrate(200);
            
            // Ambil foto final tanpa filter untuk dikirim ke API
            ambilFotoFinal(video); 
        } else {
            // Jika tidak ketemu, ulangi lagi
            isProcessing = false;
            setTimeout(startValidasiProses, 1000); 
        }
    } catch (err) {
        logKeLayar("‼️ OCR ERROR: " + err.message);
        isProcessing = false;
        // Jika error berat, coba re-init atau stop
    }
}

// 5. Logika Validasi (Keputusan Satpam)
function logicValidasiKamera(text) {
    const statusText = document.getElementById('scan-status');
    const txt = text.toUpperCase();

    // Cari kata kunci secara parsial
    if (txt.includes("NVDC") || txt.includes("TUJUAN") || txt.includes("SJKB")) {
        console.log("Target Ditemukan!");
        statusText.innerText = "✅ TERDETEKSI! MENGAMBIL FOTO...";
        statusText.style.color = "#00ff00";

        if (navigator.vibrate) navigator.vibrate(200);
        
        // Hentikan interval agar tidak foto berkali-kali
        clearInterval(scanInterval);
        setTimeout(() => ambilFotoFinal(), 500);
    }
}

// 6. Jepret Foto Final
function ambilFotoFinal(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    // Foto final bersih tanpa filter debug
    canvas.getContext('2d').drawImage(videoElement, 0, 0);
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);
    logKeLayar("📸 Foto sukses diambil!");
    
    // Matikan kamera sebelum lanjut ke proses berikutnya
    closeCamera();
    
    // Tampilkan alert atau lanjut ke fungsi berikutnya
    alert("Berhasil mendeteksi SJKB. Mengirim data...");
}

function closeCamera() {
    isProcessing = false;
    if (scanInterval) clearInterval(scanInterval);
    const video = document.getElementById('video');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    document.getElementById('camera-container').style.display = 'none';
}

function logKeLayar(msg) {
    const logBox = document.getElementById('debug-log');
    if (logBox) {
        const newLog = document.createElement('div');
        newLog.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logBox.appendChild(newLog);
        // Otomatis scroll ke paling bawah
        logBox.scrollTop = logBox.scrollHeight;
    }
}
