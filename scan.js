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
    
    if (isProcessing || container.style.display === 'none' || isLocked) return;
    isProcessing = true;

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
    processingContext.filter = 'grayscale(1) contrast(1.5)';
    processingContext.drawImage(video, startX, startY, scanWidth, scanHeight, 0, 0, scanWidth, scanHeight);

    try {
        const result = await worker.recognize(processingCanvas);
        const rawText = result.data.text.toUpperCase().replace(/O/g, '0').replace(/\s+/g, ' ');
        
        logKeLayar("👁️ Anchor: " + rawText.substring(0, 30));

        const hasToyota = /TOYOTA|T0YOTA|TOY0TA|T0Y0TA/.test(rawText);
        const hasAstra  = /ASTRA/.test(rawText);
        const hasMotor  = /M0T0R|MOTOR|M0TOR|MOT0R/.test(rawText);

        if (hasToyota && hasAstra && hasMotor) {
            isLocked = true;
            document.getElementById('scan-status').innerText = "🎯 MATCH! CAPTURING...";
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            setTimeout(() => {
                const fullCanvas = document.createElement('canvas');
                fullCanvas.width = video.videoWidth;
                fullCanvas.height = video.videoHeight;
                const fullCtx = fullCanvas.getContext('2d');
                
                fullCtx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
                const finalBlob = fullCanvas.toDataURL('image/jpeg', 0.95);
                
                const previewImg = document.getElementById('img-preview-final');
                const previewContainer = document.getElementById('preview-gemini-container');
                
                if (previewImg && previewContainer) {
                    previewImg.src = finalBlob;
                    previewContainer.style.display = 'flex';
                    logKeLayar("📸 Debug Preview (2s)...");

                    setTimeout(() => {
                        previewContainer.style.display = 'none';
                        logKeLayar("🚀 Mengirim ke Gemini...");
                        closeCamera();
                        uploadKeGemini(finalBlob);
                    }, 2000); 
                } else {
                    closeCamera();
                    uploadKeGemini(finalBlob);
                }
            }, 500);
        } else {
            isProcessing = false;
            setTimeout(startValidasiProses, 300);
        }
    } catch (err) {
        isProcessing = false;
        setTimeout(startValidasiProses, 1000);
    }
}

async function uploadKeGemini(base64Data) {
    logKeLayar("🚀 Mengirim ke Gemini via GAS...");
    
    const pureBase64 = base64Data.split(',')[1];
    const gasUrl = "https://script.google.com/macros/s/AKfycbxYY2VDSk1zx8FRfk4dpkyPOZLNjNa4Qx1czvFl5XMNE9MgeMcOZ-oTPisXQzgtOAA/exec";

    try {
        // Menggunakan metode 'no-cors' agar request tetap tembus meskipun browser rewel
        await fetch(gasUrl, {
            method: "POST",
            mode: "no-cors", 
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify({ image: pureBase64 })
        });

        // Karena 'no-cors', kita tidak bisa baca JSON balik secara langsung.
        // Tapi kita tahu kalau sampai sini tanpa 'catch', berarti data SUDAH TERKIRIM.
        logKeLayar("📡 Data terkirim! Sedang diproses di background...");
        logKeLayar("💡 Cek Spreadsheet Log_SJKB secara berkala.");

        // Trick: Tunggu 5 detik, lalu asumsikan data sudah di log sheet
        setTimeout(() => {
            alert("Selesai! Silakan cek Spreadsheet untuk melihat hasil ekstraksi Gemini.");
        }, 5000);

    } catch (err) {
        logKeLayar("‼️ Connection Error: Cek Deployment GAS");
        console.error(err);
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
