if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js?v=9')
            .then(reg => {
                console.log("SW Terdaftar!");
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            location.reload();
                        }
                    };
                };
            })
            .catch(err => console.log("SW Error:", err));
    });
}

// #endregion

// #region import modulu
import './style.css'
import { createClient } from '@supabase/supabase-js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Tesseract from 'tesseract.js'
import Dexie from 'dexie';
import CryptoJS from 'crypto-js';

const db = new Dexie('logistic_db');
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const supabase = createClient(supabaseUrl, supabaseAnonKey)
const loaderSatpam = document.getElementById('loading-satpam');
const loadProgress = document.getElementById('load-progress');
const MAX_RADIUS_KM = 1;
let isFirstLocation = true;
let watchId = null;
let isTrackingActive = false;
let lastAddressLat = 0;
let lastAddressLng = 0;
let currentPos = { lat: 0, lng: 0 };
const geoOptions = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
};
let lastAddressRequestTime = 0;
const ADDRESS_DEBOUNCE_MS = 5000;
let isFetchingAddress = false;
let worker = null;
let isLocked = false;
let isCameraActive = false;
let isProcessing = false;
const ALLOWED_LOCATIONS = [
    { name: "Lokasi 1", lat: -6.449595660933786, lng: 107.00540022618232 },
    { name: "Lokasi 2", lat: -6.314941380764999, lng: 107.08465396420782 },
    { name: "Lokasi 3", lat: -6.35781170272672, lng: 107.25441893645797 },
    { name: "Lokasi 4", lat: -6.13823075256515, lng: 106.88354566724894 }
];
let activeStream = null;
const processingCanvas = document.createElement('canvas');
const processingContext = processingCanvas.getContext('2d');
let isScannerRunning = false;
let deliveryData = null;
let currentPolylineString = null;
let map;
let currentPolyline = null;
let startMarker = null;
let endMarker = null;
let userMarker = null;
let isAutoCenter = true;
const startIcon = L.icon({
    iconUrl: '/markerrute.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});
const endIcon = L.icon({
    iconUrl: '/markerrute.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});
let finishMarker = null;


// #endregion

// #region main
document.addEventListener('DOMContentLoaded', () => {
    checkSessionGate();
    updateOnlineStatus();
});

async function checkSessionGate() {
    const localData = JSON.parse(localStorage.getItem('user_session'));
    const isOnline = navigator.onLine;

    if (isOnline) {
        if (localData && localData.lastLogin) {
            const lastLogin = new Date(localData.lastLogin);
            const now = new Date();
            const satuBulan = 30 * 24 * 60 * 60 * 1000; // Milidetik dalam 30 hari

            if (now - lastLogin > satuBulan) {
                console.log("Session expired (1 month), re-validating...");
                initSystem();
            } else {
                console.log("Session valid & online. Skipping Supabase check.");
                console.table(localData);
                skipToApp(localData);
                initSatpam();
                initMap();
                initGPS();
                checkActiveSession();
            }
        } else {
            initSystem();
        }
    } else {
        if (localData && localData.lastLogin) {
            const lastLogin = new Date(localData.lastLogin);
            const now = new Date();
            const satuBulan = 30 * 24 * 60 * 60 * 1000;

            if (now - lastLogin > satuBulan) {
                updateLoading(100, "Koneksi Offline & Sesi Berakhir. Butuh internet untuk login ulang.");
                console.error("Offline & Expired.");
            } else {
                console.log("Offline mode, using cached session.");
                console.table(localData);
                skipToApp(localData);
                initSatpam();
                checkActiveSession();
            }
        } else {
            updateLoading(100, "Tidak ada koneksi internet.");
        }
    }
}

async function initSystem() {
    updateLoading(30, "Mengecek Hak Akses...");
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        const user = session.user;
        console.log("User Aktif:", user.email);
        const userPhoto = user.user_metadata.avatar_url || user.user_metadata.picture || "";
        const userData = {
            email: user.email,
            uid: user.id,
            name: user.user_metadata.full_name || "User",
            photo: userPhoto,
            lastLogin: new Date().toISOString()
        };
        localStorage.setItem('user_session', JSON.stringify(userData));
        console.table(userData);
        const imgProfile = document.getElementById('user-profile-img');
        if (imgProfile && userPhoto) {
            imgProfile.src = userPhoto;
            imgProfile.style.display = 'block';
        }
        document.getElementById('login-overlay').style.display = 'none';
        updateLoading(100, "Sistem Aktif");
        initMap();
        initGPS();
        initSatpam();
        checkActiveSession();
    } else {
        localStorage.removeItem('user_session');
        updateLoading(60, "Menyiapkan Gerbang Login...");
        document.getElementById('login-overlay').style.display = 'flex';
        if (typeof google !== 'undefined' && google.accounts) {
            renderGoogleButton();
        } else {
            console.warn("Google SDK belum siap, mencoba memuat ulang...");
            setTimeout(() => {
                if (typeof google !== 'undefined' && google.accounts) {
                    renderGoogleButton();
                } else {
                    console.error("SDK Google gagal dimuat.");
                    updateLoading(100, "Gagal memuat Google SDK");
                }
            }, 1500);
        }
    }
}

function updateLoading(percent, text) {
    if (loadProgress) loadProgress.innerText = `${text} (${percent}%)`;
    if (percent >= 100) {
        setTimeout(() => {
            if (loaderSatpam) loaderSatpam.style.display = 'none';
        }, 800);
    }
}

window.pindahKeAdmin = (isAdmin) => {
    const areaGoogle = document.getElementById('area-google');
    const areaAdmin = document.getElementById('area-admin');
    const title = document.getElementById('title-login');
    if (isAdmin) {
        areaGoogle.style.display = 'none';
        areaAdmin.style.display = 'block';
        title.innerText = "Admin Login";
    } else {
        areaGoogle.style.display = 'block';
        areaAdmin.style.display = 'none';
        title.innerText = "Akses Sistem";
    }
}

window.prosesLoginAdmin = async () => {
    const email = document.getElementById('userAdmin').value;
    const password = document.getElementById('passAdmin').value;
    if (!email || !password) return alert("Isi email & password admin!");
    updateLoading(50, "Memverifikasi Admin...");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert("Gagal Login Admin: " + error.message);
        updateLoading(100, "Gagal Masuk");
    } else {
        location.reload();
    }
}

async function handleCredentialResponse(response) {
    updateLoading(50, "Memverifikasi Token Google...");
    const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
    })
    if (error) {
        alert("Gagal Login Google: " + error.message);
        updateLoading(100, "Gagal Masuk");
    } else {
        updateLoading(100, "Login Berhasil!");
        location.reload();
    }
}

function renderGoogleButton() {
    // 1. Inisialisasi ID Client Google
    google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        // Opsi tambahan: Agar otomatis muncul prompt "One Tap" di pojok layar
        auto_select: false,
    });

    const googleBtnDiv = document.getElementById("google-login-btn");

    if (googleBtnDiv) {
        const parentWidth = googleBtnDiv.offsetWidth || 350;

        google.accounts.id.renderButton(
            googleBtnDiv,
            {
                theme: "outline",
                size: "large",
                width: parentWidth,
                text: "signin_with",
                shape: "rectangular"
            }
        );
    }
    updateLoading(100, "Silakan Login");
}

window.logoutSistem = async () => {
    const yakin = confirm("Yakin mau keluar sistem?");
    if (yakin) {
        await supabase.auth.signOut();
        localStorage.removeItem('user_session'); // Hapus cache saat logout
        location.reload();
    }
}

function skipToApp(userData) {
    updateLoading(50, "Memuat data lokal...");
    // Tampilkan foto profil dari cache lokal
    const imgProfile = document.getElementById('user-profile-img');
    if (imgProfile && userData.photo) {
        imgProfile.src = userData.photo;
        imgProfile.style.display = 'block';
    }
    // Sembunyikan overlay login karena session masih valid
    const loginOverlay = document.getElementById('login-overlay');
    if (loginOverlay) {
        loginOverlay.style.display = 'none';
    }
    updateLoading(100, "Sistem Aktif (Mode Lokal)");
    // Jalankan fitur utama aplikasi
    if (typeof initMap === "function") initMap();
    if (typeof initGPS === "function") initGPS();
}

function initMap() {
    if (map) {
        return;
    }
    map = L.map('map', {
        zoomControl: false
    }).setView([-6.2847, 107.1006], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        useCache: true,
        crossOrigin: true,
        cacheMaxAge: 2592000000,
        useOnlyCache: false
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    userMarker = L.circleMarker([0, 0], {
        radius: 10,
        fillColor: "#007bff",
        color: "#fff",
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9
    }).addTo(map);
    map.on('movestart', (e) => {
        if (e.hard) return;
        isAutoCenter = false;
        document.getElementById('gpsText').innerText = "Manual Mode (Auto-Off)";
    });
}

function updateOnlineStatus() {
    const container = document.getElementById('status-container');
    const text = document.getElementById('status-text');
    const dot = document.getElementById('status-dot');

    if (navigator.onLine) {
        container.classList.remove('status-offline');
        text.innerText = "SYSTEM ONLINE";
        dot.style.backgroundColor = "#28a745"; // Hijau
        console.log("App is Online");
    } else {
        container.classList.add('status-offline');
        text.innerText = "SYSTEM OFFLINE";
        dot.style.backgroundColor = "#dc3545"; // Merah
        console.log("App is Offline");
    }
}

window.calculateDistanceperjalanan = function (lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function initGPS() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            updateLocationSuccess,
            updateLocationError,
            geoOptions
        );
    } else {
    }
}

function updateMapDisplay(lat, lng) {
    if (!map || !userMarker) return;
    const newPos = [lat, lng];
    userMarker.setLatLng(newPos);
    if (isFirstLocation || isAutoCenter) {
        map.setView(newPos, map.getZoom(), {
            animate: true,
            pan: {
                duration: 0.5
            }
        });
        if (isFirstLocation) isFirstLocation = false;
    }
}

function isGpsValid(newLat, newLng, accuracy) {
    if (accuracy > 500) {
        return false;
    }
    let sessionData = localStorage.getItem('active_session');
    if (!sessionData) return true; // Titik pertama valid kalau akurasinya lolos < 100m
    let session = JSON.parse(sessionData);
    let lastPoint = session.last_update;
    const dist = window.calculateDistanceperjalanan(lastPoint.lat, lastPoint.lng, newLat, newLng);
    const now = new Date();
    const lastTime = new Date(session.last_update_time || session.waktu_berangkat);
    const timeDiff = (now - lastTime) / (1000 * 60 * 60);
    if (timeDiff > 0.0002) {
        const speed = dist / timeDiff;
        if (speed > 150) {
            return false;
        }
    }
    return true;
}

function updateLocationSuccess(position) {
    // 1. Ambil data dari GPS dulu (WAJIB PALING ATAS)
    const { latitude, longitude, speed, accuracy } = position.coords;
    const now = Date.now();

    // 2. Validasi GPS (Kalau busuk, langsung stop)
    if (!isGpsValid(latitude, longitude, accuracy)) {
        const gpsEl = document.getElementById('gpsText');
        if (gpsEl) {
            gpsEl.innerText = "⚠️ Sinyal GPS Lemah";
            gpsEl.style.color = "#eab308";
        }
        return;
    }

    // 3. Update Data Internal & UI Dasar
    const speedKmH = speed ? Math.round(speed * 3.6) : 0;
    currentPos.lat = latitude;
    currentPos.lng = longitude;

    document.getElementById('lat').innerText = latitude.toFixed(6);
    document.getElementById('lng').innerText = longitude.toFixed(6);
    document.getElementById('spdDisplay').innerText = speedKmH;

    const gpsEl = document.getElementById('gpsText');
    if (gpsEl) {
        gpsEl.innerText = isAutoCenter ? "📡 Live Tracking" : "📍 Manual Mode";
        gpsEl.style.color = "#22c55e";
    }

    // 4. LOGIKA UPDATE ALAMAT (DEBOUNCE)
    const checkLat = latitude.toFixed(3);
    const checkLng = longitude.toFixed(3);
    const isMovedFarEnough = (checkLat !== lastAddressLat || checkLng !== lastAddressLng);
    const isTimePassed = (now - lastAddressRequestTime > ADDRESS_DEBOUNCE_MS);

    if (isMovedFarEnough && isTimePassed) {
        updateStreetName(latitude, longitude);
        lastAddressLat = checkLat;
        lastAddressLng = checkLng;
        lastAddressRequestTime = now;
    }

    // 5. Jalankan Tracking (Simpan ke DB) & Update Peta
    //if (isTrackingActive) {
    //    catatPerjalanan(latitude, longitude, speedKmH);
    //}

    updateMapDisplay(latitude, longitude);
}

function recenterMap() {
    isAutoCenter = true;
    if (currentPos.lat !== 0) {
        map.setView([currentPos.lat, currentPos.lng], 17, {
            animate: true,
            pan: { duration: 1 }
        });
        const gpsEl = document.getElementById('gpsText');
        if (gpsEl) {
            gpsEl.innerText = "📡 Live Tracking";
            gpsEl.style.color = "#22c55e";
        }
    }
}

function updateLocationError(error) {
    switch (error.code) {
        case error.PERMISSION_DENIED: msg = "Izin GPS ditolak supir."; break;
        case error.POSITION_UNAVAILABLE: msg = "Sinyal GPS hilang."; break;
        case error.TIMEOUT: msg = "GPS Timeout."; break;
        default: msg = "GPS Error.";
    }
    document.getElementById('gpsText').innerText = msg;
    document.getElementById('gpsText').style.color = "#ef4444";
}

async function updateStreetName(lat, lng) {
    const streetElement = document.getElementById('street-name');
    if (!streetElement || isFetchingAddress) return;

    const cacheKey = `addr_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const cachedAddress = localStorage.getItem(cacheKey);

    if (cachedAddress) {
        streetElement.innerText = cachedAddress;
        return;
    }

    try {
        isFetchingAddress = true;

        // Pembersihan cache yang aman
        const allKeys = Object.keys(localStorage);
        const addrKeys = allKeys.filter(key => key.startsWith('addr_'));

        if (addrKeys.length > 300) {
            addrKeys.sort();
            for (let i = 0; i < 100; i++) {
                localStorage.removeItem(addrKeys[i]);
                console.log("🧹 Membersihkan cache alamat lama...");
            }
        }

        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'id',
                'User-Agent': 'SatpamAsetApp/1.0'
            }
        });

        if (!response.ok) throw new Error("Respons server gagal");

        const data = await response.json();
        const address = data.address;

        if (address) {
            const street = address.road || address.residential || address.suburb || address.village || "Area tidak teridentifikasi";
            localStorage.setItem(cacheKey, street);
            streetElement.innerText = street;
        }

    } catch (error) {
        console.error("Gagal ambil alamat:", error);
        streetElement.innerText = "Gagal memuat alamat...";
    } finally {
        isFetchingAddress = false;
    }
}

async function initSatpam() {
    const progressText = document.getElementById('load-progress');
    const loadingOverlay = document.getElementById('loading-satpam');
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        try {
            attempt++;
            if (progressText) {
                progressText.innerText = `Menghubungkan ke Sistem OCR... (Percobaan ${attempt}/${MAX_RETRIES})`;
            }

            // Inisialisasi worker (Source: User Summary - Tesseract.js implementation)
            worker = await Tesseract.createWorker('eng');

            // Konfigurasi Parameter (Source: User Summary - OCR Configuration)
            await worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ',
                tessedit_pageseg_mode: '3'
            });

            // Jika berhasil sampai sini, langsung bereskan UI
            if (progressText) progressText.innerText = "OCR Siap";

            setTimeout(() => {
                if (loadingOverlay) {
                    loadingOverlay.style.opacity = '0';
                    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
                }
            }, 1000);

            return; // KELUAR DARI FUNGSI (SUKSES)

        } catch (e) {
            console.error(`Gagal pada percobaan ke-${attempt}:`, e);

            // Cek apakah sudah mencapai batas retry
            if (attempt >= MAX_RETRIES) {
                if (progressText) progressText.innerText = "Koneksi Gagal. Sistem Diblokir.";

                // KUNCI UTAMA: Melempar error agar fungsi pemanggil berhenti total
                throw new Error("BLOCK: Gagal inisialisasi OCR setelah 3 kali percobaan.");
            }

            // Jeda 1,5 detik sebelum coba lagi (memberi napas buat jaringan)
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// #endregion

// #region listener / event manggil tombol klik
document.getElementById('btn-recenter').addEventListener('click', () => {
    recenterMap();
    const btn = document.getElementById('btn-recenter');
    btn.style.transform = "scale(0.9)";
    setTimeout(() => btn.style.transform = "scale(1)", 100);
});

document.getElementById('btnScanAction').addEventListener('click', () => {
    openScanner();
    const btn = document.getElementById('btnScanAction');
    btn.style.transform = "scale(0.9)";
    setTimeout(() => btn.style.transform = "scale(1)", 100);
});

document.getElementById('btnCloseCamera').addEventListener('click', () => {
    closeCamera();
    const btn = document.getElementById('btnCloseCamera');
    btn.style.transform = "scale(0.9)";
    setTimeout(() => btn.style.transform = "scale(1)", 100);
});

document.getElementById('btnBerangkat').addEventListener('click', () => {
    handleBerangkat();
    const btn = document.getElementById('btnBerangkat');
    btn.style.transform = "scale(0.9)";
    setTimeout(() => btn.style.transform = "scale(1)", 100);
});

document.getElementById('btnSampai').addEventListener('click', () => {
    handleSampai();
    const btn = document.getElementById('btnSampai');
    btn.style.transform = "scale(0.9)";
    setTimeout(() => btn.style.transform = "scale(1)", 100);
});

// #endregion

// #region del preparation

function isDriverInZone(userLat, userLng) {
    const nearbyLocation = ALLOWED_LOCATIONS.find(loc => {
        const distance = window.calculateDistanceperjalanan(userLat, userLng, loc.lat, loc.lng);
        return distance <= MAX_RADIUS_KM;
    });
    return nearbyLocation || null; // Balikin data lokasi kalau ketemu, atau null kalau jauh
}

function resetScannerUI() {
    isCameraActive = false;
    isLocked = false;
    isProcessing = false;

    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
}

async function openScanner() {
    if (isLocked || isCameraActive) return;
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    const btnScan = document.getElementById('btnScanAction');
    const scanStatus = document.getElementById('scan-status');
    isCameraActive = true;
    isProcessing = true;
    isScannerRunning = false;
    //requestWakeLock().catch(err => console.error("WakeLock Error:", err));
    if (currentPos.lat === 0 || currentPos.lng === 0) {
        alert("⚠️ GPS belum siap atau koordinat belum terbaca.");
        resetScannerUI();
        return;
    }
    const zone = isDriverInZone(currentPos.lat, currentPos.lng);
    if (!zone) {
        alert("Harap mulai perjalanan dari lokasi tempat anda bekerja.");
        resetScannerUI();
        return;
    }
    document.getElementById('scan-status').innerText = "🔍 Scanning...";
    if (!worker) {
        alert("Sistem belum siap.");
        const cobaLagi = confirm("Sistem pemindai belum siap atau gagal dimuat. Coba muat ulang sistem?");
        if (cobaLagi) {
            const loadingOverlay = document.getElementById('loading-satpam');
            const progressText = document.getElementById('load-progress');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'flex';
                loadingOverlay.style.opacity = '1';
            }
            if (progressText) progressText.innerText = "Memuat ulang OCR...";

            await initSatpam();
        }
        if (!worker) {
            alert("Gagal koneksi ke sistem OCR.");
            resetScannerUI();
            return;
        }
    }
    container.style.display = 'block';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });
        video.srcObject = stream;
        video.onloadedmetadata = async () => {
            try {
                await video.play();
                isCameraActive = true;
                isProcessing = false;

                if (!isScannerRunning) {
                    isScannerRunning = true;
                    startValidasiProses();
                }
            } catch (playErr) {
                console.error("Video play failed:", playErr);
                resetScannerUI();
            }
        };
    } catch (err) {
        alert("Kamera Error: " + err.message);
        resetScannerUI();
    }
}

async function startValidasiProses() {
    if (!worker) {
        return;
    }
    if (!isCameraActive || isLocked || !worker || isProcessing) {
        isScannerRunning = false;
        return;
    }
    isProcessing = true;
    const video = document.getElementById('video');
    if (!video || video.readyState < 2) {
        isProcessing = false;
        requestAnimationFrame(startValidasiProses);
        return;
    }
    const scanBox = document.getElementById('scan-box');
    const rect = scanBox.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    if (!video.videoWidth || !video.videoHeight || !videoRect.width || video.readyState < 2) {
        isProcessing = false;
        setTimeout(() => requestAnimationFrame(startValidasiProses), 300);
        return;
    }
    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;
    const startX = (rect.left - videoRect.left) * scaleX;
    const startY = (rect.top - videoRect.top) * scaleY;
    const scanWidth = rect.width * scaleX;
    const scanHeight = rect.height * scaleY;
    processingCanvas.width = scanWidth;
    processingCanvas.height = scanHeight;
    processingContext.filter = 'grayscale(1) contrast(1.2)';
    processingContext.drawImage(
        video,
        startX, startY, scanWidth, scanHeight,
        0, 0, scanWidth, scanHeight
    );
    try {
        const result = await worker.recognize(processingCanvas);
        const rawText = result.data.text
            .toUpperCase()
            .replace(/O/g, '0')
            .replace(/[^A-Z0-9]/g, ' ')
            .replace(/\s+/g, ' ');
        const hasToyota = /T[0O]Y[0O]TA/.test(rawText);
        const hasAstra = /ASTRA/.test(rawText);
        const hasMotor = /M[0O]T[0O]R/.test(rawText);
        if (hasToyota && hasAstra && hasMotor) {
            isLocked = true; // Kunci proses agar tidak scan lagi
            isScannerRunning = false;
            showLoading("Mengambil gambar...");
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            document.getElementById('scan-status').innerText = "MATCH! CAPTURING...";
            setTimeout(() => {
                const fullCanvas = document.createElement('canvas');
                const MAX_WIDTH = 1280;
                let width = video.videoWidth;
                let height = video.videoHeight;
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                fullCanvas.width = width;
                fullCanvas.height = height;
                const fullCtx = fullCanvas.getContext('2d');
                fullCtx.filter = 'contrast(1.4) brightness(1.1)';
                fullCtx.drawImage(video, 0, 0, width, height);
                let finalBlob = fullCanvas.toDataURL('image/jpeg', 0.9);
                let currentLength = finalBlob.length;
                if (currentLength < 70000) {
                    finalBlob = fullCanvas.toDataURL('image/png');
                }
                else if (currentLength > 300000) {
                    finalBlob = fullCanvas.toDataURL('image/jpeg', 0.7);
                }
                else {
                }
                closeCamera();
                uploadKeGemini(finalBlob);
            }, 300);
            return;
        }
    } catch (err) {
        console.error("OCR Error:", err);
    }
    if (isCameraActive && !isLocked) {
        isProcessing = false;
        setTimeout(() => {
            requestAnimationFrame(startValidasiProses);
        }, 800);

    } else {
        isScannerRunning = false;
    }
}

async function uploadKeGemini(base64Data) {
    showLoading(" membaca data...");
    document.getElementById('no_sjkb').value = "Loading...";
    document.getElementById('tujuan_dealer').value = "Loading...";
    const pureBase64 = base64Data.split(',')[1];
    const gasUrl = "https://script.google.com/macros/s/AKfycbzJqgr_NoIACivq5IWwPyFKVFKmYgaTBkFjNwymBA7mPRC0vVKn8UN9mVPZZERPjZzr/exec";
    try {
        const response = await fetch(gasUrl, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain", // 🔥 FIX DISINI
            },
            body: JSON.stringify({ image: pureBase64 })
        });
        const result = await response.json();
        if (result.success) {
            document.getElementById('no_sjkb').value = result.no_sjkb || "-";
            document.getElementById('tujuan_dealer').value = result.tujuan || "-";
            deliveryData = await fetchSpreadsheetData(result.tujuan);
            if (deliveryData) {
                updateRuteUI(deliveryData);
            }
        } else {
        }
    } catch (err) {
        console.error(err);
    } finally {
        setTimeout(() => {
            hideLoading();
        }, 1500);
    }
}

function isiHasilScan(data) {
    const inputSJKB = document.getElementById('no_sjkb');
    const inputTujuan = document.getElementById('tujuan_dealer');
    if (inputSJKB) inputSJKB.value = data.no_sjkb || "";
    if (inputTujuan) inputTujuan.value = data.tujuan || "";
}

function closeCamera() {
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    container.style.display = 'none';
    resetScannerUI()
}

function showLoading(text = "Memproses...") {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    textEl.innerText = text;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
}

async function fetchSpreadsheetData(tujuanGemini) {
    if (!currentPos || !currentPos.lat || !currentPos.lng) {
        return null;
    }
    const zone = isDriverInZone(currentPos.lat, currentPos.lng);
    const lokasiSheet = zone ? zone.name.replace("Lokasi ", "") : "1";
    const tujuanClean = (tujuanGemini || "")
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, "")
        .trim();
    console.log(tujuanClean);
    try {
        const response = await fetch("https://script.google.com/macros/s/AKfycbxwMg2ne9r7ViTTppPhV5qPrb-S35kQf_xEH_R7VZllP_uuTiwV6TM-p7vyw8gME1zn/exec", {
            method: "POST",
            headers: {
                "Content-Type": "text/plain"
            },
            body: JSON.stringify({
                tujuan: tujuanClean,
                lokasi: lokasiSheet
            })
        });
        const text = await response.text();
        const shortText = text.length > 100 ? text.substring(0, 500) + "..." : text;
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            return null;
        }
        if (result.success) {
            deliveryData = result.data;
            if (result.data.rute && result.data.rute.length > 0) {
                currentPolylineString = result.data.rute[0].polyline;
                const estimasiMenit = result.data.durasi || 0;
                const inputElement = document.getElementById('lt_input');
                if (inputElement) {
                    inputElement.value = `${estimasiMenit} Menit`;
                }
            } else {
                currentPolylineString = "";
            }
            return result.data;
        } else {
            return null;
        }
    } catch (err) {
        return null;
    }
}

function updateRuteUI(data) {
    const container = document.getElementById('ruteButtons');
    const area = document.getElementById('ruteSelectionArea');
    if (!container || !area) {
        return;
    }
    container.innerHTML = '';
    const targetData = data || deliveryData;
    if (!targetData) {
        return;
    }
    let polyList = targetData.polylines || targetData.rute;
    if (typeof polyList === "string") {
        polyList = [polyList];
    }
    if (Array.isArray(polyList) && polyList.length > 0) {
        area.style.display = 'block';
        polyList.forEach((poly, index) => {
            const btn = document.createElement('button');
            btn.innerText = `Rute ${index + 1}`;
            btn.className = "btn-rute";
            const polyString = (typeof poly === 'object') ? poly.polyline : poly;
            btn.onclick = () => {
                document.querySelectorAll('.btn-rute').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentPolylineString = polyString;
                if (typeof drawRouteOnMap === "function") {
                    drawRouteOnMap(polyString);
                }
            };
            container.appendChild(btn);
        });
        container.firstChild.click();
    } else {
        area.style.display = 'none';
    }
}

function drawRouteOnMap(encodedPolyline) {
    if (!map) {
        return;
    }
    if (!encodedPolyline || typeof encodedPolyline !== "string") {
        return;
    }
    isAutoCenter = false;
    if (currentPolyline) {
        map.removeLayer(currentPolyline);
    }
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    const coords = decodePolyline(encodedPolyline);
    if (!coords || coords.length === 0) {
        return;
    }
    currentPolyline = L.polyline(coords, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.8,
        lineJoin: 'round'
    }).addTo(map);
    const start = coords[0];
    const end = coords[coords.length - 1];
    startMarker = L.marker(start, { icon: startIcon }).addTo(map);
    startMarker.bindTooltip("Start", { permanent: false });
    endMarker = L.marker(end, { icon: endIcon }).addTo(map)
        .bindPopup("🏁 Tujuan");
    endMarker.bindTooltip("Tujuan", { permanent: false });
    map.fitBounds(currentPolyline.getBounds(), {
        padding: [20, 20]
    });
}

function decodePolyline(encoded) {
    let points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}

// #endregion

// #region path history

db.version(1).stores({
    travel_sessions: '_id, status, waktu_berangkat'
});

function generateUniqueId(emailSesi) {
    if (!emailSesi) {
        console.warn("generateUniqueId: Email kosong, menggunakan fallback timestamp.");
        return `ID-GUEST-${Date.now()}`;
    }
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + "-" +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
    const cleanEmail = emailSesi.replace(/[@.]/g, '_');
    return `ID-${cleanEmail}-${timestamp}`;
}

async function handleBerangkat() {
    try {
        if (!currentPolylineString) {
            alert("Pilih rutenya dulu");
            return;
        }
        if (!currentPos || !currentPos.lat === 0) {
            alert("Tunggu sampai GPS mendapatkan lokasi Anda!");
            return;
        }
        const noSJKB = document.getElementById('no_sjkb').value;
        const tujuan = document.getElementById('tujuan_dealer').value;
        if (!noSJKB || !tujuan) {
            alert("Nomor SJKB atau Tujuan belum ada!");
            return;
        }
        const waktuBerangkat = new Date();
        const durasiMenit = deliveryData && !isNaN(parseInt(deliveryData.durasi, 10))
            ? parseInt(deliveryData.durasi, 10)
            : 0;
        const targetSampai = new Date(waktuBerangkat.getTime() + durasiMenit * 60000);
        if (document.getElementById('target-text')) {
            const opsi = {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false // Pakai format 24 jam
            };
            const formatter = new Intl.DateTimeFormat('id-ID', opsi).format(targetSampai);
            document.getElementById('target-text').innerText = `${formatter.replace('.', ':')} WIB`;
        }

        const session = JSON.parse(localStorage.getItem('user_session'));
        const travelId = generateUniqueId(session.email);
        await db.travel_sessions.put({
            _id: travelId,
            no_sjkb: encryptData(noSJKB),
            tujuan: encryptData(tujuan),
            lat_awal: encryptData(currentPos.lat),
            lng_awal: encryptData(currentPos.lng),
            waktu_berangkat: encryptData(waktuBerangkat.toISOString()),
            target_sampai: encryptData(targetSampai.toISOString()),
            rute_dipilih: encryptData(currentPolylineString),

            path_history: [{
                lat: currentPos.lat,
                lng: currentPos.lng,
                spd: 0
            }],

            last_update: encryptData({
                lat: currentPos.lat,
                lng: currentPos.lng,
                spd: 0
            }),

            status: "Active"
        });

        localStorage.setItem('current_session_id', travelId);
        console.log(localStorage.getItem('current_session_id'));
        if (navigator.vibrate) navigator.vibrate(200);
        isTrackingActive = true;
        isAutoCenter = true;
        const btnScan = document.getElementById('btnScanAction');
        const btnBerangkat = document.getElementById('btnBerangkat');
        const btnSampai = document.getElementById('btnSampai');
        btnBerangkat.style.display = 'none';
        btnSampai.style.display = 'block';
        if (btnScan) {
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5"; // Opsional: biar kelihatan redup/mati
            btnScan.style.cursor = "not-allowed";
        }
        if (document.getElementById('ruteSelectionArea')) {
            document.getElementById('ruteSelectionArea').style.display = 'none';
        }
        if (typeof map !== "undefined" && map) {
            map.flyTo([currentPos.lat, currentPos.lng], 17);
        }
        const targetEl = document.querySelector('.target');
        if (targetEl) targetEl.classList.remove('hidden');
        if (typeof requestWakeLock === 'function') requestWakeLock();
    } catch (err) {
        console.error("Gagal simpan sesi PouchDB:", err);
        alert("Gagal memulai perjalanan Coba Lagi.");
        resetberangkatUI();
    }
}

function toggleUIBerangkat(isStarting) {
    const btnScan = document.getElementById('btnScanAction');
    const btnBerangkat = document.getElementById('btnBerangkat');
    const btnSampai = document.getElementById('btnSampai');
    const ruteArea = document.getElementById('ruteSelectionArea');

    if (isStarting) {
        if (btnBerangkat) btnBerangkat.style.display = 'none';
        if (btnSampai) btnSampai.style.display = 'block';
        if (btnScan) {
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5";
            btnScan.style.cursor = "not-allowed";
        }
        if (ruteArea) ruteArea.style.display = 'none';
    } else {
        if (btnBerangkat) btnBerangkat.style.display = 'block';
        if (btnSampai) btnSampai.style.display = 'none';
        if (btnScan) {
            btnScan.disabled = false;
            btnScan.style.opacity = "1";
            btnScan.style.cursor = "pointer";
        }
        if (ruteArea) ruteArea.style.display = 'block';
    }
}

function resetberangkatUI() {
    toggleUIBerangkat(false);
}

const AES_SECRET = import.meta.env.VITE_AES_KEY;

function encryptData(data) {
    if (!AES_SECRET) {
        console.error("❌ VITE_AES_KEY nggak ketemu di .env");
        return data;
    }
    try {
        const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data);
        return CryptoJS.AES.encrypt(stringData, AES_SECRET).toString();
    } catch (e) {
        console.error("Gagal Enkripsi:", e);
        return null;
    }
}

function decryptData(ciphertext) {
    if (!AES_SECRET) {
        console.error("VITE_AES_KEY nggak ketemu di .env");
        return ciphertext;
    }
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, AES_SECRET);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);

        if (!originalText) return null;

        try {
            return JSON.parse(originalText);
        } catch {
            return originalText;
        }
    } catch (e) {
        console.error("Gagal Dekripsi:", e);
        return null;
    }
}


async function checkActiveSession() {
    const sessionId = localStorage.getItem('current_session_id');
    const targetEl = document.querySelector('.target');
    if (sessionId) {
        try {
            const session = await db.travel_sessions.get(sessionId);
            if (session && session.status === "Active") {
                if (targetEl) targetEl.classList.remove('hidden');

                isTrackingActive = true;
                if (typeof requestWakeLock === 'function') requestWakeLock();
                document.getElementById('btnBerangkat').style.display = 'none';
                document.getElementById('btnSampai').style.display = 'block';
                if (document.getElementById('no_sjkb'))
                    document.getElementById('no_sjkb').value = decryptData(session.no_sjkb);
                if (document.getElementById('tujuan_dealer'))
                    document.getElementById('tujuan_dealer').value = decryptData(session.tujuan);
                const rawWaktuBerangkat = decryptData(session.waktu_berangkat);
                const rawTargetSampai = decryptData(session.target_sampai);
                if (document.getElementById('lt_input')) {
                    const berangkat = new Date(rawWaktuBerangkat);
                    const target = new Date(rawTargetSampai);
                    const durasiMenit = Math.round((target - berangkat) / 60000);
                    document.getElementById('lt_input').value = `${durasiMenit} Menit`;
                }
                if (document.getElementById('target-text') && rawTargetSampai) {
                    const targetDate = new Date(rawTargetSampai);
                    const opsi = {
                        day: '2-digit', month: 'long', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: false
                    };
                    const formatter = new Intl.DateTimeFormat('id-ID', opsi).format(targetDate);
                    document.getElementById('target-text').innerText = `${formatter.replace('.', ':')} WIB`;
                }
                setTimeout(() => {
                    const rawRute = decryptData(session.rute_dipilih);
                    if (rawRute && typeof decodePolyline === 'function') {
                        const btnScan = document.getElementById('btnScanAction');
                        if (btnScan) {
                            btnScan.disabled = true;
                            btnScan.style.opacity = "0.5";
                            btnScan.style.cursor = "not-allowed";
                        }
                        const coordinates = decodePolyline(rawRute);
                        if (typeof map !== "undefined" && map) {
                            if (currentPolyline) map.removeLayer(currentPolyline);
                            currentPolyline = L.polyline(coordinates, { color: '#2563eb', weight: 5 }).addTo(map);
                            const finishPoint = coordinates[coordinates.length - 1];
                            const iconFin = (typeof iconFinish !== 'undefined') ? iconFinish : new L.Icon.Default();
                            if (finishMarker) map.removeLayer(finishMarker);
                            finishMarker = L.marker(finishPoint, { icon: iconFin }).addTo(map);
                            const lastPos = decryptData(session.last_update);
                            if (lastPos && lastPos.lat && lastPos.lat !== 0) {
                                console.log("Terbang ke lokasi terakhir dari DB:", lastPos);
                                map.flyTo([lastPos.lat, lastPos.lng], 18, {
                                    animate: true,
                                    duration: 2
                                });
                            } else {
                                map.fitBounds(currentPolyline.getBounds());
                            }
                        }
                    }
                }, 1500);

            } else {
                if (targetEl) targetEl.classList.add('hidden');
            }
        } catch (error) {
            console.error("Gagal mengambil sesi dari Dexie:", error);
        }
    } else {
        if (targetEl) targetEl.classList.add('hidden');
    }
}

async function handleSampai() {
    if (!confirm("Apakah Anda sudah sampai di lokasi tujuan?")) return;
    try {
        localStorage.removeItem('current_session_id');
        await db.travel_sessions.clear();
        isTrackingActive = false;
        isAutoCenter = true;
        if (currentPos && currentPos.lat !== 0) {
            if (typeof map !== "undefined" && map) {
                map.flyTo([currentPos.lat, currentPos.lng], 18);
            }
        }
        if (document.getElementById('no_sjkb')) document.getElementById('no_sjkb').value = "";
        if (document.getElementById('tujuan_dealer')) document.getElementById('tujuan_dealer').value = "";
        if (document.getElementById('lt_input')) document.getElementById('lt_input').value = "";
        if (document.getElementById('target-text')) document.getElementById('target-text').innerText = "--:--";
        const targetEl = document.querySelector('.target');
        if (targetEl) targetEl.classList.add('hidden');
        currentPolylineString = "";
        const btn = document.getElementById('btnBerangkat');
        if (btn) btn.style.display = 'block';
        const btnSampai = document.getElementById('btnSampai');
        if (btnSampai) btnSampai.style.display = 'none';
        if (document.getElementById('ruteSelectionArea')) {
            document.getElementById('ruteSelectionArea').style.display = 'block';
            document.getElementById('ruteSelectionArea').innerHTML = "";
        }
        if (currentPolyline && map) {
            map.removeLayer(currentPolyline);
        }
        if (typeof map !== "undefined" && map && finishMarker) {
            map.removeLayer(finishMarker);
        }
        if (typeof releaseWakeLock === 'function') releaseWakeLock();
        deliveryData = null;
        currentPolyline = null;
        finishMarker = null;
        alert("Sampai Tujuan!.");
        const btnScan = document.getElementById('btnScanAction');
        if (btnScan) {
            btnScan.disabled = false;
            btnScan.style.opacity = "1"; // Opsional: biar kelihatan redup/mati
            btnScan.style.cursor = "not-allowed";
        }
    } catch (e) {
    }
}


// #endregion

