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

const WARNA = {
  advance: '#2e6f8e',
  ontime: '#3f7d52',
  delay: '#b23b2e',
};

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
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; Kontributor OpenStreetMap',
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

  const semua = [];

  for (const r of rows) {
    const pts = decodePolyline(r.coords);
    if (pts.length < 2) continue;
    semua.push(...pts);

    L.polyline(pts, {
      color: WARNA[r.kategori] ?? '#47576a',
      weight: 3,
      opacity: 0.32,
      lineJoin: 'round',
    }).addTo(layerJalur).bindPopup(
      `<b>${escapeHtml(r.driver ?? '-')}</b><br>${escapeHtml(r.vendor ?? '-')}<br>` +
      `${fmtDateID(r.hari)} &middot; ${fmtMinutes(Number(r.menit_aktual))} ` +
      `(${Math.round(Number(r.rasio_pct))}% target)`,
    );
  }

  const first = rows[0];
  if (first?.lat_tujuan != null && first?.lng_tujuan != null) {
    const tujuan = [first.lat_tujuan, first.lng_tujuan];
    semua.push(tujuan);
    // Lingkaran 500 m: ambang yang dipakai menentukan jam sampai.
    L.circle(tujuan, { radius: 500, color: '#c8860d', weight: 1, fillOpacity: 0.08 })
      .addTo(layerTitik);
    L.circleMarker(tujuan, { radius: 6, color: '#c8860d', fillColor: '#c8860d', fillOpacity: 1 })
      .addTo(layerTitik).bindPopup('Titik tujuan');
  }

  if (first?.lat_start != null && first?.lng_start != null) {
    const asal = [first.lat_start, first.lng_start];
    semua.push(asal);
    L.circleMarker(asal, { radius: 6, color: '#16202b', fillColor: '#fff', fillOpacity: 1, weight: 2 })
      .addTo(layerTitik).bindPopup(escapeHtml(first.lokasi ?? 'Titik berangkat'));
  }

  if (semua.length > 0) {
    map.fitBounds(L.latLngBounds(semua), { padding: [24, 24] });
  }
  setTimeout(() => map.invalidateSize(), 60);
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
