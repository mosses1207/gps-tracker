import { db } from './dbModule.js';

let watchId = null;
let lastValidTimestamp = 0;
let isFetchingAddress = false;
let resolveGPS;
let rejectGPS;
let lastLat = null;
let lastLng = null;

export let lastHeading = 0;

const gpsReadyPromise = new Promise((resolve, reject) => {
    resolveGPS = resolve;
    rejectGPS = reject;
});
const MAX_ACCURACY_METERS = 200;
const MAX_LOGICAL_SPEED_MPS = 30;
const MAX_RADIUS_METERS = 1000;
const geoOptions = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
};

const ALLOWED_LOCATIONS = [
    { name: "Lokasi 1", lat: -6.449595660933786, lng: 107.00540022618232 },
    { name: "Lokasi 2", lat: -6.314941380764999, lng: 107.08465396420782 },
    { name: "Lokasi 3", lat: -6.35781170272672, lng: 107.25441893645797 },
    { name: "Lokasi 4", lat: -6.13823075256515, lng: 106.88354566724894 }
];

export const currentCoords = {
    latitude: null,
    longitude: null,
    speed: null,
    accuracy: null,
    lastUpdated: null
};

export function initGPS() {
    if (watchId) {
        console.log("[GPS] Watcher aktif ");
        return;
    }
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            updateLocationSuccess,
            updateLocationError,
            geoOptions
        );
        console.log("[GPS] System Init Berhasil.");
    } else {
        console.error("[GPS] Browser/Aplikasi gak support Geolocation.");
    }
}

function hitungJarakMeter(lat1, lng1, lat2, lng2) {
    if (
        lat1 == null ||
        lng1 == null ||
        lat2 == null ||
        lng2 == null
    ) return 0;
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function isDriverInZone() {
    const lat = currentCoords.latitude;
    const lng = currentCoords.longitude;
    if (lat == null || lng == null) {
        console.log("[GPS] Koordinat tidak valid");
        return null;
    }
    const nearbyLocation = ALLOWED_LOCATIONS.find(loc => {
        const distance =
            hitungJarakMeter(
                lat,
                lng,
                loc.lat,
                loc.lng
            );
        return distance <= MAX_RADIUS_METERS;
    });
    console.log("[GPS] Location:", nearbyLocation);
    return nearbyLocation || null;
}

export async function updateLocationSuccess(position) {
    const { latitude, longitude, speed, accuracy } = position.coords;
    const now = Date.now();
    if (accuracy > MAX_ACCURACY_METERS) {
        console.log("[GPS] Accuracy terlalu rendah: " + accuracy);
        alert("Signal GPS Hilang atau Akurasi Rendah, Accuracy: " + accuracy);
        window.dispatchEvent(new CustomEvent('gps-filter-failed', {
            detail: { reason: 'LOW_ACCURACY', accuracy }
        }));
        return;
    }
    if (
        currentCoords.latitude !== null &&
        currentCoords.longitude !== null
    ) {
        const jarakLompatMeter = hitungJarakMeter(
            currentCoords.latitude,
            currentCoords.longitude,
            latitude,
            longitude
        );
        const selisihWaktuDetik = (now - lastValidTimestamp) / 1000;
        if (selisihWaktuDetik > 0) {
            const kecepatanNyata = jarakLompatMeter / selisihWaktuDetik;
            if (kecepatanNyata > MAX_LOGICAL_SPEED_MPS) {
                window.dispatchEvent(new CustomEvent('gps-filter-failed', {
                    detail: { reason: 'IMPOSSIBLE_SPEED', speed: kecepatanNyata }
                }));
                console.log("[GPS] Kecepatan terlalu tinggi: " + kecepatanNyata);
                return;
            }
        }
    }
    currentCoords.latitude = latitude;
    currentCoords.longitude = longitude;
    currentCoords.speed = Number.isFinite(speed)
    ? speed
    : 0;
    currentCoords.accuracy = accuracy;
    currentCoords.lastUpdated = now;
    lastValidTimestamp = now;
    if (resolveGPS) {
        resolveGPS(true);
        resolveGPS = null;
    }

    if (!!window.appState.travelSession === false) {
        updateVehicle(latitude, longitude);
    }

    console.log(`[GPS VALID] Update disimpan: ${latitude}, ${longitude} (Acc: ${accuracy}m)`);
    window.dispatchEvent(new CustomEvent('gps-updated', {
        detail: {
            coords: { ...currentCoords }
        }
    }));
    const lat = latitude;
    const lng = longitude;
    if (window.appState.travelSession === false) {
        updateStreetName(lat, lng);
    }
}

function updateLocationError(error) {
    let msg = "";
    switch (error.code) {
        case error.PERMISSION_DENIED: msg = "Izin GPS ditolak."; break;
        case error.POSITION_UNAVAILABLE: msg = "Sinyal GPS hilang."; break;
        case error.TIMEOUT: msg = "GPS Timeout."; break;
    }
    if (rejectGPS) {
        rejectGPS(msg);
        rejectGPS = null;
    }
    console.error(`[GPS ERROR] ${msg}`);
    window.dispatchEvent(new CustomEvent('gps-error', {
        detail: { code: error.code, message: msg }
    }));
}

export function waitForFirstGPS() {
    return gpsReadyPromise;
}

export function stopGPS() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        console.log("[GPS] Watcher dihentikan.");
    }
}

export async function updateStreetName(lat, lng) {
    if (isFetchingAddress) return;
    const streetElement = document.getElementById('street-name');
    const cacheKey = `addr_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const cached = await db.addresses.get(cacheKey);
    if (cached) {
        if (streetElement) streetElement.textContent = cached.street;
        return;
    }
    try {
        const email = import.meta.env.VITE_EMAIL_SUPPORT
        isFetchingAddress = true;
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
        const response = await fetch(url, {
            headers: { 'Accept-Language': 'id', 'User-Agent': 'SatpamAsetApp/1.0 (contact: ' + email + ')' }
        });
        console.log("URL:", url);
        console.log("Response:", response);
        if (!response.ok) throw new Error("Gagal");
        const data = await response.json();
        console.log("Data:", data);
        const street = data.display_name || "Area tidak teridentifikasi";
        await db.addresses.put({
            cacheKey: cacheKey,
            street: street,
            timestamp: Date.now()
        });
        if (streetElement) streetElement.textContent = street;
        const count = await db.addresses.count();
        if (count > 10000) {
            const oldest = await db.addresses.orderBy('timestamp').first();
            await db.addresses.delete(oldest.cacheKey);
        }
    } catch (e) {
        console.error(e);
    } finally {
        isFetchingAddress = false;
    }
}

function smoothRotation(newHeading) {
    let delta = newHeading - lastHeading;
    if (delta > 180) {
        delta -= 360;
    }
    if (delta < -180) {
        delta += 360;
    }
    lastHeading += delta;
    lastHeading = (lastHeading + 360) % 360;
    return lastHeading;
}

function updateVehicle(latitude, longitude) {
    if (lastLat !== null && lastLng !== null) {
        const heading = getBearing(
            lastLat,
            lastLng,
            latitude,
            longitude
        );
        const smoothHeading = smoothRotation(heading);
        if (window.appState.myMarker) {
            window.appState.myMarker.setRotationAngle(smoothHeading);
        }
    }
    if (window.appState.myMarker) {
        window.appState.myMarker.setLatLng([latitude, longitude]);
    }
    lastLat = latitude;
    lastLng = longitude;
}

function getBearing(lat1, lng1, lat2, lng2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;
    const dLng = toRad(lng2 - lng1);
    lat1 = toRad(lat1);
    lat2 = toRad(lat2);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    let bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
}