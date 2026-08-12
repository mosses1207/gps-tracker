import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase.js';
import {
  fmtMinutes, fmtPct, fmtInt, fmtDateID, escapeHtml, stats,
} from '../lib/aggregate.js';
import { emptyHtml } from '../lib/ribbon.js';

/* ===========================================================================
   Tab Rute.

   Jalur setiap trip digambar bertumpuk dengan garis tipis dan transparan.
   Ruas jalan yang dilewati banyak trip jadi menggelap dengan sendirinya —
   itulah "jalur yang biasa dipakai", tanpa perlu merata-ratakan koordinat.
   Merata-ratakan garis justru berbahaya: dua rute berbeda yang sama-sama
   sah akan menghasilkan garis rata-rata yang melintas di tempat yang tidak
   pernah dilewati siapa pun.
   =========================================================================== */

/* Warna di peta sengaja lebih pekat daripada warna tabel. Di tabel, warna
   duduk di atas kertas putih polos; di peta ia harus menang melawan jalan,
   sungai, dan label kota. Nada yang enak dilihat di tabel jadi lembek di sini. */
const WARNA = {
  advance: '#0b5cd5',
  ontime: '#0f7a2e',
  delay: '#d4143c',
};

/* Tiap jalur digambar dua lapis: garis putih lebar di bawah, garis berwarna
   di atasnya. Teknik lama pembuat peta — tanpa lapisan putih ini, garis apa
   pun akan lebur begitu melintas di atas jalan tol yang warnanya mirip. */
const TEBAL = {
  normal: { casing: 7, garis: 4, opasitas: 0.8 },
  tebal: { casing: 11, garis: 7, opasitas: 0.9 },
};

let modeTebal = 'normal';
const kategoriAktif = new Set(['advance', 'ontime', 'delay']);

let map = null;
let layerJalur = null;
let layerTitik = null;
let destOptions = [];
let lastRows = [];

/** Port persis dari decodePolyline() di src/lib/format.js versi lama. */
function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    const la = lat / 1e5, ln = lng / 1e5;
    if (la >= -11 && la <= 6 && ln >= 95 && ln <= 141) points.push([la, ln]);
  }
  return points;
}

/* ------------------------------------------------------------------- peta */

function ensureMap() {
  if (map) return map;

  map = L.map('ruteMap', { scrollWheelZoom: false });
  // Basemap terang dan minim warna. Ini perbaikan keterbacaan yang paling
  // besar: ubin OpenStreetMap standar penuh warna sendiri, sehingga garis
  // rute harus bersaing dengan latar belakangnya.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; Kontributor OpenStreetMap &copy; CARTO',
  }).addTo(map);
  map.setView([-6.25, 106.9], 9);

  // Scroll halaman tidak ikut tertahan peta; zoom aktif setelah peta diklik.
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());

  layerJalur = L.layerGroup().addTo(map);
  layerTitik = L.layerGroup().addTo(map);
  return map;
}

function drawRoutes(rows) {
  ensureMap();
  layerJalur.clearLayers();
  layerTitik.clearLayers();

  const ukuran = TEBAL[modeTebal];
  const semua = [];

  for (const r of rows) {
    const pts = decodePolyline(r.coords);
    if (pts.length < 2) continue;
    semua.push(...pts);
    if (!kategoriAktif.has(r.kategori)) continue;

    const warna = WARNA[r.kategori] ?? '#47576a';

    L.polyline(pts, {
      color: '#ffffff',
      weight: ukuran.casing,
      opacity: 0.9,
      lineJoin: 'round',
      interactive: false,
    }).addTo(layerJalur);

    const garis = L.polyline(pts, {
      color: warna,
      weight: ukuran.garis,
      opacity: ukuran.opasitas,
      lineJoin: 'round',
    }).addTo(layerJalur);

    garis.bindPopup(
      `<b>${escapeHtml(r.driver ?? '-')}</b><br>${escapeHtml(r.vendor ?? '-')}<br>` +
      `${fmtDateID(r.hari)} &middot; ${fmtMinutes(Number(r.menit_aktual))} ` +
      `(${Math.round(Number(r.rasio_pct))}% target)`,
    );

    // Satu jalur bisa ditelusuri dari tumpukan: yang disentuh naik ke depan
    // dan menebal, sisanya tetap di tempatnya.
    garis.on('mouseover', () => {
      garis.setStyle({ weight: ukuran.garis + 4, opacity: 1 });
      garis.bringToFront();
    });
    garis.on('mouseout', () => {
      garis.setStyle({ weight: ukuran.garis, opacity: ukuran.opasitas });
    });
  }

  const first = rows[0];
  if (first?.lat_tujuan != null && first?.lng_tujuan != null) {
    const tujuan = [first.lat_tujuan, first.lng_tujuan];
    semua.push(tujuan);
    L.circle(tujuan, { radius: 500, color: '#b06a00', weight: 2, dashArray: '5,4', fillOpacity: 0.06 })
      .addTo(layerTitik);
    L.circleMarker(tujuan, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#b06a00', fillOpacity: 1 })
      .addTo(layerTitik).bindPopup('Titik tujuan');
  }

  if (first?.lat_start != null && first?.lng_start != null) {
    const asal = [first.lat_start, first.lng_start];
    semua.push(asal);
    L.circleMarker(asal, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#16202b', fillOpacity: 1 })
      .addTo(layerTitik).bindPopup(escapeHtml(first.lokasi ?? 'Titik berangkat'));
  }

  if (semua.length > 0) {
    map.fitBounds(L.latLngBounds(semua), { padding: [24, 24] });
  }
  setTimeout(() => map.invalidateSize(), 60);
}

/** Gambar ulang tanpa mengambil data lagi — dipakai saat tebal garis atau
 *  saringan kategori diubah. */
function ulangGambar() {
  if (lastRows.length > 0) drawRoutes(lastRows);
}

/* ------------------------------------------------------------------ daftar */

function renderDaftar(rows) {
  const el = document.getElementById('ruteDaftar');

  if (rows.length === 0) {
    el.innerHTML = emptyHtml('Tidak ada trip valid dengan rekaman jalur untuk destinasi ini.');
    return;
  }

  el.innerHTML = `
    <div class="lt-head">
      <div>Trip</div>
      <div class="num-head">Aktual</div>
      <div class="num-head hide-xs">Target</div>
      <div class="num-head hide-sm">Titik GPS</div>
      <div class="num-head">Rasio</div>
    </div>` + rows.map((r) => {
    const kelas = r.kategori === 'delay' ? 'pill-bad'
      : r.kategori === 'ontime' ? 'pill-good' : 'pill-warn';
    return `
      <div class="lt-row" data-trip="${r.trip_id}">
        <div class="lt-name">${escapeHtml(r.driver ?? '-')}
          <small>${escapeHtml(r.vendor ?? '-')} &middot; ${escapeHtml(r.moda ?? '-')} &middot; ${fmtDateID(r.hari)}</small>
        </div>
        <div class="num">${fmtMinutes(Number(r.menit_aktual))}</div>
        <div class="num num-dim hide-xs">${fmtMinutes(Number(r.menit_target))}</div>
        <div class="num num-dim hide-sm">${fmtInt(r.gps_points)}</div>
        <div class="pill ${kelas}">${Math.round(Number(r.rasio_pct))}%</div>
      </div>`;
  }).join('');
}

function renderRingkas(rows) {
  const el = document.getElementById('ruteRingkas');
  if (rows.length === 0) { el.innerHTML = ''; return; }

  const st = stats(rows.map((r) => ({
    menit_aktual: Number(r.menit_aktual),
    menit_target: Number(r.menit_target),
    rasio_pct: Number(r.rasio_pct),
    kategori: r.kategori,
  })));

  const driver = new Set(rows.map((r) => r.driver)).size;
  const vendor = new Set(rows.map((r) => r.vendor)).size;

  el.innerHTML = `
    <dl class="hero-stats">
      <div><dt>Trip</dt><dd>${fmtInt(rows.length)}</dd></div>
      <div><dt>Median</dt><dd>${fmtMinutes(st.median)}</dd></div>
      <div><dt>Tercepat</dt><dd>${fmtMinutes(Math.min(...rows.map((r) => Number(r.menit_aktual))))}</dd></div>
      <div><dt>Terlama</dt><dd>${fmtMinutes(Math.max(...rows.map((r) => Number(r.menit_aktual))))}</dd></div>
      <div><dt>Target</dt><dd>${fmtMinutes(st.target)}</dd></div>
      <div><dt>Tepat waktu</dt><dd>${fmtPct(st.pctOntime)}</dd></div>
      <div><dt>Sopir</dt><dd>${fmtInt(driver)}</dd></div>
      <div><dt>Ekspedisi</dt><dd>${fmtInt(vendor)}</dd></div>
    </dl>`;
}

/* ------------------------------------------------------------------ ambil */

/**
 * Cocokkan apa yang diketik ke nama destinasi yang benar-benar ada.
 * Mengetik persis sama dengan isi database itu menyiksa — nama seperti
 * "AUTO2000 GRAND DEPOK CITY" gampang salah satu huruf. Jadi: cocok persis
 * menang, kalau tidak ada dicari yang mengandung teks tersebut, dan kalau
 * kandidatnya lebih dari satu namanya ditawarkan, bukan ditebak.
 */
function resolveDest(input) {
  const q = input.trim().toLowerCase();
  if (!q) return { error: 'Ketik nama destinasi lebih dulu.' };

  const exact = destOptions.find((d) => d.toLowerCase() === q);
  if (exact) return { dest: exact };

  const cocok = destOptions.filter((d) => d.toLowerCase().includes(q));
  if (cocok.length === 1) return { dest: cocok[0] };
  if (cocok.length === 0) {
    return { error: `Tidak ada destinasi yang cocok dengan "${input.trim()}".` };
  }
  return {
    error: `${cocok.length} destinasi cocok: ${cocok.slice(0, 6).join(' · ')}` +
           (cocok.length > 6 ? ' …' : '') + '. Ketik lebih spesifik.',
  };
}

async function cari() {
  const status = document.getElementById('ruteStatus');
  const { dest, error: salah } = resolveDest(document.getElementById('ruteDest').value);

  if (salah) { status.textContent = salah; return; }

  // Nama yang benar dikembalikan ke kotak isian, supaya jelas mana yang dipakai.
  document.getElementById('ruteDest').value = dest;

  const jumlah = Number(document.getElementById('ruteJumlah').value) || 10;
  const lokasi = document.getElementById('filterLokasi').value || null;

  status.textContent = 'Mengambil jalur…';

  const { data, error } = await supabase.rpc('route_paths', {
    p_dest: dest,
    p_lokasi: lokasi,
    p_limit: jumlah,
  });

  if (error) {
    status.textContent =
      `Jalur tidak bisa diambil: ${error.message}. ` +
      `Kalau pesannya menyebut route_paths, fungsi RPC-nya belum dipasang di Supabase.`;
    return;
  }

  lastRows = data ?? [];
  status.textContent = lastRows.length
    ? `${lastRows.length} trip terakhir ke ${dest}` + (lokasi ? ` dari ${lokasi}` : '')
    : `Tidak ada trip valid ke ${dest}` + (lokasi ? ` dari ${lokasi}.` : '.');

  renderRingkas(lastRows);
  drawRoutes(lastRows);
  renderDaftar(lastRows);
}

/* ------------------------------------------------------------------ setup */

export function initRute() {
  document.getElementById('btnRuteCari').addEventListener('click', cari);

  document.getElementById('ruteTebal').addEventListener('change', (e) => {
    modeTebal = e.target.value;
    ulangGambar();
  });

  // Legenda merangkap saringan. Menyembunyikan kategori lain adalah cara
  // paling ampuh membaca tumpukan jalur: sisakan yang delay saja, lalu
  // bandingkan dengan yang ontime saja.
  document.querySelectorAll('[data-kategori]').forEach((el) => {
    el.addEventListener('click', () => {
      const k = el.dataset.kategori;
      if (kategoriAktif.has(k)) kategoriAktif.delete(k); else kategoriAktif.add(k);
      if (kategoriAktif.size === 0) kategoriAktif.add(k);   // jangan sampai kosong
      document.querySelectorAll('[data-kategori]').forEach((b) => {
        b.classList.toggle('mati', !kategoriAktif.has(b.dataset.kategori));
      });
      ulangGambar();
    });
  });
  document.getElementById('ruteDest').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); cari(); }
  });
}

/**
 * Daftar destinasi untuk pelengkapan otomatis diambil sekali dari seluruh
 * riwayat, BUKAN dari baris yang sedang lolos filter tanggal di topbar.
 * Tab ini memang untuk menengok jalur ke satu tujuan, kapan pun trip itu
 * terjadi — membatasinya ke bulan berjalan justru menghalangi.
 */
async function muatDaftarDest() {
  if (destOptions.length > 0) return;

  const { data, error } = await supabase.rpc('route_dest_options', { p_lokasi: null });
  if (error || !data) return;

  destOptions = [...new Set(data.map((d) => d.dest))]
    .sort((a, b) => a.localeCompare(b, 'id'));

  document.getElementById('ruteDestList').innerHTML =
    destOptions.map((d) => `<option value="${escapeHtml(d)}"></option>`).join('');
}

export async function renderRute() {
  ensureMap();
  await muatDaftarDest();
  setTimeout(() => map.invalidateSize(), 60);
}
