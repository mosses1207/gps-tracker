import { dataStore } from './querysupabase';
import { escapeHtml } from './sanitize';
import { dlog } from './debug';
import { isModaAllowed, onModaFilterChange } from './settings';
import { setSelectedKordinat, clearFrameFieldErrors, clearFmStatuses, hideMsg } from './submit';

let filteredData = [];
let currentPage = 1;
let dataStoreUnsubscribe = null;
const ITEMS_PER_PAGE = 10;
const tableCache = new Map();

export async function initializeInstruksiModule() {
    setupSearchInstruksi();

    // Subscribe ke perubahan data instruksi
    dataStoreUnsubscribe = dataStore.subscribe('instruksi', async (payload) => {
        dlog('DataStore instruksi updated:', payload);
        await handleDataStoreChange(payload);
    });

    // Subscribe ke perubahan filter moda (dari tombol Pengaturan)
    onModaFilterChange(async () => {
        dlog('[INSTRUKSI] Moda filter berubah, re-render list');
        await refreshTableInstruksi();
    });

    // Initial render
    await refreshTableInstruksi();
}

async function handleDataStoreChange(payload) {
    const { action, data } = payload;

    switch (action) {
        case 'set':
            await refreshTableInstruksi();
            break;

        case 'update':
            if (Array.isArray(data)) {
                for (const item of data) {
                    await updateTableRow(item);
                }
            } else {
                await updateTableRow(data);
            }
            break;

        case 'delete':
            removeTableRow(data.user_id);
            break;

        case 'clear':
            tableCache.clear();
            const container = document.querySelector('#konten4 .active-container');
            if (container) container.innerHTML = '';
            break;
    }
}


export async function refreshTableInstruksi() {
    const allData = dataStore.getData('instruksi'); // Ambil dari DataStore

    allData.sort((a, b) => {
        return new Date(b.updated_at) - new Date(a.updated_at);
    });

    const keyword = document
        .getElementById('searchInput4')
        ?.value
        ?.toLowerCase() || '';

    const filtered = allData.filter(item => {
        const matchesSearch = (
            item.driver?.toLowerCase().includes(keyword) ||
            item.vendor?.toLowerCase().includes(keyword)
        );
        return matchesSearch && isModaAllowed(item.moda);
    });

    const konten4 = document.getElementById('konten4');
    const container = konten4?.querySelector('.active-container');
    if (container) {
        container.innerHTML = '';
    }

    tableCache.clear();
    await createtabelinstruksi(filtered);
    await renderPagination(filtered);
}

export async function createtabelinstruksi(data = null) {
    let displayData = data;
    if (displayData === null) {
        displayData = dataStore.getData('instruksi'); // Ambil dari DataStore
    }

    const konten4 = document.getElementById('konten4');
    const container = konten4?.querySelector('.active-container');
    if (!container) return;

    displayData.forEach(item => {
        const id = item.user_id;
        const now = new Date();
        const lastUpdate = new Date(item.arrive_target);

        if (item.status === null) {
            item.status = 'Active';
        }

        let currentStatus = item.status;
        if (currentStatus === 'Active') {
            const isStale = (now - lastUpdate) > 600000;
            if (isStale) {
                currentStatus = 'Delay';
            }
        }

        const html = `
            <div class="balon-card ${escapeHtml(currentStatus.toLowerCase())}" data-id="${escapeHtml(id)}">
                <div class="balon-top">
                    <span class="Nama">${escapeHtml(item.driver)}</span>
                    <span class="status">
                        ${escapeHtml(currentStatus)}
                    </span>
                </div>
                <div class="balon-body">
                    <div class="balon-row">
                        <span>Ekspedisi</span>
                        <span>${escapeHtml(item.vendor)}</span>
                    </div>
                    <div class="balon-row">
                        <span>Tujuan</span>
                        <span>${escapeHtml(item.dest)}</span>
                    </div>
                    <div class="balon-row">
                        <span>Update</span>
                        <span>${formatTanggalIndonesia(item.created_at)}</span>
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
                attachRowListener(newEl, id, item);
            }
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-id', id);
        wrapper.innerHTML = html;
        const element = wrapper.firstElementChild;
        container.prepend(element);
        tableCache.set(id, element);
        attachRowListener(element, id, item);
    });
}

function attachRowListener(element, id, item) {
    element.addEventListener('click', () => {
        const form = document.querySelector('.bodyform');
        form.dataset.selectedId = id;
        form.dataset.sourceTab = 'instruksi';

        form.dataset.recordId = item.id;
        
        form.classList.add('show');

        const titleEl = document.getElementById('formCardTitle');
        if (titleEl) titleEl.textContent = 'EDIT PENGIRIMAN';
        document.getElementById('formCard')?.classList.add('form-mode-edit');

        populateFormFromItem(item);
    });
}

function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = (value && value !== '-') ? value : '';
}

function populateFormFromItem(item) {
    if (!item) return;

    setFieldValue('sjkb', item.sjkb);
    setFieldValue('dest', item.dest);
    setFieldValue('moda', item.moda);
    setFieldValue('leadtime', item.leadtime ? `${item.leadtime} Menit` : '');

    setFieldValue('fm1', item.fm1);
    setFieldValue('fm2', item.fm2);
    setFieldValue('fm3', item.fm3);
    setFieldValue('fm4', item.fm4);
    setFieldValue('fm5', item.fm5);
    setFieldValue('fm6', item.fm6);

    setFieldValue('alamatfm1', item.afm1);
    setFieldValue('alamatfm2', item.afm2);
    setFieldValue('alamatfm3', item.afm3);
    setFieldValue('alamatfm4', item.afm4);
    setFieldValue('alamatfm5', item.afm5);
    setFieldValue('alamatfm6', item.afm6);

    setFieldValue('typefm1', item.tfm1);
    setFieldValue('typefm2', item.tfm2);
    setFieldValue('typefm3', item.tfm3);
    setFieldValue('typefm4', item.tfm4);
    setFieldValue('typefm5', item.tfm5);
    setFieldValue('typefm6', item.tfm6);

    setFieldValue('modelfm1', item.mfm1);
    setFieldValue('modelfm2', item.mfm2);
    setFieldValue('modelfm3', item.mfm3);
    setFieldValue('modelfm4', item.mfm4);
    setFieldValue('modelfm5', item.mfm5);
    setFieldValue('modelfm6', item.mfm6);

    if (item.lattujuan && item.langtujuan) {
        setSelectedKordinat({
            lat: parseFloat(item.lattujuan),
            lng: parseFloat(item.langtujuan)
        });
    } else {
        setSelectedKordinat(null);
    }

    clearFrameFieldErrors();
    clearFmStatuses();
    hideMsg();
}

async function updateTableRow(item) {
    const id = item.user_id;

    if (!isModaAllowed(item.moda)) {
        removeTableRow(id);
        return;
    }

    const now = new Date();
    const lastUpdate = new Date(item.arrive_target);

    if (item.status === null) {
        item.status = 'Active';
    }

    let currentStatus = item.status;
    if (currentStatus === 'Active') {
        const isStale = (now - lastUpdate) > 600000;
        if (isStale) {
            currentStatus = 'Delay';
        }
    }

    const html = `
        <div class="balon-card ${escapeHtml(currentStatus.toLowerCase())}" data-id="${escapeHtml(id)}">
            <div class="balon-top">
                <span class="Nama">${escapeHtml(item.driver)}</span>
                <span class="status">
                    ${escapeHtml(currentStatus)}
                </span>
            </div>
            <div class="balon-body">
                <div class="balon-row">
                    <span>Ekspedisi</span>
                    <span>${escapeHtml(item.vendor)}</span>
                </div>
                <div class="balon-row">
                    <span>Status</span>
                    <span>${escapeHtml(item.dest)}</span>
                </div>
                <div class="balon-row">
                    <span>Update</span>
                    <span>${formatTanggalIndonesia(item.created_at)}</span>
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
            attachRowListener(newEl, id, item);
        }
    }
}

function removeTableRow(id) {
    if (!tableCache.has(id)) return;
    const element = tableCache.get(id);
    element.remove();
    tableCache.delete(id);
}

export function setupSearchInstruksi() {
    const input = document.getElementById('searchInput4');
    if (!input) return;

    input.addEventListener('input', async (e) => {
        const keyword = e.target.value.toLowerCase();
        const allData = dataStore.getData('instruksi'); // Ambil dari DataStore
        const filtered = allData.filter(item => {
            const matchesSearch = (
                item.driver?.toLowerCase().includes(keyword) ||
                item.vendor?.toLowerCase().includes(keyword)
            );
            return matchesSearch && isModaAllowed(item.moda);
        });
        currentPage = 1;
        await renderPagination(filtered);
    });
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
        const el = tableCache.get(item.user_id);
        if (el) {
            el.style.display = 'block';
        }
    });

    renderPaginationButtons(data.length);
}

export function renderPaginationButtons(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const pagination = document.getElementById('pagination4');

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

export async function focusInstruksiCard(user_id) {
    const searchInput = document.getElementById('searchInput4');
    if (searchInput) searchInput.value = '';
    await refreshTableInstruksi();

    const allowedData = dataStore.getData('instruksi').filter(item => isModaAllowed(item.moda));
    const idx = allowedData.findIndex(item => String(item.user_id) === String(user_id));
    if (idx > -1) {
        currentPage = Math.floor(idx / ITEMS_PER_PAGE) + 1;
        await renderPagination(filteredData);
    }

    setTimeout(() => {
        const card = tableCache.get(user_id)
            || document.querySelector(`#konten4 [data-id="${CSS.escape(String(user_id))}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('flash-highlight');
            setTimeout(() => card.classList.remove('flash-highlight'), 1600);
        }
    }, 60);
}

export function cleanupInstruksiModule() {
    if (dataStoreUnsubscribe) {
        dataStoreUnsubscribe();
    }
    tableCache.clear();
}
