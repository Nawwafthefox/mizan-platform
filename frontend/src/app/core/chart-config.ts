import { Chart } from 'chart.js';

// ── Crosshair plugin — vertical highlight line on hover ────────────────────
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
    ctx.strokeStyle = 'rgba(201,168,76,0.3)';
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
  // Register crosshair plugin once
  if (!_registered) {
    Chart.register(crosshairPlugin as any);
    _registered = true;
  }

  const isAr = lang === 'ar';

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
    backgroundColor: 'rgba(15,45,31,0.95)',
    titleColor: '#c9a84c',
    bodyColor: '#f0ede8',
    borderColor: 'rgba(201,168,76,0.4)',
    borderWidth: 1,
    padding: 12,
    cornerRadius: 8,
    titleFont: { size: 13, weight: 'bold' as any },
    bodyFont: { size: 12, weight: '500' as any },
    displayColors: true,
    boxWidth: 10,
    boxHeight: 10,
    boxPadding: 4,
    callbacks: {
      label(context: any) {
        const val = context.parsed?.y ?? context.parsed?.x ?? context.raw;
        if (typeof val === 'number') {
          const sarUnit = isAr ? 'ر.س' : 'SAR';
          const rateUnit = isAr ? 'ر.س/جم' : 'SAR/g';
          if (Math.abs(val) >= 1000) {
            return ` ${val.toLocaleString(isAr ? 'ar-SA' : 'en-US', { maximumFractionDigits: 0 })} ${sarUnit}`;
          }
          return ` ${val.toFixed(2)} ${rateUnit}`;
        }
        return ` ${String(val)}`;
      }
    } as any
  };

  // ── Interaction mode ──────────────────────────────────────────────────────
  (Chart.defaults as any).interaction = { mode: 'index', intersect: false };
  (Chart.defaults as any).hover = { mode: 'index', intersect: false };

  // ── Animations ───────────────────────────────────────────────────────────
  Chart.defaults.animation = { duration: 400, easing: 'easeInOutQuart' as const };

  // ── Bar dataset hover ─────────────────────────────────────────────────────
  Chart.defaults.datasets.bar = {
    ...Chart.defaults.datasets.bar,
    hoverBorderWidth: 2,
    hoverBorderColor: 'rgba(201,168,76,0.8)',
  };

  // ── Line dataset hover ────────────────────────────────────────────────────
  Chart.defaults.datasets.line = {
    ...Chart.defaults.datasets.line,
    hoverBorderWidth: 3,
    pointHoverRadius: 8,
    pointHoverBorderWidth: 2,
    pointHoverBackgroundColor: '#c9a84c',
    pointHoverBorderColor: 'rgba(201,168,76,0.3)',
  };
}
