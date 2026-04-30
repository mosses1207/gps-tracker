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

// Inisialisasi Tesseract (Satpam)
const worker = Tesseract.createWorker();
(async () => {
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    console.log("Satpam Galak Siap Tugas!");
})();

const KEYWORD_UNIT = "NVDC";
let scanInterval;
let isProcessing = false;

// 1. Fungsi Buka Kamera
async function openScanner(e) {
    if (e) e.preventDefault();
    console.log("Mencoba mengakses kamera..."); // Cek ini muncul gak di Console nanti

    const container = document.getElementById('camera-container');
    const video = document.getElementById('video');

    if (!container || !video) {
        console.error("Elemen kamera tidak ditemukan di HTML!");
        return;
    }

    container.style.display = 'block';
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        console.log("Izin diberikan, stream aktif!");
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        await video.play();
        startValidasiProses();
    } catch (err) {
        console.error("Error Detail:", err.name, err.message);
        
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            alert("Akses kamera ditolak. Silakan klik ikon gembok di sebelah alamat web untuk mengizinkan.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            alert("Kamera tidak ditemukan di perangkat ini.");
        } else {
            alert("Terjadi kesalahan: " + err.message);
        }
        container.style.display = 'none';
    }
}

// 2. Mesin Scanner
function startValidasiProses() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Hapus interval lama jika ada
    if (scanInterval) clearInterval(scanInterval);

    scanInterval = setInterval(async () => {
        if (video.paused || video.ended || isProcessing) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
            const { data: { text } } = await worker.recognize(canvas);
            logicValidasiKamera(text);
        } catch (e) { console.error("OCR Error:", e); }
    }, 1000);
}

// 3. Logika Satpam Galak
async function logicValidasiKamera(text) {
    const statusText = document.getElementById('scan-status');
    const btnCapture = document.getElementById('btnCapture');
    const cleanText = text.replace(/\s+/g, ''); 

    const hasNVDC = cleanText.toUpperCase().includes(KEYWORD_UNIT);
    const hasTujuan = text.toLowerCase().includes("tujuan");
    const sjkbPattern = /[A-Z0-9]{24}/g; 
    const matchSJKB = cleanText.match(sjkbPattern);

    if (hasNVDC && hasTujuan && matchSJKB && !isProcessing) {
        isProcessing = true; 
        statusText.innerText = "✅ VALID! Mengambil Foto...";
        statusText.style.color = "#00ff00";
        btnCapture.style.background = "#00ff00";
        
        if (navigator.vibrate) navigator.vibrate(200);

        setTimeout(() => {
            ambilFotoFinal();
        }, 500);
    } else if (!isProcessing) {
        statusText.innerText = "🔍 Mencari NVDC, Tujuan & 24 Digit...";
        statusText.style.color = "#ffffff";
    }
}

// 4. Jepret
function ambilFotoFinal() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);
    console.log("Foto diambil!");
    
    closeCamera();
    // Di sini nanti panggil panggilGeminiAPI(base64Image);
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

// Taruh ini di paling bawah script.js Abang
document.addEventListener('DOMContentLoaded', () => {
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) {
        btnScan.addEventListener('click', (e) => {
            console.log("Tombol Foto diklik lewat Listener!");
            openScanner(e);
        });
    }
});

