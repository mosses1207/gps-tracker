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
        crossOrigin: true
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

    // Event Listener dipindah ke dalam sini biar 'map' sudah siap
    map.on('movestart', (e) => {
        if (e.hard) return; 
        isAutoCenter = false;
        // logKeLayar("🖐️ Manual scroll: Auto-center Off");
    });

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
        alert("GPS Tidak Didukung Browser");
    }
}

/**
 * 3. UPDATE VISUAL PETA (SMOOTH)
 */
function updateMapDisplay(lat, lng) {
    if (!map || !userMarker) return;
    const newPos = [lat, lng];

    // Selalu update posisi marker titik biru
    userMarker.setLatLng(newPos);

    // Kalau pertama kali dapet lokasi, langsung arahin kamera
    if (isFirstLocation) {
        map.setView(newPos, 17);
        isFirstLocation = false;
        return;
    }

    // Hanya geser peta otomatis kalau isAutoCenter aktif
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
    document.getElementById('gpsText').innerText = isAutoCenter ? "Tracking Aktif" : "Manual Mode";
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
        logKeLayar("🎯 Fokus ke Lokasi (Auto-center On)");
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

window.addEventListener('load', () => {
    initMap();
    initGPS();
});
