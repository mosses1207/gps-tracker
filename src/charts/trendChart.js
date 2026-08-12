import { mountChart, COLORS, gridX, gridY } from './chartBase.js';
import { fmtDateID } from '../lib/aggregate.js';

/**
 * Batang = jumlah trip, garis = persentase tepat waktu. Dua skala sengaja
 * dipisah supaya hari dengan sedikit trip tidak terbaca setara dengan hari
 * sibuk hanya karena persentasenya kebetulan bagus.
 */
export function renderTrend(days) {
  const labels = days.map((d) => fmtDateID(d.key));

  return mountChart('chartTrend', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Trip',
          data: days.map((d) => d.stats.n),
          backgroundColor: '#dfe4e7',
          borderRadius: 2,
          yAxisID: 'y1',
          order: 2,
        },
        {
          type: 'line',
          label: 'Tepat waktu',
          data: days.map((d) => Number(d.stats.pctOntime.toFixed(1))),
          borderColor: COLORS.ontime,
          backgroundColor: COLORS.ontime,
          borderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          tension: 0.25,
          yAxisID: 'y',
          order: 1,
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: gridX,
        y: {
          ...gridY,
          position: 'left',
          min: 0,
          max: 100,
          ticks: { callback: (v) => `${v}%` },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { display: false },
          border: { display: false },
          ticks: { precision: 0 },
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => (ctx.dataset.yAxisID === 'y'
              ? ` Tepat waktu ${ctx.parsed.y}%`
              : ` ${ctx.parsed.y} trip`),
          },
        },
      },
    },
  });
}
