import {
  Component,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  signal,
  effect,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';

Chart.register(...registerables);

const KARAT_KEYS  = ['k18', 'k21', 'k22', 'k24'] as const;
const KARAT_LABELS: Record<string, string> = {
  k18: 'عيار 18',
  k21: 'عيار 21',
  k22: 'عيار 22',
  k24: 'عيار 24',
};
const KARAT_COLORS: Record<string, string> = {
  k18: '#c9a84c',
  k21: '#f59e0b',
  k22: '#fb923c',
  k24: '#fbbf24',
};
const KARAT_BG: Record<string, string> = {
  k18: 'rgba(201,168,76,.75)',
  k21: 'rgba(245,158,11,.75)',
  k22: 'rgba(251,146,60,.75)',
  k24: 'rgba(251,191,36,.75)',
};

type KaratKey = typeof KARAT_KEYS[number];

interface KaratTotal {
  sar: number;
  wt: number;
  purchSar: number;
  purchWt: number;
  saleRate: number;
  purchRate: number;
  marginPerGram: number;
  pct: number;
}

@Component({
  selector: 'app-v3-karat',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="karat-root" dir="rtl">

      <!-- Error -->
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <!-- 4 Karat KPI Cards -->
      <div class="kpi-grid">
        @for (k of karatKeys; track k) {
          <div
            class="karat-card"
            [class.best-karat]="!loading() && bestKarat() === k"
          >
            @if (loading()) {
              <div class="skeleton sk-tag"></div>
              <div class="skeleton sk-big"></div>
              <div class="skeleton sk-line"></div>
              <div class="skeleton sk-line short"></div>
              <div class="skeleton sk-line"></div>
              <div class="skeleton sk-margin"></div>
            } @else {
              <div class="karat-tag" [style.color]="karatColor(k)" [style.border-color]="karatColor(k) + '55'">
                {{ karatLabel(k) }}
                @if (bestKarat() === k) {
                  <span class="best-badge">الأفضل</span>
                }
              </div>
              <div class="karat-sar" [style.color]="karatColor(k)">
                {{ fmt(totals()[k]?.sar ?? 0) }}
                <span class="sar-unit">ريال</span>
              </div>
              <div class="karat-row">
                <span class="k-label">الوزن</span>
                <span class="k-val">{{ fmt(totals()[k]?.wt ?? 0) }} غ</span>
              </div>
              <div class="karat-row">
                <span class="k-label">م. البيع</span>
                <span class="k-val">{{ fmtRate(totals()[k]?.saleRate ?? 0) }}</span>
              </div>
              <div class="karat-row">
                <span class="k-label">م. الشراء</span>
                <span class="k-val">{{ fmtRate(totals()[k]?.purchRate ?? 0) }}</span>
              </div>
              <div class="karat-row">
                <span class="k-label">المشتريات</span>
                <span class="k-val">{{ fmt(totals()[k]?.purchSar ?? 0) }} ريال</span>
              </div>
              <div class="karat-margin" [class.pos]="(totals()[k]?.marginPerGram ?? 0) > 0" [class.neg]="(totals()[k]?.marginPerGram ?? 0) < 0">
                هامش / غ: {{ fmtRate(totals()[k]?.marginPerGram ?? 0) }}
              </div>
              <div class="karat-pct">
                <div class="pct-bar-track">
                  <div class="pct-bar-fill" [style.width.%]="totals()[k]?.pct ?? 0" [style.background]="karatColor(k)"></div>
                </div>
                <span class="pct-label">{{ fmtRate(totals()[k]?.pct ?? 0) }}% من المبيعات</span>
              </div>
            }
          </div>
        }
      </div>

      <!-- Charts Row -->
      <div class="charts-row">
        <!-- Doughnut Chart -->
        <div class="chart-card doughnut-card">
          <div class="chart-title">توزيع المبيعات بالعيار</div>
          @if (loading()) {
            <div class="skeleton-block" style="height:280px"></div>
          } @else {
            <div class="doughnut-wrap">
              <canvas #doughnutCanvas></canvas>
            </div>
            <div class="doughnut-legend">
              @for (k of karatKeys; track k) {
                <div class="legend-item">
                  <span class="legend-dot" [style.background]="karatColor(k)"></span>
                  <span class="legend-label">{{ karatLabel(k) }}</span>
                  <span class="legend-pct">{{ fmtRate(totals()[k]?.pct ?? 0) }}%</span>
                </div>
              }
            </div>
          }
        </div>

        <!-- Branch Grouped Bar Chart -->
        <div class="chart-card bar-card">
          <div class="chart-title">توزيع الأعيار لكل فرع (أعلى 15)</div>
          @if (loading()) {
            <div class="skeleton-block" style="height:280px"></div>
          } @else {
            <div class="chart-wrap">
              <canvas #branchKaratCanvas></canvas>
            </div>
          }
        </div>
      </div>

      <!-- By-Branch Table -->
      <div class="table-card">
        <div class="table-title">تفصيل الأعيار لكل فرع</div>
        @if (loading()) {
          <div class="skeleton-block" style="height:300px"></div>
        } @else {
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الفرع</th>
                  <th>المنطقة</th>
                  <th>18K (ريال)</th>
                  <th>18K (غ)</th>
                  <th>21K (ريال)</th>
                  <th>21K (غ)</th>
                  <th>22K (ريال)</th>
                  <th>22K (غ)</th>
                  <th>24K (ريال)</th>
                  <th>24K (غ)</th>
                </tr>
              </thead>
              <tbody>
                @for (b of byBranch(); track b.branchCode; let i = $index) {
                  <tr class="data-row">
                    <td class="idx">{{ i + 1 }}</td>
                    <td class="branch-name">{{ b.branchName }}</td>
                    <td>{{ b.region }}</td>
                    <td class="num k18">{{ fmt(b.k18Sar ?? 0) }}</td>
                    <td class="num">{{ fmt(b.k18Wt ?? 0) }}</td>
                    <td class="num k21">{{ fmt(b.k21Sar ?? 0) }}</td>
                    <td class="num">{{ fmt(b.k21Wt ?? 0) }}</td>
                    <td class="num k22">{{ fmt(b.k22Sar ?? 0) }}</td>
                    <td class="num">{{ fmt(b.k22Wt ?? 0) }}</td>
                    <td class="num k24">{{ fmt(b.k24Sar ?? 0) }}</td>
                    <td class="num">{{ fmt(b.k24Wt ?? 0) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    .karat-root {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      color: var(--mizan-text);
    }

    .error-banner {
      background: rgba(239,68,68,.12);
      border: 1px solid rgba(239,68,68,.4);
      color: #ef4444;
      border-radius: 8px;
      padding: .75rem 1rem;
      font-size: .9rem;
    }

    /* KPI Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }
    @media (max-width: 900px)  { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 500px)  { .kpi-grid { grid-template-columns: 1fr; } }

    .karat-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1.1rem 1.2rem;
      display: flex;
      flex-direction: column;
      gap: .45rem;
      transition: border-color .2s ease, box-shadow .2s ease;
    }
    .karat-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.25); }
    .karat-card.best-karat {
      border-color: var(--mizan-gold);
      box-shadow: 0 0 0 1px rgba(201,168,76,.35), 0 4px 20px rgba(201,168,76,.12);
    }

    .karat-tag {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      font-size: .78rem;
      font-weight: 700;
      border: 1px solid;
      border-radius: 20px;
      padding: .2rem .65rem;
      width: fit-content;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .best-badge {
      background: rgba(201,168,76,.25);
      color: var(--mizan-gold);
      border-radius: 10px;
      padding: .08rem .4rem;
      font-size: .65rem;
    }
    .karat-sar {
      font-size: 1.55rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .sar-unit { font-size: .82rem; font-weight: 400; color: var(--mizan-text-muted); }
    .karat-row {
      display: flex;
      justify-content: space-between;
      font-size: .8rem;
    }
    .k-label { color: var(--mizan-text-muted); }
    .k-val { font-variant-numeric: tabular-nums; }
    .karat-margin {
      font-size: .83rem;
      font-weight: 600;
      margin-top: .1rem;
    }
    .pos { color: var(--mizan-green); }
    .neg { color: var(--mizan-danger); }
    .karat-pct { display: flex; flex-direction: column; gap: .3rem; margin-top: .1rem; }
    .pct-bar-track {
      background: rgba(255,255,255,.08);
      border-radius: 4px;
      height: 5px;
      overflow: hidden;
    }
    .pct-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width .4s ease;
    }
    .pct-label { font-size: .72rem; color: var(--mizan-text-muted); }

    /* Skeleton */
    .skeleton {
      background: linear-gradient(90deg, var(--mizan-border) 25%, rgba(255,255,255,.05) 50%, var(--mizan-border) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 6px;
    }
    .sk-tag    { height: .9rem; width: 45%; }
    .sk-big    { height: 1.7rem; width: 75%; }
    .sk-line   { height: .7rem; width: 85%; }
    .sk-line.short { width: 55%; }
    .sk-margin { height: .8rem; width: 60%; }

    /* Charts Row */
    .charts-row {
      display: grid;
      grid-template-columns: 1fr 1.8fr;
      gap: 1rem;
    }
    @media (max-width: 800px) { .charts-row { grid-template-columns: 1fr; } }

    .chart-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
    }
    .chart-title {
      font-size: .85rem;
      font-weight: 600;
      color: var(--mizan-text-muted);
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .doughnut-wrap {
      position: relative;
      height: 230px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .doughnut-wrap canvas { max-width: 220px; max-height: 220px; }
    .doughnut-legend {
      display: flex;
      flex-wrap: wrap;
      gap: .5rem .75rem;
      margin-top: .75rem;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: .35rem;
      font-size: .8rem;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .legend-label { color: var(--mizan-text-muted); }
    .legend-pct   { font-weight: 600; }

    .chart-wrap { position: relative; height: 280px; }
    .chart-wrap canvas { width: 100% !important; height: 100% !important; }

    .skeleton-block {
      background: linear-gradient(90deg, var(--mizan-border) 25%, rgba(255,255,255,.04) 50%, var(--mizan-border) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 8px;
    }

    /* Table */
    .table-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      overflow: hidden;
    }
    .table-title {
      font-size: .85rem;
      font-weight: 600;
      color: var(--mizan-text-muted);
      padding: 1rem 1.25rem .75rem;
      text-transform: uppercase;
      letter-spacing: .04em;
      border-bottom: 1px solid var(--mizan-border);
    }
    .table-scroll { overflow-x: auto; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: .8rem;
      min-width: 800px;
    }
    .data-table th {
      text-align: right;
      padding: .6rem .65rem;
      color: var(--mizan-text-muted);
      border-bottom: 1px solid var(--mizan-border);
      font-weight: 500;
      white-space: nowrap;
      background: var(--mizan-surface);
    }
    .data-table td {
      padding: .5rem .65rem;
      border-bottom: 1px solid rgba(255,255,255,.04);
      white-space: nowrap;
    }
    .data-row:hover td { background: rgba(255,255,255,.03); }
    .data-table tr:last-child td { border-bottom: none; }
    .num  { font-variant-numeric: tabular-nums; }
    .idx  { color: var(--mizan-text-muted); font-size: .73rem; }
    .branch-name { font-weight: 500; }
    .k18 { color: #c9a84c; }
    .k21 { color: #f59e0b; }
    .k22 { color: #fb923c; }
    .k24 { color: #fbbf24; }

    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class V3KaratComponent implements OnDestroy {
  @ViewChild('doughnutCanvas')    doughnutCanvas!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('branchKaratCanvas') branchKaratCanvas!: ElementRef<HTMLCanvasElement>;

  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);

  loading  = signal(true);
  error    = signal<string | null>(null);
  totals   = signal<Record<string, KaratTotal>>({} as any);
  byBranch = signal<any[]>([]);

  karatKeys = KARAT_KEYS;

  bestKarat = computed<KaratKey | null>(() => {
    const t = this.totals();
    if (!t || !Object.keys(t).length) return null;
    return (KARAT_KEYS.reduce((best, k) =>
      (t[k]?.marginPerGram ?? 0) > (t[best]?.marginPerGram ?? 0) ? k : best
    , KARAT_KEYS[0])) as KaratKey;
  });

  private doughnutChart:    Chart | null = null;
  private branchKaratChart: Chart | null = null;

  constructor() {
    effect(() => {
      const from = this.dateRange.from();
      const to   = this.dateRange.to();
      if (!from || !to) return;
      this.load(from, to);
    });
  }

  private load(from: string, to: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.doughnutChart?.destroy();
    this.branchKaratChart?.destroy();
    this.doughnutChart    = null;
    this.branchKaratChart = null;

    this.svc.getKaratBreakdown(from, to).subscribe({
      next: (res) => {
        this.totals.set(res?.totals ?? {});
        this.byBranch.set(res?.byBranch ?? []);
        this.loading.set(false);
        setTimeout(() => {
          this.buildDoughnut(res?.totals ?? {});
          this.buildBranchKaratChart(res?.byBranch ?? []);
        }, 50);
      },
      error: (err) => {
        this.error.set('فشل تحميل بيانات الأعيار: ' + (err?.message ?? 'خطأ'));
        this.loading.set(false);
      }
    });
  }

  private buildDoughnut(totals: Record<string, KaratTotal>): void {
    const el = this.doughnutCanvas?.nativeElement;
    if (!el) return;
    this.doughnutChart?.destroy();
    this.doughnutChart = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: KARAT_KEYS.map(k => KARAT_LABELS[k]),
        datasets: [{
          data: KARAT_KEYS.map(k => totals[k]?.sar ?? 0),
          backgroundColor: KARAT_KEYS.map(k => KARAT_BG[k]),
          borderColor:     KARAT_KEYS.map(k => KARAT_COLORS[k]),
          borderWidth: 2,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.label + ': ' + Number(ctx.raw).toLocaleString('ar') + ' ريال (' + (totals[KARAT_KEYS[ctx.dataIndex]]?.pct ?? 0).toFixed(1) + '%)'
            }
          }
        }
      }
    });
  }

  private buildBranchKaratChart(byBranch: any[]): void {
    const el = this.branchKaratCanvas?.nativeElement;
    if (!el) return;
    this.branchKaratChart?.destroy();

    const top = byBranch.slice(0, 15);
    this.branchKaratChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: top.map(b => b.branchName),
        datasets: KARAT_KEYS.map(k => ({
          label: KARAT_LABELS[k],
          data: top.map(b => b[k + 'Sar'] ?? 0),
          backgroundColor: KARAT_BG[k],
          borderColor: KARAT_COLORS[k],
          borderWidth: 1,
          borderRadius: 2,
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: 'rgba(255,255,255,.7)', font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString('ar') + ' ريال'
            }
          }
        },
        scales: {
          x: {
            stacked: false,
            ticks: { color: 'rgba(255,255,255,.6)', font: { size: 9 } },
            grid:  { color: 'rgba(255,255,255,.08)' }
          },
          y: {
            stacked: false,
            ticks: {
              color: 'rgba(255,255,255,.6)',
              font: { size: 9 },
              callback: (v) => Number(v).toLocaleString('ar')
            },
            grid: { color: 'rgba(255,255,255,.08)' }
          }
        }
      }
    });
  }

  karatLabel(k: string): string {
    return KARAT_LABELS[k] ?? k;
  }

  karatColor(k: string): string {
    return KARAT_COLORS[k] ?? '#c9a84c';
  }

  fmt(n: number): string {
    return n.toLocaleString('ar', { maximumFractionDigits: 0 });
  }

  fmtRate(n: number): string {
    return n.toFixed(1);
  }

  ngOnDestroy(): void {
    this.doughnutChart?.destroy();
    this.branchKaratChart?.destroy();
  }
}
