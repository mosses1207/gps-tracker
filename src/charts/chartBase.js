import Chart from 'chart.js/auto';

export const COLORS = {
  ink: '#16202b',
  ink2: '#47576a',
  ink3: '#7b8b9c',
  rule: '#d5dadd',
  advance: '#2e6f8e',
  ontime: '#3f7d52',
  delay: '#b23b2e',
  target: '#c8860d',
};

Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = COLORS.ink2;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.boxHeight = 10;
Chart.defaults.plugins.legend.labels.usePointStyle = false;
Chart.defaults.maintainAspectRatio = false;

const registry = new Map();

/** Satu canvas satu chart: instance lama dibuang sebelum yang baru dibuat. */
export function mountChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return null;

  const prev = registry.get(canvasId);
  if (prev) prev.destroy();

  const chart = new Chart(el, config);
  registry.set(canvasId, chart);
  return chart;
}

export function destroyChart(canvasId) {
  const prev = registry.get(canvasId);
  if (prev) { prev.destroy(); registry.delete(canvasId); }
}

export const gridX = { grid: { display: false }, border: { color: COLORS.rule } };
export const gridY = {
  grid: { color: '#eef1f2' },
  border: { display: false },
  ticks: { padding: 6 },
};
