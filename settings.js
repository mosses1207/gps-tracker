//settings.js
// Filter moda (Self Drive / Single Carrier / Car Carrier / Double Carrier)
// + UI tombol Pengaturan (dropdown checklist) + Logout dengan konfirmasi.

import { dlog } from './debug';
import { getBridgeUrl, setBridgeUrl, checkBridgeHealth } from './bridge';
import { restartBridgeWs } from './bridgeSync';

const STORAGE_KEY = 'moda_filter';

export const ALL_MODA = ['Self Drive', 'Single Carrier', 'Car Carrier', 'Double Carrier'];

function loadFilter() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (Array.isArray(saved) && saved.length > 0) {
            // buang value yang gak dikenal (misal moda lama yang udah gak dipakai)
            const cleaned = saved.filter(m => ALL_MODA.includes(m));
            if (cleaned.length > 0) return cleaned;
        }
    } catch (e) {
        // localStorage kosong/corrupt, pakai default
    }
    return [...ALL_MODA]; // default: semua moda ditampilkan
}

let currentFilter = loadFilter();
let listeners = [];

export function getModaFilter() {
    return [...currentFilter];
}

// Item tanpa field moda (data lama) tetap ditampilkan supaya gak "hilang" tiba-tiba.
export function isModaAllowed(moda) {
    if (!moda) return true;
    return currentFilter.includes(moda);
}

export function setModaFilter(newFilter) {
    currentFilter = ALL_MODA.filter(m => newFilter.includes(m)); // urutan konsisten
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentFilter));
    } catch (e) {
        // storage penuh/disabled, tetap jalan pakai state in-memory
    }
    dlog('[SETTINGS] Moda filter diubah:', currentFilter);
    listeners.forEach((cb) => {
        try {
            cb(getModaFilter());
        } catch (error) {
            console.error('Error in moda filter listener:', error);
        }
    });
}

export function onModaFilterChange(callback) {
    listeners.push(callback);
    return () => {
        listeners = listeners.filter((cb) => cb !== callback);
    };
}

// ============================================
// UI: tombol Pengaturan + dropdown + logout confirm
// ============================================

export function initSettingsUI() {
    const btn = document.getElementById('settingsBtn');
    const panel = document.getElementById('settingsPanel');
    if (!btn || !panel) return;

    const checkboxes = Array.from(panel.querySelectorAll('input[type="checkbox"][data-moda]'));

    // Sinkronkan checkbox dengan state tersimpan
    checkboxes.forEach((cb) => {
        cb.checked = currentFilter.includes(cb.dataset.moda);
        cb.addEventListener('change', () => {
            const selected = checkboxes.filter((c) => c.checked).map((c) => c.dataset.moda);
            setModaFilter(selected);
        });
    });

    const closePanel = () => {
        panel.classList.remove('show');
        btn.classList.remove('active');
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = !panel.classList.contains('show');
        panel.classList.toggle('show', willShow);
        btn.classList.toggle('active', willShow);
    });

    panel.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', () => closePanel());

    initBridgeUrlUI();

    // ---- Logout dengan konfirmasi ----
    const logoutBtn = document.getElementById('settingsLogoutBtn');
    const confirmOverlay = document.getElementById('logoutConfirmOverlay');
    const confirmYes = document.getElementById('logoutConfirmYes');
    const confirmNo = document.getElementById('logoutConfirmNo');

    if (logoutBtn && confirmOverlay) {
        logoutBtn.addEventListener('click', () => {
            closePanel();
            confirmOverlay.classList.add('show');
        });
    }

    if (confirmNo && confirmOverlay) {
        confirmNo.addEventListener('click', () => {
            confirmOverlay.classList.remove('show');
        });
    }

    if (confirmYes && confirmOverlay) {
        confirmYes.addEventListener('click', async () => {
            confirmOverlay.classList.remove('show');
            if (typeof window.handleLogout === 'function') {
                await window.handleLogout();
            }
        });
    }
}

// ============================================
// UI: alamat bridge lokal (Helper Push Data) dipakai buat autofill form
// ============================================

function initBridgeUrlUI() {
    const input = document.getElementById('bridgeUrlInput');
    const saveBtn = document.getElementById('bridgeUrlSaveBtn');
    const hint = document.getElementById('bridgeUrlHint');
    if (!input || !saveBtn) return;

    // Cegah init dobel kalau initSettingsUI ke-panggil lebih dari sekali
    if (input.dataset.bridgeUiReady === '1') return;
    input.dataset.bridgeUiReady = '1';

    const defaultHintText = hint ? hint.textContent : '';

    input.value = getBridgeUrl();

    const showHint = (text, kind) => {
        if (!hint) return;
        hint.textContent = text;
        hint.className = 'settings-bridge-hint' + (kind ? ` ${kind}` : '');
    };

    const saveAndCheck = async () => {
        const saved = setBridgeUrl(input.value);
        input.value = saved;

        if (!saved) {
            showHint(defaultHintText, '');
            return;
        }

        showHint('Mengecek koneksi ke bridge...', '');
        const result = await checkBridgeHealth(saved);

        if (result.ok) {
            const lokasi = result.data?.lokasi ? ` (${result.data.lokasi})` : '';
            showHint(`Bridge tersambung${lokasi}.`, 'ok');
            restartBridgeWs();
        } else {
            showHint('Alamat tersimpan, tapi bridge belum bisa dihubungi. Pastikan bridge sudah di-Start & 1 jaringan.', 'error');
        }
    };

    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveAndCheck();
    });

    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveAndCheck();
        }
    });
}