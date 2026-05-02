let watchId = null;
let map;
let userMarker;
let isFirstLocation = true;
let isAutoCenter = true;
let currentPos = { lat: 0, lng: 0 };

const geoOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
};

/**
 * 1. INISIALISASI PETA
 */
function initMap() {
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

    // Zoom ditaruh di kanan bawah
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

    logKeLayar("🗺️ Map Ready");
}

/**
 * 2. INISIALISASI GPS (Langsung panggil popup izin)
 */
function initGPS() {
    if ("geolocation" in navigator) {
        logKeLayar("📡 Meminta akses GPS...");
        watchId = navigator.geolocation.watchPosition(
            updateLocationSuccess,
            updateLocationError,
            geoOptions
        );
    } else {
        logKeLayar("❌ Browser tidak support GPS");
    }
}

/**
 * 3. UPDATE VISUAL PETA
 */
function updateMapDisplay(lat, lng) {
    if (!map || !userMarker) return;
    const newPos = [lat, lng];

    userMarker.setLatLng(newPos);

    if (isFirstLocation) {
        map.setView(newPos, 17);
        isFirstLocation = false;
        return;
    }

    if (isAutoCenter) {
        map.flyTo(newPos, map.getZoom(), {
            animate: true,
            duration: 1.5 
        });
    }
}

/**
 * 4. CALLBACK SUKSES GPS
 */
function updateLocationSuccess(position) {
    const { latitude, longitude, speed } = position.coords;
    const speedKmH = speed ? Math.round(speed * 3.6) : 0;
    
    currentPos.lat = latitude;
    currentPos.lng = longitude;

    document.getElementById('lat').innerText = latitude.toFixed(6);
    document.getElementById('lng').innerText = longitude.toFixed(6);
    document.getElementById('spdDisplay').innerText = speedKmH;
    document.getElementById('gpsText').innerText = isAutoCenter ? "📡 Live Tracking" : "📍 Manual Mode";
    document.getElementById('gpsText').style.color = "#22c55e";

    updateMapDisplay(latitude, longitude);
}

/**
 * 5. TOMBOL RECENTER
 */
function recenterMap() {
    isAutoCenter = true;
    if (currentPos.lat !== 0) {
        map.flyTo([currentPos.lat, currentPos.lng], 17, {
            animate: true,
            duration: 1
        });
        logKeLayar("🎯 Fokus ke Lokasi");
    }
}

/**
 * 6. HANDLE ERROR GPS
 */
function updateLocationError(error) {
    let msg = "";
    switch(error.code) {
        case error.PERMISSION_DENIED: msg = "Izin GPS ditolak supir."; break;
        case error.POSITION_UNAVAILABLE: msg = "Sinyal GPS hilang."; break;
        case error.TIMEOUT: msg = "GPS Timeout."; break;
        default: msg = "GPS Error.";
    }
    document.getElementById('gpsText').innerText = msg;
    document.getElementById('gpsText').style.color = "#ef4444";
    logKeLayar("⚠️ " + msg);
}

// OTOMATIS JALAN PAS LOAD
window.addEventListener('load', () => {
    initMap();
    initGPS();
});
