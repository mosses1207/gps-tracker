//map.js

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { dlog } from './debug';
import { dataStore } from './querysupabase';
import { isModaAllowed } from './settings';

let map;
let interactionTimer;

window.autofokus = true;
window.lastUserInteraction = 0;

export function initializeMap() {
    if (map) return;
    const mapContainer = document.getElementById('map');
    if (mapContainer) mapContainer.innerHTML = '';

    map = L.map('map', { zoomControl: false }).setView([-6.2847, 107.1006], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    window.Mymap = map;

    const matikanAutofokus = () => {
        window.autofokus = false;
        window.lastUserInteraction = Date.now(); // ← fix #2
        const statusEl = document.getElementById('statusmap');
        if (statusEl) {
            statusEl.textContent = 'Mode: Manual';
            statusEl.style.color = '#e67e22';
        }
    };

    map.on('dragstart', matikanAutofokus);
    map.on('zoomstart', matikanAutofokus);
    startInteractionChecker();

    // ← Listener untuk auto update map saat data 'active' berubah
    dataStore.subscribe('active', (payload) => {
        dlog('[MAP LISTENER] Data active berubah:', payload);

        // Auto update markers & recenter jika mode auto fokus aktif
        window.autoRecenterMap();
    });
}

// BUG FIX: dulu beberapa tempat (querysupabase.js) manggil window.recenterMap()
// langsung tiap ada payload baru, jadi map tetap ke-geser walau admin lagi di
// mode Manual (habis drag/zoom). window.recenterMap() sendiri SELALU
// mindahin map (dipakai tombol "center map" yang emang harus maksa pindah).
//
// window.autoRecenterMap() ini yang dipanggil tiap ada payload baru — dia
// cuma recenter kalau mode masih Auto Center. Kalau admin lagi geser manual,
// fungsi ini gak ngapa-ngapain sampai admin klik tombol center map lagi.
window.autoRecenterMap = function () {
    if (window.autofokus) {
        window.recenterMap();
    }
};

window.recenterMap = async function () {
    if (!map) return;
    
    // Ambil data langsung dari dataStore (sudah decrypted otomatis)
    const data = dataStore.getData('active');

    const points = data
        .filter(item => isModaAllowed(item.moda))
        .map(item => [parseFloat(item.lat), parseFloat(item.lng)])
        .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

    if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), {
            padding: [50, 50],
            maxZoom: 15,
            animate: true,
            duration: 1.5
        });
        const statusEl = document.getElementById('statusmap');
        if (statusEl) {
            statusEl.textContent = 'Mode: Auto Center';
            statusEl.style.color = '#2ecc71';
        }
    } else {
    }

    window.autofokus = true;       // ← fix #2
    window.lastUserInteraction = 0; // ← fix #2
};

function startInteractionChecker() {
    if (interactionTimer) clearInterval(interactionTimer);

    interactionTimer = setInterval(() => {
        if (!window.autofokus && window.lastUserInteraction > 0) { // ← fix #2
            const jeda = Date.now() - window.lastUserInteraction;
            if (jeda > 300000) {
                window.recenterMap();
            }
        }
    }, 10000);
}