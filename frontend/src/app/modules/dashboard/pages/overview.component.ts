import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { KpiRingCardComponent } from '../../../shared/components/kpi-ring-card/kpi-ring-card.component';
import { SaudiMapComponent } from '../../../shared/components/saudi-map/saudi-map.component';
import { MizanPipe } from '../../../shared/pipes/mizan.pipe';
import { fmtN, fmtSar, fmtWt } from '../../../shared/utils/format.utils';
import { UploadService } from '../../../core/services/upload.service';
import { Chart, registerables } from 'chart.js';
import { fmtCompact, barDataLabels, pieDataLabels } from '../../../core/chart-config';

Chart.register(...registerables);

// SVG gauge circumference for r=38 circle: 2π×38 ≈ 238.76
const CIRC = 238.76;

interface KpiCard {
  label: string;
  value: string;
  unit: string;
  pct: number;      // 0–100, controls gauge fill
  color: string;    // stroke color
  sub?: string;     // optional subtitle
  icon: string;
  valueClass?: string;
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, DateFilterComponent, KpiRingCardComponent, SaudiMapComponent, MizanPipe],
  template: `
    <div class="page-header">
      <div>
        <h2>نظرة عامة</h2>
        <p>لوحة التحكم الرئيسية</p>
      </div>
      <button class="export-btn" (click)="exportCsv()">⬇ تصدير</button>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else {

      <!-- KPI Ring Card Grid -->
      <div class="kpi-grid" style="margin-bottom:1.5rem">
        @for (k of kpiCards(); track k.label) {
          <app-kpi-ring-card
            [icon]="k.icon"
            [label]="k.label"
            [value]="k.value"
            [sub]="k.sub ?? ''"
            [ringColor]="k.color"
            [ringPct]="k.pct"
            [valueClass]="k.valueClass ?? ''">
          </app-kpi-ring-card>
        }
      </div>

      <!-- Charts Row -->
      @if (branches().length > 0) {
        <div class="charts-row">
          <div class="card chart-card">
            <div class="card__header"><h3>المبيعات والمشتريات — أعلى الفروع</h3></div>
            <canvas #barChart style="max-height:300px"></canvas>
          </div>
          <div class="card chart-card">
            <div class="card__header"><h3>المبيعات بالمناطق</h3></div>
            <canvas #doughnutChart style="max-height:300px"></canvas>
          </div>
        </div>

        <!-- Daily Trend Chart -->
        <div class="card chart-card" style="margin-bottom:1.5rem">
          <div class="card__header"><h3>{{ 'الحركة اليومية' | mizan }}</h3></div>
          <div style="height:200px;position:relative">
            <canvas #cvTrend></canvas>
          </div>
        </div>

        <!-- Saudi Map -->
        <div style="margin-bottom:1.5rem">
          <app-saudi-map [branches]="branches()"></app-saudi-map>
        </div>

        <!-- Top / Bottom Tables -->
        <div class="tables-row">
          <div class="card">
            <div class="card__header"><h3>أفضل 5 فروع</h3></div>
            <table class="data-table">
              <thead>
                <tr><th>الفرع</th><th>المنطقة</th><th>المبيعات</th><th>الفرق</th></tr>
              </thead>
              <tbody>
                @for (b of top5(); track b.code) {
                  <tr>
                    <td>{{ b.name }}</td>
                    <td>
                      <span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>
                      {{ b.region }}
                    </td>
                    <td>{{ fmt(b.sar) }}</td>
                    <td [class]="ana.getDiffClass(b.diffRate)">{{ fmtRate(b.diffRate) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="card">
            <div class="card__header"><h3>أدنى 5 فروع</h3></div>
            <table class="data-table">
              <thead>
                <tr><th>الفرع</th><th>المنطقة</th><th>المبيعات</th><th>الفرق</th></tr>
              </thead>
              <tbody>
                @for (b of bottom5(); track b.code) {
                  <tr>
                    <td>{{ b.name }}</td>
                    <td>
                      <span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>
                      {{ b.region }}
                    </td>
                    <td>{{ fmt(b.sar) }}</td>
                    <td [class]="ana.getDiffClass(b.diffRate)">{{ fmtRate(b.diffRate) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Alerts -->
      @if (alerts().length > 0) {
        <div class="card mt-4">
          <div class="card__header clickable" (click)="alertsExpanded.set(!alertsExpanded())">
            <h3>التنبيهات</h3>
            <span class="badge badge--warning">{{ alerts().length }} تنبيه</span>
          </div>
          @if (alertsExpanded()) {
            <div class="alerts-list">
              @for (a of alerts(); track a.branchCode) {
                <div class="alert-row" [class]="'alert-row--' + a.severity.toLowerCase()">
                  <strong>{{ a.branchName }}</strong>
                  <span>{{ a.messageAr }}</span>
                  <span class="alert-rate">{{ fmtRate(a.diffRate) }}</span>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (branches().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>لا توجد بيانات للفترة المحددة</p>
        </div>
      }
    }
  `,
  styles: [`
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: .75rem;
    }
    @media (max-width: 600px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: .5rem; }
    }

    .charts-row {
      display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; margin-bottom: 1.5rem;
    }
    @media (max-width: 900px) { .charts-row { grid-template-columns: 1fr; } }
    .chart-card { padding: 1rem; }

    .tables-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;
    }
    @media (max-width: 800px) { .tables-row { grid-template-columns: 1fr; } }

    table { width: 100%; border-collapse: collapse; }
    thead tr { background: var(--mz-surface-2, #213d2e); }
    thead th {
      padding: 10px 14px; font-size: 11px; font-weight: 700;
      color: var(--mz-gold, #c9a84c); text-align: start;
      text-transform: uppercase; letter-spacing: .6px;
    }
    tbody tr {
      border-bottom: 1px solid var(--mz-border, rgba(201,168,76,.14));
      transition: background .12s;
      &:hover { background: rgba(201,168,76,.04); }
      &:last-child { border-bottom: none; }
    }
    tbody td { padding: 9px 14px; font-size: 13px; color: var(--mz-text, #f2ede4); }

    .region-dot {
      display: inline-block; width: 8px; height: 8px;
      border-radius: 50%; margin-inline-end: 4px;
    }
    .pos { color: var(--mz-green-pop, #34d399); font-weight: 600; }
    .neg { color: var(--mz-red-pop, #f87171);   font-weight: 600; }

    .alerts-list { padding: .5rem 0; }
    .alert-row {
      display: flex; align-items: center; gap: 1rem;
      padding: .5rem 1rem; border-bottom: 1px solid var(--mz-border, rgba(201,168,76,.14));
      font-size: .85rem;
    }
    .alert-row--critical { color: var(--mz-red-pop, #f87171); }
    .alert-row--warning  { color: var(--mz-amber-pop, #fbbf24); }
    .alert-row--info     { color: var(--mz-text-2, rgba(242,237,228,.58)); }
    .alert-rate { margin-inline-start: auto; font-weight: 600; }

    .clickable { cursor: pointer; user-select: none; }
    .badge--warning {
      background: rgba(251,191,36,.15); color: var(--mz-amber-pop, #fbbf24);
      border: 1px solid rgba(251,191,36,.28); padding: .2rem .6rem;
      border-radius: 12px; font-size: .75rem;
    }
    .card__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: .75rem 1rem; border-bottom: 1px solid var(--mz-border, rgba(201,168,76,.14));
    }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    .export-btn {
      padding: .3rem .85rem; border-radius: 20px; font-size: .78rem; font-weight: 600; cursor: pointer;
      background: rgba(201,168,76,.12); color: var(--mz-gold, #c9a84c);
      border: 1px solid rgba(201,168,76,.3);
    }
    .export-btn:hover { background: rgba(201,168,76,.22); }
  `]
})
export class OverviewComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);
  private uploadSvc = inject(UploadService);

  @ViewChild('barChart')      barChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutChart') doughnutChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvTrend')       cvTrend?: ElementRef<HTMLCanvasElement>;

  summary  = signal<any>(null);
  branches = signal<any[]>([]);
  alerts   = signal<any[]>([]);
  loading  = signal(false);
  alertsExpanded = signal(false);

  private _pendingTrend: any[] | null = null;

  // Expose constant to template
  readonly CIRC = CIRC;

  private barChart: Chart | null = null;
  private doughnutChart: Chart | null = null;
  private trendChart: Chart | null = null;
  private viewReady = false;

  top5    = () => [...this.branches()].sort((a, b) => b.sar - a.sar).slice(0, 5);
  bottom5 = () => [...this.branches()].sort((a, b) => a.sar - b.sar).slice(0, 5);

  kpiCards = computed((): KpiCard[] => {
    const s = this.summary();
    if (!s) return [];
    const totalSales = Math.max(s.totalSalesAmount ?? 0, 1);
    const branchCt   = s.branchCount ?? 0;

    return [
      {
        icon: '💰',
        label: 'إجمالي المبيعات',
        value: fmtN(s.totalSalesAmount ?? 0),
        unit: 'ر.س',
        pct: 100,
        color: '#c9a84c',
        sub: fmtSar(s.totalSalesAmount)
      },
      {
        icon: '🛒',
        label: 'إجمالي المشتريات',
        value: fmtN(s.totalPurchasesAmount ?? 0),
        unit: 'ر.س',
        pct: Math.min(100, ((s.totalPurchasesAmount ?? 0) / totalSales) * 100),
        color: '#34d399',
        sub: fmtSar(s.totalPurchasesAmount)
      },
      {
        icon: '📈',
        label: 'الصافي',
        value: fmtN(s.netAmount ?? 0),
        unit: 'ر.س',
        pct: Math.min(100, Math.max(0, ((s.netAmount ?? 0) / totalSales) * 100)),
        color: (s.netAmount ?? 0) >= 0 ? '#34d399' : '#f87171',
        valueClass: (s.netAmount ?? 0) >= 0 ? 'pos' : 'neg',
        sub: ''
      },
      {
        icon: '⚖️',
        label: 'الوزن الصافي',
        value: fmtWt(s.totalNetWeight ?? 0),
        unit: 'جم',
        pct: 72,
        color: '#c9a84c',
        sub: ''
      },
      {
        icon: '🧾',
        label: 'عدد الفواتير',
        value: String(s.totalInvoices ?? 0),
        unit: 'فاتورة',
        pct: 85,
        color: '#c9a84c',
        sub: ''
      },
      {
        icon: '📊',
        label: 'متوسط الفاتورة',
        value: fmtN(s.avgInvoice ?? 0),
        unit: 'ر.س',
        pct: 60,
        color: '#c9a84c',
        sub: fmtSar(s.avgInvoice)
      },
      {
        icon: '💹',
        label: 'سعر البيع',
        value: this.fmtRate(s.saleRate),
        unit: 'ر.س/جم',
        pct: Math.min(100, ((s.saleRate ?? 0) / 260) * 100),
        color: '#c9a84c',
        sub: ''
      },
      {
        icon: '🏷️',
        label: 'سعر الشراء',
        value: this.fmtRate(s.purchaseRate),
        unit: 'ر.س/جم',
        pct: Math.min(100, ((s.purchaseRate ?? 0) / 260) * 100),
        color: '#34d399',
        sub: ''
      },
      {
        icon: '↔️',
        label: 'فرق المعدل',
        value: this.fmtRate(s.rateDifference),
        unit: 'ر.س/جم',
        pct: Math.min(100, Math.max(0, ((s.rateDifference ?? 0) / 150) * 100)),
        color: (s.rateDifference ?? 0) >= 0 ? '#34d399' : '#f87171',
        valueClass: (s.rateDifference ?? 0) >= 0 ? 'pos' : 'neg',
        sub: ''
      },
      {
        icon: '🏪',
        label: 'الفروع',
        value: String(branchCt),
        unit: 'فرع',
        pct: branchCt > 0 ? ((s.profitableBranches ?? 0) / branchCt) * 100 : 0,
        color: '#c9a84c',
        sub: `${s.profitableBranches ?? 0} رابح · ${s.lossBranches ?? 0} خاسر`
      },
      {
        icon: '🥇',
        label: 'أفضل فرع',
        value: s.topBranchName || '—',
        unit: '',
        pct: 100,
        color: '#c9a84c',
        sub: s.topBranchSar ? fmtN(s.topBranchSar) + ' ر.س' : ''
      },
      {
        icon: '🏬',
        label: 'مشتريات الفروع',
        value: fmtN(s.totalBranchPurchases ?? 0),
        unit: 'ر.س',
        pct: Math.min(100, ((s.totalBranchPurchases ?? 0) / Math.max(s.totalPurchasesAmount ?? 1, 1)) * 100),
        color: '#34d399',
        sub: fmtWt(s.totalBranchPurchaseWeight ?? 0)
      },
      {
        icon: '🪙',
        label: 'موطن الذهب',
        value: fmtN(s.totalMothan ?? 0),
        unit: 'ر.س',
        pct: Math.min(100, ((s.totalMothan ?? 0) / Math.max(s.totalPurchasesAmount ?? 1, 1)) * 100),
        color: '#c9a84c',
        sub: fmtWt(s.totalMothanWeight ?? 0) + ' · ' + (s.mothanTxnCount ?? 0) + ' عملية'
      },
      {
        icon: '↩️',
        label: 'إجمالي المرتجعات',
        value: fmtN(s.totalReturns ?? 0),
        unit: 'ر.س',
        pct: Math.min(100, ((s.totalReturns ?? 0) / Math.max(s.totalSalesAmount ?? 1, 1)) * 100),
        color: '#f87171',
        valueClass: (s.totalReturns ?? 0) > 0 ? 'neg' : '',
        sub: (s.returnBranchCount ?? 0) + ' فرع · ' +
             (((s.totalReturns ?? 0) / Math.max(s.totalSalesAmount ?? 1, 1)) * 100).toFixed(1) + '%'
      },
      {
        icon: '⚠️',
        label: 'أعلى فرع مرتجعات',
        value: s.topReturnBranchName || '—',
        unit: '',
        pct: s.topReturnBranchSar && s.totalReturns
               ? Math.min(100, (s.topReturnBranchSar / s.totalReturns) * 100) : 0,
        color: '#f87171',
        sub: s.topReturnBranchSar
               ? fmtN(s.topReturnBranchSar) + ' ر.س · ' + (s.topReturnBranchDays ?? 0) + ' يوم' : ''
      },
    ];
  });

  ngOnInit(): void {
    this.svc.getLatestDate().subscribe({
      next: r => {
        if (r.data?.latestDate) {
          const latest = new Date(r.data.latestDate);
          const now = new Date();
          if (latest.getMonth() !== now.getMonth() ||
              latest.getFullYear() !== now.getFullYear()) {
            const first = new Date(latest.getFullYear(), latest.getMonth(), 1);
            this.dr.fromDate.set(first.toISOString().slice(0, 10));
            this.dr.toDate.set(r.data.latestDate);
            this.dr.activePeriod.set('month');
          }
        }
        this.load();
      },
      error: () => this.load()
    });
  }

  exportCsv(): void { this.uploadSvc.exportCsv('summary', this.dr.getFrom(), this.dr.getTo()); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.loading() && this.branches().length > 0) {
      setTimeout(() => {
        this.buildCharts();
        if (this._pendingTrend) this.buildTrendChart(this._pendingTrend);
      }, 80);
    }
  }

  ngOnDestroy(): void {
    this.barChart?.destroy();
    this.doughnutChart?.destroy();
    this.trendChart?.destroy();
  }

  load(): void {
    this.loading.set(true);
    this._pendingTrend = null;
    const from = this.dr.getFrom(), to = this.dr.getTo();
    let done = 0;
    const check = () => {
      if (++done === 4) {
        this.loading.set(false);
        // All data is loaded → canvases are now in the DOM; build charts
        setTimeout(() => {
          this.buildCharts();
          if (this._pendingTrend) this.buildTrendChart(this._pendingTrend);
        }, 80);
      }
    };

    this.svc.getSummary(from, to).subscribe({
      next: r => { this.summary.set(r.data ?? null); check(); },
      error: () => check()
    });

    this.svc.getBranches(from, to).subscribe({
      next: r => { this.branches.set(r.data ?? []); check(); },
      error: () => check()
    });

    this.svc.getAlerts(from, to).subscribe({
      next: r => { this.alerts.set(r.data ?? []); check(); },
      error: () => check()
    });

    this.svc.getDailyTrend(from, to).subscribe({
      next: r => { this._pendingTrend = r.data ?? []; check(); },
      error: () => check()
    });
  }

  buildTrendChart(trend: any[]): void {
    if (!this.cvTrend?.nativeElement) return;
    if (this.trendChart) { this.trendChart.destroy(); this.trendChart = null; }
    if (!trend.length) return;
    const labels = trend.map(d => (d.date as string).slice(5)); // MM-DD
    const sarVals = trend.map(d => d.sar as number);
    const s = this.summary();
    const purchRatio = s?.totalPurchasesAmount && s?.totalSalesAmount
      ? s.totalPurchasesAmount / s.totalSalesAmount : 0.5;
    const purchVals = sarVals.map(v => Math.round(v * purchRatio));
    this.trendChart = new Chart(this.cvTrend.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'المبيعات / Sales',
            data: sarVals,
            borderColor: 'rgba(255,255,255,0.8)',
            backgroundColor: 'rgba(255,255,255,0.06)',
            fill: true, tension: 0.4,
            pointRadius: labels.length > 15 ? 0 : 3,
            pointBackgroundColor: '#fff', borderWidth: 2,
          },
          {
            label: 'المشتريات / Purch',
            data: purchVals,
            borderColor: 'rgba(201,168,76,0.7)',
            backgroundColor: 'rgba(201,168,76,0.05)',
            fill: true, tension: 0.4,
            borderDash: [5, 3],
            pointRadius: labels.length > 15 ? 0 : 3,
            pointBackgroundColor: '#c9a84c', borderWidth: 2,
          } as any,
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 }, color: 'rgba(255,255,255,0.6)' } },
          datalabels: { display: false }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0, font: { size: 9 }, color: 'rgba(255,255,255,0.5)' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: (v: any) => fmtCompact(+v), font: { size: 9 }, color: 'rgba(255,255,255,0.5)' } }
        }
      }
    });
  }

  private buildCharts(): void {
    const bs = this.branches();
    if (!bs.length) return;

    this.barChart?.destroy();
    const top8 = [...bs].sort((a, b) => b.sar - a.sar).slice(0, 8);
    if (this.barChartRef?.nativeElement) {
      this.barChart = new Chart(this.barChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: top8.map(b => b.name),
          datasets: [
            { label: 'المبيعات',   data: top8.map(b => b.sar),             backgroundColor: 'rgba(201,168,76,0.8)', borderRadius: 4 },
            { label: 'المشتريات', data: top8.map(b => b.purch + b.mothan), backgroundColor: 'rgba(52,211,153,0.65)', borderRadius: 4 },
          ]
        },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top' },
            datalabels: barDataLabels()
          },
          scales: {
            y: {
              grid: { color: 'rgba(255,255,255,0.04)' },
              ticks: { callback: (v: any) => fmtCompact(+v) }
            }
          }
        }
      });
    }

    this.doughnutChart?.destroy();
    const regionMap: Record<string, number> = {};
    for (const b of bs) regionMap[b.region] = (regionMap[b.region] || 0) + b.sar;
    const regions = Object.keys(regionMap);
    if (this.doughnutChartRef?.nativeElement && regions.length > 0) {
      this.doughnutChart = new Chart(this.doughnutChartRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels: regions,
          datasets: [{ data: regions.map(r => regionMap[r]), backgroundColor: regions.map(r => this.ana.getRegionColor(r)), hoverOffset: 8 }]
        },
        options: {
          responsive: true,
          cutout: '65%',
          plugins: {
            legend: { position: 'bottom' },
            datalabels: pieDataLabels()
          }
        }
      });
    }
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }

  fmtWtLocal(n?: number): string { return (n ?? 0).toFixed(1); }
  fmtRate(n?: number): string { return (n ?? 0).toFixed(2); }
}
