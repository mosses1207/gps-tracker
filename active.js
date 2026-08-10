import L from 'leaflet';
import { dataStore } from './querysupabase';
import { escapeHtml } from './sanitize';
import { dlog } from './debug';
import { isModaAllowed, onModaFilterChange } from './settings';
import { showLoading, hideLoading, getSession } from './auth';
import { supabase } from './supabaseClient';

const tableCache = new Map();
let markerLayer = L.layerGroup();
const markerCache = new Map();
let filteredData = [];
let currentPage = 1;
let listTooltipTimer;
let globalTooltipTimer;
let dataStoreUnsubscribe = null; // untuk cleanup listener
const ITEMS_PER_PAGE = 10;

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

export async function initializeActiveModule() {
    setupSearch();
    initArrivalModal();
    initArrivalReasonCounter();
    
    dataStoreUnsubscribe = dataStore.subscribe('active', async (payload) => {
        dlog('DataStore active updated:', payload);
        await handleDataStoreChange(payload);
        checkActiveCountChange();
    });

    onModaFilterChange(async () => {
        dlog('[ACTIVE] Moda filter berubah, re-render list & marker');
        await refreshTableActive();
        await reapplyMarkerFilter();
        resyncActiveCountBaseline();
    });

    await refreshTableActive();
    await createmarker();

    resyncActiveCountBaseline();
}


let lastActiveCount = null;
let activeBlinkTimeout = null;

function getFilteredActiveCount() {
    return dataStore.getData('active').filter(item => isModaAllowed(item.moda)).length;
}

function triggerActiveTabBlink() {
    const tabBtn = document.getElementById('tab-btn-active');
    if (!tabBtn) return;

    tabBtn.classList.add('tab-blink');
    if (activeBlinkTimeout) clearTimeout(activeBlinkTimeout);
    activeBlinkTimeout = setTimeout(() => {
        tabBtn.classList.remove('tab-blink');
        activeBlinkTimeout = null;
    }, 10000);
}

function checkActiveCountChange() {
    const count = getFilteredActiveCount();
    if (lastActiveCount !== null && count !== lastActiveCount) {
        triggerActiveTabBlink();
    }
    lastActiveCount = count;
}

function resyncActiveCountBaseline() {
    lastActiveCount = getFilteredActiveCount();
}


let pendingArrivalId = null;
let sendingArrival = false;

function showArrivalError(text) {
    const el = document.getElementById('arrivalErrorMsg');
    if (!el) return;
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
}

const ARRIVAL_REASON_MIN_LENGTH = 50;

function openArrivalModal(id) {
    if (!id) {
        dlog('[ARRIVAL] Tombol diklik tanpa id, dibatalkan');
        return;
    }
    pendingArrivalId = id;
    const overlay = document.getElementById('arrivalConfirmOverlay');
    const textarea = document.getElementById('arrivalReason');
    if (textarea) textarea.value = '';
    showArrivalError('');
    if (overlay) overlay.classList.add('show');
}

function initArrivalReasonCounter() {
    const textarea = document.getElementById('arrivalReason');
    if (!textarea) return;
    textarea.addEventListener('input', () => {
        const len = textarea.value.trim().length;
        if (len === 0) {
            showArrivalError('');
        } else if (len < ARRIVAL_REASON_MIN_LENGTH) {
            showArrivalError(`${len}/${ARRIVAL_REASON_MIN_LENGTH} karakter`);
        } else {
            showArrivalError('');
        }
    });
}

function closeArrivalModal() {
    pendingArrivalId = null;
    const overlay = document.getElementById('arrivalConfirmOverlay');
    if (overlay) overlay.classList.remove('show');
}

function initArrivalModal() {
    const overlay = document.getElementById('arrivalConfirmOverlay');
    const btnNo = document.getElementById('arrivalConfirmNo');
    const btnYes = document.getElementById('arrivalConfirmYes');
    if (!overlay || !btnNo || !btnYes) return;

    btnNo.addEventListener('click', () => closeArrivalModal());

    btnYes.addEventListener('click', async () => {
        const id = pendingArrivalId;
        const reason = document.getElementById('arrivalReason')?.value.trim() || '';

        if (!id) {
            closeArrivalModal();
            return;
        }
        if (!reason) {
            showArrivalError('Alasan wajib diisi.');
            return;
        }
        if (reason.length < ARRIVAL_REASON_MIN_LENGTH) {
            showArrivalError(`Alasan minimal ${ARRIVAL_REASON_MIN_LENGTH} karakter (sekarang ${reason.length} karakter).`);
            return;
        }

        const hasil = await submitArrival(id, reason);
        if (hasil.success) {
            closeArrivalModal();
        } else {
            showArrivalError(hasil.error || 'Gagal mengubah status, coba lagi.');
        }
    });
}

async function submitArrival(id, reason) {
    if (sendingArrival) {
        return { success: false, error: 'Sedang memproses, silahkan tunggu.' };
    }
    sendingArrival = true;
    showLoading('Mengubah status ke Arrival...');

    try {
        const session = await getSession();
        if (!session) {
            return { success: false, error: 'Silakan login kembali.' };
        }

        const { error } = await supabase
            .from('path_history')
            .update({ reason, status: 'Arrival' })
            .eq('id', id);

        if (error) {
            throw new Error(error.message || 'Gagal mengubah status');
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        sendingArrival = false;
        hideLoading();
    }
}


async function reapplyMarkerFilter() {
    const allData = dataStore.getData('active');
    const allowedIds = new Set(
        allData.filter(item => isModaAllowed(item.moda)).map(item => item.idseason)
    );

    markerCache.forEach((marker, id) => {
        if (!allowedIds.has(id)) {
            markerLayer.removeLayer(marker);
            markerCache.delete(id);
        }
    });

    await createmarker();

    if (typeof window.autoRecenterMap === 'function') {
        window.autoRecenterMap();
    }
}

async function handleDataStoreChange(payload) {
    const { action, data } = payload;
    
    switch (action) {
        case 'set':
            // Data full replace, re-render semua
            await refreshTableActive();
            await createmarker();
            break;
            
        case 'update':
            // Single item update
            if (Array.isArray(data)) {
                // Multiple items
                for (const item of data) {
                    await updateTableRow(item);
                    await updateMarker(item.idseason, item);
                }
            } else {
                // Single item
                await updateTableRow(data);
                await updateMarker(data.idseason, data);
            }
            break;
            
        case 'delete':
            // Remove item dari UI
            removeTableRow(data.idseason);
            removeMarker(data.idseason);
            break;
            
        case 'clear':
            // Clear semua
            tableCache.clear();
            markerCache.forEach((marker) => markerLayer.removeLayer(marker));
            markerCache.clear();
            const container = document.querySelector('.active-container');
            if (container) container.innerHTML = '';
            break;
    }
}

export async function createtabelactive(data = null) {
    let displayData = data;
    
    if (displayData === null) {
        displayData = dataStore.getData('active');
    }
    
    const konten2 = document.getElementById('konten2');
    const container = konten2?.querySelector('.active-container');
    if (!container) return;

    displayData.forEach(async (item) => {
        const id = item.idseason;
        const pkId = item.id;
        const now = new Date();
        const lastUpdate = new Date(item.arrive_target);
        let currentStatus = item.status;

        if (currentStatus && currentStatus.toLowerCase() === 'active') {
            const isStale = (now - lastUpdate) > 600000;
            if (isStale) {
                currentStatus = 'Delay';
            }
        }

        const html = `
            <div class="balon-card ${escapeHtml(currentStatus.toLowerCase())}" data-id="${escapeHtml(id)}">
                <div class="balon-top">
                    <span class="sjkb">${escapeHtml(item.sjkb)}</span>
                    <div class="balon-top-right">
                        <span class="status">
                            ${escapeHtml(currentStatus)}
                        </span>
                        <button type="button" class="balon-settings-btn" title="Set Arrival / Insiden">
                            <i class="fa-solid fa-gear"></i>
                        </button>
                    </div>
                </div>
                <div class="balon-body">
                    <div class="balon-row">
                        <span>Tujuan</span>
                        <span>${escapeHtml(item.dest)}</span>
                    </div>
                    <div class="balon-row">
                        <span>Update</span>
                        <span>${formatTanggalIndonesia(item.updated_at)}</span>
                    </div>
                </div>
            </div>
        `;

        if (tableCache.has(id)) {
            const element = tableCache.get(id);
            element.outerHTML = html;
            const newEl = container.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
            if (newEl) {
                tableCache.set(id, newEl);
                attachTableRowListener(newEl, id, pkId);
            }
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-id', id);
        wrapper.innerHTML = html;
        const element = wrapper.firstElementChild;
        container.prepend(element);
        tableCache.set(id, element);
        attachTableRowListener(element, id, pkId);
    });
}

function attachTableRowListener(element, id, pkId) {
    element.addEventListener('click', () => {
        const marker = markerCache.get(id);
        if (!marker) return;

        window.autofokus = false;
        window.lastUserInteraction = Date.now();

        const map = window.Mymap;
        if (!map) return;

        const offsetLatLng = [
            marker.getLatLng().lat + 0.003,
            marker.getLatLng().lng
        ];

        map.setView(offsetLatLng, 16, { animate: true });
        marker.openTooltip();
        clearTimeout(listTooltipTimer);
        listTooltipTimer = setTimeout(() => {
            marker.closeTooltip();
        }, 30000);
    });

    const gearBtn = element.querySelector('.balon-settings-btn');
    if (gearBtn) {
        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // biar gak ikut trigger klik-card (fokus map) di atas
            openArrivalModal(pkId); // pkId = item.id (primary key path_history), dipakai buat UPDATE
        });
    }
}

async function updateTableRow(item) {
    const id = item.idseason;
    const pkId = item.id;

    if (!isModaAllowed(item.moda)) {
        removeTableRow(id);
        return;
    }

    const now = new Date();
    const lastUpdate = new Date(item.arrive_target);
    let currentStatus = item.status;

    if (currentStatus && currentStatus.toLowerCase() === 'active') {
        const isStale = (now - lastUpdate) > 600000;
        if (isStale) {
            currentStatus = 'Delay';
        }
    }

    const html = `
        <div class="balon-card ${escapeHtml(currentStatus.toLowerCase())}" data-id="${escapeHtml(id)}">
            <div class="balon-top">
                <span class="sjkb">${escapeHtml(item.sjkb)}</span>
                <div class="balon-top-right">
                    <span class="status">
                        ${escapeHtml(currentStatus)}
                    </span>
                    <button type="button" class="balon-settings-btn" title="Set Arrival / Insiden">
                        <i class="fa-solid fa-gear"></i>
                    </button>
                </div>
            </div>
            <div class="balon-body">
                <div class="balon-row">
                    <span>Tujuan</span>
                    <span>${escapeHtml(item.dest)}</span>
                </div>
                <div class="balon-row">
                    <span>Update</span>
                    <span>${formatTanggalIndonesia(item.updated_at)}</span>
                </div>
            </div>
        </div>
    `;

    if (tableCache.has(id)) {
        const element = tableCache.get(id);
        element.outerHTML = html;
        const newEl = document.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
        if (newEl) {
            tableCache.set(id, newEl);
            attachTableRowListener(newEl, id, pkId);
        }
    }
}

function removeTableRow(id) {
    if (!tableCache.has(id)) return;
    const element = tableCache.get(id);
    element.remove();
    tableCache.delete(id);
}

export async function renderPagination(data) {
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

export function renderPaginationButtons(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const pagination = document.getElementById('pagination2');
    if (!pagination) {
        return;
    }
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
    }
}

export function setupSearch() {
    const input = document.getElementById('searchInput2');
    if (!input) return;

    input.addEventListener('input', async (e) => {
        const keyword = e.target.value.toLowerCase();
        const allData = dataStore.getData('active'); // Ambil dari DataStore
        const filtered = allData.filter(item => {
            const matchesSearch = (
                item.sjkb?.toLowerCase().includes(keyword) ||
                item.dest?.toLowerCase().includes(keyword)
            );
            return matchesSearch && isModaAllowed(item.moda);
        });
        currentPage = 1;
        await renderPagination(filtered);
    });
}

export async function refreshTableActive() {
    const allData = dataStore.getData('active'); // Ambil dari DataStore
    allData.sort((a, b) => {
        return new Date(b.updated_at) - new Date(a.updated_at);
    });

    const keyword = document
        .getElementById('searchInput2')
        ?.value
        ?.toLowerCase() || '';

    const filtered = allData.filter(item => {
        const matchesSearch = (
            item.sjkb?.toLowerCase().includes(keyword) ||
            item.dest?.toLowerCase().includes(keyword)
        );
        return matchesSearch && isModaAllowed(item.moda);
    });

    const konten2 = document.getElementById('konten2');
    const container = konten2?.querySelector('.active-container');
    if (container) {
        container.innerHTML = '';
    }
    tableCache.clear();
    await createtabelactive(filtered);
    await renderPagination(filtered);
}


function buildPopup(item) {
    const now = new Date();
    const lastUpdate = new Date(item.arrive_target);
    let currentStatus = item.status;
    let isStale = null;

    if (currentStatus && currentStatus.toLowerCase() === 'active') {
        isStale = (now - lastUpdate) > 600000;
        if (isStale) currentStatus = 'Delay';
    }

    const statusClass = currentStatus === 'Delay' ? 'status-delay' : 'status-normal';
    const iconMarker = currentStatus === 'Delay' ? markerdelay : markerontime;

    const html = `
        <div class="popup-content">
            <div class="header">
                <span class="header-sjkb">${escapeHtml(item.sjkb)}</span>
                <div class="status-container">
                    <span class="status ${statusClass}">${escapeHtml(currentStatus)}</span>
                </div>
            </div>
            <div class="header-info">
                <div style="display:grid;grid-template-columns:100px 1fr;gap:5px;">
                    <span><b>Tujuan</b></span>
                    <span>: ${escapeHtml(item.dest)}</span>
                    <span><b>Depart</b></span>
                    <span>: ${formatTanggalIndonesia(item.depart_at)}</span>
                    <span><b>Estimasi</b></span>
                    <span>: ${formatTanggalIndonesia(item.arrive_target)}</span>
                    <span><b>Ekspedisi</b></span>
                    <span>: ${escapeHtml(item.vendor)}</span>
                    <span><b>Driver</b></span>
                    <span>: ${escapeHtml(item.driver)}</span>
                </div>
            </div>
            <div class="timestamp" style="margin-top:10px;font-size:10px;color:#666;">
                Update: ${formatTanggalIndonesia(item.updated_at)}
            </div>
        </div>
    `;

    return { html, iconMarker, isStale };
}

export async function createmarker(data = null) {
    const map = window.Mymap;
    if (!map) return;

    let displayData = data;
    if (displayData === null) {
        displayData = dataStore.getData('active'); // Ambil dari DataStore
    }

    if (!displayData || displayData.length === 0) return;
    if (!map.hasLayer(markerLayer)) markerLayer.addTo(map);

    displayData.forEach((item) => {
        const id = item.idseason;
        if (!isModaAllowed(item.moda)) return;

        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const { html, iconMarker, isStale } = buildPopup(item);

        const handleMarkerClick = (clickedMarker) => {
            window.autofokus = false;
            window.lastUserInteraction = Date.now();

            const originalLatLng = clickedMarker.getLatLng();
            const offsetLatLng = [originalLatLng.lat + 0.003, originalLatLng.lng];

            map.setView(offsetLatLng, 16, { animate: true });
            clickedMarker.openTooltip();
            clearTimeout(globalTooltipTimer);
            globalTooltipTimer = setTimeout(() => {
                clickedMarker.closeTooltip();
            }, 3000);
        };

        if (markerCache.has(id)) {
            const marker = markerCache.get(id);
            marker.setLatLng([lat, lng]);
            marker.setIcon(iconMarker);
            marker.setTooltipContent(html);
            marker.off('click').on('click', () => handleMarkerClick(marker));
            return;
        }

        const marker = L.marker([lat, lng], { icon: iconMarker });
        marker.bindTooltip(html, {
            permanent: false,
            direction: 'top',
            className: 'custom-tooltip',
            offset: [0, -50]
        });
        marker.off('click').on('click', () => handleMarkerClick(marker));
        marker.addTo(markerLayer);
        markerCache.set(id, marker);
    });
}

export async function updateMarker(id, item) {
    if (!isModaAllowed(item.moda)) {
        removeMarker(id);
        return;
    }

    if (!markerCache.has(id)) {
        await createmarker([item]);
        return;
    }

    const marker = markerCache.get(id);
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);
    const { html, iconMarker } = buildPopup(item);

    if (!isNaN(lat) && !isNaN(lng)) marker.setLatLng([lat, lng]);
    marker.setIcon(iconMarker);
    marker.setTooltipContent(html);
}

export function removeMarker(id) {
    if (!markerCache.has(id)) return;
    markerLayer.removeLayer(markerCache.get(id));
    markerCache.delete(id);
}

function formatTanggalIndonesia(dateString) {
    const date = new Date(dateString);
    const hari = date.toLocaleDateString('id-ID', { weekday: 'long' });
    const tanggal = date.getDate();
    const bulanIndo = [
        'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
        'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    const tahun = date.getFullYear();
    const jam = date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return `${hari}, ${tanggal} ${bulanIndo[date.getMonth()]} ${tahun} ${jam}`;
}

export async function focusActiveCard(idseason) {
    const searchInput = document.getElementById('searchInput2');
    if (searchInput) searchInput.value = '';
    await refreshTableActive();

    const allowedData = dataStore.getData('active').filter(item => isModaAllowed(item.moda));
    const idx = allowedData.findIndex(item => String(item.idseason) === String(idseason));
    if (idx > -1) {
        currentPage = Math.floor(idx / ITEMS_PER_PAGE) + 1;
        await renderPagination(filteredData);
    }

    setTimeout(() => {
        const card = tableCache.get(idseason)
            || document.querySelector(`#konten2 [data-id="${CSS.escape(String(idseason))}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('flash-highlight');
            setTimeout(() => card.classList.remove('flash-highlight'), 1600);
        }
    }, 60);

    const marker = markerCache.get(idseason);
    if (marker && window.Mymap) {
        window.autofokus = false;
        window.lastUserInteraction = Date.now();
        const offsetLatLng = [marker.getLatLng().lat + 0.003, marker.getLatLng().lng];
        window.Mymap.setView(offsetLatLng, 16, { animate: true });
        marker.openTooltip();
        clearTimeout(globalTooltipTimer);
        globalTooltipTimer = setTimeout(() => marker.closeTooltip(), 3000);
    }
}

export function cleanupActiveModule() {
    if (dataStoreUnsubscribe) {
        dataStoreUnsubscribe();
    }
    tableCache.clear();
    markerCache.forEach((marker) => markerLayer.removeLayer(marker));
    markerCache.clear();

    lastActiveCount = null;
    if (activeBlinkTimeout) {
        clearTimeout(activeBlinkTimeout);
        activeBlinkTimeout = null;
    }
    document.getElementById('tab-btn-active')?.classList.remove('tab-blink');
}
