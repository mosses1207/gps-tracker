import './stylemap.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createClient } from '@supabase/supabase-js';
import Dexie from 'dexie';
import { db } from './db.js';
import CryptoJS from 'crypto-js';
export { CryptoJS };
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
let map;
let userMarker;
let markerLayer = L.layerGroup();
let autofokus = true;
let lastUserInteraction = 0;
let interactionTimer = null;
let dashboardInitialized = false;
const markerCache = new Map();
const tableCache = new Map();
const ITEMS_PER_PAGE = 5;
let currentPage = 1;
let filteredData = [];

window.addEventListener('DOMContentLoaded', async () => {
    const screenType = detectScreenType();
    if (screenType !== 'desktop') {
        alert('Dashboard hanya bisa diakses melalui PC atau Laptop.');
        window.location.href = '/index.html';
        return;
    }
    await setupPinAutoFocus();
    await pinOverlay();
    await re_initEventListeners();
});

async function initializeDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;
    await initializeMap();
    await fetchActivePathHistory();
    await setupPathHistoryListener();
    await setupSearch();
}

function initializeMap() {
    if (map) return;
    const mapContainer = document.getElementById('map');
    if (mapContainer) mapContainer.innerHTML = '';
    map = L.map('map', {
        zoomControl: false
    }).setView([-6.2847, 107.1006], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const matikanAutofokus = (e) => {
        autofokus = false;
        lastUserInteraction = Date.now();
        const statusEl = document.getElementById('statusmap');
        if (statusEl) {
            statusEl.textContent = 'Mode: Manual';
            statusEl.style.backgroundColor = '#fff';
            statusEl.style.color = '#e67e22';
        }
    };
    map.on('dragstart', matikanAutofokus);
    map.on('zoomstart', matikanAutofokus);
    startInteractionChecker();
}

function startInteractionChecker() {

    if (interactionTimer) {
        clearInterval(interactionTimer);
        interactionTimer = null;
    }
    interactionTimer = setInterval(() => {
        if (!autofokus && lastUserInteraction > 0) {
            const sekarang = Date.now();
            const jedaInteraksi = sekarang - lastUserInteraction;

            if (jedaInteraksi > 300000) {
                autofokus = true;
                lastUserInteraction = 0;
                recenterMap();
            }
        }
    }, 10000);
}

async function handlepin() {
    const pin = Array.from({ length: 6 }, (_, i) =>
        document.getElementById(`pin${i + 1}`).value
    ).join('');
    if (pin === import.meta.env.VITE_PIN) {
        const overlay = document.getElementById('pinOverlay');
        overlay.style.setProperty('display', 'none', 'important');
        overlay.classList.add('hidden');
        initializeDashboard();
    } else {
        alert('Invalid PIN!');
    }
}

async function fetchActivePathHistory() {
    try {
        const { data, error } = await supabase
            .from('path_history')
            .select('*')
            .or('status.eq.active,status.eq.Active');
        if (error) throw error;
        if (!error && data.length > 0) {
            const decryptedData = data.map(item => {
                const newdata = { ...item };
                Object.keys(newdata).forEach(key => {
                    if (newdata[key] != null && newdata[key] !== '') {
                        try {
                            newdata[key] = decryptData(newdata[key]);
                        } catch (decryptErr) {
                            console.error(`Decrypt Error for field ${key}:`, decryptErr.message);
                            console.error('Original value:', newdata[key]);
                        }
                    }
                });
                return newdata;
            });
            try {
                decryptedData.sort((a, b) => {
                    try {
                        const waktua = new Date(a.updated_at);
                        const waktub = new Date(b.updated_at);
                        if (isNaN(waktua.getTime()) || isNaN(waktub.getTime())) {
                            console.error('Invalid date format:', {
                                a_updated: a.updated_at,
                                b_updated: b.updated_at
                            });
                            return 0;
                        }
                        return waktub - waktua;
                    } catch (sortErr) {
                        return 0;
                    }
                });
            } catch (sortErr) {
                console.error('Sorting failed:', sortErr.message);
            }
            try {
                await db.real_location.clear();
                await db.real_location.bulkPut(decryptedData);
                await createmarker(decryptedData);
                await refreshTable();
                handellistener();
            } catch (dbErr) {
                console.error('IndexedDB Error:', dbErr.message);
                console.error('Failed data:', decryptedData.slice(0, 2));
            }
        }
    } catch (err) {
        return [];
    }
}

function setupPathHistoryListener() {
    const channel = supabase
        .channel('path_history_changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'path_history' },
            async (payload) => {
                const { eventType, new: newData, old: oldData } = payload;
                try {
                    if (eventType === 'DELETE') {
                        const idToDelete = oldData?.idseason;
                        if (idToDelete) {
                            await db.real_location.delete(idToDelete);
                            await removeMarker(idToDelete);
                            await refreshTable();
                            await handellistener();
                        } else {
                            console.error('Delete Gagal: idseason tidak ada di payload.old');
                        }
                        return;
                    }
                    if (eventType === 'INSERT' || eventType === 'UPDATE') {
                        if (!newData) return;
                        let decryptedData = { ...newData };
                        Object.keys(decryptedData).forEach(key => {
                            if (decryptedData[key] != null && decryptedData[key] !== '') {
                                try {
                                    decryptedData[key] = decryptData(decryptedData[key]);
                                } catch (err) {
                                    // Abaikan jika field bukan data terenkripsi
                                }
                            }
                        });

                        await db.real_location.put(decryptedData);
                        await createmarker([decryptedData]);
                        await refreshTable();
                        await handellistener();
                    }

                } catch (err) {
                    console.error('Realtime Sync Error:', err.message);
                }
            }
        )
        .subscribe();

    return channel;
}

function detectScreenType() {
    const width = window.innerWidth;
    const userAgent = navigator.userAgent;
    let screenType = 'desktop';
    if (width <= 1024 || /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent)) {
        screenType = 'mobile/tablet';
    }
    return screenType;
}

function pinOverlay() {
    document.getElementById('pinOverlay').style.display = 'flex';
}

function setupPinAutoFocus() {
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`pin${i}`);
        if (!input) continue;
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && i < 6) {
                document.getElementById(`pin${i + 1}`).focus();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value === '' && i > 1) {
                document.getElementById(`pin${i - 1}`).focus();
            }
            if (e.key === 'Enter') handlepin();
        });
    }
}

function re_initEventListeners() {

    const btnDashboard = document.getElementById('btn-dashboard');
    if (btnDashboard) {
        btnDashboard.onclick = () => {
            window.location.href = 'index.html';
        };
    }
    
    const btn = document.getElementById('confirmPin');
    if (btn) btn.onclick = () => handlepin();
    const recenterBtn = document.getElementById('recenterBtn');
    if (recenterBtn) {
        recenterBtn.onclick = async () => {
            autofokus = true;
            lastUserInteraction = 0;
            await recenterMap();
            lastrecenter = Date.now();
        };
    }
}

function encryptData(data) {
    const AES_SECRET = import.meta.env.VITE_AES_KEY;
    if (!AES_SECRET) {
        return data;
    }
    try {
        const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data);
        return CryptoJS.AES.encrypt(stringData, AES_SECRET).toString();
    } catch (e) {
        return null;
    }
}

function decryptData(ciphertext) {
    const AES_SECRET = import.meta.env.VITE_AES_KEY;
    if (!AES_SECRET || !ciphertext) return ciphertext;
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, AES_SECRET);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        if (!originalText) {
            return ciphertext;
        }
        try {
            return JSON.parse(originalText);
        } catch {
            return originalText;
        }
    } catch (e) {
        return ciphertext;
    }
}

let lastrecenter = 0;

async function handellistener() {
    const sekarang = Date.now();
    const sudahLimaMenit = (sekarang - lastrecenter) > 300000;
    if (sudahLimaMenit) {
        if (autofokus === true) {
            await recenterMap();
            lastrecenter = sekarang;
        }
    }
}

let markerdelay = L.icon({
    iconUrl: '/marker-icon-delay.png',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

let markerontime = L.icon({
    iconUrl: '/marker-icon-ontime.png',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

async function createmarker(data = null) {
    if (!map) return;
    let displayData = data;
    if (displayData === null) {
        displayData = await db.real_location.toArray();
    }
    if (!displayData || displayData.length === 0) {
        return;
    }
    if (!map.hasLayer(markerLayer)) {
        markerLayer.addTo(map);
    }
    displayData.forEach((item) => {
        const id = item.idseason;
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lng);
        if (isNaN(lat) || isNaN(lng)) return;
        const now = new Date();
        const lastUpdate = new Date(item.arrive_target);
        let currentStatus = item.status;
        if (currentStatus === 'Active') {
            const isStale = (now - lastUpdate) > 600000;
            if (isStale) {
                currentStatus = 'Delay';
            }
        }
        const statusClass =
            currentStatus === 'Delay'
                ? 'status-delay'
                : 'status-normal';
        const iconMarker =
            currentStatus === 'Delay'
                ? markerdelay
                : markerontime;
        const customPopup = `
            <div class="popup-content">
                <div class="status-container">
                    <span class="status ${statusClass}">
                        ${currentStatus}
                    </span>
                </div>
                <div class="header">
                    <br>
                    <span class="header-sjkb">
                        ${item.sjkb}
                    </span>
                </div>
                <div class="header-info">
                    <div style="display:grid;grid-template-columns:100px 1fr;gap:5px;">
                        <span><b>Tujuan</b></span>
                        <span>: ${item.dest}</span>

                        <span><b>Depart</b></span>
                        <span>: ${formatTanggalIndonesia(item.depart_at)}</span>

                        <span><b>Est. Arrive</b></span>
                        <span>: ${formatTanggalIndonesia(item.arrive_target)}</span>
                    </div>
                </div>
                <div class="timestamp"
                    style="margin-top:10px;font-size:10px;color:#666;">
                    Update:
                    ${formatTanggalIndonesia(item.updated_at)}
                </div>
            </div>
        `;
        if (markerCache.has(id)) {
            const marker = markerCache.get(id);
            marker.setLatLng([lat, lng]);
            marker.setIcon(iconMarker);
            marker.setPopupContent(customPopup);
            return;
        }
        const marker = L.marker([lat, lng], {
            icon: iconMarker
        });
        marker.bindPopup(customPopup);
        marker.on('mouseover', function () {
            this.openPopup();
        });
        marker.on('mouseout', function () {
            this.closePopup();
        });
        marker.addTo(markerLayer);
        markerCache.set(id, marker);
    });
}

function removeMarker(idseason) {
    if (!markerCache.has(idseason)) return;
    const marker = markerCache.get(idseason);
    markerLayer.removeLayer(marker);
    markerCache.delete(idseason);
    console.log('Marker removed:', idseason);
}

async function createtabelactive(data = null) {
    let displayData = data;
    if (displayData === null) {
        displayData = await db.real_location.toArray();
    }
    const container = document.getElementById('active-container');
    if (!container) return;
    displayData.forEach(item => {
        const id = item.idseason;
        const now = new Date();
        const lastUpdate = new Date(item.arrive_target);
        let currentStatus = item.status;
        if (currentStatus === 'Active') {
            const isStale = (now - lastUpdate) > 600000;
            if (isStale) {
                currentStatus = 'Delay';
            }
        }
        const html = `
                <div class="balon-card ${currentStatus.toLowerCase()}"data-id="${id}">
                <div class="balon-top">
                    <span class="sjkb">${item.sjkb}</span>
                    <span class="status">
                        ${currentStatus}
                    </span>
                </div>
                <div class="balon-body">
                    <div class="row">
                        <span>Tujuan</span>
                        <span>${item.dest}</span>
                    </div>
                    <div class="row">
                        <span>Arrive target</span>
                        <span>${formatTanggalIndonesia(item.arrive_target)}</span>
                    </div>
                    <div class="row">
                        <span>Update</span>
                        <span>${formatTanggalIndonesia(item.updated_at)}</span>
                    </div>
                </div>
            </div>
        `;
        if (tableCache.has(id)) {
            const element = tableCache.get(id);
            element.outerHTML = html;
            const newEl = container.querySelector(`[data-id="${id}"]`);
            if (newEl) {
                tableCache.set(id, newEl);
            }
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-id', id);
        wrapper.innerHTML = html;
        const element = wrapper.firstElementChild;
        container.prepend(element);
        tableCache.set(id, element);
        element.addEventListener('click', () => {
            const marker = markerCache.get(id);
            if (!marker) return;
            autofokus = false;
            map.panTo(
                marker.getLatLng(),
            );
            marker.openPopup();
        });
    });
}

function removeTableCard(idseason) {
    if (!tableCache.has(idseason)) return;
    const element = tableCache.get(idseason);
    element.remove();
    tableCache.delete(idseason);
    console.log('🗑️ Table card removed:', idseason);
}

function formatTanggalIndonesia(dateString) {
    const date = new Date(dateString);
    const hari = date.toLocaleDateString('id-ID', { weekday: 'long' });
    const tanggal = date.getDate();
    const bulanIndo = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const tahun = date.getFullYear();
    const jam = date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return `${hari}, ${tanggal} ${bulanIndo[date.getMonth()]} ${tahun} ${jam} WIB`;
}

async function recenterMap() {
    if (!map) return;
    const data = await db.real_location.toArray();
    let point = [];
    if (data.length > 0) {
        point = data.map(item => {
            return [parseFloat(item.lat), parseFloat(item.lng)];
        }).filter(item => !isNaN(item[0]) && !isNaN(item[1]));
    }
    if (point.length > 0) {
        const bounds = L.latLngBounds(point);
        map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 15,
            animate: true,
            duration: 1.5
        });
        const statusEl = document.getElementById('statusmap');
        if (statusEl) {
            statusEl.textContent = 'Mode: Auto Center';
            statusEl.style.color = '#2ecc71';
            autofokus = true;
        }
    } else {
        console.log("Tidak ada data untuk direcenter");
    }
    autofokus = true;
    lastUserInteraction = 0;
}

async function renderPagination(data) {
    filteredData = data;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const paginated = data.slice(start, end);
    tableCache.forEach(el => {
        el.style.display = 'none';
    });
    paginated.forEach(item => {
        const el = tableCache.get(item.idseason);
        if (el) {
            el.style.display = 'block';
        }
    });
    renderPaginationButtons(data.length);
}

function renderPaginationButtons(totalItems) {
    console.log('📄 Rendering pagination for', totalItems, 'items');
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    console.log('📄 Total pages:', totalPages);
    const pagination = document.getElementById('pagination');
    if (!pagination) {
        console.log('❌ Pagination element not found');
        return;
    }
    
    // Debug pagination element
    console.log('🔍 Pagination element:', pagination);
    console.log('🔍 Pagination styles:', window.getComputedStyle(pagination));
    console.log('🔍 Pagination rect:', pagination.getBoundingClientRect());
    
    pagination.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        if (i === currentPage) {
            btn.classList.add('active');
        }
        btn.onclick = async () => {
            currentPage = i;
            await renderPagination(filteredData);
            btn.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest'
            });
        };
        pagination.appendChild(btn);
        
        // Debug each button
        console.log('🔍 Button', i, 'created:', btn);
        console.log('🔍 Button', i, 'styles:', window.getComputedStyle(btn));
        console.log('🔍 Button', i, 'rect:', btn.getBoundingClientRect());
    }
    
    console.log('✅ Pagination buttons created:', totalPages, 'buttons');
    console.log('🔍 Final pagination HTML:', pagination.innerHTML);
    console.log('🔍 Final pagination children:', pagination.children.length);
}

function setupSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', async (e) => {
        const keyword = e.target.value.toLowerCase();
        const allData = await db.real_location.toArray();
        const filtered = allData.filter(item => {
            return (
                item.sjkb?.toLowerCase().includes(keyword) ||
                item.dest?.toLowerCase().includes(keyword)
            );
        });
        currentPage = 1;
        await renderPagination(filtered);
    });
}

async function refreshTable() {
    const allData = await db.real_location.toArray();
    allData.sort((a, b) => {
        return new Date(b.updated_at) - new Date(a.updated_at);
    });
    const keyword = document
        .getElementById('searchInput')
        ?.value
        ?.toLowerCase() || '';
    const filtered = allData.filter(item => {
        return (
            item.sjkb?.toLowerCase().includes(keyword) ||
            item.dest?.toLowerCase().includes(keyword)
        );
    });
    const container = document.getElementById('active-container');
    if (container) {
        container.innerHTML = '';
    }
    tableCache.clear();
    await createtabelactive(filtered);
    await renderPagination(filtered);
    console.log("📦 Table Refreshed");
}
