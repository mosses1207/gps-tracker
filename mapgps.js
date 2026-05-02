const startIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/5425/5425869.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});

const endIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/5425/5425869.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32]
});

const geoOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
};

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
    
    const checkLat = latitude.toFixed(3);
    const checkLng = longitude.toFixed(3);

    if (checkLat !== lastAddressLat || checkLng !== lastAddressLng) {
        updateStreetName(latitude, longitude); // NAH, DIPANGGIL DISINI BANG!
        lastAddressLat = checkLat;
        lastAddressLng = checkLng;
    }
    updateMapDisplay(latitude, longitude);
}

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

function updateLocationError(error) {
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

async function updateStreetName(lat, lng) {
    const streetElement = document.getElementById('street-name');
    const cacheKey = `addr_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const cachedAddress = localStorage.getItem(cacheKey);
    
    if (cachedAddress) {
        console.log("Ambil dari cache HP...");
        streetElement.innerText = cachedAddress;
        return;
    }

    try {
        if (localStorage.length > 500) {
            console.log("🧹 Membersihkan cache lama...");
            localStorage.clear(); 
        }
        console.log("Tanya ke internet (Nominatim)...");
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
        const response = await fetch(url, { headers: { 'Accept-Language': 'id' } });
        const data = await response.json();
        const address = data.address;
        const street = address.road || address.residential || address.suburb || "Area tidak teridentifikasi";
        localStorage.setItem(cacheKey, street);
        streetElement.innerText = street;
    } catch (error) {
        console.error("Gagal ambil alamat:", error);
    }
}

function drawRouteOnMap(encodedPolyline) {
    if (!map) {
        logKeLayar("❌ Map belum siap");
        return;
    }

    if (!encodedPolyline || typeof encodedPolyline !== "string") {
        logKeLayar("❌ Polyline tidak valid");
        return;
    }

    isAutoCenter = false;

    // hapus polyline lama
    if (currentPolyline) {
        map.removeLayer(currentPolyline);
    }

    // hapus marker lama
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);

    const coords = decodePolyline(encodedPolyline);

    if (!coords || coords.length === 0) {
        logKeLayar("❌ Gagal decode polyline");
        return;
    }

    // 🔥 gambar polyline
    currentPolyline = L.polyline(coords, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.8,
        lineJoin: 'round'
    }).addTo(map);

    // 🔥 ambil titik awal & akhir
    const start = coords[0];
    const end = coords[coords.length - 1];

    // 🔥 pasang marker
    startMarker = L.marker(start, { icon: startIcon }).addTo(map);
        startMarker.bindTooltip("Start", { permanent: false });
    endMarker = L.marker(end, { icon: endIcon }).addTo(map)
        .bindPopup("🏁 Tujuan");
        endMarker.bindTooltip("Tujuan", { permanent: false });
    map.fitBounds(currentPolyline.getBounds(), {
        padding: [20, 20]
    });

    logKeLayar("🗺️ Rute + Marker ditampilkan");
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

window.addEventListener('load', () => {
    initMap();
    initGPS();
});
