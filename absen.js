import { dataStore } from './querysupabase';
import { dlog } from './debug';
import { escapeHtml } from './sanitize';
import { showLoading, hideLoading, getSession } from './auth';
import { resetForm } from './submit';
import { supabase } from './supabaseClient';

const tableCache = new Map();
let filteredData = [];
let currentPage = 1;
let dataStoreUnsubscribe = null;
const ITEMS_PER_PAGE = 10;

export async function initializeAbsenModule() {
    setupSearchAbsen();
    initDeleteConfirmModal();
    
    dataStoreUnsubscribe = dataStore.subscribe('absen', async (payload) => {
        dlog('DataStore absen updated:', payload);
        await handleDataStoreChange(payload);
    });
    
    await refreshTableAbsen();
}

async function handleDataStoreChange(payload) {
    const { action, data } = payload;
    
    switch (action) {
        case 'set':
            await refreshTableAbsen();
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
            const container = document.querySelector('#konten1 .active-container');
            if (container) container.innerHTML = '';
            updateBadge(false);
            break;
    }
}

export async function refreshTableAbsen() {
    const allData = dataStore.getData('absen'); // Ambil dari DataStore
    const count = allData.length;
    
    if (count > 0) {
        document.getElementById('tab-icon').textContent = count;
        checkForNewData(true);
    } else {
        document.getElementById('tab-icon').textContent = '';
        checkForNewData(false);
    }
    
    allData.sort((a, b) => {
        return new Date(b.updated_at) - new Date(a.updated_at);
    });
    
    const keyword = document
        .getElementById('searchInput1')
        ?.value
        ?.toLowerCase() || '';
    
    const filtered = allData.filter(item => {
        return (
            item.driver?.toLowerCase().includes(keyword) ||
            item.vendor?.toLowerCase().includes(keyword)
        );
    });
    
    const konten1 = document.getElementById('konten1');
    const container = konten1?.querySelector('.active-container');
    if (container) {
        container.innerHTML = '';
    }
    tableCache.clear();
    await createtabelactive(filtered);
    await renderPagination(filtered);
}

export async function createtabelactive(data = null) {
    let displayData = data;
    if (displayData === null) {
        displayData = dataStore.getData('absen'); // Ambil dari DataStore
    }
    
    const konten1 = document.getElementById('konten1');
    const container = konten1?.querySelector('.active-container');
    if (!container) return;
    
    displayData.forEach(item => {
        const id = item.user_id;
        const recordId = item.id;
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
                    <div class="balon-top-right">
                        <span class="status">
                            ${escapeHtml(currentStatus)}
                        </span>
                        <button type="button" class="balon-settings-btn balon-delete-btn" data-record-id="${escapeHtml(String(recordId))}" title="Hapus data absen">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="balon-body">
                    <div class="balon-row">
                        <span>Lokasi Absen</span>
                        <span>${escapeHtml(item.lokasi)}</span>
                    </div>
                    <div class="balon-row">
                        <span>Ekspedisi</span>
                        <span>${escapeHtml(item.vendor)}</span>
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
        resetForm();

        const form = document.querySelector('.bodyform');
        
        form.dataset.selectedId = id;
        form.dataset.sourceTab = 'absen';

        if (item?.id !== undefined && item?.id !== null && item.id !== '') {
            form.dataset.recordId = String(item.id); // Primary key (id auto increment)
        } else {
            delete form.dataset.recordId;
            console.warn('[ABSEN] item.id kosong untuk record ini — cek select query di /api/request-data & /api/decrypt, pastikan kolom id ikut dikembalikan.', item);
        }
        
        form.classList.add('show');

        const titleEl = document.getElementById('formCardTitle');
        if (titleEl) titleEl.textContent = 'Input pengiriman';
        document.getElementById('formCard')?.classList.remove('form-mode-edit');
    });

    const deleteBtn = element.querySelector('.balon-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const recordId = deleteBtn.dataset.recordId;
            const driverName = element.querySelector('.Nama')?.textContent || '';
            openDeleteConfirmModal(recordId, driverName);
        });
    }
}

async function updateTableRow(item) {
    const id = item.user_id;
    const recordId = item.id;
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
                <div class="balon-top-right">
                    <span class="status">
                        ${escapeHtml(currentStatus)}
                    </span>
                    <button type="button" class="balon-settings-btn balon-delete-btn" data-record-id="${escapeHtml(String(recordId))}" title="Hapus data absen">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="balon-body">
                <div class="balon-row">
                    <span>Lokasi Absen</span>
                    <span>${escapeHtml(item.lokasi)}</span>
                </div>
                <div class="balon-row">
                    <span>Ekspedisi</span>
                    <span>${escapeHtml(item.vendor)}</span>
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
    const pagination = document.getElementById('pagination1');
    
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

export function setupSearchAbsen() {
    const input = document.getElementById('searchInput1');
    if (!input) return;
    
    input.addEventListener('input', async (e) => {
        const keyword = e.target.value.toLowerCase();
        const allData = dataStore.getData('absen'); // Ambil dari DataStore
        const filtered = allData.filter(item => {
            return (
                item.driver?.toLowerCase().includes(keyword) ||
                item.vendor?.toLowerCase().includes(keyword)
            );
        });
        currentPage = 1;
        await renderPagination(filtered);
    });
}

let pendingDeleteId = null;
let sendingDelete = false;

function showDeleteError(text) {
    const el = document.getElementById('deleteAbsenErrorMsg');
    if (!el) return;
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
}

function openDeleteConfirmModal(recordId, driverName) {
    if (!recordId) {
        dlog('[DELETE ABSEN] Tombol diklik tanpa id, dibatalkan');
        return;
    }
    pendingDeleteId = recordId;
    const overlay = document.getElementById('deleteAbsenConfirmOverlay');
    const nameEl = document.getElementById('deleteAbsenDriverName');
    if (nameEl) nameEl.textContent = driverName || '-';
    showDeleteError('');
    if (overlay) overlay.classList.add('show');
}

function closeDeleteConfirmModal() {
    pendingDeleteId = null;
    const overlay = document.getElementById('deleteAbsenConfirmOverlay');
    if (overlay) overlay.classList.remove('show');
}

function initDeleteConfirmModal() {
    const overlay = document.getElementById('deleteAbsenConfirmOverlay');
    const btnNo = document.getElementById('deleteAbsenConfirmNo');
    const btnYes = document.getElementById('deleteAbsenConfirmYes');
    if (!overlay || !btnNo || !btnYes) return;

    btnNo.addEventListener('click', () => closeDeleteConfirmModal());

    btnYes.addEventListener('click', async () => {
        const recordId = pendingDeleteId;
        if (!recordId) {
            closeDeleteConfirmModal();
            return;
        }

        const hasil = await deleteAbsenItem(recordId);
        if (hasil.success) {
            closeDeleteConfirmModal();
        } else {
            showDeleteError(hasil.error || 'Gagal menghapus data, coba lagi.');
        }
    });
}

async function deleteAbsenItem(id) {
    if (sendingDelete) {
        return { success: false, error: 'Sedang memproses, silahkan tunggu.' };
    }
    sendingDelete = true;
    showLoading('Menghapus data...');

    try {
        const session = await getSession();
        if (!session) {
            return { success: false, error: 'Silakan login kembali.' };
        }

        const { error } = await supabase
            .from('path_history')
            .delete()
            .eq('id', id);

        if (error) {
            throw new Error(error.message || 'Gagal menghapus data');
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        sendingDelete = false;
        hideLoading();
    }
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playNotifSound() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    function beep(freq, start, duration) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + duration);
        osc.start(audioCtx.currentTime + start);
        osc.stop(audioCtx.currentTime + start + duration);
    }
    
    beep(600, 0, 0.15);
    beep(900, 0.15, 0.2);
}

let badgeInterval = null;

function updateBadge(status = false) {
    checkForNewData(status);
}

function checkForNewData(status = false) {
    const badge = document.querySelector('.badge');
    if (!badge) return;

    if (status === true) {
        const isAlreadyShowing = badge.classList.contains('show');

        if (!isAlreadyShowing) {
            badge.classList.add('show');
            playNotifSound();
        }

        if (!badgeInterval) {
            badgeInterval = setInterval(() => {
                badge.classList.add('shake');
                badge.addEventListener('animationend', () => {
                    badge.classList.remove('shake');
                }, { once: true });
            }, 10000);
        }
    } else {
        badge.classList.remove('show');
        badge.classList.remove('shake');
        if (badgeInterval) {
            clearInterval(badgeInterval);
            badgeInterval = null;
        }
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

export function cleanupAbsenModule() {
    if (dataStoreUnsubscribe) {
        dataStoreUnsubscribe();
    }
    tableCache.clear();
    if (badgeInterval) {
        clearInterval(badgeInterval);
        badgeInterval = null;
    }
    closeDeleteConfirmModal();
}
