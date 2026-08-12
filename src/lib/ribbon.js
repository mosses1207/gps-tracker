import { fmtMinutes, fmtPct, fmtInt, escapeHtml, ontimeClass, MIN_SAMPLE } from './aggregate.js';

/* ===========================================================================
   Pita rasio — elemen penanda dashboard ini.

   Semua pita memakai skala tetap 0..200% dari target, jadi garis target
   berdiri di posisi horizontal yang identik pada setiap baris dan membentuk
   satu garis lurus menurun sepanjang tabel. Mata langsung menangkap
   destinasi mana yang massa tripnya menyeberang garis.

   Yang digambar adalah rentang P10..P90 dari rasio, bukan satu batang
   rata-rata: rentangnya menunjukkan seberapa konsisten rute itu, dan itu
   informasi yang hilang kalau hanya menampilkan satu angka.
   =========================================================================== */

const SCALE_MAX = 200;

const clampPct = (v) => Math.max(0, Math.min(100, v));
const toX = (rasio) => clampPct((rasio / SCALE_MAX) * 100);

export function ribbonHtml(st) {
  if (!st.n || st.rasioMedian == null) {
    return '<div class="bar"><span class="bar-target"></span></div>';
  }

  const lo = toX(st.rasioP10 ?? st.rasioMedian);
  const hi = toX(st.rasioP90 ?? st.rasioMedian);
  const mid = toX(st.rasioMedian);

  // Warna diambil dari kategori median — itu kondisi khas rute tersebut.
  const cls = st.rasioMedian < 70 ? 'bar-advance' : st.rasioMedian <= 100 ? 'bar-ontime' : 'bar-delay';

  const width = Math.max(hi - lo, 1.2);
  const title = `P10 ${Math.round(st.rasioP10 ?? 0)}% · median ${Math.round(st.rasioMedian)}% · P90 ${Math.round(st.rasioP90 ?? 0)}% dari target`;

  return `
    <div class="bar" title="${escapeHtml(title)}">
      <span class="bar-seg ${cls}" style="left:${lo}%;width:${width}%;opacity:.35"></span>
      <span class="bar-seg ${cls}" style="left:${Math.max(0, mid - 0.5)}%;width:1.6%"></span>
      <span class="bar-target"></span>
    </div>`;
}

export function tableHead({ nameLabel = 'Destinasi', ribbon = true } = {}) {
  return `
    <div class="lt-head">
      <div>${escapeHtml(nameLabel)}</div>
      <div class="num-head">Trip</div>
      <div class="num-head hide-xs">Median</div>
      <div class="num-head hide-sm">Target</div>
      ${ribbon ? '<div class="hide-xs">Sebaran terhadap target</div>' : ''}
      <div class="num-head">Ontime</div>
    </div>`;
}

export function rowHtml(item, { level = 0, expandable = false, expanded = false, sub = '', ribbon = true } = {}) {
  const st = item.stats;
  const thin = st.n < MIN_SAMPLE;
  const caret = expandable ? `<span class="caret">${expanded ? '▾' : '▸'}</span>` : '';
  const subLine = sub ? `<small>${escapeHtml(sub)}</small>` : '';

  return `
    <div class="lt-row lvl-${level}${expandable ? ' clickable' : ''}" data-key="${escapeHtml(item.key)}">
      <div class="lt-name">${caret}${escapeHtml(item.label)}${subLine}</div>
      <div class="num${thin ? ' num-dim' : ''}">${fmtInt(st.n)}</div>
      <div class="num hide-xs">${fmtMinutes(st.median)}</div>
      <div class="num num-dim hide-sm">${fmtMinutes(st.target)}</div>
      ${ribbon ? `<div class="hide-xs">${ribbonHtml(st)}</div>` : ''}
      <div class="pill ${ontimeClass(st.pctOntime)}">${fmtPct(st.pctOntime)}</div>
    </div>`;
}

export function emptyHtml(msg) {
  return `<div class="empty">${escapeHtml(msg)}</div>`;
}
