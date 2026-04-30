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

document.getElementById('btnScanAction').addEventListener('click', function(e) {
    e.preventDefault(); // STOP Buka Folder/File
    e.stopPropagation();
    console.log("Tombol diklik, memanggil kamera...");
    openScanner(e);
}, true);

const KEYWORD_UNIT = "NVDC";
let scanInterval;
let isProcessing = false;

// 1. Fungsi Buka Kamera
async function openScanner(e) {
    if (e) e.preventDefault();
    
    const container = document.getElementById('camera-container');
    const video = document.getElementById('video');

    console.log("Status container:", container); // Cek di console log

    // Munculkan layar kamera
    container.style.setProperty('display', 'block', 'important');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        await video.play();
        console.log("Kamera Aktif!");
        
        // Pancing izin muncul di sini
        startValidasiProses();
    } catch (err) {
        console.error("Gagal kamera:", err);
        alert("Pesan dari Browser: " + err.message);
        container.style.display = 'none';
    }
}

// 2. Mesin Scanner
function startValidasiProses() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (scanInterval) clearInterval(scanInterval);

    scanInterval = setInterval(async () => {
        if (video.paused || video.ended || isProcessing) return;

        // 1. Ambil area tengah saja (biar satpam fokus ke kotak hijau)
        canvas.width = 600; // Ukuran standar biar enteng
        canvas.height = 300;
        
        // Gambar hanya bagian tengah video ke canvas
        ctx.filter = 'contrast(1.5) grayscale(1)'; // TAJAMKAN & HITAM PUTIH
        ctx.drawImage(video, video.videoWidth * 0.1, video.videoHeight * 0.3, video.videoWidth * 0.8, video.videoHeight * 0.4, 0, 0, canvas.width, canvas.height);

        try {
            // 2. Satpam mulai baca
            const { data: { text } } = await worker.recognize(canvas);
            console.log("Satpam Baca:", text); // Cek di console log HP apa yang kebaca
            logicValidasiKamera(text);
        } catch (e) { console.error("OCR Error:", e); }
    }, 1200); // Kasih jeda dikit biar HP gak panas
}

// 3. Logika Satpam Galak
async function logicValidasiKamera(text) {
    const statusText = document.getElementById('scan-status');
    const btnCapture = document.getElementById('btnCapture');
    
    // Bersihkan teks: hilangkan spasi, ubah ke huruf BESAR semua
    const cleanText = text.replace(/\s+/g, '').toUpperCase(); 

    // Cek kata kunci dengan toleransi
    const hasNVDC = cleanText.includes("NVDC");
    const hasTujuan = cleanText.includes("TUJUAN");
    
    // Pola SJKB: cari 24 karakter alphanumeric
    const sjkbPattern = /[A-Z0-9]{24}/g;
    const matchSJKB = cleanText.match(sjkbPattern);

    if ((hasNVDC || hasTujuan) && !isProcessing) {
        // Jika minimal salah satu ketemu (NVDC atau TUJUAN), langsung sikat!
        isProcessing = true;
        statusText.innerText = "✅ DATA TERDETEKSI! MEMOTRET...";
        statusText.style.color = "#00ff00";
        
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // Getar HP
        
        setTimeout(() => {
            ambilFotoFinal();
        }, 800);
    } else {
        statusText.innerText = "🔍 Mencari NVDC / TUJUAN...";
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

