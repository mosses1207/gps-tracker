let watchId = null;
let map;
let userMarker;
let isFirstLocation = true;
let currentPos = { lat: 0, lng: 0 };

// Konfigurasi Geolocation
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
        crossOrigin: true
    }).addTo(map);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Marker Titik Biru (CircleMarker lebih smooth)
    userMarker = L.circleMarker([0, 0], {
        radius: 10,
        fillColor: "#007bff",
        color: "#fff",
        weight: 3,
        opacity: 1,
        fillOpacity: 0.9
    }).addTo(map);

    logKeLayar("🗺️ Map Ready & Live GPS Active");
}

/**
 * 2. INISIALISASI GPS
 */
function initGPS() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            updateLocationSuccess,
            updateLocationError,
            geoOptions
        );
        logKeLayar("📡 GPS: Memulai pelacakan live...");
    } else {
        alert("Maaf, Browser abang tidak mendukung GPS.");
        document.getElementById('gpsText').innerText = "GPS Tidak Didukung";
    }
}

/**
 * 3. CALLBACK SUKSES GPS
 */
function updateLocationSuccess(position) {
    const { latitude, longitude, speed } = position.coords;
    const speedKmH = speed ? Math.round(speed * 3.6) : 0;
    
    // Simpan posisi saat ini
    currentPos.lat = latitude;
    currentPos.lng = longitude;

    // Update UI Teks
    document.getElementById('lat').innerText = latitude.toFixed(6);
    document.getElementById('lng').innerText = longitude.toFixed(6);
    document.getElementById('spdDisplay').innerText = speedKmH;
    document.getElementById('gpsText').innerText = "Live Tracking...";
    document.getElementById('gpsText').style.color = "#22c55e";

    // Update Visual di Peta
    updateMapDisplay(latitude, longitude);
}

/**
 * 4. UPDATE VISUAL PETA (SMOOTH)
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

    // Geser peta halus mengikuti driver
    map.flyTo(newPos, map.getZoom(), {
        animate: true,
        duration: 1.5 
    });
}

/**
 * 5. TOMBOL RECENTER
 */
function recenterMap() {
    if (currentPos.lat !== 0) {
        map.flyTo([currentPos.lat, currentPos.lng], 17, {
            animate: true,
            duration: 1
        });
        logKeLayar("🎯 Fokus kembali ke lokasi");
    } else {
        logKeLayar("❌ Lokasi belum ditemukan");
    }
}

/**
 * 6. HANDLE ERROR GPS
 */
function updateLocationError(error) {
    let msg = "";
    switch(error.code) {
        case error.PERMISSION_DENIED: msg = "Izin GPS ditolak."; break;
        case error.POSITION_UNAVAILABLE: msg = "Sinyal GPS hilang."; break;
        case error.TIMEOUT: msg = "GPS Timeout."; break;
        default: msg = "GPS Error.";
    }
    document.getElementById('gpsText').innerText = msg;
    document.getElementById('gpsText').style.color = "#ef4444";
    logKeLayar("⚠️ " + msg);
}

// Jalankan saat load
window.addEventListener('load', () => {
    initMap();
    initGPS();
});
