import Tesseract from 'tesseract.js';
import { supabase } from './loginModule.js';
import { isDriverInZone } from './gpsModule.js';
import { showLoading, hideLoading } from './loginModule.js';
import { db } from './dbModule.js'

let workerLineFinder = null;
let workerLineReader = null;
let isLocked = false;
let isCameraActive = false;
let isProcessing = false;
let isScannerRunning = false;
const statusEl = document.getElementById("scan-label");


/** Promise-based delay */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Inisialisasi Tesseract worker.
 * Otomatis terminate worker lama jika ada.
 * Retry hingga MAX_RETRIES kali jika gagal.
 */
async function initOCR() {
    if (workerLineFinder || workerLineReader) {
        try {
            console.log('Membersihkan worker lama yang masih menggantung...');
            if (workerLineFinder) await workerLineFinder.terminate();
            if (workerLineReader) await workerLineReader.terminate();
        } catch (err) {
            console.warn('Peringatan: Gagal mematikan worker lama.', err);
        } finally {
            workerLineFinder = null;
            workerLineReader = null;
        }
    }
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`Inisialisasi Dual-Worker OCR — Percobaan ke-${attempt}`);
            workerLineReader = await Tesseract.createWorker('eng');
            await workerLineReader.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ',
                tessedit_pageseg_mode: '7',
            });
            workerLineFinder = await Tesseract.createWorker('eng');
            await workerLineFinder.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ',
                tessedit_pageseg_mode: '6',
            });
            console.log('Dual-Worker OCR Ready! (PSM 6 & PSM 7 aktif)');
            return;
        } catch (err) {
            console.error(`Gagal pada percobaan ke-${attempt}:`, err.message);
            if (workerLineFinder) await workerLineFinder.terminate();
            if (workerLineReader) await workerLineReader.terminate();
            workerLineFinder = null;
            workerLineReader = null;
            if (attempt >= MAX_RETRIES) {
                throw new Error('BLOCK: Gagal inisialisasi OCR setelah 3 kali percobaan.');
            }
            await delay(1500);
        }
    }
}

async function offOCR() {
    if (workerLineFinder || workerLineReader) {
        try {
            if (workerLineFinder) {
                await workerLineFinder.terminate();
                workerLineFinder = null;
            }
            if (workerLineReader) {
                await workerLineReader.terminate();
                workerLineReader = null;
            }
            console.log('Semua Worker OCR berhasil dimatikan dan dibersihkan.');
        } catch (err) {
            console.error('Gagal mematikan worker:', err);
            workerLineFinder = null;
            workerLineReader = null;
        }
    }
}

/** Hentikan stream kamera, matikan OCR worker, reset UI */
export async function closeCamera() {
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
    const video = document.getElementById('video');
    if (video?.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    await offOCR();
    resetScannerUI();
}

function resetScannerUI() {
    isLocked = false;
    isCameraActive = false;
    isScannerRunning = false;
    isProcessing = false;
    const container = document.getElementById('camera-container');
    if (container) container.style.display = 'none';
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
}

/**
 * Buka kamera dan mulai proses OCR.
 * Validasi zona GPS terlebih dahulu sebelum mengaktifkan kamera.
 */
export async function openscanerocr() {
    if (isLocked || isCameraActive) {
        console.warn('openscanerocr: sistem terkunci atau kamera sedang aktif.');
        return;
    }
    try {
        isLocked = true;
        console.log('Sedang mengambil lokasi GPS...');
        const zone = await isDriverInZone();
        if (!zone) {
            alert('Akses Ditolak: Anda berada di luar radius lokasi yang diperbolehkan. pastikan GPS anda Aktif');
            resetScannerUI();
            return;
        }
        console.log(`Driver terverifikasi di: ${zone.name}`);
        const btnScan = document.getElementById('btnScanAction');
        const video = document.getElementById('video');
        const container = document.getElementById('camera-container');
        if (btnScan) btnScan.disabled = true;
        if (container) container.style.display = 'flex';
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
            });
        } catch (err) {
            alert('Kamera Error: ' + err.message);
            resetScannerUI();
            return;
        }
        video.srcObject = stream;
        video.onloadedmetadata = async () => {
            try {
                await initOCR();
                isCameraActive = true;
                isProcessing = false;
                await video.play();
                if (!isScannerRunning) {
                    isScannerRunning = true;
                    document.getElementById('scan-label').innerText =
                        'Posisikan Dokumen sesuai Instruksi';
                    const anchorOk = await validasiAnchor();
                }
            } catch (err) {
                console.error('Video play gagal:', err);
                resetScannerUI();
            }
        };
    } catch (err) {
        console.error('Terjadi kesalahan:', err);
        alert('Gagal memverifikasi lokasi. Pastikan GPS aktif.');
        resetScannerUI();
    }
}

/**
 * @returns {boolean|null} true jika dokumen valid dan AI berhasil, null jika worker tidak siap
 */
async function validasiAnchor() {
    if (!workerLineFinder) return null;
    await workerLineFinder.setParameters({
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
    });
    while (isCameraActive && !isProcessing) {
        isProcessing = true;
        statusEl.style.color = '';
        const rawcanvas = await captureFullCamera();
        try {
            const [result1, result2] = await Promise.all([
                workerLineFinder.recognize(rawcanvas.split6[0]),
                workerLineFinder.recognize(rawcanvas.split6[1]),
            ]);
            const text1 = normalizeOcrText(result1.data.text);
            console.log('Region 1:', text1);
            const hasToyota = /T0[YV]0T[A4]/.test(text1);
            const hasAstra = /[A4]5T1R[A4]/.test(text1);
            const hasToyotaAstra = hasToyota && hasAstra;
            const hasMotor = /M0T0R/.test(text1);
            const text2 = normalizeOcrText(result2.data.text);
            console.log('Region 2:', text2);
            const hasSurat = /5[U0]R[A4]T/.test(text2);
            const hasJalan = /[J1][A4]L[A4]N/.test(text2);
            const hasKendaraan = /K[E3]N[D0][A4]R[A4]+N/.test(text2);
            const hasBaru = /[B8][A4]R[U0]/.test(text2);
            const scoreRegion1 = (+hasToyota) + (+hasAstra) + (+hasMotor) + (+hasToyotaAstra);
            const scoreRegion2 = (+hasSurat) + (+hasJalan) + (+hasKendaraan) + (+hasBaru);
            if (scoreRegion1 >= 1 && scoreRegion2 >= 1) {
                console.log('ANCHOR PAS');
                if (statusEl) {
                    statusEl.innerText = 'Posisi dokumen sudah benar, tahan sebentar...';
                    statusEl.style.color = '';
                    showLoading('Memproses dokumen...');
                }
                const [Result1, Result2] = await Promise.all([
                    Compressbase64(rawcanvas.split4[0]),
                    Compressbase64(rawcanvas.split4[1]),
                ]);
                const gabungCanvas = [Result1, Result2];
                if (statusEl) statusEl.innerText = 'Menganalisis dokumen dengan AI...';
                const hasilAI = await pushtoAI(gabungCanvas);
                if (hasilAI && hasilAI.success) {
                    console.log("AI Berhasil Memproses Dokumen!", hasilAI);

                    console.log("Masukin data ke element");
                    await masukindatakeelement(hasilAI);

                    console.log("Close camera");
                    await closeCamera();
                    console.log("Hide loading");
                    hideLoading();
                    console.log("Return true");
                    return true;
                }
                console.log('AI gagal memproses dokumen.');
                if (statusEl) {
                    statusEl.innerText = 'AI gagal membaca struktur. Mohon paskan ulang dokumen.';
                    statusEl.style.color = 'red';
                    hideLoading();
                }
                await delay(2500);
            }
        } catch (err) {
            console.error('Error saat validasi anchor:', err);
        } finally {
            isProcessing = false;
        }
        await delay(600);
    }
}

async function Compressbase64(canvas) {
    const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, 'image/png')
    );
    if (!blob) {
        throw new Error('Gagal membuat blob');
    }
    const sizeKB = (blob.size / 1024).toFixed(2);
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);

    console.log(`
=== IMAGE SIZE ===
Bytes : ${blob.size}
KB    : ${sizeKB} KB
MB    : ${sizeMB} MB
==================
    `);
    const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
    return base64.split(',')[1];
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeOcrText(raw) {
    return raw
        .toUpperCase()
        .replace(/O/g, '0')
        .replace(/I/g, '1')
        .replace(/S/g, '5')
        .replace(/[^A-Z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getVideoCoverOffset(video) {
    const videoRect = video.getBoundingClientRect();
    const containerAspect = videoRect.width / videoRect.height;
    const videoAspect = video.videoWidth / video.videoHeight;
    let drawWidth, drawHeight, offsetX, offsetY;
    if (videoAspect > containerAspect) {
        drawHeight = videoRect.height;
        drawWidth = videoRect.height * videoAspect;
        offsetX = (drawWidth - videoRect.width) / 2;
        offsetY = 0;
    } else {
        drawWidth = videoRect.width;
        drawHeight = videoRect.width / videoAspect;
        offsetX = 0;
        offsetY = (drawHeight - videoRect.height) / 2;
    }
    return { drawWidth, drawHeight, offsetX, offsetY };
}

function applyGrayscale(canvas, ctx) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);
}

function captureFullCamera() {
    const container = document.getElementById('camera-container');
    const video = document.getElementById('video');
    const containerRect = container.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const cover = getVideoCoverOffset(video);
    const scaleX = video.videoWidth / cover.drawWidth;
    const scaleY = video.videoHeight / cover.drawHeight;
    const isPortrait = containerRect.width < containerRect.height;
    const sx = (containerRect.left - videoRect.left + cover.offsetX) * scaleX;
    const sy = (containerRect.top - videoRect.top + cover.offsetY) * scaleY;
    const sw = containerRect.width * scaleX;
    const sh = containerRect.height * scaleY;
    const canvas = document.createElement('canvas');
    if (isPortrait) {
        canvas.width = Math.floor(containerRect.height); // lebar canvas = tinggi container
        canvas.height = Math.floor(containerRect.width);  // tinggi canvas = lebar container
    } else {
        canvas.width = Math.floor(containerRect.width);
        canvas.height = Math.floor(containerRect.height);
    }
    const ctx = canvas.getContext('2d');
    if (isPortrait) {
        ctx.save();
        ctx.translate(0, canvas.height);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.height, canvas.width);
        ctx.restore();
    } else {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }
    applyGrayscale(canvas, ctx);
    const fullW = canvas.width;
    const fullH = canvas.height;
    function createGridSplits(rows, cols) {
        const baseW = Math.floor(fullW / cols);
        const baseH = Math.floor(fullH / rows);
        const splits = [];
        for (let r = 0; r < rows; r++) {
            const y = r * baseH;
            const cellH = r === rows - 1 ? fullH - y : baseH; // baris terakhir ambil sisa
            for (let c = 0; c < cols; c++) {
                const x = c * baseW;
                const cellW = c === cols - 1 ? fullW - x : baseW; // kolom terakhir ambil sisa
                const cellCanvas = document.createElement('canvas');
                cellCanvas.width = cellW;
                cellCanvas.height = cellH;
                const cellCtx = cellCanvas.getContext('2d');
                cellCtx.drawImage(canvas, x, y, cellW, cellH, 0, 0, cellW, cellH);
                splits.push(cellCanvas);
            }
        }
        return splits;
    }
    const split6 = createGridSplits(3, 2);
    const split4 = createGridSplits(2, 2);
    return { canvas, split6, split4 };
}


async function pushtoAI(gabungCanvas) {
    console.log("gabungCanvas:", gabungCanvas);
    try {
        const responseGambar = await supabase.functions.invoke('ocrsjkb', {
            body: {
                base64Images: gabungCanvas
            }
        });
        console.log(responseGambar);
        const dataGambar = responseGambar.data;
        return dataGambar;
    } catch (error) {
        console.error("Proses AI Gagal total:", error);
        return null;
    }
}

async function masukindatakeelement(hasilRaw) {
    const date = new Date();
    try {
        let hasilAI = hasilRaw;
        if (hasilRaw?.data) {
            hasilAI = hasilRaw.data;
            console.log("[DEBUG] Data berhasil di-unwrap.");
        }
        await db.ocr_results.clear(); // Hapus semua data lama
        await db.ocr_results.add({
            created_at: date,
            data: hasilAI
        });
        console.log("[DB] Data berhasil disimpan (Single Record).");
        await update_element();
    } catch (err) {
        console.error("[FATAL ERROR] masukindatakeelement:", err);
    }
}

export async function update_element() {
    const sjkb = document.getElementById("no_sjkb");
    const tujuan = document.getElementById("tujuan_dealer");
    const Leadtime = document.getElementById("lt_input");
    const targetsampaiel = document.getElementById("target_sampai");
    const btnberangkat = document.getElementsByClassName("mulaiperjalanan")[0];
    const jumlahData = await db.ocr_results.count();
    if (jumlahData > 0) {
        const rawdata = await db.ocr_results.toArray();
        const dataTerbaru = rawdata[0].data;
        const waktuSampaiObj = new Date(Date.now() + (dataTerbaru.leadtime || 60) * 60 * 1000);
        const formatTeks = waktuSampaiObj.toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        if (sjkb) sjkb.value = dataTerbaru.no_sjkb || '';
        if (tujuan) tujuan.value = dataTerbaru.tujuan || '';
        if (Leadtime) {
            Leadtime.value = dataTerbaru.leadtime ? dataTerbaru.leadtime + " Menit" : "";
        }
        if (targetsampaiel) {
            targetsampaiel.textContent = "Target " + formatTeks; // Sekarang ini akan berisi string "20/05/2026, 22:45"
        }
        console.log("[FRONTEND] Leadtime:", Leadtime.value);
        if (btnberangkat) btnberangkat.style.display = "flex";
        console.log("[FRONTEND] Sukses memuat single-data dari DB:");
    } else {
        if (sjkb) sjkb.value = '';
        if (tujuan) tujuan.value = '';
        if (Leadtime) Leadtime.value = '';
        if (btnberangkat) btnberangkat.style.display = "none";
        if (targetsampaiel) targetsampaiel.textContent = '';
        console.log("[FRONTEND] DB kosong, form dibersihkan dan tombol disembunyikan.");
    }
}