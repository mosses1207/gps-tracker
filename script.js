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

// Inisialisasi Satpam di awal sekali
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
async function openScanner() {
  console.log("Tombol Scan Dipencet"); // Cek di console log muncul gak
  
  const container = document.getElementById('camera-container');
  container.style.setProperty('display', 'block', 'important'); // Paksa muncul
  
  isProcessing = false;

  try {
    const video = document.getElementById('video');
    const constraints = { 
      video: { 
        facingMode: "environment",
        // Hapus focusMode dulu buat ngetes, karena gak semua HP support
      } 
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    // Pastikan video main
    video.play(); 
    
    video.onloadedmetadata = () => { 
      console.log("Kamera Aktif!");
      startValidasiProses(); 
    };
  } catch (err) {
    console.error("Error Kamera:", err);
    alert("Kamera Error: " + err.message);
    closeCamera();
  }
}

// 2. Fungsi Validasi (Satpam Galak)

async function logicValidasiKamera(text) {
    const statusText = document.getElementById('scan-status');
    const btnCapture = document.getElementById('btnCapture');
    const cleanText = text.replace(/\s+/g, ''); 

    const hasNVDC = cleanText.toUpperCase().includes(KEYWORD_UNIT);
    const hasTujuan = text.toLowerCase().includes("tujuan");
    const sjkbPattern = /[A-Z0-9]{24}/g; 
    const matchSJKB = cleanText.match(sjkbPattern);

    // Cek apakah data valid DAN sistem lagi nggak proses jepretan lain
    if (hasNVDC && hasTujuan && matchSJKB && !isProcessing) {
        // Set jadi true supaya nggak jepret berkali-kali
        isProcessing = true; 

        statusText.innerText = "✅ DATA VALID! Mengambil Foto...";
        statusText.style.color = "#00ff00";
        
        btnCapture.style.background = "#00ff00"; // Ubah warna jadi hijau tanda sukses
        
        // Kasih delay dikit (misal 500ms) biar driver sadar datanya dapet
        setTimeout(() => {
            ambilFotoFinal();
        }, 500);

    } else if (!isProcessing) {
        statusText.innerText = "🔍 Mencari NVDC, Tujuan & 24 Digit...";
        statusText.style.color = "#ffffff";
        btnCapture.disabled = true;
        btnCapture.style.background = "gray";
    }
}

// 3. Mesin Scanner
async function startValidasiProses() {
  const video = document.getElementById('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  scanInterval = setInterval(async () => {
    if (video.paused || video.ended) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      // Kita pakai Tesseract versi simpel
      const { data: { text } } = await worker.recognize(canvas);
      logicValidasiKamera(text);
    } catch (e) { console.error(e); }
  }, 1000); 
}

// 4. JEPRET & KIRIM KE GEMINI
async function ambilFotoFinal() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);
    
    closeCamera(); // Matikan kamera dulu biar HP adem
    showLoader("Sedang Memproses Data via AI...");
    
    // Panggil fungsi Gemini Abang (yang sudah kita bahas sebelumnya)
    // panggilGeminiAPI(base64Image); 
}

// 5. Tutup Kamera
function closeCamera() {
  isProcessing = false;
  clearInterval(scanInterval);
  const video = document.getElementById('video');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  document.getElementById('camera-container').style.display = 'none';
}
