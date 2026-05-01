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
        // Pastikan overlay muncul di awal
        loadingOverlay.style.display = 'flex';
        progressText.innerText = "Menghubungi Satpam (0%)";

        // Inisialisasi Tesseract v5
        worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'loading eng.traineddata' || m.status === 'loading tesseract core') {
                    const prog = Math.round(m.progress * 100);
                    progressText.innerText = `Mengunduh Ilmu OCR (${prog}%)`;
                    // Update progress bar jika ada
                    if (prog === 100) progressText.innerText = "Menyusun Data...";
                }
            },
            workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
        });

        // TANDA BAHWA PROSES SELESAI
        console.log("Satpam Ready!");
        
        // Kasih jeda sedikit biar smooth
        setTimeout(() => {
            loadingOverlay.style.opacity = '0'; // Efek fade out
            setTimeout(() => {
                loadingOverlay.style.display = 'none'; // Benar-benar hilang
            }, 500);
        }, 1000);

    } catch (e) {
        console.error("Gagal init Tesseract:", e);
        progressText.innerText = "Gagal memuat sistem. Cek koneksi internet.";
        progressText.style.color = "red";
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
function startValidasiProses() {
    const video = document.getElementById('video');
    const statusText = document.getElementById('scan-status');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (scanInterval) clearInterval(scanInterval);

    scanInterval = setInterval(async () => {
        // CEK 1: Apakah worker sudah ada?
        // CEK 2: Apakah video sudah siap datanya? (HAVE_ENOUGH_DATA = 4)
        if (!worker || isProcessing || video.readyState !== 4) return;

        isProcessing = true; // Kunci biar tidak numpuk prosesnya

        // Samakan ukuran canvas dengan video asli
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Gambar frame dari video ke canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
            statusText.innerText = "🔍 Mencoba membaca teks...";
            
            // Lakukan OCR
            const { data: { text } } = await worker.recognize(canvas);
            
            console.log("Hasil OCR:", text);
            logicValidasiKamera(text);
        } catch (err) {
            console.error("Proses OCR Error:", err);
        } finally {
            isProcessing = false; // Buka kunci setelah selesai (berhasil/gagal)
        }
    }, 1500); // Interval 1.5 detik
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
function ambilFotoFinal() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);
    console.log("Foto sukses diambil!");
    
    closeCamera();
    // Panggil fungsi Gemini Abang di sini
    // panggilGeminiAPI(base64Image);
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
