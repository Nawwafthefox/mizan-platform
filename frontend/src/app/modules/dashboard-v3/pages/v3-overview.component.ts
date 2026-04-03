import {
  Component,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';
import { V3KpiCardComponent } from '../shared/v3-kpi-card.component';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { fmtCompact, barDataLabels } from '../../../core/chart-config';

Chart.register(...registerables);

@Component({
  selector: 'app-v3-overview',
  standalone: true,
  imports: [CommonModule, V3KpiCardComponent],
  template: `
    <div class="overview-root" dir="rtl">

      <!-- KPI Grid -->
      <div class="kpi-grid">
        <v3-kpi-card
          label="إجمالي المبيعات"
          icon="💰"
          color="gold"
          [value]="loading() ? null : fmt(data()?.totalSales ?? 0) + ' ريال'"
          [subtitle]="loading() ? undefined : fmt(data()?.totalWeight ?? 0) + 'غ / ' + fmt(data()?.totalInvoices ?? 0) + ' فاتورة'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="الصافي"
          icon="📈"
          [color]="(data()?.net ?? 0) >= 0 ? 'green' : 'red'"
          [value]="loading() ? null : fmt(data()?.net ?? 0) + ' ريال'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="إجمالي المشتريات"
          icon="🛒"
          color="gold"
          [value]="loading() ? null : fmt(data()?.totalPurchases ?? 0) + ' ريال'"
          [subtitle]="loading() ? undefined : fmt(data()?.totalPurchWt ?? 0) + 'غ'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="مشتريات الفروع"
          icon="🏪"
          color="gold"
          [value]="loading() ? null : fmt(data()?.branchPurchases ?? 0) + ' ريال'"
          [subtitle]="loading() ? undefined : fmt(data()?.branchPurchWt ?? 0) + 'غ'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="موطن الذهب"
          icon="🏦"
          color="gold"
          [value]="loading() ? null : fmt(data()?.totalMothan ?? 0) + ' ريال'"
          [subtitle]="loading() ? undefined : fmt(data()?.totalMothanWt ?? 0) + 'غ / ' + (data()?.mothanTxnCount ?? 0) + ' صفقة'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="فرق المعدل"
          icon="⚡"
          [color]="rateDiffColor()"
          [value]="loading() ? null : fmtRate(data()?.rateDiff ?? 0)"
          [subtitle]="loading() ? undefined : fmtRate(data()?.saleRate ?? 0) + ' بيع / ' + fmtRate(data()?.purchRate ?? 0) + ' شراء'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="فروع بصافٍ سالب"
          icon="⚠️"
          [color]="(data()?.negativeBranches ?? 0) > 0 ? 'red' : 'green'"
          [value]="loading() ? null : (data()?.negativeBranches ?? 0) + ' / ' + (data()?.branchCount ?? 0)"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="أعلى فرع"
          icon="🏆"
          color="gold"
          [value]="loading() ? null : (data()?.topBranchName ?? '—')"
          [subtitle]="loading() ? undefined : fmt(data()?.topBranchSar ?? 0) + ' ريال'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="متوسط الفاتورة"
          icon="🧾"
          color="gold"
          [value]="loading() ? null : fmtRate(data()?.avgInvoice ?? 0) + ' ريال'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="إجمالي المرتجعات"
          icon="🔄"
          color="red"
          [value]="loading() ? null : fmt(data()?.totalReturns ?? 0) + ' ريال'"
          [subtitle]="loading() ? undefined : (data()?.returnBranchCount ?? 0) + ' فرع / ' + fmtRate(data()?.returnPctOfSales ?? 0) + '%'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="أعلى مرتجعات"
          icon="📉"
          color="red"
          [value]="loading() ? null : (data()?.topReturnBranchName ?? '—')"
          [subtitle]="loading() ? undefined : fmt(data()?.topReturnBranchSar ?? 0) + ' ريال'"
          [loading]="loading()"
        />
      </div>

      <!-- Error Banner -->
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <!-- Charts Row -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-title">أعلى 8 فروع بالمبيعات</div>
          @if (loading()) {
            <div class="skeleton-chart"></div>
          } @else {
            <div class="chart-wrap">
              <canvas #branchBarCanvas></canvas>
            </div>
            <div class="chart-insight">
              الشريط الأطول يعني مبيعات أعلى — قارن الأشرطة لتحديد الفروع الرائدة في الفترة المختارة. الفجوة بين أول شريط وآخر شريط تعكس مستوى التفاوت في الأداء بين الفروع.
            </div>
          }
        </div>
        <div class="chart-card">
          <div class="chart-title">الاتجاه اليومي</div>
          @if (loading()) {
            <div class="skeleton-chart"></div>
          } @else {
            <div class="chart-wrap">
              <canvas #trendLineCanvas></canvas>
            </div>
            <div class="chart-insight">
              الخط الذهبي يمثل المبيعات اليومية والخط الأخضر يمثل المشتريات — ابحث عن أيام ترتفع فيها الخطوط للتعرف على أيام الذروة، وعن الانخفاضات الحادة لاكتشاف الأيام الضعيفة. التقاطع بين الخطين يشير إلى تعادل المبيعات والمشتريات.
            </div>
          }
        </div>
      </div>

      <!-- Bottom Row -->
      <div class="bottom-row">
        <!-- Top 5 Branches -->
        <div class="table-card">
          <div class="table-title">أعلى 5 فروع</div>
          @if (loading()) {
            <div class="skeleton-table"></div>
          } @else {
            <table class="data-table">
              <thead>
                <tr>
                  <th>الفرع</th>
                  <th>المبيعات</th>
                  <th>الصافي</th>
                  <th>فرق المعدل</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                @for (b of top5(); track b.branchCode) {
                  <tr>
                    <td>{{ b.branchName }}</td>
                    <td class="num">{{ fmt(b.totalSar) }}</td>
                    <td class="num" [class.pos]="b.net >= 0" [class.neg]="b.net < 0">{{ fmt(b.net) }}</td>
                    <td class="num" [class.pos]="b.diffRate > 0" [class.neg]="b.diffRate < 0">{{ fmtRate(b.diffRate) }}</td>
                    <td><span class="dot" [class.dot-green]="b.net >= 0" [class.dot-red]="b.net < 0"></span></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Bottom 5 Branches -->
        <div class="table-card">
          <div class="table-title">أدنى 5 فروع</div>
          @if (loading()) {
            <div class="skeleton-table"></div>
          } @else {
            <table class="data-table">
              <thead>
                <tr>
                  <th>الفرع</th>
                  <th>المبيعات</th>
                  <th>الصافي</th>
                  <th>فرق المعدل</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                @for (b of bottom5(); track b.branchCode) {
                  <tr>
                    <td>{{ b.branchName }}</td>
                    <td class="num">{{ fmt(b.totalSar) }}</td>
                    <td class="num" [class.pos]="b.net >= 0" [class.neg]="b.net < 0">{{ fmt(b.net) }}</td>
                    <td class="num" [class.pos]="b.diffRate > 0" [class.neg]="b.diffRate < 0">{{ fmtRate(b.diffRate) }}</td>
                    <td><span class="dot" [class.dot-green]="b.net >= 0" [class.dot-red]="b.net < 0"></span></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Alerts Preview -->
        <div class="table-card alerts-card">
          <div class="table-title">تنبيهات</div>
          @if (loading()) {
            <div class="skeleton-table"></div>
          } @else {
            @if (alerts().length === 0) {
              <div class="no-alerts">لا توجد تنبيهات</div>
            } @else {
              <ul class="alerts-list">
                @for (a of alerts(); track $index) {
                  <li class="alert-item" [class.alert-warn]="a.level === 'warn'" [class.alert-danger]="a.level === 'danger'">
                    <span class="alert-icon">{{ a.level === 'danger' ? '🔴' : '🟡' }}</span>
                    <span class="alert-msg">{{ a.message }}</span>
                  </li>
                }
              </ul>
            }
          }
        </div>
      </div>

    </div>
  `,
  styles: [`
    .overview-root {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      color: var(--mizan-text);
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }
    @media (max-width: 900px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 480px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }

    /* Error */
    .error-banner {
      background: rgba(239,68,68,.12);
      border: 1px solid rgba(239,68,68,.4);
      color: #ef4444;
      border-radius: 8px;
      padding: .75rem 1rem;
      font-size: .9rem;
    }

    /* Charts Row */
    .charts-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 768px) {
      .charts-row { grid-template-columns: 1fr; }
    }

    .chart-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1.25rem;
    }
    .chart-title {
      font-size: .85rem;
      font-weight: 600;
      color: var(--mizan-text-muted);
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .chart-wrap {
      position: relative;
      height: 220px;
    }
    .chart-wrap canvas {
      width: 100% !important;
      height: 100% !important;
    }
    .chart-insight {
      margin-top: 0.85rem;
      font-size: 0.9rem;
      color: rgba(232,228,220,0.65);
      line-height: 1.75;
      padding: 0.7rem 1rem;
      background: rgba(201,168,76,0.05);
      border-right: 3px solid rgba(201,168,76,0.35);
      border-radius: 0 8px 8px 0;
    }
    .skeleton-chart {
      height: 220px;
      background: linear-gradient(90deg, var(--mizan-border) 25%, rgba(255,255,255,.04) 50%, var(--mizan-border) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 8px;
    }

    /* Bottom Row */
    .bottom-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 900px) {
      .bottom-row { grid-template-columns: 1fr; }
    }

    .table-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1.25rem;
      overflow: hidden;
    }
    .table-title {
      font-size: .85rem;
      font-weight: 600;
      color: var(--mizan-text-muted);
      margin-bottom: .75rem;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .skeleton-table {
      height: 160px;
      background: linear-gradient(90deg, var(--mizan-border) 25%, rgba(255,255,255,.04) 50%, var(--mizan-border) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 8px;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: .82rem;
    }
    .data-table th {
      text-align: right;
      padding: .45rem .5rem;
      color: var(--mizan-text-muted);
      border-bottom: 1px solid var(--mizan-border);
      font-weight: 500;
      white-space: nowrap;
    }
    .data-table td {
      padding: .45rem .5rem;
      border-bottom: 1px solid rgba(255,255,255,.04);
      color: var(--mizan-text);
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table .num { font-variant-numeric: tabular-nums; }
    .data-table .pos { color: var(--mizan-green); }
    .data-table .neg { color: var(--mizan-danger); }

    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot-green { background: var(--mizan-green); }
    .dot-red   { background: var(--mizan-danger); }

    /* Alerts */
    .no-alerts {
      color: var(--mizan-text-muted);
      font-size: .85rem;
      padding: .5rem 0;
    }
    .alerts-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .alert-item {
      display: flex;
      gap: .5rem;
      align-items: flex-start;
      padding: .5rem .65rem;
      border-radius: 8px;
      font-size: .82rem;
    }
    .alert-warn   { background: rgba(234,179,8,.08); border: 1px solid rgba(234,179,8,.25); }
    .alert-danger { background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.25); }
    .alert-icon { flex-shrink: 0; line-height: 1.4; }
    .alert-msg  { color: var(--mizan-text); line-height: 1.4; }

    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class V3OverviewComponent implements OnDestroy {
  @ViewChild('branchBarCanvas') branchBarCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendLineCanvas') trendLineCanvas!: ElementRef<HTMLCanvasElement>;

  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);

  loading  = signal(true);
  error    = signal<string | null>(null);
  data     = signal<any>(null);
  branches = signal<any[]>([]);
  trend    = signal<any[]>([]);
  alerts   = signal<any[]>([]);

  top5    = signal<any[]>([]);
  bottom5 = signal<any[]>([]);

  private barChart:    Chart | null = null;
  private lineChart:   Chart | null = null;
  private pendingBar:  any[] | null = null;
  private pendingLine: any[] | null = null;

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
    this.destroyCharts();

    forkJoin({
      overview: this.svc.getOverview(from, to).pipe(catchError(() => of(null))),
      branches: this.svc.getBranchSummary(from, to).pipe(catchError(() => of([]))),
      trend:    this.svc.getDailyTrend(from, to).pipe(catchError(() => of([]))),
      alerts:   this.svc.getAlerts(from, to).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ overview, branches, trend, alerts }) => {
        if (!overview) {
          this.error.set('فشل تحميل البيانات');
          this.loading.set(false);
          return;
        }
        this.data.set(overview);

        const sorted = [...(branches as any[])].sort((a, b) => b.totalSar - a.totalSar);
        this.branches.set(sorted);
        this.top5.set(sorted.slice(0, 5));
        this.bottom5.set([...sorted].sort((a, b) => a.net - b.net).slice(0, 5));
        this.trend.set(trend as any[] ?? []);
        this.alerts.set(alerts as any[] ?? []);

        this.pendingBar  = sorted.slice(0, 8);
        this.pendingLine = trend as any[] ?? [];
        this.loading.set(false);

        // Wait 80ms after loading=false so Angular re-renders @if block
        // and @ViewChild canvas refs are in the DOM before we attach charts
        setTimeout(() => {
          if (this.pendingBar)  { this.buildBarChart(this.pendingBar);   this.pendingBar  = null; }
          if (this.pendingLine) { this.buildLineChart(this.pendingLine); this.pendingLine = null; }
        }, 80);
      },
      error: (err) => {
        this.error.set('فشل تحميل البيانات: ' + (err?.message ?? 'خطأ غير معروف'));
        this.loading.set(false);
      }
    });
  }

  private buildBarChart(branches: any[], retries = 3): void {
    const el = this.branchBarCanvas?.nativeElement;
    if (!el) {
      if (retries > 0) setTimeout(() => this.buildBarChart(branches, retries - 1), 80);
      return;
    }
    this.barChart?.destroy();
    this.barChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: branches.map(b => b.branchName),
        datasets: [{
          label: 'المبيعات',
          data: branches.map(b => b.totalSar),
          backgroundColor: 'rgba(201,168,76,.75)',
          borderColor: '#c9a84c',
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
              label: ctx => ' ' + Number(ctx.raw).toLocaleString('ar') + ' ريال'
            }
          },
          datalabels: {
            ...barDataLabels(),
            anchor: 'center' as const,
            align: 'center' as const,
            offset: 0,
            font: { size: 11, weight: 800 as any, family: "'IBM Plex Sans Arabic', 'IBM Plex Sans', sans-serif" },
          },
        },
        scales: {
          x: {
            ticks: { color: 'rgba(255,255,255,.6)', font: { size: 11 } },
            grid:  { color: 'rgba(255,255,255,.08)' }
          },
          y: {
            ticks: {
              color: 'rgba(255,255,255,.6)',
              font: { size: 10 },
              callback: (v: any) => fmtCompact(+v)
            },
            grid: { color: 'rgba(255,255,255,.08)' }
          }
        }
      }
    });
  }

  private buildLineChart(trend: any[], retries = 3): void {
    const el = this.trendLineCanvas?.nativeElement;
    if (!el) {
      if (retries > 0) setTimeout(() => this.buildLineChart(trend, retries - 1), 80);
      return;
    }
    this.lineChart?.destroy();
    this.lineChart = new Chart(el, {
      type: 'line',
      data: {
        labels: trend.map(t => t.date ?? t.day ?? ''),
        datasets: [
          {
            label: 'المبيعات',
            data: trend.map(t => t.sales ?? t.totalSar ?? 0),
            borderColor: '#c9a84c',
            backgroundColor: 'rgba(201,168,76,.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#c9a84c',
          },
          {
            label: 'المشتريات',
            data: trend.map(t => t.purchases ?? t.purchSar ?? 0),
            borderColor: '#14b8a6',
            backgroundColor: 'rgba(20,184,166,.08)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#14b8a6',
          }
        ]
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
              label: ctx => ' ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString('ar')
            }
          },
          datalabels: { display: false },
        },
        scales: {
          x: {
            ticks: { color: 'rgba(255,255,255,.6)', font: { size: 10 } },
            grid:  { color: 'rgba(255,255,255,.06)' }
          },
          y: {
            ticks: {
              color: 'rgba(255,255,255,.6)',
              font: { size: 10 },
              callback: (v: any) => fmtCompact(+v)
            },
            grid: { color: 'rgba(255,255,255,.06)' }
          }
        }
      }
    });
  }

  rateDiffColor(): 'green' | 'gold' | 'red' {
    const v = this.data()?.rateDiff ?? 0;
    if (v > 0) return 'green';
    if (v < 0) return 'red';
    return 'gold';
  }

  fmt(n: number): string {
    return n.toLocaleString('ar', { maximumFractionDigits: 0 });
  }

  fmtRate(n: number): string {
    return n.toFixed(1);
  }

  private destroyCharts(): void {
    this.barChart?.destroy();
    this.barChart = null;
    this.lineChart?.destroy();
    this.lineChart = null;
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }
}
