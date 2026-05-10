if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js?v=10')
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
            .catch(err => console.error("SW Error:", err));
    });
}
import './style.css'
import { createClient } from '@supabase/supabase-js'
import L, { control } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Tesseract from 'tesseract.js'
import { db } from './db.js'
import CryptoJS from 'crypto-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const MAX_RADIUS_KM = 1;
let isFirstLocation = true;
let watchId = null;
let isTrackingActive = false;
let lastAddressLat = 0;
let lastAddressLng = 0;
let currentPos = { lat: 0, lng: 0 };
let currentChannel = null;
let currentPage = 0;
const itemsPerPage = 1;
const loaderSatpam = document.getElementById('loading-satpam');
const loadProgress = document.getElementById('load-progress');
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
delete L.Icon.Default.prototype._getIconUrl;
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
let initialBody = "";

if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    console.log = () => { };
    console.warn = () => { };
    console.debug = () => { };
    console.info = () => { };
    // console.error = () => {}; 
}

window.addEventListener('DOMContentLoaded', async () => {
    currentPage = 0;
    await hideAllOverlays();
    await ambildatahtml();
    await stopTracking();
    isTrackingActive = false;
    await checkSessionGate();
    await re_initEventListeners();
    await hideOfflineScreen();
    await updateOnlineStatus();
    const sessionRaw = localStorage.getItem('user_session');
    if (sessionRaw) {
        const sessionData = JSON.parse(sessionRaw);
        const uid = sessionData.uid;
        if (uid) {
                        await startTunnelListener(uid);
        }
    } else {
        console.warn("User belum login (user_session kosong)");
    }
    await renderToUI();
    //hideTargetInfo();
    //loadTargetFromDexie();
});

function hideAllOverlays() {
    const overlays = ['loading-satpam', 'login-overlay', 'loading-overlay'];
    overlays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function ambildatahtml() {
    // 1. Ambil SEMUA elemen input bertipe text, number, dll.
    // Selector 'input' akan mengambil semua tag <input>
    const allInputs = document.querySelectorAll('input');

    console.group("📝 [Auto Input Reset]", allInputs);

    allInputs.forEach(input => {
        // Cek tipe input agar tidak salah hapus (misal tombol atau checkbox)
        const tipeBolehDihapus = ['text', 'number', 'date', 'hidden', 'tel'];

        if (tipeBolehDihapus.includes(input.type)) {
            input.value = ""; // RESET DI SINI
        }
    });

    // 2. Jika ada <textarea> (catatan tambahan), bersihkan juga
    const allTextAreas = document.querySelectorAll('textarea');
    allTextAreas.forEach(txt => {
        txt.value = "";
    });

    console.groupEnd();

    console.group("🔘 [Button Reset]");

    const btnBerangkat = document.getElementById('btnBerangkat');
    if (btnBerangkat) {
        btnBerangkat.style.display = 'block';
    }
    const btnSampai = document.getElementById('btnSampai');
    if (btnSampai) {
        btnSampai.style.display = 'none';
    }

    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) {
        btnScan.style.cursor = "pointer";
        btnScan.disabled = false;
    }

    const ruteSelectionArea = document.getElementById('ruteSelectionArea');
    if (ruteSelectionArea) {
        ruteSelectionArea.style.display = "none";
    }

    if (currentPolyline) {
        map.removeLayer(currentPolyline);
        currentPolyline = null;
    }

    console.groupEnd();

    
}

async function checkSessionGate() {
    updateLoading(10, "Memeriksa Koneksi...");
    const localData = JSON.parse(localStorage.getItem('user_session'));
    const isOnline = navigator.onLine;
    const SATU_BULAN = 30 * 24 * 60 * 60 * 1000;
    const hasSession = localData && localData.lastLogin;
    const isSessionValid = hasSession && (new Date() - new Date(localData.lastLogin) < SATU_BULAN);
    if (isOnline) {
        if (!isSessionValid) {
            await initSystem();
            return;
        }
        await resetTampilan();
        await checkActiveSessiononline();
    } else {
        if (isSessionValid) {
            await resetTampilan();
            await checkActiveSessionoffline();
        } else {
            console.warn("Offline dan tidak ada sesi valid. Sistem dihentikan.");
            const pesan = !hasSession
                ? "Tidak ada data login. Butuh internet untuk login pertama kali."
                : "Sesi berakhir. Anda perlu koneksi internet untuk login ulang.";
            showOfflineScreen(pesan);
            await stopAllSystem();
        }
    }
}

async function initSystem() {
    try {
        updateLoading(20, "Mengecek Hak Akses...");
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session) {
            localStorage.removeItem('google_sdk_retry');
            const user = session.user;
            const metadata = user.user_metadata;
            const userData = {
                email: user.email,
                uid: user.id,
                name: metadata.full_name || user.email.split('@')[0],
                photo: metadata.avatar_url || metadata.picture || "",
                lastLogin: new Date().toISOString()
            };
            localStorage.setItem('user_session', JSON.stringify(userData));
            updateLoading(100, "Berhasil masuk");
        } else {
            handleUnauthenticated();
        }
    } catch (error) {
        console.error("Gagal percobaan:", error);
        if (retryCount < 3) {
            retryCount++;
            setTimeout(initSystem, 2000);
        } else {
            showOfflineScreen("Gagal memuat sistem. Periksa koneksi internet Anda.");
            retryCount = 0;
            stopAllSystem();
        }
    }
}

function handleUnauthenticated() {
    localStorage.removeItem('user_session');
    updateLoading(30, "Menyiapkan Gerbang Login...");
    const emergencyTimer = setTimeout(() => {
        const btn = document.getElementById("google-login-btn");
        if (btn && btn.innerHTML.trim() === "") {
            console.error("Authentication Timeout: Tombol Google gagal dimuat.");
            showOfflineScreen("<b>Gagal Memuat Sistem Login</b><br>Layanan otentikasi ditolak (Error 403) atau koneksi terganggu.");
            stopAllSystem();
        }
    }, 6000);
    if (typeof google !== 'undefined' && google.accounts) {
        renderGoogleButton();
    } else {
        console.warn("Google SDK tidak terdeteksi saat inisialisasi.");
        clearTimeout(emergencyTimer);
        handleSDKLoadFailure();
    }
}

function renderGoogleButton() {
    google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        auto_select: false,
    });
    const loginoverlay = document.getElementById('login-overlay');
    const googleBtnDiv = document.getElementById("google-login-btn");
    const googlearea = document.getElementById("area-google");
    if (loginoverlay) {
        loginoverlay.style.display = "flex";
    } else {
        console.warn("Elemen login-overlay tidak ditemukan. Pastikan elemen dengan id 'login-overlay' ada di HTML.");
    }
    if (googlearea) {
        document.getElementById("area-google").style.display = "block";
    } else {
        console.warn("Elemen area-google tidak ditemukan. Pastikan elemen dengan id 'area-google' ada di HTML.");
    }
    if (googleBtnDiv) {
        const parentWidth = googleBtnDiv.offsetWidth || 350;
        google.accounts.id.renderButton(googleBtnDiv, {
            theme: "outline",
            size: "large",
            width: parentWidth,
            text: "continue_with",
            shape: "rectangular",
            logo_alignment: "center"
        });
        const passInput = document.getElementById('login-password');
        if (passInput) {
            passInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleManualLogin();
            });
        }
    } else {
        console.warn("Elemen google-login-btn tidak ditemukan. Pastikan elemen dengan id 'google-login-btn' ada di HTML.");
    }
    updateLoading(100, "Silakan Login");
}

async function handleCredentialResponse(response) {
    updateLoading(50, "Memverifikasi Token Google...");
    const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
    });
    if (error) {
        alert("Gagal Login Google: " + error.message);
        updateLoading(100, "Gagal Masuk");
        const loginoverlay = document.getElementById('login-overlay');
        if (loginoverlay) {
            loginoverlay.style.display = "none";
        }
        const areagoogle = document.getElementById('area-google');
        if (areagoogle) {
            areagoogle.style.display = "none";
        }
        location.reload();
    } else {
        const userData = {
            email: data.user.email,
            uid: data.user.id,
            name: data.user.user_metadata.full_name || "User Google",
            lastLogin: new Date().toISOString()
        };
        localStorage.setItem('user_session', JSON.stringify(userData));
        const loginoverlay = document.getElementById('login-overlay');
        if (loginoverlay) {
            loginoverlay.style.display = "none";
        }
        const areagoogle = document.getElementById('area-google');
        if (areagoogle) {
            areagoogle.style.display = "none";
        }
        updateLoading(100, "Login Berhasil!");
        location.reload();
    }
}

function handleSDKLoadFailure() {
    console.warn("Google SDK tidak ditemukan.");
    let retry = Number(localStorage.getItem('google_sdk_retry')) || 0;
    if (retry < 2) {
        retry++;
        localStorage.setItem('google_sdk_retry', retry);
        const loginoverlay = document.getElementById('login-overlay');
        if (loginoverlay) {
            loginoverlay.style.display = "none";
        }
        const areagoogle = document.getElementById('area-google');
        if (areagoogle) {
            areagoogle.style.display = "none";
        }
        location.reload();
    } else {
        localStorage.removeItem('google_sdk_retry');
        const loginoverlay = document.getElementById('login-overlay');
        if (loginoverlay) {
            loginoverlay.style.display = "none";
        }
        showOfflineScreen("SDK Google tidak dapat dimuat. Pastikan koneksi stabil.");
        console.error("Gagal memuat Google SDK setelah beberapa percobaan.");
        stopAllSystem();
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
            worker = await Tesseract.createWorker('eng');
            await worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ',
                tessedit_pageseg_mode: '3'
            });
            if (progressText) progressText.innerText = "OCR Siap";
            setTimeout(() => {
                if (loadingOverlay) {
                    loadingOverlay.style.opacity = '0';
                    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
                }
            }, 1000);
            return;
        } catch (e) {
            console.error(`Gagal pada percobaan ke-${attempt}:`, e);
            if (attempt >= MAX_RETRIES) {
                console.error("Koneksi Gagal. Sistem Diblokir.");
                throw new Error("BLOCK: Gagal inisialisasi OCR setelah 3 kali percobaan.");
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
}

async function offSatpam() {
    console.group("🛑 [OCR Shutdown]");
    try {
        if (worker) {
            await worker.terminate(); // Ini perintah utamanya
            worker = null; // Kosongkan variabel agar bisa di-init ulang nanti
        }
    } catch (e) {
        console.error("❌ Gagal mematikan worker:", e);
    }
    console.groupEnd();
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
        dot.style.backgroundColor = "#28a745";
    } else {
        container.classList.add('status-offline');
        text.innerText = "SYSTEM OFFLINE";
        dot.style.backgroundColor = "#dc3545";
    }
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

let retryCount = 0;
async function checkActiveSessionoffline() {
    try {
        const sessions = await db.travel_sessions.toArray();
        const activeSession = sessions.find(s => s.status && s.status.toLowerCase() === "active");
        const sessionId = activeSession ? activeSession.idseason : null;
        if (sessionId) {
            isTrackingActive = true;
            isAutoCenter = true;
            startTracking();
            //stopTracking();
            const noSJKB = decryptData(activeSession.sjkb);
            if (noSJKB) {
                const inputSJKB = document.getElementById('no_sjkb');
                if (inputSJKB) {
                    inputSJKB.value = noSJKB;
                }
            }
            const tujuan = decryptData(activeSession.dest);
            if (tujuan) {
                const inputTujuan = document.getElementById('tujuan_dealer');
                if (inputTujuan) {
                    inputTujuan.value = tujuan;
                }
            }
            const waktuBerangkat = new Date(decryptData(activeSession.depart_at));
            const targetSampai = new Date(decryptData(activeSession.arrive_target));
            if (!isNaN(waktuBerangkat) && !isNaN(targetSampai)) {
                const selisihWaktu = targetSampai - waktuBerangkat;
                const durasiMenit = Math.round(selisihWaktu / 60000);
                const inputLt = document.getElementById('lt_input');
                if (inputLt) {
                    inputLt.value = `${durasiMenit} Menit`;
                }
            } else {
                console.error("Waktu berangkat atau target sampai tidak valid di sesi Dexie.");
            }
            if (!isNaN(targetSampai)) {
                const formattanggal = {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                };
                const formatter = targetSampai.toLocaleString('id-ID', formattanggal);
                const targetTextEl = document.getElementById('target-text');
                if (targetTextEl) {
                    targetTextEl.innerText = `${formatter.replace(/\./g, ':')} WIB`;
                }
            }
            setTimeout(() => {
                const ruteDipilih = decryptData(activeSession.route_master);
                if (ruteDipilih && typeof decodePolyline === 'function') {
                    startTracking();
                    const coordinates = decodePolyline(ruteDipilih);
                    if (typeof map !== "undefined" && map) {
                        if (currentPolyline) map.removeLayer(currentPolyline);
                        currentPolyline = L.polyline(coordinates, { color: '#2563eb', weight: 5 }).addTo(map);
                        const finishPoint = coordinates[coordinates.length - 1];
                        const iconFin = (typeof iconFinish !== 'undefined') ? iconFinish : new L.Icon.Default();
                        if (finishMarker) map.removeLayer(finishMarker);
                        finishMarker = L.marker(finishPoint, { icon: iconFin }).addTo(map);
                        const lastPos = decryptData(activeSession.lat) && decryptData(activeSession.lng)
                            ? { lat: parseFloat(decryptData(activeSession.lat)), lng: parseFloat(decryptData(activeSession.lng)) }
                            : null;
                        if (lastPos && lastPos.lat !== 0 && lastPos.lng !== 0) {
                            map.flyTo([lastPos.lat, lastPos.lng], 18, {
                                animate: true,
                                duration: 2
                            });
                        } else {
                            map.fitBounds(currentPolyline.getBounds());
                        }
                    }
                    const btnScan = document.getElementById('btnScanAction');
                    if (btnScan) {
                        btnScan.disabled = true;
                        btnScan.style.opacity = "0.5";
                        btnScan.style.cursor = "not-allowed";
                    }
                    const btnBerangkat = document.getElementById('btnBerangkat');
                    const btnSampai = document.getElementById('btnSampai');
                    if (btnBerangkat) {
                        btnBerangkat.style.display = 'none';
                    }
                    if (btnSampai) {
                        btnSampai.style.display = 'block';
                    }
                    //hideTargetInfo();
                    loadTargetFromDexie();
                } else {
                    console.error("Rute yang dipilih tidak valid atau tidak ditemukan di sesi Dexie.");
                }
            }, 1500);
            if (typeof requestWakeLock === 'function') requestWakeLock();
            retryCount = 0;
        } else {
            console.error("Tidak ada sesi aktif di Dexie.");
            retryCount = 0;
            resetTampilan();
            isTrackingActive = true;
            isAutoCenter = true;
            //startTracking();
            stopTracking();
        }
    } catch (error) {
        console.error("Gagal memuat sesi aktif, percobaan ke-", retryCount + 1, ":", error);
        if (retryCount < 3) {
            retryCount++;
            setTimeout(checkActiveSessionoffline, 2000);
        } else {
            alert("Gagal memuat sesi aktif setelah beberapa percobaan. Silakan muat ulang halaman.");
            showOfflineScreen("Gagal memuat sesi aktif setelah beberapa percobaan. Silakan muat ulang halaman.");
            retryCount = 0;
            isTrackingActive = false;
            isAutoCenter = false;
            //startTracking();
            stopTracking();
            stopAllSystem();
        }
    }
}

function updateUIFromSession(session) {
    const noSJKB = decryptData(session.sjkb);
    const tujuan = decryptData(session.dest);
    const rawBerangkat = decryptData(session.depart_at);
    const rawTarget = decryptData(session.arrive_target);
    if (noSJKB) document.getElementById('no_sjkb').value = noSJKB;
    if (tujuan) document.getElementById('tujuan_dealer').value = tujuan;
    const waktuBerangkat = new Date(rawBerangkat);
    const targetSampai = new Date(rawTarget);
    if (!isNaN(waktuBerangkat) && !isNaN(targetSampai)) {
        const durasiMenit = Math.round((targetSampai - waktuBerangkat) / 60000);
        if (document.getElementById('lt_input')) document.getElementById('lt_input').value = `${durasiMenit} Menit`;
        const formattanggal = { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
        const formatter = targetSampai.toLocaleString('id-ID', formattanggal);
        const targetTextEl = document.getElementById('target-text');
        if (targetTextEl) targetTextEl.innerText = `${formatter.replace(/\./g, ':')} WIB`;
    }
    const ruteDipilih = decryptData(session.route_master);
    if (ruteDipilih && typeof decodePolyline === 'function') {
        const coordinates = decodePolyline(ruteDipilih);
        if (typeof map !== "undefined" && map) {
            if (currentPolyline) map.removeLayer(currentPolyline);
            currentPolyline = L.polyline(coordinates, { color: '#2563eb', weight: 5 }).addTo(map);
            const finishPoint = coordinates[coordinates.length - 1];
            if (finishMarker) map.removeLayer(finishMarker);
            finishMarker = L.marker(finishPoint, { icon: (typeof iconFinish !== 'undefined' ? iconFinish : new L.Icon.Default()) }).addTo(map);
            const lastLat = decryptData(session.lat);
            const lastLng = decryptData(session.lng);
            if (lastLat && lastLng && parseFloat(lastLat) !== 0) {
                map.flyTo([parseFloat(lastLat), parseFloat(lastLng)], 18);
            } else {
                map.fitBounds(currentPolyline.getBounds());
            }
        }
    }
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) {
        btnScan.disabled = true;
        btnScan.style.opacity = "0.5";
    }
    if (document.getElementById('btnBerangkat')) document.getElementById('btnBerangkat').style.display = 'none';
    if (document.getElementById('btnSampai')) document.getElementById('btnSampai').style.display = 'block';
    isTrackingActive = true;
    isAutoCenter = true;
    startTracking();
    //hideTargetInfo();
    loadTargetFromDexie();
    //stopTracking();
}

async function checkActiveSessiononline() {

    // 1. Ambil & Validasi LocalStorage
    let userSession;
    try {
        userSession = JSON.parse(localStorage.getItem('user_session'));
    } catch (e) {
        console.error("❌ [CheckSession] Gagal parse user_session dari localStorage:", e);
    }

    const uid = userSession ? userSession.uid : null;
    if (!uid) {
        console.warn("⚠️ [CheckSession] UID tidak ditemukan. Mengarahkan ke login...");
        location.reload();
        return;
    }
    try {
        // 1. Ambil & Validasi LocalStorage
        const { data: activeSession, error } = await supabase
            .from('path_history')
            .select('*')
            .eq('user_id', uid)
            .eq('status', 'Active')
            .maybeSingle();
        if (error) {
            console.error("❌ [Supabase Error]:", error);
            throw error;
        }

        if (activeSession) {

            // 3. Bandingkan dengan data di Dexie
            const localSessions = await db.travel_sessions.toArray();
            const localData = localSessions.length > 0 ? localSessions[0] : null;

            if (localData && localData.idseason === activeSession.idseason) {
                updateUIFromSession(localData);
            } else {
                await db.travel_sessions.clear();

                const dataToSave = {
                    sjkb: activeSession.sjkb,
                    dest: activeSession.dest,
                    lat_start: activeSession.lat_start,
                    lng_start: activeSession.lng_start,
                    lat: activeSession.lat,
                    lng: activeSession.lng,
                    depart_at: activeSession.depart_at,
                    arrive_target: activeSession.arrive_target,
                    updated_at: activeSession.updated_at,
                    route_master: activeSession.route_master,
                    path_hist: null, // kosongkan path_hist
                    status: "Active",
                    user_id: activeSession.user_id,
                    idseason: activeSession.idseason
                };

                await db.travel_sessions.put(dataToSave);
                updateUIFromSession(activeSession);
            }

            if (typeof requestWakeLock === 'function') {
                requestWakeLock();
            }
            return activeSession.idseason;

        } else {
            ambildatahtml();
            isTrackingActive = true;
            isAutoCenter = true;
            //startTracking();
            stopTracking();
            return null;
        }

    } catch (error) {
        console.error("Gagal memuat sesi aktif:", error);
        alert("Gagal memuat sesi aktif. Silakan muat ulang halaman.");
        showOfflineScreen("Gagal memuat sesi aktif.");
        stopAllSystem();
    }
}

function updateMapDisplay(lat, lng) {
    if (!map || !userMarker) {
        console.warn("⚠️ updateMapDisplay: map atau userMarker tidak tersedia");
        return;
    }
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
    if (!sessionData) return true;
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

async function updateLocationSuccess(position) {
    const { latitude, longitude, speed, accuracy } = position.coords;
    const now = Date.now();

    if (!isGpsValid(latitude, longitude, accuracy)) {
        const gpsEl = document.getElementById('gpsText');
        if (gpsEl) {
            gpsEl.innerText = "⚠️ Sinyal GPS Lemah";
            gpsEl.style.color = "#eab308";
        }
        return;
    }

    const speedKmH = speed ? Math.round(speed * 3.6) : 0;
    const elLat = document.getElementById('lat');
    const elLng = document.getElementById('lng');
    const elSpd = document.getElementById('spdDisplay');

    if (elLat) elLat.innerText = latitude.toFixed(6);
    if (elLng) elLng.innerText = longitude.toFixed(6);
    if (elSpd) elSpd.innerText = speedKmH;

    currentPos.lat = latitude;
    currentPos.lng = longitude;

    const gpsEl = document.getElementById('gpsText');
    if (gpsEl) {
        gpsEl.innerText = isAutoCenter ? "📡 Live Tracking" : "📍 Manual Mode";
        gpsEl.style.color = "#22c55e";
    }

    // --- LOGIC ALAMAT & MAP ---
    const isMovedFarEnough = (latitude.toFixed(3) !== lastAddressLat || longitude.toFixed(3) !== lastAddressLng);
    const isTimePassed = (now - lastAddressRequestTime > ADDRESS_DEBOUNCE_MS);

    if (isMovedFarEnough && isTimePassed) {
        updateStreetName(latitude, longitude);
        lastAddressLat = latitude.toFixed(3);
        lastAddressLng = longitude.toFixed(3);
        lastAddressRequestTime = now;
        if (typeof isTrackingActive !== 'undefined' && isTrackingActive === true) {
            try {
                const sessions = await db.travel_sessions.toArray();

                // JIKA TIDAK ADA SESI, JANGAN SIMPAN APAPUN
                if (sessions.length === 0) {
                    console.warn("⚠️ No active session, location not saved to path_hist.");
                } else {
                    const currentSession = sessions[0];
                    let path = [];

                    if (currentSession.path_hist) {
                        try {
                            path = typeof currentSession.path_hist === 'string'
                                ? JSON.parse(currentSession.path_hist)
                                : currentSession.path_hist;
                        } catch (e) {
                            path = [];
                        }
                    }

                    path.push([latitude, longitude, speedKmH, new Date().toISOString()]);

                    await db.travel_sessions.update(currentSession.idseason, {
                        path_hist: JSON.stringify(path),
                    });
                }
            } catch (err) {
                console.error("Gagal update path ke Dexie:", err);
            }
        }
    }

    updateMapDisplay(latitude, longitude);
    const sessionData = localStorage.getItem('active_session');
    if (sessionData) {
        let session = JSON.parse(sessionData);
        session.last_update = { lat: latitude, lng: longitude };
        session.last_update_time = new Date().toISOString();
        localStorage.setItem('active_session', JSON.stringify(session));
    }
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
    if (isFetchingAddress) return;
    const streetElement = document.getElementById('street-name');
    if (!streetElement) {
        console.warn("⚠️ updateStreetName: elemen street-name tidak ditemukan");
        return;
    }

    const cacheKey = `addr_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const cachedAddress = localStorage.getItem(cacheKey);

    // PINTU 1: Ambil dari Cache (Irit Bandwidth)
    if (cachedAddress) {
        streetElement.innerText = cachedAddress;
        return;
    }

    try {
        isFetchingAddress = true;

        // PINTU 2: Tanya Internet (Hanya jika tidak ada di cache)
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

            // 1. Simpan alamat ke localStorage
            localStorage.setItem(cacheKey, street);

            // 2. Kelola Antrian (Queue)
            let queue = JSON.parse(localStorage.getItem('addr_queue') || '[]');

            // Tambah ke antrian jika belum ada
            if (!queue.includes(cacheKey)) {
                queue.push(cacheKey);
            }

            // 3. Bersihkan cache terlama JIKA sudah lebih dari 1000
            if (queue.length > 1000) {
                const toDelete = queue.splice(0, 100); // Ambil 100 yang paling depan
                toDelete.forEach(key => localStorage.removeItem(key));
            }

            // 4. Simpan kembali antrian yang sudah diupdate
            localStorage.setItem('addr_queue', JSON.stringify(queue));

            // 5. Update Tampilan
            streetElement.innerText = street;
        }
    } catch (error) {
        console.error("Gagal ambil alamat:", error);
        // Jangan tampilkan error jika hanya masalah koneksi, biarkan teks lama/default
    } finally {
        isFetchingAddress = false;
    }
}
window.addEventListener('online', async () => {
    const savedUid = localStorage.getItem('user_id_login');
    if (savedUid) {
        await startTunnelListener(savedUid);
        updateOnlineStatus();
    }
});

window.addEventListener('offline', () => {
    showPushNotif("Sinyal Terputus. Menunggu koneksi...");
    updateOnlineStatus();
});

async function handleManualLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
        alert("Harap isi email dan password!");
        return;
    }
    updateLoading(50, "Memverifikasi Identitas...");
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });
    if (error) {
        alert("Gagal Masuk: " + error.message);
        updateLoading(100, "Gagal Masuk");
        const loginoverlay = document.getElementById('login-overlay');
        if (loginoverlay) {
            loginoverlay.style.display = "none";
        }
    } else {
        const userData = {
            email: data.user.email,
            uid: data.user.id,
            name: data.user.user_metadata.full_name || email.split('@')[0],
            lastLogin: new Date().toISOString()
        };
        localStorage.setItem('user_session', JSON.stringify(userData));
        const loginoverlay = document.getElementById('login-overlay');
        if (loginoverlay) {
            loginoverlay.style.display = "none";
        }
        const areagoogle = document.getElementById('area-google');
        if (areagoogle) {
            areagoogle.style.display = "none";
        }
        updateLoading(100, "Login Berhasil!");
        setTimeout(() => { location.reload(); }, 800);
    }
}

function togglePassword() {
    const passwordInput = document.getElementById("login-password");
    const theSvg = document.getElementById("eye-icon"); // ID SVG kamu
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        theSvg.innerHTML = `
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20 C5 20 1 12 1 12a21.8 21.8 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4 c7 0 11 8 11 8a21.8 21.8 0 0 1-4.06 5.94"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
        `;
    } else {
        passwordInput.type = "password";
        theSvg.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/>
            <circle cx="12" cy="12" r="3"/>
        `;
    }
}

async function re_initEventListeners() {


    const dashboard = document.getElementById('btn-dashboard');
    if (dashboard) {
        dashboard.onclick = async () => {
            window.location.href = 'dashboard.html';
        };
    }

    const theButton = document.getElementById("eyebuton");
    if (theButton) {
        theButton.onclick = async () => {
            togglePassword();
            theButton.style.transform = "translateY(-50%) scale(0.9)";
            setTimeout(() => {
                theButton.style.transform = "translateY(-50%) scale(1)";
            }, 100);
        };
    }
    const btnlogin = document.getElementById('handleManualLogin');
    if (btnlogin) {
        btnlogin.onclick = async () => {
            const passInput = confirm("apakah pasword dan email sudah diisi? klik cancel untuk batal.");
            if (passInput) {
                await handleManualLogin();
            }
        };
    }

    /*

    const btnAreaAdmin = document.getElementById('btn-area-admin');
    if (btnAreaAdmin) {
        btnAreaAdmin.onclick = async () => {
            const yakin = confirm("Yakin mau keluar sistem?");
            if (yakin) {
                await localStorage.removeItem('user_session'); // Hapus cache saat logout
                const user = document.getElementById('user-name').innerText || "User";
                const pass = document.getElementById('admin-pass').innerText || "password";
            }
        };
    }
    */
    const btnrecenter = document.getElementById('btn-recenter');
    if (btnrecenter) {
        btnrecenter.onclick = async () => {
            await recenterMap();
            btnrecenter.style.transform = "scale(0.9)";
            setTimeout(() => btnrecenter.style.transform = "scale(1)", 100);
        };
    }
    const btnScanAction = document.getElementById('btnScanAction');
    if (btnScanAction) {
        btnScanAction.onclick = async () => {
            await openScanner();
            btnScanAction.style.transform = "scale(0.9)";
            setTimeout(() => btnScanAction.style.transform = "scale(1)", 100);
        };
    }
    const btnCloseCamera = document.getElementById('btnCloseCamera');
    if (btnCloseCamera) {
        btnCloseCamera.onclick = async () => {
            await closeCamera();
            btnCloseCamera.style.transform = "scale(0.9)";
            setTimeout(() => btnCloseCamera.style.transform = "scale(1)", 100);
        };
    }
    const btnBerangkat = document.getElementById('btnBerangkat');
    if (btnBerangkat) {
        btnBerangkat.onclick = async () => {
            await handleBerangkat();
            btnBerangkat.style.transform = "scale(0.9)";
            setTimeout(() => btnBerangkat.style.transform = "scale(1)", 100);
        };
    }
    const btnSampai = document.getElementById('btnSampai');
    if (btnSampai) {
        btnSampai.onclick = async () => {
            btnSampai.style.transform = "scale(0.9)";
            setTimeout(() => btnSampai.style.transform = "scale(1)", 100);
            await handleSampai();
        };
    }
}

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
    if (isLocked || isCameraActive) {
        console.warn("⚠️ openScanner: sistem terkunci atau kamera aktif");
        return;
    }
    await initSatpam();
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    const btnScan = document.getElementById('btnScanAction');
    const scanStatus = document.getElementById('scan-status');
    isCameraActive = true;
    isProcessing = true;
    isScannerRunning = false;
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
                "Content-Type": "text/plain",
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

async function closeCamera() {
    const btnScan = document.getElementById('btnScanAction');
    if (btnScan) btnScan.disabled = false;
    const video = document.getElementById('video');
    const container = document.getElementById('camera-container');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    container.style.display = 'none';
    await offSatpam();
    await resetScannerUI();
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



function encryptData(data) {
    const AES_SECRET = import.meta.env.VITE_AES_KEY;
    if (!AES_SECRET) {
        console.error("VITE_AES_KEY nggak ketemu di .env");
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
    const AES_SECRET = import.meta.env.VITE_AES_KEY;
    if (!AES_SECRET) {
        console.error("VITE_AES_KEY nggak ketemu di .env");
        return ciphertext;
    }
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, AES_SECRET);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);

        if (!originalText) {
            console.warn("⚠️ decryptData: hasil decrypt kosong");
            return null;
        }

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

function stopAllSystem() {
    console.warn("sistem dihentikan");
    if (trackingInterval) {
        clearInterval(window.trackingInterval);
        trackingInterval = null;
    }
    if (polliingtimeout) {
        clearTimeout(window.polliingtimeout);
        polliingtimeout = null;
    }
    if (watchId) {
        navigator.geolocation.clearWatch(window.watchId);
        watchId = null;
    }
    if (WebSocket) {
        try {
            socket.close();
        } catch (error) {
            console.error("Error occurred while closing WebSocket:", error);
        }
    }
    if (AbortController) {
        try {
            window.abortController.abort();
        } catch { }
        abortController = null;
    }
    isTrackingActive = false;
    isCameraActive = false;
    isProcessing = false;
    isInitRunning = false;
}

function showOfflineScreen(message = null) {
    const el = document.getElementById('offline-screen');
    if (!el) {
        console.warn("⚠️ showOfflineScreen: elemen offline-screen tidak ditemukan");
        return;
    }
    el.style.display = 'flex';
    if (message) {
        const msg = document.getElementById('offline-message');
        if (msg) msg.innerHTML = message;
    }
}

function hideOfflineScreen() {
    const el = document.getElementById('offline-screen');
    if (!el) {
        console.warn("⚠️ hideOfflineScreen: elemen offline-screen tidak ditemukan");
        return;
    }
    el.style.display = 'none';
}

function showLoading(text = "Memproses...") { // Bisa dipanggil dengan parameter teks khusus, atau default "Memproses..."
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

function updateLoading(percent, text) {
    if (loadProgress) loadProgress.innerText = `${text} (${percent}%)`;
    if (percent >= 100) {
        setTimeout(() => {
            if (loaderSatpam) loaderSatpam.style.display = 'none';
        }, 800);
    }
}

async function resetTampilan() {
    if (map) {
        try {
            map.remove();
            map = null;
        } catch (e) {
            console.warn("Gagal menghapus instance peta:", e);
        }
    }
    ambildatahtml();
    re_initEventListeners();
    initMap();
    initGPS()
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
        if (!currentPos || isNaN(currentPos.lat) || isNaN(currentPos.lng)) {
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
            : 60;
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
        if (!session) {
            alert("Sesi user tidak ditemukan, silakan login ulang.");
            return;
        }
        const uid = session.uid;
        const travelId = generateUniqueId(session.email);
        await db.travel_sessions.put({
            sjkb: encryptData(noSJKB),
            dest: encryptData(tujuan),
            lat_start: encryptData(currentPos.lat.toString()),
            lng_start: encryptData(currentPos.lng.toString()),
            lat: encryptData(currentPos.lat.toString()),
            lng: encryptData(currentPos.lng.toString()),
            depart_at: encryptData(waktuBerangkat.toISOString()),
            arrive_target: encryptData(targetSampai.toISOString()),
            updated_at: encryptData(new Date().toISOString()),
            route_master: encryptData(currentPolylineString),
            path_hist: null,
            status: "Active",
            user_id: session.uid,
            idseason: travelId
        });
        await db.all_logs.put({
            sjkb: encryptData(noSJKB),
            dest: encryptData(tujuan),
            lat_start: encryptData(currentPos.lat.toString()),
            lng_start: encryptData(currentPos.lng.toString()),
            lat: encryptData(currentPos.lat.toString()),
            lng: encryptData(currentPos.lng.toString()),
            depart_at: encryptData(waktuBerangkat.toISOString()),
            arrive_target: encryptData(targetSampai.toISOString()),
            updated_at: encryptData(new Date().toISOString()),
            route_master: encryptData(currentPolylineString),
            path_hist: null,
            status: "Active",
            user_id: session.uid,
            idseason: travelId
        });
        localStorage.setItem('current_session_id', travelId);
        const { error: supabaseError } = await supabase
            .from('path_history')
            .insert([{
                sjkb: encryptData(noSJKB),
                dest: encryptData(tujuan),
                lat_start: encryptData(currentPos.lat.toString()),
                lng_start: encryptData(currentPos.lng.toString()),
                lat: encryptData(currentPos.lat.toString()),
                lng: encryptData(currentPos.lng.toString()),
                depart_at: encryptData(waktuBerangkat.toISOString()),
                arrive_target: encryptData(targetSampai.toISOString()),
                updated_at: encryptData(new Date().toISOString()),
                route_master: encryptData(currentPolylineString),
                path_hist: null,
                status: "Active",
                user_id: session.uid,
                idseason: travelId
            }]);
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        if (supabaseError) {
            console.error('Error simpan ke Supabase:', supabaseError.message);
        }
        isTrackingActive = true;
        isAutoCenter = true;
        startTracking();
        const btnScan = document.getElementById('btnScanAction');
        const btnBerangkat = document.getElementById('btnBerangkat');
        const btnSampai = document.getElementById('btnSampai');
        btnBerangkat.style.display = 'none';
        btnSampai.style.display = 'block';
        if (btnScan) {
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5";
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
        await startTunnelListener();
        await renderToUI();
    } catch (err) {
        console.error("Gagal simpan sesi PouchDB:", err);
        alert("Gagal memulai perjalanan Coba Lagi.");
        resetberangkatUI();
    }
}


async function handleSampai() {
    if (!confirm("Apakah Anda sudah sampai di lokasi tujuan?")) return;
    showLoading("Menyelesaikan perjalanan...");
    try {
        console.group("log_handle_sampai");
        let id_final = "";
        const id_storage = localStorage.getItem('current_session_id');
        if (id_storage) {
            id_final = id_storage;
        } else {
            const activesession = await db.travel_sessions
                .where('status')
                .equals('Active') // Pastikan di handleberangkat statusnya 'active' kecil
                .first();
            if (activesession) {
                id_final = activesession.idseason;
                localStorage.setItem('current_session_id', id_final);
            }
        }
        if (!id_final) {
            alert("data sesi tidak ditemukan. pastikan perjalanan sudah dimulai.");
            console.groupEnd();
            return;
        }
        const activedata = await db.travel_sessions.get(id_final);
        if (!activedata) {
            alert("data sesi tidak ditemukan di database lokal.");
            console.groupEnd();
            return;
        }
        console.log("hostname_saat_ini:", location.hostname);
        if (activedata) {
            activedata.path_hist = [
                [-6.402484, 106.894412, 40, new Date().toISOString()],
                [-6.402500, 106.894500, 45, new Date().toISOString()]
            ];
        } else {
            console.error("waduh_activedata_null_ngga_bisa_suntik");
        }
        const pathhistraw = activedata.path_hist;
        const historyarray = typeof pathhistraw === 'string'
            ? JSON.parse(pathhistraw)
            : pathhistraw;

        if (!historyarray || !Array.isArray(historyarray) || historyarray.length < 2) {
            console.warn("history_perjalanan_minim:", historyarray);
            alert("perjalanan tidak dapat diselesaikan karena history perjalanan anda tidak ada.");
            console.groupEnd();
            return;
        }
        await syncPathToSupabaseWithStatus(id_final, "arrival");
        console.log("sinkron_ke_all_log_id:", id_final);
        await moveSessionToHistory(id_final);
        console.log("hapus_storage_dan_dexie");
        localStorage.removeItem('current_session_id');
        await db.travel_sessions.clear();
        console.groupEnd();
        isTrackingActive = false;
        isAutoCenter = true;
        stopTracking();
        if (currentPos && currentPos.lat !== 0 && typeof map !== "undefined" && map) {
            map.flyTo([currentPos.lat, currentPos.lng], 18);
        }
        if (document.getElementById('no_sjkb')) document.getElementById('no_sjkb').value = "";
        if (document.getElementById('tujuan_dealer')) document.getElementById('tujuan_dealer').value = "";
        if (document.getElementById('target-text')) document.getElementById('target-text').innerText = "--:--";
        const targetel = document.querySelector('.target');
        if (targetel) targetel.classList.add('hidden');
        if (currentPolyline && map) map.removeLayer(currentPolyline);
        if (finishMarker && map) map.removeLayer(finishMarker);
        currentPolylineString = "";
        const btnberangkat = document.getElementById('btnBerangkat');
        const btnsampai = document.getElementById('btnSampai');
        if (btnberangkat) btnberangkat.style.display = 'block';
        if (btnsampai) btnsampai.style.display = 'none';
        const btnscan = document.getElementById('btnScanAction');
        if (btnscan) {
            btnscan.disabled = false;
            btnscan.style.opacity = "1";
            btnscan.style.cursor = "pointer";
        }
        if (typeof releasewakelock === 'function') releasewakelock();
        hideLoading();
        alert("perjalanan selesai");
        renderToUI();
    } catch (e) {
        console.groupEnd();
        console.error("fatal_error_saat_finish:", e);
        const konfirmasiulang = confirm(
            "Gagal Mengirim Laporan Ke Server!\n" +
            "Data perjalanan masih aman di HP. Pastikan internet aktif.\n\n" +
            "Coba kirim ulang sekarang?"
        );
        if (konfirmasiulang) {
            handleSampai();
        }
    }
}


async function handleUpdate5menit() {
    try {
        if (!currentPos || isNaN(currentPos.lat) || isNaN(currentPos.lng)) {
            console.warn("Signal GPS Lemah");
            return;
        }
        let travelId = localStorage.getItem('current_session_id');
        const lastSession = await db.travel_sessions.toCollection().last();
        if (!travelId || !lastSession) {
            console.error("Critical: Sesi hilang dari storage!");
            location.reload();
            return;
        }
        const updatetime = encryptData(new Date().toISOString());
        const latEnc = encryptData(currentPos.lat.toString());
        const lngEnc = encryptData(currentPos.lng.toString());
        await db.travel_sessions.update(lastSession.idseason, {
            lat: latEnc,
            lng: lngEnc,
            updated_at: updatetime,
        });
        const { error: supabaseError } = await supabase
            .from('path_history')
            .update({ lat: latEnc, lng: lngEnc, updated_at: updatetime })
            .eq('idseason', lastSession.idseason);

        // --- FILTER ERROR DI SINI ---
        if (supabaseError) {
            // Cek apakah error karena masalah jaringan (offline/timeout)
            const isNetworkError =
                !navigator.onLine ||
                supabaseError.message.includes("FetchError") ||
                supabaseError.code === "PGRST301" || // Contoh code timeout/lost connection
                supabaseError.status === 0;

            if (isNetworkError) {
                console.warn("Gagal update karena SIGNAL. Dexie aman, skip reload.");
            } else {
                // Jika errornya karena coding (salah nama kolom, query ditolak, dll)
                console.error("Error Coding/Database:", supabaseError.message);
                location.reload();
            }
        } else {
            if (navigator.vibrate) navigator.vibrate(200);
            console.log("Sync Berhasil!");
        }

    } catch (err) {
        // Catch ini biasanya menangkap error coding (SyntaxError, TypeError, dll)
        console.error("Runtime Script Error:", err);
        // Tetap cek: Kalau internet mati saat proses enkripsi/logic, jangan reload.
        if (navigator.onLine) {
            location.reload();
        }
    }
}

let trackingInterval = null;

function startTracking() {
    console.log("update ke supabase setiap 5 menit aktif")
    // 300000 ms = 5 menit
    trackingInterval = setInterval(() => {
        handleUpdate5menit();
    }, 300000);
}

function stopTracking() {
    console.log("update ke supabase setiap 5 menit tidak aktif")
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
}


async function syncPathToSupabaseWithStatus(idseason, status = "Arrive") {
    try {
        console.log("1. Ambil data dari Dexie untuk session:", idseason);
        const rawSession = localStorage.getItem('user_session');
        if (!rawSession) {
            console.error("⚠️ user_session tidak ditemukan di Local Storage!");
            return;
        }
        const userSession = JSON.parse(rawSession);
        console.log("User UID ditemukan:", userSession.uid);

        const currentSession = await db.travel_sessions.get(idseason);
        if (!currentSession) {
            console.warn("⚠️ Sync batal: Session tidak ditemukan!");
            return;
        }

        console.log("2. Data session:", currentSession);
        if (!currentSession.path_hist) {
            console.warn("⚠️ Sync batal: path_hist kosong!");
            return;
        }
        // Cek apakah perlu di-parse atau sudah jadi object
        const fullPath = typeof currentSession.path_hist === 'string'
            ? JSON.parse(currentSession.path_hist)
            : currentSession.path_hist;

        console.log("3. Menyiapkan data enkripsi...");
        const encPoly = encryptData(encodePolyline(fullPath.map(p => [p[0], p[1]])));
        const encSpeeds = encryptData(JSON.stringify(fullPath.map(p => p[2])));
        const encTimes = encryptData(JSON.stringify(fullPath.map(p => p[3])));

        const pathData = [encPoly, encSpeeds, encTimes];

        console.log("4. Mengirim ke Supabase dengan status:", status);
        const { error } = await supabase
            .from('path_history')
            .update({
                path_hist: JSON.stringify(pathData),
                updated_at: encryptData(new Date().toISOString()),
                status: status
            })
            .eq('idseason', currentSession.idseason)
            .eq('user_id', userSession.uid);

        if (error) {
            console.error("❌ Error dari Supabase:", error.message);
            throw error;
        }

        console.log(`✅ Berhasil Update Supabase dengan status: ${status}!`);

    } catch (err) {
        console.error("💥 ERROR TOTAL:", err);
    }
}

function encodePolyline(points) {
    let lastLat = 0;
    let lastLng = 0;
    let str = "";
    function encodeValue(value) {
        value = value < 0 ? ~(value << 1) : (value << 1);
        while (value >= 0x20) {
            str += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
            value >>= 5;
        }
        str += String.fromCharCode(value + 63);
    }
    for (let point of points) {
        let lat = Math.round(point[0] * 1e5);
        let lng = Math.round(point[1] * 1e5);
        encodeValue(lat - lastLat);
        encodeValue(lng - lastLng);
        lastLat = lat;
        lastLng = lng;
    }
    return str;
}

let allLogs = null;

async function startTunnelListener(uid) {
    let targetUid = uid; // 1. Tampung dulu dari parameter

    // 2. Kalau parameter kosong, baru bongkar LocalStorage
    if (!targetUid) {
        try {
            const sessionRaw = localStorage.getItem('user_session');
            if (sessionRaw) {
                const parsed = JSON.parse(sessionRaw);
                targetUid = parsed.uid;
            }
        } catch (e) {
            console.log("Gagal parsing session:", e);
        }
    }

    // 3. VALIDASI KRUSIAL: Kalau tetep nggak ada UID, stop di sini!
    if (!targetUid || targetUid === "undefined") {
        console.warn("Tunnel Listener dibatalkan: UID kosong.");
        return;
    }
    if (currentChannel) {
        console.log("Menutup terowongan lama...");
        await supabase.removeChannel(currentChannel);
        currentChannel = null;
    }

    try {
        allLogs = await db.all_logs
            .orderBy('created_at')
            .reverse()
            .toArray();
        if (allLogs.length > 0) {
            renderToUI(allLogs);
            console.log("Menampilkan history lama dari lokal...");
        }
    } catch (err) {
        console.error("Gagal ambil data awal Dexie:", err);
    }

    const { data, error } = await supabase
        .from('path_history')
        .select('arrive_target, status, sjkb, depart_at, created_at, idseason, dest, updated_at')
        .eq('user_id', targetUid)
        .eq('status', 'Active')
        .order('created_at', { ascending: false })

    if (error) {
        console.error(error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('Tidak ada sesi aktif');
        return;
    }

    if (!error && data) {
        const logsWithTimestamp = data.map(row => ({
            ...row,
            saved_at: new Date().toISOString()
        }));

        try {
            await db.all_logs.bulkPut(logsWithTimestamp);
            const count = await db.all_logs.count();
            if (count > 100) {
                const extraCount = count - 100;
                const oldDataIds = await db.all_logs
                    .orderBy('created_at')
                    .limit(extraCount)
                    .primaryKeys();
                await db.all_logs.bulkDelete(oldDataIds);
                console.log(`Bersih-bersih: ${extraCount} data lama dihapus.`);
            }
            allLogs = await db.all_logs
                .orderBy('created_at')
                .reverse()
                .toArray();

            renderToUI(allLogs);
        } catch (err) {
            console.error("Gagal kelola data di Dexie:", err);
        }
    }
    const idseason = data[0]?.idseason;
    if (!idseason) {
        console.log('ID Session tidak ditemukan');
        return;
    }
    currentChannel = supabase
        .channel(`db-changes-${idseason}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'path_history',
                filter: `idseason=eq.${idseason}`
            },
            async (payload) => {
                if (payload.new.status === 'Arrive') {
                    console.log('Data Update Masuk:', payload.new);
                    try {
                        await db.all_logs.put({
                            ...payload.new,
                            saved_at: new Date().toISOString()
                        });
                        allLogs = await db.all_logs
                            .orderBy('created_at')
                            .reverse()
                            .toArray();
                        renderToUI(allLogs);
                        const waktu = new Date(payload.new.created_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        showPushNotif(`Update Lokasi Berhasil: ${waktu} WIB`);
                    } catch (err) {
                        console.error("Gagal sinkron Realtime ke Dexie:", err);
                    }
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("Terowongan tersambung dan siap menerima data!");
            }
        });
}

// Helper Fungsi Notif (Sederhana tapi Ganteng)
function showPushNotif(msg) {
    const notif = document.createElement('div');
    notif.className = 'toast-notif';
    notif.innerText = msg;
    Object.assign(notif.style, {
        position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
        background: '#10b981', color: 'white', padding: '10px 20px',
        borderRadius: '20px', zIndex: '9999', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        fontSize: '13px', fontWeight: 'bold'
    });
    document.body.appendChild(notif);
    if (navigator.vibrate) navigator.vibrate(100);
    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => notif.remove(), 500);
    }, 3000);
}

async function renderToUI(items = null) {
    const container = document.getElementById('logContainer');
    if (!container) {
        console.error("❌ logContainer tidak ditemukan!");
        return;
    }
    let dataToRender;
    if (items) {
        dataToRender = items;
    } else {
        try {
            // Ambil semua data tanpa sorting
            const allData = await db.all_logs.toArray();
            
            if (allData.length === 0) {
                dataToRender = [];
            } else {
                // Decrypt created_at dan sorting manual
                dataToRender = allData.map(item => {
                    try {
                        const decryptedCreatedAt = item.created_at ? decryptData(item.created_at) : new Date().toISOString();
                        return {
                            ...item,
                            decrypted_created_at: new Date(decryptedCreatedAt)
                        };
                    } catch (err) {
                        console.warn("Gagal decrypt created_at untuk item:", item.idseason, err);
                        return {
                            ...item,
                            decrypted_created_at: new Date(0) // fallback ke oldest date
                        };
                    }
                });
                
                // Sorting berdasarkan decrypted_created_at (terbaru dulu)
                dataToRender.sort((a, b) => b.decrypted_created_at - a.decrypted_created_at);
            }
        } catch (err) {
            console.error("❌ Gagal ambil data dari all_logs:", err);
            return;
        }
    }
    const totalItems = dataToRender.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (totalItems === 0) {
        container.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:20px;">Belum ada riwayat perjalanan.</div>`;
        console.warn("⚠️ Tidak ada data yang dirender di renderToUI()");
        return;
    }

    // Logic Slicing buat 1 item
    const start = currentPage * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = dataToRender.slice(start, end);

    container.innerHTML = paginatedItems.map(item => {
        const options = {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };

        // Dekripsi data logistics
        const noSJKB = decryptData(item.sjkb) || '-';
        const tujuan = decryptData(item.dest) || '-';
        
        // Warning jika decrypt gagal
        if (noSJKB === '-' && item.sjkb) {
            console.warn("⚠️ Gagal decrypt SJKB untuk item:", item.idseason);
        }
        if (tujuan === '-' && item.dest) {
            console.warn("⚠️ Gagal decrypt tujuan untuk item:", item.idseason);
        }
        
        const depart = new Date(decryptData(item.depart_at));
        const targetDate = new Date(decryptData(item.arrive_target));
        const update = new Date(decryptData(item.updated_at));
        
        // Warning jika date invalid
        if (isNaN(depart.getTime())) {
            console.warn("⚠️ Invalid depart_at date untuk item:", item.idseason);
        }
        if (isNaN(targetDate.getTime())) {
            console.warn("⚠️ Invalid arrive_target date untuk item:", item.idseason);
        }
        if (isNaN(update.getTime())) {
            console.warn("⚠️ Invalid updated_at date untuk item:", item.idseason);
        }
        let statusBase = item.status;
        const isSelesai = statusBase === "Arrive";
        // Status & Warna (Logic Toyota Merah/Hijau lu)
        const isDelay = new Date() > targetDate ? "Delay" : "On Schedule";
        let statusTampil = statusBase === "Active" ? isDelay : statusBase;

        let warna = "#2563eb";
        let warnaBG = "#ffffff";

        if (statusBase === "Active") {
            if (isDelay === "Delay") {
                warna = "#eb0a1e"; // Merah Toyota
                warnaBG = "#fef2f2";
            } else {
                warna = "#22c55e"; // Green
                warnaBG = "#f0fdf4";
            }
        } else if (statusBase === "Arrive") {
            warna = "#64748b";
            warnaBG = "#f8fafc";
        }

        return `
        <div class="log-card" style="background-color:${warnaBG}; solid ${warna}">
            <div class="header-log"">
                <span class="sjkb">📄 ${noSJKB}</span>
                <span style="color:${warna}">${statusTampil}</span>
            </div>
            <div class="logdetail-tujuan" style="margin-bottom:5px;">
                <span>📍 Tujuan:</span>
                <span>${tujuan}</span>
            </div>
            <div class="logdetail-depart">
                <span>Depart :</span>
                <span>${depart.toLocaleString('id-ID', options)} WIB</span>
            </div>
            <div class="logdetail-target">
                <span>Target :</span>
                <span>${targetDate.toLocaleString('id-ID', options)} WIB</span>
            </div>
            <div class="lastupdatelog">
                <span>Update :</span>
                <span>${update.toLocaleString('id-ID', options)} WIB</span>
            </div>


        </div>`;
    }).join('') + `
    <div class="pagination" style="display:flex; justify-content:center; align-items:center; gap:20px; margin-top:15px;">
        <button id="btprev" ${currentPage === 0 ? 'disabled' : ''} style="padding:8px 16px; border-radius:5px; cursor:pointer;">Prev</button>
        <span class="pages" style="font-weight:bold; font-family:sans-serif;">${currentPage + 1} / ${totalPages}</span>
        <button id="btnext" ${currentPage >= totalPages - 1 ? 'disabled' : ''} style="padding:8px 16px; border-radius:5px; cursor:pointer;">Next</button>
    </div>`;
    re_initEventListeners();
    re_initpaginationEventListeners();
}

async function re_initpaginationEventListeners() {

    const btnext = document.getElementById('btnext');
    if (btnext) {
        btnext.onclick = async () => {
            const data = await db.all_logs.toArray();
            const totalPages = Math.ceil(data.length / itemsPerPage);
            console.log(`📄 Pagination: Current page ${currentPage + 1}/${totalPages}, Total items: ${data.length}`);
            if (currentPage < totalPages - 1) {
                currentPage++;
                console.log(`➡️ Moving to page ${currentPage + 1}`);
                renderToUI();
            } else {
                console.warn("⚠️ Already on last page, cannot go next");
            }
        };
    }

    const btnprev = document.getElementById('btprev');
    if (btprev) {
        btprev.onclick = async () => {
            if (currentPage > 0) {
                console.log(`⬅️ Moving to page ${currentPage}`);
                currentPage--;
                renderToUI();
            } else {
                console.warn("⚠️ Already on first page, cannot go back");
            }
        };
    }
}


window.filterTable = function () {
    const keyword = document.getElementById('searchInput').value.toLowerCase().trim();
    console.log(`🔍 Searching for keyword: "${keyword}" in ${allLogs.length} items`);
    const filteredData = allLogs.filter(item => {
        const sjkb = decryptData(item.sjkb).toLowerCase();
        const tujuan = decryptData(item.dest).toLowerCase();
        return sjkb.includes(keyword) || tujuan.includes(keyword);
    });
    console.log(`📊 Filter result: ${filteredData.length} items found`);
    renderToUI(filteredData);
};

async function loadTargetFromDexie() {
    try {
        const session = await db.travel_sessions.toArray();
        if (session && session.length > 0) {
            const lastSession = session[session.length - 1];
            if (lastSession.arrive_target) {
                const decryptedISO = decryptData(lastSession.arrive_target);
                const jamTarget = new Date(decryptedISO).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } else {
                console.warn("⚠️ arrive_target tidak ditemukan di lastSession");
            }
        } else {
            console.warn("⚠️ Tidak ada session di travel_sessions saat loadTargetFromDexie()");
        }
    } catch (error) {
        console.error("Gagal load target dari Dexie:", error);
    }
}

function goToCamera() {
    window.location.href = 'camera.html';
}

function updateSpeedUI(speed) {
    const spdDisplay = document.getElementById('spdDisplay');
    const bars = document.querySelectorAll('#speedBar span');
    spdDisplay.innerText = Math.round(speed);
    spdDisplay.className = ''; // Reset class
    if (speed > 80) spdDisplay.classList.add('speed-danger');
    else if (speed >= 60) spdDisplay.classList.add('speed-warning');
    else if (speed >= 40) spdDisplay.classList.add('speed-safe');
    else spdDisplay.classList.add('speed-normal');
    const activeCount = Math.min(Math.floor(speed / 10), 10);
    bars.forEach((bar, index) => {
        bar.className = ''; // Reset bar
        if (index < activeCount) {
            if (speed > 80) bar.classList.add('bar-danger');
            else if (speed >= 60) bar.classList.add('bar-warning');
            else if (speed >= 40) bar.classList.add('bar-safe');
            else bar.classList.add('bar-normal');
        }
    });
}

async function moveSessionToHistory(idseason) {
    try {
        const activeData = await db.travel_sessions.get(idseason);
        if (!activeData) {
            return;
        }
        const rawPath = typeof activeData.path_hist === 'string'
            ? JSON.parse(activeData.path_hist)
            : activeData.path_hist;
        const encPoly = encryptData(encodePolyline(rawPath.map(p => [p[0], p[1]])));
        const encSpeeds = encryptData(JSON.stringify(rawPath.map(p => p[2])));
        const encTimes = encryptData(JSON.stringify(rawPath.map(p => p[3])));
        const pathData = [encPoly, encSpeeds, encTimes];

        try {
            const hasil = await db.all_logs.put({

                sjkb: activeData.sjkb,
                dest: activeData.dest,
                lat_start: activeData.lat_start,
                lng_start: activeData.lng_start,
                lat: activeData.lat,
                lng: activeData.lng,
                depart_at: activeData.depart_at,
                arrive_target: activeData.arrive_target,
                updated_at: activeData.updated_at,
                route_master: activeData.route_master,
                path_hist: pathData,
                status: "Arrive",
                user_id: activeData.user_id,
                idseason: activeData.idseason

            });

            console.log(`%c sukses simpan history: ${hasil}`, "color: green; font-weight: bold;");
        } catch (err) {

            console.group("error_simpan_dexie");
            console.error("pesan_error:", err.message);
            console.error("detail_data_gagal:", activeData.idseason);
            console.groupEnd();

            alert("gagal simpan history lokal, cek koneksi atau memori hp");
        }

        console.log(`History ID ${idseason} aman tersimpan.`);
        if (typeof renderToUI === "function") {
            renderToUI();
        }
        console.groupEnd();
    } catch (err) {
        console.error("Gagal mindahin ke history:", err);
    }
}


