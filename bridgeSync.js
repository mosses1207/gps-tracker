// bridgeSync.js
//
// Jembatan real-time PWA <-> Helper Bridge (aplikasi Python di komputer admin).
// Helper Bridge sengaja TIDAK punya kredensial Supabase, jadi PWA ini yang
// jadi "tangan"-nya buat baca & tulis tabel `planning` di Supabase.
//
// Tanggung jawab file ini:
//   1. Connect WebSocket ke Helper Bridge (port ws = port http bridge + 1).
//   2. Wajib balas { type: 'pong' } tiap kali dapat { type: 'ping' }.
//   3. Balas 'supabase_sync_request' dengan isi tabel `planning` (7 field wajib).
//   4. Eksekusi 'supabase_sync_instructions' (insert/update/delete) ke `planning`.
//   5. Tampilkan badge kecil di pojok kanan atas peta tiap ada proses sync.
//   6. Deteksi awal: kalau bridge belum konek, munculin form alamat/port bridge.
//
// Catatan soal "data kosong": tiap kali diminta sync, PWA SELALU balas dengan
// bentuk JSON yang valid -> { type: 'supabase_sync_response', items: [...] }.
// Kalau gak ada baris yang cocok (atau query gagal), items dikirim sebagai
// array kosong ([]) -- BUKAN pesan yang di-skip / gak dibalas sama sekali --
// supaya Helper Bridge selalu tahu pasti "isi Supabase buat moda ini ya
// segini (kosong)", bukan salah duga koneksinya putus atau datanya beda.

import { supabase } from './supabaseClient';
import { getBridgeUrl, setBridgeUrl, checkBridgeHealth, BRIDGE_DEFAULT_PORT } from './bridge';
import { dlog } from './debug';

const TABLE = 'planning';
const REQUIRED_FIELDS = ['id', 'driver', 'ekspedisi', 'planing', 'status', 'moda', 'trip'];
const RECONNECT_DELAY_MS = 3000;

let ws = null;
let reconnectTimer = null;
let manuallyClosed = false;
let lastData2 = null;

// ============================================
// Konversi alamat HTTP bridge -> alamat WS bridge (port + 1)
// ============================================
function wsUrlFromHttp(httpUrl) {
    try {
        const u = new URL(httpUrl);
        const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        const httpPort = u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80);
        return `${wsProto}//${u.hostname}:${httpPort + 1}`;
    } catch (e) {
        return null;
    }
}

// ============================================
// Badge kecil pojok kanan-atas peta ("sedang insert/update/delete...")
// ============================================
let badgeQueue = [];
let badgeBusy = false;

function showSyncBadge(kind, text, duration = 1800) {
    badgeQueue.push({ kind, text, duration });
    processBadgeQueue();
}

function processBadgeQueue() {
    if (badgeBusy) return;
    const next = badgeQueue.shift();
    if (!next) return;
    badgeBusy = true;

    const badge = document.getElementById('syncBadge');
    if (badge) {
        const icon = { insert: '⬆️', update: '✏️', delete: '🗑️', sync: '🔄', error: '⚠️', ok: '✅' }[next.kind] || '🔄';
        badge.innerHTML = `<span class="sync-badge-icon">${icon}</span><span>${next.text}</span>`;
        badge.className = `sync-badge show sync-badge--${next.kind}`;
    }

    setTimeout(() => {
        if (badge) badge.classList.remove('show');
        badgeBusy = false;
        setTimeout(processBadgeQueue, 150);
    }, next.duration);
}

// ============================================
// WebSocket: connect, reconnect otomatis, ping/pong
// ============================================
function safeSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(obj));
        } catch (e) {
            dlog('[BRIDGE-WS] gagal kirim pesan:', e);
        }
    }
}

function setWsConnected(connected) {
    window.dispatchEvent(new CustomEvent('bridge:ws-status', { detail: { connected } }));
    dlog('[BRIDGE-WS] status koneksi =', connected);
}

function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connectBridgeWs(), RECONNECT_DELAY_MS);
}

function connectBridgeWs() {
    const httpUrl = getBridgeUrl();
    if (!httpUrl) return;

    const wsUrl = wsUrlFromHttp(httpUrl);
    if (!wsUrl) return;

    manuallyClosed = false;
    clearTimeout(reconnectTimer);

    // Tutup koneksi lama kalau masih ada (misal alamat baru disimpan)
    if (ws) {
        try { ws.onclose = null; ws.close(); } catch (e) { /* noop */ }
        ws = null;
    }

    try {
        ws = new WebSocket(wsUrl);
    } catch (e) {
        dlog('[BRIDGE-WS] gagal bikin koneksi:', e);
        scheduleReconnect();
        return;
    }

    ws.addEventListener('open', () => {
        dlog('[BRIDGE-WS] terhubung ke', wsUrl);
        setWsConnected(true);
    });

    ws.addEventListener('message', (evt) => {
        handleBridgeMessage(evt.data);
    });

    ws.addEventListener('close', () => {
        setWsConnected(false);
        if (!manuallyClosed) scheduleReconnect();
    });

    ws.addEventListener('error', (e) => {
        dlog('[BRIDGE-WS] error koneksi:', e);
    });
}

/** Dipanggil habis admin ganti/simpan alamat bridge baru, biar WS langsung nyoba konek ulang. */
export function restartBridgeWs() {
    manuallyClosed = true;
    if (ws) {
        try { ws.close(); } catch (e) { /* noop */ }
        ws = null;
    }
    clearTimeout(reconnectTimer);
    connectBridgeWs();
}

async function handleBridgeMessage(raw) {
    let msg;
    try {
        msg = JSON.parse(raw);
    } catch (e) {
        dlog('[BRIDGE-WS] pesan bukan JSON valid, diabaikan');
        return;
    }

    switch (msg.type) {
        case 'ping':
            safeSend({ type: 'pong' });
            break;

        case 'init':
        case 'data2_update':
            lastData2 = msg.data2 || {};
            window.dispatchEvent(new CustomEvent('bridge:data2', { detail: lastData2 }));
            break;

        case 'supabase_sync_request':
            await handleSyncRequest(msg.moda);
            break;

        case 'supabase_sync_instructions':
            await handleSyncInstructions(msg);
            break;

        default:
            dlog('[BRIDGE-WS] tipe pesan gak dikenal:', msg.type);
    }
}

export function getLastData2() {
    return lastData2;
}

// ============================================
// PWA jadi "tangan" Supabase: balas isi tabel `planning`
// ============================================
function normalizeItem(row) {
    const out = {};
    REQUIRED_FIELDS.forEach((key) => {
        const v = row ? row[key] : undefined;
        out[key] = (v === undefined || v === null) ? '' : v;
    });
    return out;
}

async function handleSyncRequest(modaList) {
    showSyncBadge('sync', 'Sinkron data ke Helper…');

    const moda = Array.isArray(modaList) ? modaList.filter(Boolean) : [];

    try {
        let query = supabase.from(TABLE).select(REQUIRED_FIELDS.join(', '));
        if (moda.length > 0) {
            query = query.in('moda', moda);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Selalu kirim array (bisa kosong) dengan bentuk field yang konsisten,
        // supaya Helper Bridge gak salah duga koneksi putus / data beda.
        const items = (data || []).map(normalizeItem);

        safeSend({ type: 'supabase_sync_response', items });
        showSyncBadge('ok', `Sync terkirim (${items.length} data)`);
    } catch (e) {
        console.error('[BRIDGE-WS] gagal ambil data planning:', e);
        // Tetap balas dengan bentuk valid (items kosong) walau query gagal,
        // biar Helper Bridge gak nunggu / salah asumsi.
        safeSend({ type: 'supabase_sync_response', items: [] });
        showSyncBadge('error', 'Gagal ambil data Supabase');
    }
}

// ============================================
// Lokasi admin: Helper Bridge gak pernah ngirim field `lokasi` pas insert
// (dia gak tau ini device/admin yang mana), jadi PWA ambil sendiri dari
// tabel `admin` (kolom `lokasi`) berdasarkan uid user yang lagi login di
// PWA ini, terus ditempelin ke tiap baris sebelum insert ke `planning`.
// ============================================
const LOKASI_CACHE_MS = 5 * 60 * 1000;
let cachedLokasi = null;
let lokasiFetchedAt = 0;

async function getMyLokasi() {
    const now = Date.now();
    if (cachedLokasi !== null && (now - lokasiFetchedAt) < LOKASI_CACHE_MS) {
        return cachedLokasi;
    }
    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            dlog('[BRIDGE-WS] belum login, gak bisa ambil lokasi admin');
            return cachedLokasi;
        }

        // PERBAIKAN: 
        // 1. Select kolom 'Area' (bukan 'lokasi')
        // 2. Menggunakan .eq('uid', user.id)
        const { data, error } = await supabase
            .from('admin')
            .select('Area')
            .eq('uid', user.id)
            .maybeSingle();

        if (error || !data) {
            dlog('[BRIDGE-WS] gagal ambil lokasi dari tabel admin:', error);
            return cachedLokasi;
        }

        // Ambil properti .Area
        cachedLokasi = data.Area ?? null;
        lokasiFetchedAt = now;
        return cachedLokasi;
    } catch (e) {
        dlog('[BRIDGE-WS] error ambil lokasi admin:', e);
        return cachedLokasi;
    }
}

// ============================================
// PWA jadi "tangan" Supabase: eksekusi insert/update/delete
// ============================================
function stripId(row) {
    if (!row || typeof row !== 'object') return row;
    const { id, ...rest } = row;
    return rest;
}

async function handleSyncInstructions(msg) {
    const inserts = Array.isArray(msg.inserts) ? msg.inserts.filter(Boolean) : [];
    const updates = Array.isArray(msg.updates) ? msg.updates.filter(Boolean) : [];
    const deletes = Array.isArray(msg.deletes) ? msg.deletes.filter((v) => v !== null && v !== undefined) : [];

    if (inserts.length > 0) {
        showSyncBadge('insert', `Insert ${inserts.length} data…`);
        try {
            const lokasi = (await getMyLokasi()) || ''; // Berikan fallback string kosong jika lokasi null
            
            // Buang key 'id' secara eksplisit agar Postgres menggunakan Sequence Auto-Increment
            const rows = inserts.map((row) => {
                const cleanRow = { ...row };
                delete cleanRow.id; 
                return {
                    ...cleanRow,
                    lokasi: lokasi
                };
            });

            dlog('[BRIDGE-WS] Payload insert ke Supabase:', rows);

            const { error } = await supabase.from(TABLE).insert(rows);
            if (error) {
                console.error('[BRIDGE-WS] Detail error Supabase:', error.message, error.details, error.hint);
                throw error;
            }
            showSyncBadge('ok', `Insert ${inserts.length} data selesai`);
        } catch (e) {
            console.error('[BRIDGE-WS] insert ke planning gagal:', e);
            showSyncBadge('error', 'Insert ke Supabase gagal');
        }
    }

    if (updates.length > 0) {
        showSyncBadge('update', `Update ${updates.length} data…`);
        let failCount = 0;
        for (const u of updates) {
            if (!u || u.id === undefined || u.id === null) continue;
            const { id, ...rest } = u;
            try {
                const { error } = await supabase.from(TABLE).update(rest).eq('id', id);
                if (error) {
                    console.error(`[BRIDGE-WS] Detail error update id=${id}:`, error.message, error.details);
                    throw error;
                }
            } catch (e) {
                failCount++;
                console.error(`[BRIDGE-WS] update planning id=${id} gagal:`, e);
            }
        }
        showSyncBadge(failCount > 0 ? 'error' : 'ok', failCount > 0 ? `${failCount} update gagal` : `Update ${updates.length} data selesai`);
    }

    if (deletes.length > 0) {
        showSyncBadge('delete', `Hapus ${deletes.length} data…`);
        try {
            const { error } = await supabase.from(TABLE).delete().in('id', deletes);
            if (error) {
                console.error('[BRIDGE-WS] Detail error delete Supabase:', error.message, error.details);
                throw error;
            }
            showSyncBadge('ok', `Hapus ${deletes.length} data selesai`);
        } catch (e) {
            console.error('[BRIDGE-WS] delete di planning gagal:', e);
            showSyncBadge('error', 'Hapus di Supabase gagal');
        }
    }

    if (inserts.length === 0 && updates.length === 0 && deletes.length === 0) {
        dlog('[BRIDGE-WS] supabase_sync_instructions kosong, gak ada operasi');
    }
}

// ============================================
// Deteksi awal konek/gak + form alamat/port wajib muncul kalau belum konek
// ============================================
function showBridgeSetupModal(hintText) {
    const overlay = document.getElementById('bridgeSetupOverlay');
    if (!overlay) return;

    const input = document.getElementById('bridgeSetupUrlInput');
    if (input && !input.value) {
        input.value = getBridgeUrl() || `https://192.168.1.10:${BRIDGE_DEFAULT_PORT}`;
    }

    const hint = document.getElementById('bridgeSetupHint');
    if (hint) {
        hint.textContent = hintText || 'PWA belum terhubung ke Helper Bridge. Masukkan alamat yang muncul di tab "Bridge" aplikasi Helper (setelah klik Start).';
        hint.className = 'bridge-setup-hint';
    }

    overlay.classList.add('show');
}

function hideBridgeSetupModal() {
    const overlay = document.getElementById('bridgeSetupOverlay');
    if (overlay) overlay.classList.remove('show');
}

async function ensureBridgeConfigured() {
    const url = getBridgeUrl();

    if (!url) {
        showBridgeSetupModal();
        return;
    }

    const result = await checkBridgeHealth(url);
    if (!result.ok) {
        showBridgeSetupModal(`Alamat tersimpan saat ini (${url}) tapi belum bisa dihubungi. Pastikan Helper Bridge sudah di-Start & 1 jaringan WiFi/LAN.`);
    } else {
        hideBridgeSetupModal();
    }
}

/** Wiring tombol Simpan/Tutup di form modal wajib-konek. Panggil sekali saat init. */
export function initBridgeSetupModalUI() {
    const overlay = document.getElementById('bridgeSetupOverlay');
    const input = document.getElementById('bridgeSetupUrlInput');
    const saveBtn = document.getElementById('bridgeSetupSaveBtn');
    const closeBtn = document.getElementById('bridgeSetupCloseBtn');
    const hint = document.getElementById('bridgeSetupHint');
    if (!overlay || !input || !saveBtn) return;

    if (input.dataset.ready === '1') return;
    input.dataset.ready = '1';

    const setHint = (text, kind) => {
        if (!hint) return;
        hint.textContent = text;
        hint.className = 'bridge-setup-hint' + (kind ? ` ${kind}` : '');
    };

    const saveAndConnect = async () => {
        const saved = setBridgeUrl(input.value);
        input.value = saved;

        if (!saved) {
            setHint('Isi dulu alamat bridge-nya, (contoh: https://192.168.1.10:8877).', 'error');
            return;
        }

        setHint('Mengecek koneksi ke bridge...', '');
        const result = await checkBridgeHealth(saved);

        if (result.ok) {
            setHint('Tersambung! Menutup form...', 'ok');
            restartBridgeWs();
            setTimeout(hideBridgeSetupModal, 700);
        } else {
            setHint('Belum bisa terhubung. Pastikan Helper Bridge sudah di-Start & PWA + komputer admin ada di WiFi/LAN yang sama.', 'error');
        }
    };

    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveAndConnect();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveAndConnect();
        }
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => hideBridgeSetupModal());
    }
}

/** Entry point utama, panggil sekali saat aplikasi mulai. */
export async function initBridgeSync() {
    await ensureBridgeConfigured();
    connectBridgeWs();
}