import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-rotatedmarker/leaflet.rotatedMarker.js';
import { currentCoords, lastHeading } from './gpsModule';
import { getRoute } from './osrmService';
import { db } from './dbModule';
import { decodePolyline } from './polyline';
import { decryptData } from './aes';

export const getAllRoutes = () => window.appState.allRoutes;
export const getSelectedRouteIndex = () => window.appState.selectedRouteIndex;
export const getSelectedRoute = () => window.appState.allRoutes[window.appState.selectedRouteIndex];
export const setAllRoutes = (routes) => { window.appState.allRoutes = routes; };
export const setSelectedRouteIndex = (index) => { window.appState.selectedRouteIndex = index; };



let zoom = 16;
let maxpixel = 90;
let map = null;
let marker = null;

delete L.Icon.Default.prototype._getIconUrl;

export const markerDestinasiIcon = L.icon({
    iconUrl: '/destinasi.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});

export const markerVehicleIcon = L.icon({
    iconUrl: '/navigation.png',
    iconSize: [25, 25],
    iconAnchor: [12, 12]
});

let vehicleMarker = null;

export function initMap() {
    if (map) return;

    map = L.map('map', {
        renderer: L.canvas({ padding: 0.5 }),
        zoomControl: false
    }).setView([currentCoords.latitude, currentCoords.longitude], zoom);
    L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            attribution: '&copy; OpenStreetMap',
        }
    ).addTo(map);
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);
    marker = L.marker(
        [-6.2847, 107.1006],
        {
            icon: markerVehicleIcon,
            rotationAngle: 0
        }
    ).addTo(map);
    window.appState.myMarker = marker;
    window.appState.myMap = map;
    window.appState.isAutoCenter = true;
    const statusmap = document.getElementById("status_map");
    statusmap.textContent = "Auto Center";
    statusmap.style.color = "#00ff00";
    map.on('dragstart', () => {
        const statusmap = document.getElementById("status_map");
        statusmap.textContent = "Manual";
        statusmap.style.color = "rgb(255, 140, 0)";
        window.appState.isAutoCenter = false;
    });
}


window.addEventListener('gps-updated', ({ detail }) => {
    const { latitude, longitude } = detail.coords;
    if (!window.appState.isAutoCenter || !window.appState.myMap || window.appState.isFlying) return;

    const markerPoint = window.appState.myMap.latLngToContainerPoint([latitude, longitude]);
    const mapSize = window.appState.myMap.getSize();
    const dx = markerPoint.x - mapSize.x / 2;
    const dy = markerPoint.y - mapSize.y / 2;

    if (Math.sqrt(dx * dx + dy * dy) > 100) {
        window.appState.isFlying = true;
        window.appState.myMap.once('moveend', () => {
            const [offsetX, offsetY] = getOffsetByHeading(lastHeading);
            window.appState.myMap.once('moveend', () => {
                window.appState.isFlying = false;
            });
            window.appState.myMap.panBy([offsetX, offsetY], { animate: false });
        });
        window.appState.myMap.panTo([latitude, longitude], zoom);
    }
});

export async function recenterMap() {
    window.appState.isAutoCenter = true;
    if (currentCoords.latitude !== null && !window.appState.isFlying) {
        window.appState.isFlying = true;
        window.appState.myMap.once('moveend', async () => {
            const [offsetX, offsetY] = await getOffsetByHeading(lastHeading);
            window.appState.myMap.once('moveend', () => {
                window.appState.isFlying = false;
            });
            window.appState.myMap.panBy([offsetX, offsetY], { animate: false });
        });

        if (window.appState.travelSession === true) {
            zoom = 17;
        }

        window.appState.myMap.flyTo([currentCoords.latitude, currentCoords.longitude], zoom);
        const statusmap = document.getElementById("status_map");
        statusmap.textContent = "Auto Center";
        statusmap.style.color = "#00ff00";
    }
}

export async function munculmap() {
    const mapcontainer = document.getElementById("map_container");
    if (mapcontainer) {
        mapcontainer.style.opacity = "1";
        mapcontainer.style.display = "flex";

        if (window.appState.myMap) {
            window.appState.myMap.invalidateSize();
            if (window.appState.myMarker instanceof L.Marker || window.appState.myMarker instanceof L.CircleMarker) {
                window.appState.myMarker.setLatLng([currentCoords.latitude, currentCoords.longitude]);
            }
        }
    }
}


export async function renderRute() {
    const activeSessions = await db.travel_sessions.toArray();
    if (activeSessions && activeSessions.length > 0) {
        //checkpolyline();
    } else {
        const Rute = await getRoute(false);
        if (Rute) {
            console.log(" Rute:", Rute);
            gambarRuteKePeta(Rute);
        } else {
            console.error('[OSRM DRAW] Gagal mendapatkan rute.');
        }
    }
}

export function gambarRuteKePeta(Rute) {
    if (!window.appState.myMap) return;
    bersihkanRutePeta();
    if (!Rute || Rute.length === 0) return;

    window.appState.allRoutes = [];
    let allBounds = [];

    try {
        Rute.forEach((rute, index) => {
            const coords = decodePolyline(rute.polylineCoordinates);
            if (!coords || coords.length === 0) return;
            allBounds.push(...coords);

            const isUtama = (index === 0);
            const poly = L.polyline(coords, {
                color: isUtama ? 'rgb(0, 255, 106)' : '#6c757d', // Pakai warna abu untuk non-utama
                weight: isUtama ? 6 : 4,
                opacity: 0.8,
                dashArray: isUtama ? null : '5, 10'
            }).addTo(window.appState.myMap);

            window.appState.allRoutes.push({
                tipeRute: rute.tipeRute,
                polyline: poly,
                index: index,
                coordinates: coords
            });

            if (isUtama) {
                window.appState.currentRouteEndMarker = L.marker(coords[coords.length - 1], {
                    icon: markerDestinasiIcon
                }).addTo(window.appState.myMap);
            }
        });

        // Tampilkan semua rute di layar
        if (allBounds.length > 0) {
            window.appState.myMap.fitBounds(allBounds, { padding: [50, 50], maxZoom: 16 });
        }

        // Render Tombol UI
        const container = document.getElementById('container-tombol-rute');
        if (container) {
            container.style.display = 'flex';
            renderTombolRute('container-tombol-rute');
        }
    } catch (error) {
        console.error('[OSRM DRAW] Error:', error);
    }
}


export function renderTombolRute(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    window.appState.allRoutes.forEach((item) => {
        const btn = document.createElement('button');
        btn.className = `btn-pilih-rute ${window.appState.selectedRouteIndex === item.index ? 'active' : ''}`;
        btn.textContent = `Rute ${item.index + 1}`;
        btn.onclick = () => {
            window.appState.selectedRouteIndex = item.index;
            document.querySelectorAll('.btn-pilih-rute').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            pilihRute(item.index);
            window.appState.myMap.fitBounds(item.polyline.getBounds(), { padding: [50, 50], maxZoom: 16 });
        };
        container.appendChild(btn);
    });
}

export async function pilihRute(indexDipilih) {
    window.appState.allRoutes.forEach((item) => {
        if (item.index === indexDipilih) {
            item.polyline.setStyle({
                color: 'rgb(0, 255, 106)',
                weight: 6,
                dashArray: null
            });
            item.polyline.bringToFront();
        } else {
            item.polyline.setStyle({
                color: '#6c757d',
                weight: 4,
                dashArray: '5, 10'
            });
        }
    });
    await db.rute.update('rute', {
        key:indexDipilih
    });
}


export function bersihkanRutePeta() {
    window.appState.allRoutes.forEach(item => { if (item.polyline) item.polyline.remove(); });
    window.appState.allRoutes = [];
    window.appState.selectedRouteIndex = 0;
    if (window.appState.currentRouteEndMarker) {
        window.appState.currentRouteEndMarker.remove();
        window.appState.currentRouteEndMarker = null;
    }
    const container = document.getElementById('container-tombol-rute');
    if (container) container.innerHTML = '';
    if (window.appState.activePolyline) {
        window.appState.activePolyline.remove();
        window.appState.activePolyline = null;
    }
}

export function getOffsetByHeading(heading) {
    const rad = (heading * Math.PI) / 180;
    const offsetPx = maxpixel;
    const x = Math.sin(rad) * offsetPx;
    const y = -Math.cos(rad) * offsetPx;
    return [x, y];
}


export async function drawruteistravel(rute) {
    await bersihkanRutePeta();
    let rawdata = null;
    let drawrute = null;

    if (rute && Array.isArray(rute) && rute.length > 0 && rute[0].polylineCoordinates) {
        rawdata = rute[0].polylineCoordinates;

        if (Array.isArray(rawdata)) {
            drawrute = rawdata;
        } else if (typeof rawdata === 'string' && rawdata.length > 20) {
            drawrute = decodePolyline(rawdata);
        }
    } else {
        console.log("Input rute tidak valid atau kosong, mencoba fallback ke Dexie...");
    }

    if (!drawrute) {
        try {
            const rawdata = await db.travel_sessions.toArray();
            if (rawdata && rawdata.length > 0) {
                const polylineString = decryptData(rawdata[0].route_master);
                drawrute = decodePolyline(polylineString);
            }
        } catch (error) {
            console.error('Error saat mengambil dari dexie:', error);
            return false;
        }
    }
    const rutegabungan = drawrute;
    if (!rutegabungan || rutegabungan.length === 0) {
        console.warn("Data koordinat kosong setelah proses decode.");
        return false;
    }
    const fiksrute = bikinRapet(rutegabungan);

    window.appState.activeRouteCoords = fiksrute;

    if (window.appState.activeRouteCoords && Array.isArray(window.appState.activeRouteCoords)) {
        window.appState.activePolyline = L.polyline(window.appState.activeRouteCoords, {
            color: 'hsl(216, 100%, 50%)',
            weight: 6,
            smoothFactor: 3
        }).addTo(window.appState.myMap);

        window.appState.currentRouteEndMarker = L.marker(window.appState.activeRouteCoords[window.appState.activeRouteCoords.length - 1], {
            icon: markerDestinasiIcon
        }).addTo(window.appState.myMap);
        recenterMap()
        return true;
    } else {
        console.warn("Data koordinat rute tidak valid.");
        return false;
    }
}

/**
 * Menambahkan titik-titik di antara koordinat agar jarak antar titik konsisten 5 meter
 */
function bikinRapet(coords, targetDist = 5) {
    const rapetCoords = [];

    for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        rapetCoords.push(p1);
        const d = hitungJarakMeter(p1[0], p1[1], p2[0], p2[1]);
        if (d > targetDist) {
            const numPoints = Math.floor(d / targetDist);
            for (let j = 1; j <= numPoints; j++) {
                const ratio = j / (numPoints + 1);
                const newLat = p1[0] + (p2[0] - p1[0]) * ratio;
                const newLng = p1[1] + (p2[1] - p1[1]) * ratio;
                rapetCoords.push([newLat, newLng]);
            }
        }
    }
    rapetCoords.push(coords[coords.length - 1]);
    return rapetCoords;
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