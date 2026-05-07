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
            .catch(err => console.log("SW Error:", err));
    });
}

import './style.css'
import { createClient } from '@supabase/supabase-js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Tesseract from 'tesseract.js'
import Dexie from 'dexie'
import CryptoJS from 'crypto-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
const db = new Dexie('logistic_db');
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const MAX_RADIUS_KM = 1;
let isFirstLocation = true;
let watchId = null;
let isTrackingActive = false;
let lastAddressLat = 0;
let lastAddressLng = 0;
let currentPos = { lat: 0, lng: 0 };
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

window.addEventListener('DOMContentLoaded', async () => {
    console.log("Ambil inital body");
    await ambildatahtml();
    console.log("Merubah flag tracking menjadi off");
    await stopTracking();
    console.log("merubah flag istracking");
    isTrackingActive = false;
    console.log("check session gate");
    await checkSessionGate();
    console.log("reinit event listener");
    await re_initEventListeners();
    console.log("hideofline screen");
    await hideOfflineScreen();
    console.log("check status online");
    await updateOnlineStatus();
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function ambildatahtml() {
    function resetAppToDefault() {
        console.log("Cleaning up system...");
        const inputs = ['no_sjkb', 'tujuan_dealer', 'lt_input'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        const toHide = [
            'camera-container',
            'area-admin',
            'login-overlay',
            'area-google',
            'ruteSelectionArea',
            'btnSampai'
        ];
        toHide.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const btnBerangkat = document.getElementById('btnBerangkat');
        if (btnBerangkat) btnBerangkat.style.display = 'block';
        const btnScan = document.getElementById('btnScanAction');
        if (btnScan) {
            btnScan.style.opacity = "1";
            btnScan.style.backgroundColor = "#2563eb";
            btnScan.style.cursor = "pointer";
            btnScan.disabled = false;
            btnScan.style.transform = "scale(1)";
        }
        if (currentPolyline) {
            map.removeLayer(currentPolyline);
            currentPolyline = null;
        }
        console.log("System Clean! Siap rute baru.");
    }
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
            console.log("Sesi expired/kosong. Meminta login ulang (Online)...");
            return;
        }
        console.log("Sesi valid. Memuat sistem online...");
        await initSatpam();
        await resetTampilan();
        await checkActiveSessiononline();
    } else {
        if (isSessionValid) {
            console.log("Sesi valid. Memuat sistem offline...");
            await initSatpam();
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
        console.log("Hasil getSession:", { session, error });
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
            console.log("Sesi ditemukan, user sudah login:", userData);
        } else {
            console.log("Tidak ada sesi aktif. Meminta login...");
            handleUnauthenticated();
        }
    } catch (error) {
        console.error("Gagal percobaan:", error);
        if (retryCount < 3) {
            retryCount++;
            console.log("Mencoba lagi (Percobaan ke-" + retryCount + ")");
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
            console.log("Emergency Timer Triggered: Google Login button failed to load within expected time.");
            stopAllSystem();
        }
    }, 6000);
    if (typeof google !== 'undefined' && google.accounts) {
        console.log("Google SDK terdeteksi, menampilkan tombol login...");
        renderGoogleButton();
    } else {
        console.warn("Google SDK tidak terdeteksi saat inisialisasi.");
        clearTimeout(emergencyTimer);
        handleSDKLoadFailure();
    }
}

function renderGoogleButton() {
    console.log("Menginisialisasi Google Sign-In...");
    google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        auto_select: false,
    });
    const loginoverlay = document.getElementById('login-overlay');
    const googleBtnDiv = document.getElementById("google-login-btn");
    const googlearea = document.getElementById("area-google");
    if (loginoverlay) {
        console.log("Menampilkan overlay login...");
        loginoverlay.style.display = "flex";
    } else {
        console.warn("Elemen login-overlay tidak ditemukan. Pastikan elemen dengan id 'login-overlay' ada di HTML.");
    }
    if (googlearea) {
        console.log("Menampilkan area Google Sign-In...");
        document.getElementById("area-google").style.display = "block";
    } else {
        console.warn("Elemen area-google tidak ditemukan. Pastikan elemen dengan id 'area-google' ada di HTML.");
    }
    if (googleBtnDiv) {
        console.log("Merender tombol Google Sign-In...");
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
        console.log("App is Online");
    } else {
        container.classList.add('status-offline');
        text.innerText = "SYSTEM OFFLINE";
        dot.style.backgroundColor = "#dc3545";
        console.log("App is Offline");
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
            console.log("Sesi aktif ditemukan di Dexie:", sessionId);
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
                            console.log("Terbang ke lokasi terakhir dari DB:", lastPos);
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
                } else {
                    console.error("Rute yang dipilih tidak valid atau tidak ditemukan di sesi Dexie.");
                }
            }, 1500);
            if (typeof requestWakeLock === 'function') requestWakeLock();
            console.log("Sesi aktif berhasil dimuat dari Dexie, sistem siap melanjutkan tracking.");
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
            console.log("Mencoba lagi untuk memuat sesi aktif... (Percobaan ke-" + retryCount + ")");
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
    //stopTracking();
}

async function checkActiveSessiononline() {
    const userSession = JSON.parse(localStorage.getItem('user_session'));
    const uid = userSession ? userSession.uid : null;
    if (!uid) {
        console.warn("Sesi tidak ditemukan di localstorage. User harus login ulang.");
        location.reload();
        return;
    }
    try {
        const { data: activeSession, error } = await supabase
            .from('path_history')
            .select('*')
            .eq('user_id', uid)
            .eq('status', 'Active')
            .maybeSingle();
        if (error) throw error;
        if (activeSession) {
            console.log("Sesi aktif ditemukan di server:", activeSession.idseason);
            const localSessions = await db.travel_sessions.toArray();
            const localData = localSessions.length > 0 ? localSessions[0] : null;
            if (localData && localData.idseason === activeSession.idseason) {
                console.log("Sesi sama dengan lokal, gunakan data Dexie.");
                startTracking();
                updateUIFromSession(localData);  // Update UI menggunakan data lokal
            } else {
                console.warn("ID berbeda atau lokal kosong! Overwrite Dexie dengan data Server...");
                await db.travel_sessions.clear();
                await db.travel_sessions.put({
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
                });
                updateUIFromSession(activeSession);
            }
            if (typeof requestWakeLock === 'function') requestWakeLock();
            return activeSession.idseason;
        } else {
            console.log("Tidak ada sesi aktif di server.");
            ambildatahtml();
            isTrackingActive = true;
            isAutoCenter = true;
            //startTracking();
            stopTracking();
            return;
        }

    } catch (error) {
        console.error("Gagal memuat sesi aktif:", error);
        alert("Gagal memuat sesi aktif. Silakan muat ulang halaman.");
        showOfflineScreen("Gagal memuat sesi aktif.");
        stopAllSystem();
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
    if (typeof isTrackingActive !== 'undefined' && isTrackingActive === true) {
        try {
            const sessions = await db.travel_sessions.toArray();
            if (sessions.length > 0) {
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
                console.log("Path berhasil diupdate");
            }
        } catch (err) {
            console.error("Gagal update path ke Dexie:", err);
        }
    }
    const isMovedFarEnough = (latitude.toFixed(3) !== lastAddressLat || longitude.toFixed(3) !== lastAddressLng);
    const isTimePassed = (now - lastAddressRequestTime > ADDRESS_DEBOUNCE_MS);
    if (isMovedFarEnough && isTimePassed) {
        updateStreetName(latitude, longitude);
        lastAddressLat = latitude.toFixed(3);
        lastAddressLng = longitude.toFixed(3);
        lastAddressRequestTime = now;
    }
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

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

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
    const theButton = document.getElementById("eyebuton");
    if (theButton) {
        theButton.addEventListener('click', async () => {
            togglePassword();
            theButton.style.transform = "translateY(-50%) scale(0.9)";
            setTimeout(() => {
                theButton.style.transform = "translateY(-50%) scale(1)";
            }, 100);
        });
    }
    const btnlogin = document.getElementById('handleManualLogin');
    if (btnlogin) {
        btnlogin.addEventListener('click', async () => {
            const passInput = confirm("apakah pasword dan email sudah diisi? klik cancel untuk batal.");
            if (passInput) {
                await handleManualLogin();
            }
        });
    }
    const btnAreaAdmin = document.getElementById('btn-area-admin');
    if (btnAreaAdmin) {
        btnAreaAdmin.addEventListener('click', async () => {
            const yakin = confirm("Yakin mau keluar sistem?");
            if (yakin) {
                await localStorage.removeItem('user_session'); // Hapus cache saat logout
                const user = document.getElementById('user-name').innerText || "User";
                const pass = document.getElementById('admin-pass').innerText || "password";
            }
        });
    }
    const btnrecenter = document.getElementById('btn-recenter');
    if (btnrecenter) {
        btnrecenter.addEventListener('click', async () => {
            await recenterMap();
            btnrecenter.style.transform = "scale(0.9)";
            setTimeout(() => btnrecenter.style.transform = "scale(1)", 100);
        });
    }
    const btnScanAction = document.getElementById('btnScanAction');
    if (btnScanAction) {
        btnScanAction.addEventListener('click', async () => {
            await openScanner();
            btnScanAction.style.transform = "scale(0.9)";
            setTimeout(() => btnScanAction.style.transform = "scale(1)", 100);
        });
    }
    const btnCloseCamera = document.getElementById('BtnCloseCamera');
    if (btnCloseCamera) {
        btnCloseCamera.addEventListener('click', async () => {
            await closeCamera();
            btnCloseCamera.style.transform = "scale(0.9)";
            setTimeout(() => btnCloseCamera.style.transform = "scale(1)", 100);
        });
    }
    const btnBerangkat = document.getElementById('btnBerangkat');
    if (btnBerangkat) {
        btnBerangkat.addEventListener('click', async () => {
            await handleBerangkat();
            btnBerangkat.style.transform = "scale(0.9)";
            setTimeout(() => btnBerangkat.style.transform = "scale(1)", 100);
        });
    }
    const btnSampai = document.getElementById('btnSampai');
    if (btnSampai) {
        btnSampai.addEventListener('click', async () => {
            await handleSampai();
            btnSampai.style.transform = "scale(0.9)";
            setTimeout(() => btnSampai.style.transform = "scale(1)", 100);
        });
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
    if (isLocked || isCameraActive) return;
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
    console.log("Semua sistem dihentikan, state reset ke default.");
}

function showOfflineScreen(message = null) {
    const el = document.getElementById('offline-screen');
    if (!el) return;
    el.style.display = 'flex';
    if (message) {
        const msg = document.getElementById('offline-message');
        if (msg) msg.innerHTML = message;
    }
}

function hideOfflineScreen() {
    const el = document.getElementById('offline-screen');
    if (!el) return;
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
    ambildatahtml();
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

db.version(1).stores({
    travel_sessions: 'idseason, status, waktu_berangkat'
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
    } catch (err) {
        console.error("Gagal simpan sesi PouchDB:", err);
        alert("Gagal memulai perjalanan Coba Lagi.");
        resetberangkatUI();
    }
}

async function handleSampai() {
    if (!confirm("Apakah Anda sudah sampai di lokasi tujuan?")) return;
    try {
        await syncPathToSupabase();
        localStorage.removeItem('current_session_id');
        await db.travel_sessions.clear();
        isTrackingActive = false;
        isAutoCenter = true;
        stopTracking();
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
        }
        ambildatahtml();
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
        const btnScan = document.getElementById('btnScanAction');
        stopTracking();
        if (btnScan) {
            btnScan.disabled = false;
            btnScan.style.opacity = "1"; // Opsional: biar kelihatan redup/mati
            btnScan.style.cursor = "pointer";
        }
        console.log("berhasil menyelesaikan perjalanan");
        alert("perjalanan selesai");
    } catch (e) {
        console.error("Fatal Error saat Finish:", e);

        // Tampilkan modal/alert yang lebih informatif
        const pesanError = e.message || "Koneksi terputus";

        const konfirmasiUlang = confirm(
            "Gagal Mengirim Laporan Ke Server!" +
            "Data perjalanan masih aman di HP. Pastikan internet aktif dan coba klik 'Selesai' lagi.\n\n" +
            "Coba kirim ulang sekarang?"
        );
        if (konfirmasiUlang) {
            handleSampai();
        }
    }
}

async function handleUpdate5menit() {
    try {
        if (!currentPos || isNaN(currentPos.lat) || isNaN(currentPos.lng)) {
            alert("Signal GPS Lemah");
            return;
        }
        const travelId = localStorage.getItem('current_session_id');
        if (!travelId) {
            throw new Error("Session ID tidak ditemukan di localStorage");
        }
        const updatetime = encryptData(new Date().toISOString());
        await db.travel_sessions.update(travelId, {
            lat: encryptData(currentPos.lat.toString()),
            lng: encryptData(currentPos.lng.toString()),
            updated_at: updatetime,
        });
        const { error: supabaseError } = await supabase
            .from('path_history')
            .update({
                lat: encryptData(currentPos.lat.toString()),
                lng: encryptData(currentPos.lng.toString()),
                updated_at: updatetime,
            })
            .eq('idseason', travelId);
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        console.log("update data ke supabase setiap 5 menit berhasil");
        if (supabaseError) {
            console.error('Error update ke Supabase:', supabaseError.message);
        }
    } catch (err) {
        console.error("Gagal simpan sesi PouchDB:", err);
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


async function syncPathToSupabase() {
    try {
        const sessions = await db.travel_sessions.toArray();
        if (sessions.length === 0) return;
        const currentSession = sessions[0];
        if (!currentSession.path_hist) return;
        const fullPath = JSON.parse(currentSession.path_hist);
        const encPoly = encryptData(encodePolyline(fullPath.map(p => [p[0], p[1]])));
        const encSpeeds = encryptData(JSON.stringify(fullPath.map(p => p[2])));
        const encTimes = encryptData(JSON.stringify(fullPath.map(p => p[3])));
        const pathData = [encPoly, encSpeeds, encTimes];
        const { error } = await supabase
            .from('travel_history')
            .update({
                path_hist: JSON.stringify(pathData),
                updated_at: encryptData(new Date().toISOString()),
                status: "Arrive"
            })
            .eq('idseason', currentSession.idseason)
            .eq('user_id', userSession.uid);
        if (error) throw error;
        console.log("✅ Data masuk ke kolom TEXT Supabase!");
    } catch (err) {
        console.error("Gagal sinkronisasi:", err);
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
