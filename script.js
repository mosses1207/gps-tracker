// --- FAKE GOOGLE SCRIPT RUN (MOCKUP) ---
const google = {
  script: {
    run: {
      withSuccessHandler: function(callback) {
        this.callback = callback;
        return this;
      },
      withFailureHandler: function(failCallback) {
        this.failCallback = failCallback;
        return this;
      },
      // Simulasi Fungsi Ambil Data Tabel
      getData: function() {
        console.log("Mock: Mengambil data...");
        setTimeout(() => {
          const fakeData = [
            ["SJKB-001", "Dealer Jakarta", "2026-04-30T10:00:00", "2026-04-30T11:00:00"],
            ["SJKB-002", "Dealer Bekasi", "2026-04-30T12:00:00", "-"]
          ];
          this.callback(fakeData);
        }, 1000);
      },
      // Simulasi Fungsi OCR
      ocrViaDrive: function(base64) {
        console.log("Mock: Menjalankan OCR...");
        setTimeout(() => {
          this.callback({
            no_sjkb: "SJKB-MOCK-123",
            tujuan: "DEALER TOYOTA CIBUBUR",
            lt: "45",
            confidence: "HIGH",
            rute_options: ["encoded_polyline_1", "encoded_polyline_2"]
          });
        }, 2000);
      },
      // Simulasi Fungsi Mulai Jalan
      mulaiRecordSheet: function(no, tujuan, lat, lng, rute) {
        console.log("Mock: Memulai perjalanan...");
        setTimeout(() => {
          this.callback("Berhasil Record di Server (Fake)");
        }, 1500);
      },
      // Simulasi Fungsi Sampai
      updateSampaiSheet: function(no, path, lat, lng, speed) {
        console.log("Mock: Menyimpan data sampai...");
        setTimeout(() => {
          this.callback();
        }, 1500);
      }
    }
  }
};

///////////////////////////////////////////////


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
async function initSatpam() {
    const progressText = document.getElementById('load-progress');
    const loadingOverlay = document.getElementById('loading-satpam');

    if (!progressText || !loadingOverlay) {
        console.error("Elemen loading tidak ditemukan!");
        return;
    }

    try {
        console.log("Menghubungi Satpam...");
        // Gunakan parameter v5 terbaru
        worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'loading language traineddata' || m.status === 'loading tesseract core') {
                    const prog = Math.round(m.progress * 100);
                    progressText.innerText = `Sedang mengunduh ilmu: ${prog}%`;
                    console.log("Progress:", prog);
                }
            }
        });

        console.log("Satpam Standby!");
        loadingOverlay.style.display = 'none'; 
    } catch (e) {
        console.error("Satpam pingsan:", e);
        progressText.innerText = "Gagal memuat. Periksa koneksi internet.";
    }
}

// EKSEKUSI LANGSUNG
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
    const container = document.getElementById('camera-container');
    const video = document.getElementById('video');
    
    container.style.setProperty('display', 'block', 'important');
    isProcessing = false;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        await video.play();
        console.log("Kamera Aktif!");
        
        startValidasiProses();
    } catch (err) {
        console.error("Gagal kamera:", err);
        alert("Akses Kamera Gagal: " + err.message);
        container.style.display = 'none';
    }
}

// 4. Proses Scan (Mata Satpam)
function startValidasiProses() {
    const video = document.getElementById('video');
    const statusText = document.getElementById('scan-status');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (scanInterval) clearInterval(scanInterval);

    scanInterval = setInterval(async () => {
        if (!worker || isProcessing || video.paused) return;

        canvas.width = 640;
        canvas.height = 360;

        // FILTER TAJAM: Biar tulisan NVDC terlihat jelas
        ctx.filter = 'contrast(150%) grayscale(100%)';
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
            statusText.innerText = "🔍 Satpam sedang membaca...";
            const { data: { text } } = await worker.recognize(canvas);
            
            console.log("Hasil Baca:", text); 
            logicValidasiKamera(text);
        } catch (err) {
            console.error("OCR Gagal:", err);
        }
    }, 1500);
}

// 5. Logika Validasi (Keputusan Satpam)
function logicValidasiKamera(text) {
    const cleanText = text.toUpperCase().replace(/\s+/g, '');
    const statusText = document.getElementById('scan-status');

    // Kita cari kata NVDC atau TUJUAN
    if (cleanText.includes("NVDC") || cleanText.includes("TUJUAN")) {
        isProcessing = true;
        statusText.innerText = "✅ TARGET DITEMUKAN! MEMOTRET...";
        statusText.style.color = "#00ff00";
        
        if (navigator.vibrate) navigator.vibrate(200);
        
        setTimeout(() => ambilFotoFinal(), 800);
    } else {
        statusText.innerText = "🔍 Mencari NVDC / TUJUAN...";
        statusText.style.color = "white";
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
