import { summarize, stats, fmtMinutes, fmtPct, fmtInt, fmtHour, escapeHtml, ontimeClass } from '../lib/aggregate.js';
import { renderJam } from '../charts/jamChart.js';
import { emptyHtml } from '../lib/ribbon.js';

let currentRows = [];

export function initJam() {
  document.getElementById('jamDest').addEventListener('change', paint);
}

export function renderJamTab(valid) {
  currentRows = valid;

  // Isi pilihan destinasi berdasarkan data yang sedang tampil.
  const sel = document.getElementById('jamDest');
  const prev = sel.value;
  const names = [...new Set(valid.map((r) => r.dest))].sort((a, b) => a.localeCompare(b, 'id'));
  sel.innerHTML = '<option value="">Semua destinasi</option>' +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (names.includes(prev)) sel.value = prev;

  paint();
}

function paint() {
  const pick = document.getElementById('jamDest').value;
  const rows = pick ? currentRows.filter((r) => r.dest === pick) : currentRows;
  const tableEl = document.getElementById('jamTable');

  if (rows.length === 0) {
    tableEl.innerHTML = emptyHtml('Tidak ada trip valid untuk pilihan ini.');
    return;
  }

  // Selalu 24 jam penuh supaya jam kosong tetap terlihat sebagai jam kosong,
  // bukan hilang dari grafik.
  const byHour = summarize(rows, (r) => r.jam_berangkat);
  const hours = Array.from({ length: 24 }, (_, h) => {
    const found = byHour.find((b) => Number(b.key) === h);
    return { hour: h, rows: found?.rows ?? [], stats: found?.stats ?? stats([]) };
  });

  renderJam(hours);

  const filled = hours.filter((h) => h.stats.n > 0);
  tableEl.innerHTML = `
    <div class="lt-head">
      <div>Jam berangkat</div>
      <div class="num-head">Trip</div>
      <div class="num-head hide-xs">Median</div>
      <div class="num-head hide-sm">P90</div>
      <div class="num-head">Ontime</div>
    </div>` + filled.map((h) => `
    <div class="lt-row">
      <div class="lt-name">${fmtHour(h.hour)}</div>
      <div class="num">${fmtInt(h.stats.n)}</div>
      <div class="num hide-xs">${fmtMinutes(h.stats.median)}</div>
      <div class="num num-dim hide-sm">${fmtMinutes(h.stats.p90)}</div>
      <div class="pill ${ontimeClass(h.stats.pctOntime)}">${fmtPct(h.stats.pctOntime)}</div>
    </div>`).join('');
}
