import {
  summarize, fmtPct, fmtInt, escapeHtml, ontimeClass,
} from '../lib/aggregate.js';
import { emptyHtml } from '../lib/ribbon.js';

/**
 * Alasan teknis diterjemahkan ke bahasa yang bisa ditindaklanjuti — nama
 * kolom database tidak memberi tahu siapa pun apa yang harus diperbaiki.
 */
const ALASAN = {
  path_hist_kosong: {
    judul: 'Rekaman GPS tidak terkirim',
    saran: 'Aplikasi ditutup paksa, atau trip diselesaikan admin secara manual.',
  },
  titik_terakhir_jauh: {
    judul: 'Berhenti jauh dari tujuan',
    saran: 'Kalau menumpuk di satu destinasi, periksa koordinat tujuannya di data master.',
  },
  gps_terlalu_sedikit: {
    judul: 'Titik GPS terlalu sedikit',
    saran: 'Rekaman terputus di tengah jalan; datanya tidak cukup untuk mengukur waktu.',
  },
  berangkat_sudah_di_tujuan: {
    judul: 'Berangkat dari titik tujuan',
    saran: 'Biasanya trip uji coba, atau asal dan tujuan memang satu lokasi.',
  },
  target_kosong: {
    judul: 'Target leadtime kosong',
    saran: 'Isi kolom leadtime pada data master rute.',
  },
  depart_at_kosong: {
    judul: 'Waktu berangkat tidak terbaca',
    saran: 'Payload keberangkatan tidak tersimpan utuh.',
  },
  koordinat_tujuan_invalid: {
    judul: 'Koordinat tujuan tidak valid',
    saran: 'Perbaiki lattujuan / langtujuan pada data master destinasi.',
  },
  waktu_tidak_wajar: {
    judul: 'Waktu sampai mendahului berangkat',
    saran: 'Jam pada perangkat kemungkinan tidak sinkron.',
  },
  titik_gps_tidak_terbaca: {
    judul: 'Titik GPS gagal dibaca',
    saran: 'Format rekaman tidak sesuai; kemungkinan file arsip belum didekripsi.',
  },
};

export function renderKualitas(all, valid) {
  renderAlasan(all);
  renderCakupan(all, valid);
}

function renderAlasan(all) {
  const el = document.getElementById('alasanList');
  const invalid = all.filter((r) => !r.is_valid);

  if (invalid.length === 0) {
    el.innerHTML = emptyHtml('Semua trip pada rentang ini terhitung. Tidak ada yang dibuang.');
    return;
  }

  const groups = summarize(invalid, (r) => r.alasan_invalid ?? 'tidak diketahui')
    .sort((a, b) => b.stats.n - a.stats.n);

  const max = groups[0].stats.n;

  el.innerHTML = groups.map((g) => {
    const meta = ALASAN[g.key] ?? { judul: g.key, saran: '' };
    const pct = (g.stats.n / all.length) * 100;
    return `
      <div class="mini-row">
        <div class="lbl">
          ${escapeHtml(meta.judul)}
          <small>${escapeHtml(meta.saran)}</small>
        </div>
        <div class="mini-bar" style="width:90px">
          <i style="width:${(g.stats.n / max) * 100}%"></i>
        </div>
        <div class="num">${fmtInt(g.stats.n)} · ${fmtPct(pct)}</div>
      </div>`;
  }).join('');
}

function renderCakupan(all, valid) {
  const el = document.getElementById('cakupanTable');

  const byDest = summarize(all, (r) => `${r.lokasi}||${r.dest}`, (r) => r.dest)
    .map((d) => {
      const ok = d.rows.filter((r) => r.is_valid).length;
      return { ...d, ok, pct: (ok / d.rows.length) * 100, lokasi: d.rows[0]?.lokasi ?? '' };
    })
    .filter((d) => d.rows.length >= 3)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 25);

  if (byDest.length === 0) {
    el.innerHTML = emptyHtml('Belum cukup data untuk menilai cakupan per destinasi.');
    return;
  }

  el.innerHTML = `
    <div class="lt-head">
      <div>Destinasi</div>
      <div class="num-head">Total</div>
      <div class="num-head hide-xs">Valid</div>
      <div class="num-head hide-sm">Dibuang</div>
      <div class="num-head">Cakupan</div>
    </div>` + byDest.map((d) => `
    <div class="lt-row">
      <div class="lt-name">${escapeHtml(d.label)}<small>dari ${escapeHtml(d.lokasi)}</small></div>
      <div class="num">${fmtInt(d.rows.length)}</div>
      <div class="num hide-xs">${fmtInt(d.ok)}</div>
      <div class="num num-dim hide-sm">${fmtInt(d.rows.length - d.ok)}</div>
      <div class="pill ${ontimeClass(d.pct)}">${fmtPct(d.pct)}</div>
    </div>`).join('');
}

/* --------------------------------------------------------------------- CSV */

const CSV_COLS = [
  'trip_id', 'sumber', 'lokasi', 'dest', 'moda', 'vendor', 'driver',
  'hari', 'jam_berangkat', 'menit_aktual', 'menit_target', 'rasio_pct',
  'kategori', 'menit_di_area', 'is_valid', 'alasan_invalid',
  'jarak_akhir_m', 'sumber_tiba', 'gps_points',
];

export function downloadCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const body = [
    CSV_COLS.join(','),
    ...rows.map((r) => CSV_COLS.map((c) => esc(r[c])).join(',')),
  ].join('\n');

  // BOM supaya Excel membaca UTF-8 dengan benar.
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ratetrip-leadtime-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
