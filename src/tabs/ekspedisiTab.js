import { summarize, sortSummaries } from '../lib/aggregate.js';
import { tableHead, rowHtml, emptyHtml } from '../lib/ribbon.js';

const MIN_VENDOR_TRIPS = 3;

export function renderEkspedisi(valid) {
  const el = document.getElementById('vendorTable');
  el.classList.add('lt-vendor');

  const vendors = sortSummaries(
    summarize(valid, (r) => r.vendor, (r) => r.vendor),
    'delay',
  ).filter((v) => v.stats.n >= MIN_VENDOR_TRIPS);

  if (vendors.length === 0) {
    el.innerHTML = emptyHtml(
      `Belum ada ekspedisi dengan minimal ${MIN_VENDOR_TRIPS} trip valid pada filter ini.`,
    );
    return;
  }

  const html = [tableHead({ nameLabel: 'Ekspedisi' })];
  for (const v of vendors) {
    const dests = new Set(v.rows.map((r) => r.dest)).size;
    html.push(rowHtml(v, { sub: `${dests} destinasi` }));
  }
  el.innerHTML = html.join('');
}
