import { Chart } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// ── Compact number formatter — K / M / B ──────────────────────────────────
export function fmtCompact(value: number | null | undefined, decimals = 1): string {
  const n = value ?? 0;
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return (n / 1_000_000_000).toFixed(decimals) + 'B';
  if (a >= 1_000_000)     return (n / 1_000_000).toFixed(decimals) + 'M';
  if (a >= 1_000)         return (n / 1_000).toFixed(decimals) + 'K';
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}

// ── Reusable datalabels config for bar charts ──────────────────────────────
export function barDataLabels(opts?: {
  color?: string;
  anchor?: 'end' | 'center' | 'start';
  align?: 'top' | 'end' | 'center' | 'start' | 'bottom';
  fontSize?: number;
}) {
  return {
    display: true,
    color: opts?.color ?? 'rgba(240,237,232,0.75)',
    anchor: opts?.anchor ?? 'end',
    align: opts?.align ?? 'top',
    offset: 2,
    font: {
      size: opts?.fontSize ?? 10,
      weight: 'bold' as const,
      family: "'IBM Plex Sans Arabic', 'IBM Plex Sans', sans-serif",
    },
    formatter: (value: number) => fmtCompact(value, 1),
    clip: false,
  } as any;
}

// ── Reusable datalabels config for doughnut / pie charts ──────────────────
export function pieDataLabels() {
  return {
    display: true,
    color: 'rgba(240,237,232,0.85)',
    font: { size: 10, weight: 'bold' as const },
    formatter: (value: number, ctx: any) => {
      const total = (ctx.chart.data.datasets[0]?.data as number[]).reduce((a: number, b: number) => a + b, 0);
      if (!total) return '';
      const pct = ((value / total) * 100);
      return pct < 3 ? '' : pct.toFixed(1) + '%';
    },
  };
}

// ── Crosshair plugin — vertical gold dashed line on hover ─────────────────
const crosshairPlugin = {
  id: 'crosshair',
  afterDatasetsDraw(chart: Chart) {
    const active = chart.getActiveElements();
    if (!active.length) return;
    const ctx = chart.ctx;
    const x = active[0].element.x;
    const topY = chart.scales['y']?.top;
    const bottomY = chart.scales['y']?.bottom;
    if (topY == null || bottomY == null) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x, bottomY);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(201,168,76,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }
};

let _registered = false;

/**
 * configureCharts — set Chart.js global defaults.
 * Called from AppComponent via an effect so it re-runs on language change.
 */
export function configureCharts(lang: 'ar' | 'en'): void {
  if (!_registered) {
    Chart.register(crosshairPlugin as any, ChartDataLabels);
    _registered = true;
  }

  const isAr = lang === 'ar';
  const sarUnit = isAr ? 'ر.س' : 'SAR';

  Chart.defaults.color = 'rgba(240,237,232,0.7)';
  Chart.defaults.borderColor = 'rgba(42,58,42,0.5)';
  Chart.defaults.font.family = isAr
    ? "'IBM Plex Sans Arabic', sans-serif"
    : "'IBM Plex Sans', sans-serif";
  Chart.defaults.font.size = 12;
  (Chart.defaults.font as any).weight = '600';

  // ── Global tooltip ────────────────────────────────────────────────────────
  Chart.defaults.plugins.tooltip = {
    ...Chart.defaults.plugins.tooltip,
    enabled: true,
    backgroundColor: 'rgba(10,26,18,0.97)',
    titleColor: '#c9a84c',
    bodyColor: '#f0ede8',
    footerColor: 'rgba(240,237,232,0.45)',
    borderColor: 'rgba(201,168,76,0.38)',
    borderWidth: 1,
    padding: { x: 14, y: 10 } as any,
    cornerRadius: 10,
    titleFont: { size: 13, weight: 'bold' as any },
    bodyFont: { size: 12, weight: '500' as any },
    footerFont: { size: 10, weight: '400' as any },
    displayColors: true,
    boxWidth: 10,
    boxHeight: 10,
    boxPadding: 4,
    multiKeyBackground: 'rgba(10,26,18,0.97)',
    callbacks: {
      label(context: any) {
        const val = context.parsed?.y ?? context.parsed?.x ?? context.raw;
        const dsLabel = context.dataset.label ?? '';
        const prefix = dsLabel ? `  ${dsLabel}: ` : '  ';
        if (typeof val === 'number') {
          const full = val.toLocaleString(isAr ? 'ar-SA' : 'en-US', { maximumFractionDigits: 2 });
          return `${prefix}${full} ${sarUnit}`;
        }
        return `${prefix}${String(val)}`;
      }
    } as any
  };

  // ── datalabels — disabled globally; each chart opts in ───────────────────
  (Chart.defaults as any).plugins.datalabels = { display: false };

  // ── Interaction ───────────────────────────────────────────────────────────
  (Chart.defaults as any).interaction = { mode: 'index', intersect: false };
  (Chart.defaults as any).hover = { mode: 'index', intersect: false };

  // ── Animations ───────────────────────────────────────────────────────────
  Chart.defaults.animation = { duration: 600, easing: 'easeOutQuart' as const };

  // ── Bar dataset defaults ──────────────────────────────────────────────────
  (Chart.defaults.datasets as any).bar = {
    ...Chart.defaults.datasets.bar,
    hoverBorderWidth: 2,
    hoverBorderColor: 'rgba(201,168,76,0.8)',
    borderRadius: 4,
    borderSkipped: 'bottom',
    barPercentage: 0.72,
    categoryPercentage: 0.85,
  };

  // ── Line dataset defaults ─────────────────────────────────────────────────
  Chart.defaults.datasets.line = {
    ...Chart.defaults.datasets.line,
    hoverBorderWidth: 3,
    pointHoverRadius: 8,
    pointHoverBorderWidth: 2,
    pointHoverBackgroundColor: '#c9a84c',
    pointHoverBorderColor: 'rgba(201,168,76,0.3)',
  };
}
