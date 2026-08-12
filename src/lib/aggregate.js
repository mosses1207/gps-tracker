/* ===========================================================================
   Agregasi. Semua statistik dihitung dari baris trip yang sudah valid.

   Median dipakai sebagai angka utama, bukan rata-rata: satu truk yang
   tersangkut enam jam bisa menarik rata-rata satu destinasi naik puluhan
   menit padahal puluhan trip lain normal. Rata-rata dan P90 tetap disimpan
   dan ditampilkan berdampingan.
   =========================================================================== */

export const MIN_SAMPLE = 5;   // di bawah ini tidak ikut diperingkat

export function percentile(sortedAsc, p) {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

export function stats(rows) {
  const menit = rows
    .map((r) => Number(r.menit_aktual))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  const n = rows.length;
  const advance = rows.filter((r) => r.kategori === 'advance').length;
  const ontime = rows.filter((r) => r.kategori === 'ontime').length;
  const delay = rows.filter((r) => r.kategori === 'delay').length;

  const targets = rows
    .map((r) => Number(r.menit_target))
    .filter((v) => Number.isFinite(v));

  const rasio = rows
    .map((r) => Number(r.rasio_pct))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  return {
    n,
    advance, ontime, delay,
    pctAdvance: n ? (advance / n) * 100 : 0,
    pctOntime: n ? (ontime / n) * 100 : 0,
    pctDelay: n ? (delay / n) * 100 : 0,
    median: percentile(menit, 0.5),
    mean: menit.length ? menit.reduce((a, b) => a + b, 0) / menit.length : null,
    p90: percentile(menit, 0.9),
    target: targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : null,
    rasioP10: percentile(rasio, 0.1),
    rasioMedian: percentile(rasio, 0.5),
    rasioP90: percentile(rasio, 0.9),
  };
}

/** Kelompokkan baris berdasarkan satu kunci gabungan. */
export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let bucket = map.get(k);
    if (!bucket) { bucket = []; map.set(k, bucket); }
    bucket.push(r);
  }
  return map;
}

/** Daftar { key, label, rows, stats } terurut sesuai pilihan pengguna. */
export function summarize(rows, keyFn, labelFn) {
  const out = [];
  for (const [key, bucket] of groupBy(rows, keyFn)) {
    out.push({ key, label: labelFn ? labelFn(bucket[0]) : key, rows: bucket, stats: stats(bucket) });
  }
  return out;
}

export function sortSummaries(list, mode) {
  const arr = [...list];
  const rank = (s) => (s.stats.n >= MIN_SAMPLE ? 0 : 1);   // sampel tipis turun

  switch (mode) {
    case 'ontime':
      return arr.sort((a, b) => rank(a) - rank(b) || a.stats.pctOntime - b.stats.pctOntime);
    case 'median':
      return arr.sort((a, b) => rank(a) - rank(b) || (b.stats.median ?? 0) - (a.stats.median ?? 0));
    case 'trips':
      return arr.sort((a, b) => b.stats.n - a.stats.n);
    case 'nama':
      return arr.sort((a, b) => String(a.label).localeCompare(String(b.label), 'id'));
    case 'delay':
    default:
      return arr.sort((a, b) => rank(a) - rank(b) || b.stats.pctDelay - a.stats.pctDelay);
  }
}

/* ------------------------------------------------------------------ format */

export function fmtMinutes(v) {
  if (v == null || !Number.isFinite(v)) return '–';
  const m = Math.round(v);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}j` : `${h}j ${rest}m`;
}

export function fmtPct(v, digits = 0) {
  if (v == null || !Number.isFinite(v)) return '–';
  return `${v.toFixed(digits)}%`;
}

export function fmtInt(v) {
  if (v == null || !Number.isFinite(v)) return '–';
  return v.toLocaleString('id-ID');
}

export function fmtHour(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

export function fmtDateID(iso) {
  if (!iso) return '–';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Kelas pil untuk persentase tepat waktu. */
export function ontimeClass(pct) {
  if (pct >= 85) return 'pill-good';
  if (pct >= 65) return 'pill-warn';
  return 'pill-bad';
}
