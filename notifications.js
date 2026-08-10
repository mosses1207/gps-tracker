// notifications.js
//
// Panel notifikasi/reminder buat admin di pojok kanan atas sidebar (sebelah
// tombol Pengaturan). Isinya agregat dari data 'instruksi' dan 'active' di
// DataStore, dan di-scroll kayak riwayat chat kalau isinya banyak.
//
// Kondisi yang dipantau:
// 1) Item di tab Instruksi yang belum pindah status (masih di bucket
//    'instruksi', artinya driver belum mulai jalan) lebih dari 1 jam sejak
//    created_at.
// 2) Item active yang "delay & belum sampai": update posisi TERAKHIR yang
//    masuk (updated_at) sudah melewati target kedatangan (arrive_target,
//    yaitu depart_at + leadtime yang udah dihitung backend). Artinya bukan
//    cuma nebak dari jalannya jam, tapi udah kebukti dari data yang beneran
//    masuk. Sengaja dibandingkan ke updated_at (bukan "jam sekarang") biar
//    gak tumpang tindih sama kondisi #3 (device yang lagi silent/gak connect
//    udah kepegang di situ). Kalau ternyata maksudnya "now > arrive_target"
//    (real-time, samain kayak status "Delay" di kartu), tinggal ganti baris
//    yang ditandain "GANTI DI SINI" di bawah.
// 3) Item active yang updated_at-nya sudah lebih dari 10 menit dari waktu
//    saat ini (reminder: GPS/koneksi mungkin bermasalah).
//
// Semua kondisi ikut filter moda yang lagi aktif (settings.js) — kalau lagi
// difilter Self Drive doang, badge yang muncul cuma punya moda itu.

import { dataStore } from './querysupabase';
import { escapeHtml } from './sanitize';
import { dlog } from './debug';
import { isModaAllowed, onModaFilterChange } from './settings';
import { focusActiveCard } from './active';
import { focusInstruksiCard } from './instruksi';

const ONE_HOUR_MS = 60 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;
const TICK_INTERVAL_MS = 20000; // re-evaluasi berkala krn kondisi 1 & 3 jalan seiring waktu, bukan cuma pas data berubah

let tickTimer = null;
let unsubActive = null;
let unsubInstruksi = null;
let unsubModa = null;
let knownIds = new Set();
let audioCtx = null;

// ============================================
// SOUND (chime pendek pas ada reminder baru)
// ============================================

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playChime() {
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        const beep = (freq, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + duration);
        };

        beep(720, 0, 0.12);
        beep(980, 0.12, 0.16);
    } catch (error) {
        // audio context belum di-"unlock" sama gesture user, aman diabaikan
    }
}

// ============================================
// COMPUTE
// ============================================

function relativeTime(dateString) {
    const then = new Date(dateString).getTime();
    if (isNaN(then)) return '-';
    const diffMin = Math.floor((Date.now() - then) / 60000);

    if (diffMin < 1) return 'baru saja';
    if (diffMin < 60) return `${diffMin} menit lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam lalu`;
    return `${Math.floor(diffHour / 24)} hari lalu`;
}

function computeNotifications() {
    const now = Date.now();
    const notifs = [];

    // Kondisi 1: instruksi belum berubah status > 1 jam dari updated_at
    // (pakai updated_at, bukan created_at -- created_at gak reliable/gak selalu
    // ke-return dari API buat baris instruksi, updated_at yang konsisten ada)
    dataStore.getData('instruksi').forEach(item => {
        if (!isModaAllowed(item.moda)) return;
        const lastUpdatedAt = new Date(item.updated_at).getTime();
        if (isNaN(lastUpdatedAt)) return;

        if (now - lastUpdatedAt > ONE_HOUR_MS) {
            notifs.push({
                id: `instruksi-${item.user_id}`,
                category: 'instruksi',
                triggeredAt: lastUpdatedAt + ONE_HOUR_MS,
                title: item.driver || 'Driver',
                message: 'Instruksi belum direspon, status belum berubah',
                meta: item.vendor || '',
                timeLabel: relativeTime(item.updated_at),
                refId: item.user_id
            });
        }
    });

    // Kondisi 2 & 3: active
    dataStore.getData('active').forEach(item => {
        if (!isModaAllowed(item.moda)) return;
        if (!item.status || item.status.toLowerCase() !== 'active') return;

        const updatedAt = new Date(item.updated_at).getTime();

        // Kondisi 2: delay & belum sampai — arrive_target = depart_at + leadtime
        // (field ini sama persis yang udah dipakai di active.js buat status "Delay")
        const deadline = new Date(item.arrive_target).getTime();
        if (!isNaN(deadline) && !isNaN(updatedAt) && updatedAt > deadline) { // GANTI DI SINI kalau maunya now > deadline
            notifs.push({
                id: `delay-${item.idseason}`,
                category: 'delay',
                triggeredAt: deadline,
                title: item.sjkb || 'Pengiriman',
                message: `Delay, belum sampai${item.dest ? ' ke ' + item.dest : ''}`,
                meta: item.driver || '',
                timeLabel: relativeTime(item.updated_at),
                refId: item.idseason
            });
        }

        // Kondisi 3: gak ada update posisi > 10 menit
        if (!isNaN(updatedAt) && (now - updatedAt) > TEN_MIN_MS) {
            notifs.push({
                id: `stale-${item.idseason}`,
                category: 'stale',
                triggeredAt: updatedAt + TEN_MIN_MS,
                title: item.sjkb || 'Pengiriman',
                message: 'Belum ada update posisi lebih dari 10 menit',
                meta: item.driver || '',
                timeLabel: relativeTime(item.updated_at),
                refId: item.idseason
            });
        }
    });

    // Urutan prioritas admin: delay pengiriman (udah lewat target) paling urgent,
    // baru device/GPS gak ada update >10 menit, baru instruksi yang mangkrak >1 jam.
    // Di dalam kategori yang sama, yang paling lama "nunggak" ditaruh paling atas.
    const CATEGORY_PRIORITY = { delay: 1, stale: 2, instruksi: 3 };
    notifs.sort((a, b) => {
        const prioA = CATEGORY_PRIORITY[a.category] ?? 99;
        const prioB = CATEGORY_PRIORITY[b.category] ?? 99;
        if (prioA !== prioB) return prioA - prioB;
        return a.triggeredAt - b.triggeredAt;
    });
    return notifs;
}

// ============================================
// RENDER
// ============================================

function iconForCategory(category) {
    switch (category) {
        case 'instruksi': return 'fa-solid fa-clock';
        case 'delay': return 'fa-solid fa-truck-fast';
        case 'stale': return 'fa-solid fa-satellite-dish';
        default: return 'fa-solid fa-bell';
    }
}

function closePanel() {
    document.getElementById('notifPanel')?.classList.remove('show');
    document.getElementById('notifBtn')?.classList.remove('active');
}

function renderPanel(notifs) {
    const list = document.getElementById('notifList');
    const countBadge = document.getElementById('notifBadgeCount');
    const panelCount = document.getElementById('notifPanelCount');
    const bellBtn = document.getElementById('notifBtn');
    if (!list || !countBadge || !panelCount || !bellBtn) return;

    panelCount.textContent = String(notifs.length);

    if (notifs.length > 0) {
        countBadge.textContent = notifs.length > 99 ? '99+' : String(notifs.length);
        countBadge.classList.add('show');
        bellBtn.classList.add('has-alert');
    } else {
        countBadge.classList.remove('show');
        bellBtn.classList.remove('has-alert');
    }

    if (notifs.length === 0) {
        list.innerHTML = `
            <div class="notif-empty">
                <i class="fa-regular fa-circle-check"></i>
                <span>Aman, gak ada reminder saat ini.</span>
            </div>
        `;
        return;
    }

    list.innerHTML = notifs.map(n => `
        <div class="notif-item type-${escapeHtml(n.category)}" data-category="${escapeHtml(n.category)}" data-ref="${escapeHtml(n.refId)}">
            <div class="notif-avatar"><i class="${iconForCategory(n.category)}"></i></div>
            <div class="notif-bubble">
                <div class="notif-bubble-top">
                    <span class="notif-name">${escapeHtml(n.title)}</span>
                    <span class="notif-time">${escapeHtml(n.timeLabel)}</span>
                </div>
                <div class="notif-message">${escapeHtml(n.message)}</div>
                ${n.meta ? `<div class="notif-meta">${escapeHtml(n.meta)}</div>` : ''}
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.notif-item').forEach(el => {
        el.addEventListener('click', async () => {
            const category = el.dataset.category;
            const refId = el.dataset.ref;
            closePanel();

            if (category === 'instruksi') {
                document.getElementById('tab-btn-instruksi')?.click();
                await focusInstruksiCard(refId);
            } else {
                document.getElementById('tab-btn-active')?.click();
                await focusActiveCard(refId);
            }
        });
    });
}

function refresh() {
    const notifs = computeNotifications();

    const currentIds = new Set(notifs.map(n => n.id));
    let hasNew = false;
    currentIds.forEach(id => {
        if (!knownIds.has(id)) hasNew = true;
    });

    // Cuma bunyi kalau ada reminder BARU, dan bukan pas render pertama kali load
    if (hasNew && knownIds.size > 0) {
        playChime();
    }
    knownIds = currentIds;

    renderPanel(notifs);
}

// ============================================
// INIT / CLEANUP
// ============================================

export function initializeNotificationsModule() {
    const bellBtn = document.getElementById('notifBtn');
    const panel = document.getElementById('notifPanel');

    if (bellBtn && panel) {
        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willShow = !panel.classList.contains('show');
            panel.classList.toggle('show', willShow);
            bellBtn.classList.toggle('active', willShow);
            if (willShow) refresh();
        });

        panel.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => closePanel());
    }

    unsubActive = dataStore.subscribe('active', () => {
        dlog('[NOTIF] active berubah, re-evaluasi reminder');
        refresh();
    });

    unsubInstruksi = dataStore.subscribe('instruksi', () => {
        dlog('[NOTIF] instruksi berubah, re-evaluasi reminder');
        refresh();
    });

    unsubModa = onModaFilterChange(() => {
        dlog('[NOTIF] filter moda berubah, re-evaluasi reminder');
        refresh();
    });

    refresh();
    tickTimer = setInterval(refresh, TICK_INTERVAL_MS);
}

export function cleanupNotificationsModule() {
    if (unsubActive) unsubActive();
    if (unsubInstruksi) unsubInstruksi();
    if (unsubModa) unsubModa();
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
    knownIds = new Set();
}