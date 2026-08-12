import { mountChart, COLORS, gridX, gridY } from './chartBase.js';
import { fmtHour } from '../lib/aggregate.js';

/**
 * Median menit per jam berangkat, dibubuhi warna kategori. Jam dengan sampel
 * tipis dibuat pudar supaya tidak terbaca sepenting jam yang ramai.
 */
export function renderJam(hours) {
  const labels = hours.map((h) => fmtHour(h.hour));

  const colorFor = (h) => {
    if (h.stats.n === 0) return '#e6eaec';
    const base = h.stats.rasioMedian == null ? COLORS.ink3
      : h.stats.rasioMedian < 70 ? COLORS.advance
      : h.stats.rasioMedian <= 100 ? COLORS.ontime
      : COLORS.delay;
    return h.stats.n < 5 ? `${base}55` : base;
  };

  return mountChart('chartJam', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Median menit',
        data: hours.map((h) => (h.stats.median == null ? null : Math.round(h.stats.median))),
        backgroundColor: hours.map(colorFor),
        borderRadius: 2,
      }],
    },
    options: {
      scales: {
        x: { ...gridX, ticks: { autoSkip: false, maxRotation: 0, font: { size: 10 } } },
        y: { ...gridY, beginAtZero: true, ticks: { callback: (v) => `${v}m` } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const h = hours[ctx.dataIndex];
              return [
                ` Median ${ctx.parsed.y ?? '–'} menit`,
                ` ${h.stats.n} trip · tepat waktu ${h.stats.pctOntime.toFixed(0)}%`,
              ];
            },
          },
        },
      },
    },
  });
}
