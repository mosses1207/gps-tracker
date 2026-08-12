import './style.css';
import { getCurrentUser, signOut, onAuthStateChange } from './lib/supabase.js';
import { fetchLeadtime, fetchDateBounds } from './lib/leadtimeService.js';
import { fmtInt } from './lib/aggregate.js';
import { renderRingkasan } from './tabs/ringkasanTab.js';
import { initDestinasi, renderDestinasi, resetDestinasiState } from './tabs/destinasiTab.js';
import { renderEkspedisi } from './tabs/ekspedisiTab.js';
import { initJam, renderJamTab } from './tabs/jamTab.js';
import { initRute, renderRute } from './tabs/ruteTab.js';
import { renderKualitas, downloadCsv } from './tabs/kualitasTab.js';

const state = {
  all: [],          // seluruh baris dalam rentang tanggal
  filtered: [],     // setelah filter lokasi
  valid: [],        // hanya yang is_valid
  tab: 'ringkasan',
  rendered: new Set(),
};

/* --------------------------------------------------------------------- tab */

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.panel').forEach((el) => { el.hidden = true; });
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  const panel = document.getElementById(`tab-${tab}`);
  if (panel) panel.hidden = false;

  // Tab berat baru digambar saat pertama dibuka.
  if (!state.rendered.has(tab)) {
    paintTab(tab);
    state.rendered.add(tab);
  }
}

function paintTab(tab) {
  switch (tab) {
    case 'ringkasan': renderRingkasan(state.valid, state.filtered); break;
    case 'destinasi': renderDestinasi(state.valid); break;
    case 'ekspedisi': renderEkspedisi(state.valid); break;
    case 'rute': renderRute(); break;
    case 'jam': renderJamTab(state.valid); break;
    case 'kualitas': renderKualitas(state.filtered, state.valid); break;
  }
}

function repaintAll() {
  state.rendered.clear();
  paintTab(state.tab);
  state.rendered.add(state.tab);
}

/* ----------------------------------------------------------------- filters */

/**
 * Rekaman GPS sebelum Agustus 2026 banyak yang putus di tengah jalan, jadi
 * sebagian besar trip periode itu tidak lolos syarat hitung. Angkanya tetap
 * boleh dilihat, tapi jangan sampai ada yang menyimpulkan sesuatu dari
 * rentang yang isinya tinggal seperempat — peringatannya muncul sendiri.
 */
const AMBANG_CAKUPAN = 60;   // persen trip valid

function renderPeringatan() {
  let el = document.getElementById('mutuNotice');
  const total = state.filtered.length;
  const pct = total ? (state.valid.length / total) * 100 : 100;

  if (total === 0 || pct >= AMBANG_CAKUPAN) {
    if (el) el.remove();
    return;
  }

  if (!el) {
    el = document.createElement('div');
    el.id = 'mutuNotice';
    el.className = 'notice';
    document.getElementById('main').prepend(el);
  }

  el.innerHTML =
    `<strong>Hanya ${pct.toFixed(0)}% trip pada rentang ini yang bisa dihitung.</strong> ` +
    `Rekaman GPS sebelum Agustus 2026 banyak yang berhenti di tengah perjalanan. ` +
    `Persempit rentang ke Agustus dan seterusnya, atau baca rinciannya di tab Kualitas data.`;
}

function applyLokasiFilter() {
  const lokasi = document.getElementById('filterLokasi').value;
  state.filtered = lokasi ? state.all.filter((r) => r.lokasi === lokasi) : state.all;
  state.valid = state.filtered.filter((r) => r.is_valid);

  document.getElementById('footStamp').textContent =
    `${fmtInt(state.valid.length)} trip dihitung dari ${fmtInt(state.filtered.length)} baris` +
    (lokasi ? ` · ${lokasi}` : '') +
    ` · diperbarui ${new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`;

  renderPeringatan();
  resetDestinasiState();
  repaintAll();
}

function fillLokasiOptions() {
  const sel = document.getElementById('filterLokasi');
  const prev = sel.value;
  const names = [...new Set(state.all.map((r) => r.lokasi).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id'));

  sel.innerHTML = '<option value="">Semua lokasi</option>' +
    names.map((n) => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');

  if (names.includes(prev)) sel.value = prev;
}

async function reload() {
  const from = document.getElementById('filterFrom').value || null;
  const to = document.getElementById('filterTo').value || null;

  setLoading(true);
  try {
    state.all = await fetchLeadtime({ from, to });
    fillLokasiOptions();
    // Panel harus terlihat DULU sebelum digambar: Chart.js mengukur canvas
    // saat dibuat, dan canvas di dalam elemen hidden berukuran nol.
    setLoading(false);
    applyLokasiFilter();
  } catch (err) {
    showFatal(err);
  }
}

/* ------------------------------------------------------------------ chrome */

function setLoading(on) {
  document.getElementById('loading').hidden = !on;
  document.querySelectorAll('.panel').forEach((el) => { el.hidden = true; });
  if (!on) {
    document.getElementById('fatal').hidden = true;
    const panel = document.getElementById(`tab-${state.tab}`);
    if (panel) panel.hidden = false;
  }
}

function showFatal(err) {
  console.error(err);
  document.getElementById('loading').hidden = true;
  const el = document.getElementById('fatal');
  el.hidden = false;
  el.textContent =
    `Data tidak bisa diambil: ${err.message}. Periksa koneksi, lalu muat ulang halaman. ` +
    `Kalau berulang, kemungkinan hak akses tabel trip_leadtime belum terbuka untuk akun ini.`;
}

function wireChrome() {
  document.querySelectorAll('.tab').forEach((el) => {
    el.addEventListener('click', () => showTab(el.dataset.tab));
  });

  document.getElementById('filterLokasi').addEventListener('change', applyLokasiFilter);
  document.getElementById('filterFrom').addEventListener('change', reload);
  document.getElementById('filterTo').addEventListener('change', reload);

  document.getElementById('btnReset').addEventListener('click', () => {
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    reload();
  });

  document.getElementById('btnPrint').addEventListener('click', () => window.print());

  document.getElementById('btnCsv').addEventListener('click', () => downloadCsv(state.filtered));

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await signOut();
    window.location.href = '/login.html';
  });

  initDestinasi();
  initJam();
  initRute();
}

/* -------------------------------------------------------------------- boot */

async function init() {
  const { user } = await getCurrentUser();
  if (!user) { window.location.href = '/login.html'; return; }

  wireChrome();

  // Nilai awal filter: bulan berjalan. Sengaja BUKAN "30 hari terakhir" —
  // rentang bergulir seperti itu selalu menyeret sebagian bulan sebelumnya,
  // dan data sebelum Agustus 2026 kualitas rekamannya jauh lebih buruk.
  try {
    const { max } = await fetchDateBounds();
    if (max) {
      document.getElementById('filterTo').value = max;
      document.getElementById('filterFrom').value = `${max.slice(0, 7)}-01`;
    }
  } catch {
    // Rentang gagal dibaca: biarkan kosong, reload() akan menarik semuanya.
  }

  await reload();
}

onAuthStateChange((session) => {
  if (!session) window.location.href = '/login.html';
});

init();
