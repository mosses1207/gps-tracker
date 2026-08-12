import { summarize, sortSummaries, escapeHtml } from '../lib/aggregate.js';
import { tableHead, rowHtml, emptyHtml } from '../lib/ribbon.js';

const SEP = '||';   // bukan \u0000: parser HTML mengganti byte nol di atribut
const expanded = new Set();   // kunci lokasi|dest yang sedang terbuka

let currentRows = [];
let sortMode = 'delay';

export function initDestinasi() {
  const sel = document.getElementById('sortDest');
  sel.addEventListener('change', () => {
    sortMode = sel.value;
    paint();
  });

  document.getElementById('destTable').addEventListener('click', (e) => {
    const row = e.target.closest('.lt-row.clickable');
    if (!row) return;
    const key = row.dataset.key;
    if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
    paint();
  });
}

export function renderDestinasi(valid) {
  currentRows = valid;
  paint();
}

function paint() {
  const el = document.getElementById('destTable');

  if (currentRows.length === 0) {
    el.innerHTML = emptyHtml('Tidak ada trip valid pada filter ini.');
    return;
  }

  const dests = sortSummaries(
    summarize(currentRows, (r) => `${r.lokasi}${SEP}${r.dest}`, (r) => r.dest),
    sortMode,
  );

  const html = [tableHead({ nameLabel: 'Destinasi' })];

  for (const d of dests) {
    const open = expanded.has(d.key);
    const lokasi = d.rows[0]?.lokasi ?? '';

    html.push(rowHtml(d, {
      level: 0,
      expandable: true,
      expanded: open,
      sub: `dari ${lokasi}`,
    }));

    if (!open) continue;

    // Tingkat 2: moda
    const modas = sortSummaries(
      summarize(d.rows, (r) => `${d.key}${SEP}${r.moda}`, (r) => r.moda),
      sortMode,
    );

    for (const m of modas) {
      html.push(rowHtml(m, { level: 1 }));

      // Tingkat 3: ekspedisi di dalam moda
      const vendors = sortSummaries(
        summarize(m.rows, (r) => `${m.key}${SEP}${r.vendor}`, (r) => r.vendor),
        sortMode,
      );
      for (const v of vendors) {
        html.push(rowHtml(v, { level: 2 }));
      }
    }
  }

  el.innerHTML = html.join('');
}

export function resetDestinasiState() {
  expanded.clear();
}
