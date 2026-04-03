import {
  Component, OnDestroy,
  inject, signal, effect, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Chart, ChartConfiguration, BarController, BarElement,
  CategoryScale, LinearScale, Tooltip, Legend
} from 'chart.js';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

type HeatmapSort = 'total' | 'diffRate' | 'k18' | 'k21' | 'k22' | 'k24';

@Component({
  selector: 'app-v3-heatmap',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; }

    .page-header { margin-bottom: 1.5rem; }
    .page-title { font-size: 1.4rem; font-weight: 700; color: var(--mizan-gold); margin: 0 0 0.25rem 0; }
    .page-subtitle { font-size: 0.85rem; color: var(--mizan-text-muted); }

    .sort-bar {
      display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center;
    }
    .sort-label { font-size: 0.8rem; color: var(--mizan-text-muted); margin-left: 0.25rem; }
    .sort-btn {
      padding: 0.3rem 0.85rem;
      border-radius: 20px;
      border: 1px solid var(--mizan-border);
      background: var(--mizan-surface);
      color: var(--mizan-text-muted);
      font-size: 0.78rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .sort-btn:hover, .sort-btn.active {
      border-color: var(--mizan-gold);
      color: var(--mizan-gold);
      background: rgba(201,168,76,0.08);
    }

    .section-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      margin-bottom: 1.5rem;
      overflow: hidden;
    }
    .section-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--mizan-border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .section-title { font-size: 1rem; font-weight: 600; color: var(--mizan-text); margin: 0; }
    .row-count {
      font-size: 0.78rem; color: var(--mizan-text-muted);
      background: rgba(255,255,255,0.05); padding: 0.15rem 0.55rem; border-radius: 10px;
    }

    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    thead th {
      padding: 0.7rem 0.9rem;
      text-align: right;
      color: var(--mizan-text-muted);
      font-weight: 600; font-size: 0.75rem;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--mizan-border);
      white-space: nowrap;
    }
    th.branch-col {
      position: sticky; right: 0; z-index: 2;
      background: var(--mizan-surface);
      border-left: 1px solid var(--mizan-border);
    }
    td {
      padding: 0.6rem 0.9rem;
      text-align: right;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      white-space: nowrap;
    }
    td.branch-col {
      position: sticky; right: 0; z-index: 1;
      background: var(--mizan-surface);
      border-left: 1px solid var(--mizan-border);
      font-weight: 600; color: var(--mizan-text);
    }
    tbody tr:hover td { filter: brightness(1.1); }
    tbody tr:last-child td { border-bottom: none; }

    .cell-val {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      font-size: 0.8rem;
      color: var(--mizan-text);
    }
    .diff-val {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .chart-area { padding: 1.5rem; }
    .chart-container { position: relative; height: 300px; }

    .state-box { padding: 3rem; text-align: center; color: var(--mizan-text-muted); }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid rgba(201,168,76,0.2); border-top-color: var(--mizan-gold);
      border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-box {
      background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
      color: #ef4444; border-radius: 10px; padding: 1rem 1.5rem; margin-bottom: 1rem; font-size: 0.9rem;
    }
    .legend-row {
      display: flex; gap: 1.5rem; padding: 0.75rem 1.5rem;
      border-top: 1px solid var(--mizan-border); font-size: 0.78rem;
      color: var(--mizan-text-muted); flex-wrap: wrap;
    }
    .legend-item { display: flex; align-items: center; gap: 0.35rem; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; }
  `],
  template: `
    <div class="page-header">
      <h2 class="page-title">خريطة حرارة الفروع</h2>
      <p class="page-subtitle">مبيعات كل فرع حسب العيار مع معدل الفارق</p>
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="state-box"><div class="spinner"></div><div>جاري التحميل...</div></div>
    } @else if (rows().length > 0) {

      <div class="sort-bar">
        <span class="sort-label">ترتيب حسب:</span>
        @for (opt of sortOptions; track opt.value) {
          <button class="sort-btn" [class.active]="sortBy() === opt.value" (click)="setSort(opt.value)">
            {{ opt.label }}
          </button>
        }
      </div>

      <!-- Heatmap Table -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">الخريطة الحرارية</h3>
          <span class="row-count">{{ rows().length }} فرع</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="branch-col">الفرع</th>
                <th>18K (ر.س)</th>
                <th>21K (ر.س)</th>
                <th>22K (ر.س)</th>
                <th>24K (ر.س)</th>
                <th>الإجمالي (ر.س)</th>
                <th>فارق المعدل</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.branchCode) {
                <tr>
                  <td class="branch-col">{{ row.branchName }}</td>
                  <td>
                    <span class="cell-val" [style.background]="cellBg(row.k18Sar, maxSar())">
                      {{ fmtK(row.k18Sar) }}
                    </span>
                  </td>
                  <td>
                    <span class="cell-val" [style.background]="cellBg(row.k21Sar, maxSar())">
                      {{ fmtK(row.k21Sar) }}
                    </span>
                  </td>
                  <td>
                    <span class="cell-val" [style.background]="cellBg(row.k22Sar, maxSar())">
                      {{ fmtK(row.k22Sar) }}
                    </span>
                  </td>
                  <td>
                    <span class="cell-val" [style.background]="cellBg(row.k24Sar, maxSar())">
                      {{ fmtK(row.k24Sar) }}
                    </span>
                  </td>
                  <td>
                    <span class="cell-val" [style.background]="cellBg(totalOf(row), maxTotal())">
                      {{ fmtK(totalOf(row)) }}
                    </span>
                  </td>
                  <td>
                    <span class="diff-val" [style.color]="row.diffRate > 0 ? 'var(--mizan-green)' : 'var(--mizan-danger)'"
                          [style.background]="diffBg(row.diffRate)"
                          style="padding:0.2rem 0.5rem;border-radius:6px;">
                      {{ row.diffRate > 0 ? '+' : '' }}{{ (row.diffRate ?? 0).toFixed(1) }}
                    </span>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--mizan-text-muted)">لا توجد بيانات</td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="legend-row">
          <span class="legend-item">
            <span class="legend-dot" style="background:rgba(201,168,76,0.43)"></span>
            مبيعات مرتفعة
          </span>
          <span class="legend-item">
            <span class="legend-dot" style="background:rgba(201,168,76,0.08)"></span>
            مبيعات منخفضة
          </span>
          <span class="legend-item">
            <span class="legend-dot" style="background:rgba(34,197,94,0.35)"></span>
            فارق إيجابي
          </span>
          <span class="legend-item">
            <span class="legend-dot" style="background:rgba(239,68,68,0.35)"></span>
            فارق سلبي
          </span>
        </div>
      </div>

      <!-- Bar Chart: diff rate per branch -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">فارق المعدل حسب الفرع</h3>
        </div>
        <div class="chart-area">
          <div class="chart-container">
            <canvas #diffChart></canvas>
          </div>
        </div>
      </div>
    }
  `
})
export class V3HeatmapComponent implements OnDestroy {
  @ViewChild('diffChart') canvasRef!: ElementRef<HTMLCanvasElement>;

  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);
  private cdr       = inject(ChangeDetectorRef);

  loading = signal(true);
  error   = signal<string | null>(null);
  rows    = signal<any[]>([]);
  sortBy  = signal<HeatmapSort>('total');
  maxSar  = signal(0);
  maxTotal = signal(0);

  private chart: Chart | null = null;

  sortOptions = [
    { value: 'total'   as HeatmapSort, label: 'إجمالي المبيعات' },
    { value: 'diffRate'as HeatmapSort, label: 'فارق المعدل' },
    { value: 'k21'     as HeatmapSort, label: '21K' },
    { value: 'k18'     as HeatmapSort, label: '18K' },
    { value: 'k22'     as HeatmapSort, label: '22K' },
    { value: 'k24'     as HeatmapSort, label: '24K' },
  ];

  constructor() {
    effect(() => {
      const from = this.dateRange.from();
      const to   = this.dateRange.to();
      if (from && to) this.load(from, to);
    });
  }

  ngOnDestroy(): void {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
  }

  private load(from: string, to: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getHeatmap(from, to).subscribe({
      next: (data) => {
        this.applySort(data);
        this.loading.set(false);
        this.cdr.markForCheck();
        this.createChart(this.rows());
      },
      error: (e) => {
        this.error.set('تعذّر تحميل بيانات الفروع: ' + (e?.message ?? ''));
        this.loading.set(false);
      }
    });
  }

  setSort(s: HeatmapSort): void {
    this.sortBy.set(s);
    this.applySort(this.rows());
    this.createChart(this.rows());
  }

  private applySort(data: any[]): void {
    const s = this.sortBy();
    const sorted = [...data].sort((a, b) => {
      if (s === 'total')    return this.totalOf(b) - this.totalOf(a);
      if (s === 'diffRate') return (b.diffRate ?? 0) - (a.diffRate ?? 0);
      if (s === 'k18')      return (b.k18Sar ?? 0) - (a.k18Sar ?? 0);
      if (s === 'k21')      return (b.k21Sar ?? 0) - (a.k21Sar ?? 0);
      if (s === 'k22')      return (b.k22Sar ?? 0) - (a.k22Sar ?? 0);
      if (s === 'k24')      return (b.k24Sar ?? 0) - (a.k24Sar ?? 0);
      return 0;
    });
    const allKarats = sorted.flatMap(r => [r.k18Sar, r.k21Sar, r.k22Sar, r.k24Sar]).filter(Boolean);
    this.maxSar.set(Math.max(...allKarats, 0));
    this.maxTotal.set(Math.max(...sorted.map(r => this.totalOf(r)), 0));
    this.rows.set(sorted);
  }

  totalOf(row: any): number {
    return (row.k18Sar ?? 0) + (row.k21Sar ?? 0) + (row.k22Sar ?? 0) + (row.k24Sar ?? 0);
  }

  cellBg(val: number, max: number): string {
    const intensity = max > 0 ? val / max : 0;
    return `rgba(201, 168, 76, ${0.08 + intensity * 0.35})`;
  }

  diffBg(diff: number): string {
    return diff > 0
      ? `rgba(34,197,94,${Math.min(Math.abs(diff) / 30, 1) * 0.3 + 0.05})`
      : `rgba(239,68,68,${Math.min(Math.abs(diff) / 30, 1) * 0.3 + 0.05})`;
  }

  fmtK(n: number | null | undefined): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
    return String(n);
  }

  private createChart(data: any[]): void {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    setTimeout(() => {
      const canvas = this.canvasRef?.nativeElement;
      if (!canvas) return;
      const labels = data.map(r => r.branchName);
      const values = data.map(r => r.diffRate ?? 0);
      const colors = values.map(v =>
        v > 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)'
      );
      this.chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'فارق المعدل (ر/ج)',
            data: values,
            backgroundColor: colors,
            borderColor: colors.map(c => c.replace('0.75', '1')),
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${(ctx.parsed.y as number).toFixed(1)} ر/ج`
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 45 },
              grid:  { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
              ticks: { color: '#9ca3af' },
              grid:  { color: 'rgba(255,255,255,0.06)' }
            }
          }
        }
      } as ChartConfiguration);
    }, 0);
  }
}
