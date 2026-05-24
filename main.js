window.appState = {
    isAutoCenter: true,
    isFlying: false,
    isTravel: false,
    myMap: null,
    activePolyline: null,
    allRoutes: [],
    selectedRouteIndex: 0,
    myMarker: null,
    currentRouteEndMarker: null,
    travelSession: false,
    travelActive: false,
    activeRouteCoords: []
};


import { initGPS, waitForFirstGPS, stopGPS } from './gpsModule';
import './index.css';
import { pasangSwipe } from './swipeAction';
import { checkSessionGate, hideLoading, showLoading, showOfflineScreen } from './loginModule';
import { openscanerocr, closeCamera, update_element } from './PreparationModule';
import { initMap, recenterMap, munculmap, renderRute } from './map';
import { checkTravelActive, initSlideButton, absen } from './travelactive';
import { handleDriverBerangkat } from './berangkat';
import { handleDriverSampai } from './sampai';
import { queryfromsupabase } from './moduleQuery';
import '/istravel';

const SATU_BULAN = 30 * 24 * 60 * 60 * 1000;

window.addEventListener('DOMContentLoaded', async () => {
    try {
        showLoading("sedang mengaktifkan GPS...");
        initGPS();
        await waitForFirstGPS();
        await initMap();
        await checkSessionGate();
        const localData = JSON.parse(localStorage.getItem('user_session'));
        const hasSession = localData?.lastLogin;
        const isSessionValid = hasSession && (Date.now() - new Date(localData.lastLogin).getTime() < SATU_BULAN);
        if (!isSessionValid) {
            await re_initEventListeners();
            return;
        } else {
            await re_initEventListeners();
            await queryfromsupabase();
            hideLoading();
            await checkTravelActive();
        }
    } catch (err) {
        console.error("Inisialisasi Gagal:", err);
        stopGPS();
        hideLoading();
        showOfflineScreen("GPS tidak tersedia: " + err);
    }
});


function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


export async function re_initEventListeners() {

    pasangSwipe("handleBerangkat", "trackBerangkat", () => {
        console.log("Tombol berangkat ditekan, mencoba memanggil handleDriverBerangkat...");
        if (typeof handleDriverBerangkat === "function") {
            handleDriverBerangkat();
        } else {
            console.error("Fungsi handleDriverBerangkat tidak ditemukan di window!");
        }
    });

    // 2. Logika murni swipe Sampai -> panggil global window
    pasangSwipe("handleSampai", "trackSampai", () => {
        console.log("Tombol sampai ditekan, mencoba memanggil handleDriverSampai...");
        if (typeof handleDriverSampai === "function") {
            handleDriverSampai();
        } else {
            console.error("Fungsi handleDriverSampai tidak ditemukan di window!");
        }
    });

    initSlideButton(async () => {
        console.log('ORDER SUCCESS');
        await absen();
    });

    const closemap = document.getElementById('close_map_btn');
    if (closemap) {
        closemap.onclick = () => { // Menghapus 'async' karena tidak dibutuhkan
            const containermap = document.getElementById("map_container");
            if (containermap) {
                // FIX: Gunakan .style.display = "none" untuk menyembunyikannya
                containermap.style.display = "none";
            }
        };
    }

    const openmap = document.getElementById('btnmulaiperjalanan');
    if (openmap) {
        openmap.onclick = async () => {
            if (openmap) {
                await munculmap();
                await delay(800);
                await renderRute();
            }
        };
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            await handleManualLogin();
        };
    }

    const btnScanAction = document.getElementById('btnScanAction');
    if (btnScanAction) {
        btnScanAction.onclick = async () => {
            await openscanerocr();
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

    const btnrecenter = document.getElementById('btn-recenter');
    if (btnrecenter) {
        btnrecenter.onclick = () => {
            recenterMap();
        };
    }
}

window.addEventListener('online', async () => {
    updateOnlineStatus();
});

window.addEventListener('offline', () => {
    showPushNotif("Sinyal Terputus. Menunggu koneksi...");
    updateOnlineStatus();
});

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