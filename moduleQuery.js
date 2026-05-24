import { supabase, hasInternet } from './loginModule.js';
import { db } from './dbModule.js';
import { decryptData } from './aes.js';

let currentPage = 1;
const pageSize = 5;
let displayedLogs = [];
let currentChannel = null; // ← deklarasi yang hilang

// Helper biar tidak duplikasi logika ambil UID
function getUidFromSession() {
    const raw = localStorage.getItem('user_session');
    if (!raw) return null;
    try {
        return JSON.parse(raw)?.uid ?? null;
    } catch {
        return null;
    }
}

export async function queryfromsupabase() {
    const uid = getUidFromSession();
    if (!uid) {
        console.warn("UID tidak ditemukan, redirect...");
        location.reload();
        return;
    }

    try {
        const online = await hasInternet();
        if (!online) return;

        await syncPathHistoryToDexie(uid);
        await startTunnelListener(uid);
    } catch (err) {
        console.error("Inisialisasi Gagal:", err);
    }
}

async function syncPathHistoryToDexie(uid) {
    let query = supabase.from('path_history').select('*').eq('user_id', uid);

    const logsCount = await db.all_logs.count();
    if (logsCount > 0) {
        const latestLog = await db.all_logs.orderBy('created_at').last();
        if (latestLog?.created_at) {
            query = query.gt('created_at', latestLog.created_at);
        }
    }

    const { data, error } = await query;
    if (error) {
        console.error("Error fetching path_history:", error);
        return;
    }

    if (data?.length > 0) {
        await db.all_logs.bulkPut(data);
        console.log(`${data.length} data baru disinkronkan.`);
    }

    await rendertabel();
}

async function startTunnelListener(uid) {
    if (!uid || uid === "undefined") {
        console.warn("Tunnel Listener dibatalkan: UID kosong.");
        return;
    }

    // Tutup channel lama kalau ada
    if (currentChannel) {
        console.log("Menutup terowongan lama...");
        await supabase.removeChannel(currentChannel);
        currentChannel = null;
    }

    // Bersihkan data lama di Dexie (max 100 records)
    try {
        const count = await db.all_logs.count();
        if (count > 100) {
            const extraCount = count - 100;
            const oldIds = await db.all_logs.orderBy('created_at').limit(extraCount).primaryKeys();
            await db.all_logs.bulkDelete(oldIds);
        }
    } catch (err) {
        console.error("Gagal kelola data di Dexie:", err);
    }

    const handleChange = async (payload) => {
        console.log('Perubahan terdeteksi:', payload.eventType, payload.new);
        await db.all_logs.put({
            ...payload.new,
            saved_at: new Date().toISOString()
        });
        await rendertabel();
    };

    currentChannel = supabase
        .channel(`db-changes-${uid}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'path_history',
            filter: `user_id=eq.${uid}`
        }, handleChange)
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("Tunel tersambung dan siap menerima data!");
            }
        });
}

async function rendertabel() {
    const container = document.getElementById('log-container');
    const paginationEl = document.getElementById('pagination');
    if (!container) return;

    // Ambil semua data dari Dexie, urutkan terbaru dulu
    const allLogs = await db.all_logs.orderBy('created_at').reverse().toArray();
    displayedLogs = allLogs;

    const totalPages = Math.ceil(allLogs.length / pageSize);

    // Pastikan currentPage tidak melebihi total halaman
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    }

    const startIdx = (currentPage - 1) * pageSize;
    const pageLogs = allLogs.slice(startIdx, startIdx + pageSize);

    // Render cards
    container.innerHTML = pageLogs.length === 0
        ? `<p style="color: var(--color-text-secondary)">Belum ada data.</p>`
        : pageLogs.map(log => renderCard(log)).join('');

    // Render pagination
    if (paginationEl) {
        paginationEl.innerHTML = renderPagination(totalPages);
    }
}

function renderCard(log) {
    // 1. Decrypt data yang mau ditampilkan ke layar dashboard
    const sjkb = log.sjkb ? decryptData(log.sjkb) : '-';
    const driver = log.driver ? decryptData(log.driver) : '-';
    const nopol = log.nopol ? decryptData(log.nopol) : '-';
    const dest = log.dest ? decryptData(log.dest) : '-';
    const vendor = log.vendor ? decryptData(log.vendor) : '-';
    const departDecrypted = log.depart_at ? decryptData(log.depart_at) : null;

    // 2. Ubah ke Format Indonesia (Contoh: 05 Agu 2026 12:00 WIB)
    let formattedDate = '-';

    if (departDecrypted) {
        const dateObj = new Date(departDecrypted);

        // Pastikan konversi ke date object berhasil (valid date)
        if (!isNaN(dateObj.getTime())) {
            formattedDate = dateObj.toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short', // Mengasilkan 'Agu' (Singkatan Indonesia)
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false // Memastikan format 24 jam
            }) + ' WIB'; // Tambahkan string 'WIB' di ujungnya
        }
    }

    // 2. Mainkan struktur HTML card-nya di sini
    return `
        <div class="log-card" data-id="${log.idseason}">
            
        <div class="log-card__header">
                <span class="log-card__sjkb">${escapeHtml(sjkb)}</span>
            </div>

            <div class="log-card__body">
                <p><strong>Status</strong> : ${escapeHtml(log.status ?? 'PENDING')}</p>
                <p><strong>Driver</strong> : ${escapeHtml(driver)} - (${escapeHtml(nopol)})</p>
                <p><strong>Vendor</strong> : ${escapeHtml(vendor)}</p>
                <p><strong>Tujuan</strong> : ${escapeHtml(dest)}</p>
                <p><strong>Dibuat</strong> : ${escapeHtml(formattedDate)}</p>
            </div>

            <div class="log-card__meta">
                <span>${escapeHtml(log.idseason)}</span>
            </div>
        </div>
    `;
}

function renderPagination(totalPages) {
    if (totalPages <= 1) return '';

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `<button 
            class="page-btn ${i === currentPage ? 'page-btn--active' : ''}" 
            onclick="goToPage(${i})"
        >${i}</button>`;
    }
    return html;
}

// Fungsi ini dipanggil dari HTML lewat onclick pagination
window.goToPage = async (page) => {
    currentPage = page;
    await rendertabel();
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}