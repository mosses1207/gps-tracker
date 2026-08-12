import {
  stats, summarize, sortSummaries, fmtMinutes, fmtPct, fmtInt,
  escapeHtml, MIN_SAMPLE,
} from '../lib/aggregate.js';
import { renderTrend } from '../charts/trendChart.js';
import { destroyChart } from '../charts/chartBase.js';
import { emptyHtml } from '../lib/ribbon.js';

export function renderRingkasan(valid, all) {
  const st = stats(valid);

  document.getElementById('heroOntime').textContent = valid.length ? fmtPct(st.pctOntime) : '–';
  document.getElementById('heroMedian').textContent = fmtMinutes(st.median);
  document.getElementById('heroMean').textContent = fmtMinutes(st.mean);
  document.getElementById('heroP90').textContent = fmtMinutes(st.p90);

  const destCount = new Set(valid.map((r) => `${r.lokasi}||${r.dest}`)).size;
  document.getElementById('heroDest').textContent = fmtInt(destCount);

  const buang = all.length - valid.length;
  document.getElementById('heroBasis').textContent =
    `${fmtInt(valid.length)} trip dihitung dari ${fmtInt(all.length)}` +
    (buang > 0 ? ` · ${fmtInt(buang)} tidak memenuhi syarat` : '');

  renderRibbon(st);
  renderTrendPanel(valid);
  renderTopDelay(valid);
}

function renderRibbon(st) {
  const el = document.getElementById('heroRibbon');
  if (!st.n) { el.innerHTML = ''; return; }

  const segs = [
    { cls: 'bar-advance', pct: st.pctAdvance },
    { cls: 'bar-ontime', pct: st.pctOntime },
    { cls: 'bar-delay', pct: st.pctDelay },
  ];

  el.innerHTML = segs.map((s) => (
    s.pct <= 0 ? '' :
      `<span class="${s.cls}" style="width:${s.pct}%;background:var(--${s.cls.replace('bar-', '')})">${
        s.pct >= 7 ? `${s.pct.toFixed(0)}%` : ''
      }</span>`
  )).join('');
}

function renderTrendPanel(valid) {
  const days = summarize(valid, (r) => r.hari)
    .filter((d) => d.key)
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))
    .slice(-30);

  const wrap = document.querySelector('#chartTrend').parentElement;
  const note = wrap.nextElementSibling?.classList.contains('empty')
    ? wrap.nextElementSibling : null;

  if (days.length === 0) {
    // Canvas tidak boleh dihapus dari DOM: repaint berikutnya butuh elemennya.
    destroyChart('chartTrend');
    wrap.style.display = 'none';
    if (!note) wrap.insertAdjacentHTML('afterend', emptyHtml('Belum ada trip valid pada rentang ini.'));
    return;
  }

  wrap.style.display = '';
  if (note) note.remove();
  renderTrend(days);
}

function renderTopDelay(valid) {
  const el = document.getElementById('topDelay');

  const list = sortSummaries(
    summarize(valid, (r) => `${r.lokasi}||${r.dest}`, (r) => r.dest),
    'delay',
  ).filter((d) => d.stats.n >= MIN_SAMPLE && d.stats.pctDelay > 0).slice(0, 8);

  if (list.length === 0) {
    el.innerHTML = emptyHtml(`Tidak ada destinasi dengan minimal ${MIN_SAMPLE} trip yang mengalami delay.`);
    return;
  }

  el.innerHTML = list.map((d) => {
    const lokasi = d.rows[0]?.lokasi ?? '';
    return `
      <div class="mini-row">
        <div class="lbl">
          ${escapeHtml(d.label)}
          <small>dari ${escapeHtml(lokasi)} · ${d.stats.n} trip · median ${fmtMinutes(d.stats.median)}</small>
        </div>
        <div class="mini-bar" style="width:90px">
          <i style="width:${Math.min(100, d.stats.pctDelay)}%"></i>
        </div>
        <div class="num">${fmtPct(d.stats.pctDelay)} delay</div>
      </div>`;
  }).join('');
}
