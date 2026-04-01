import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { Chart, registerables } from 'chart.js';

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
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, DateFilterComponent],
  template: `
    <div class="page-header">
      <div>
        <h2>نظرة عامة</h2>
        <p>لوحة التحكم الرئيسية</p>
      </div>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else {

      <!-- KPI Gauge Grid -->
      <div class="kpi-gauge-grid">
        @for (k of kpiCards(); track k.label) {
          <div class="kpi-gauge-card">
            <div class="gauge-wrap">
              <svg class="gauge-svg" viewBox="0 0 100 100" fill="none">
                <!-- track ring -->
                <circle cx="50" cy="50" r="38"
                        stroke="rgba(201,168,76,0.10)" stroke-width="5"/>
                <!-- fill ring -->
                <circle cx="50" cy="50" r="38"
                        [attr.stroke]="k.color"
                        stroke-width="5"
                        stroke-linecap="round"
                        [attr.stroke-dasharray]="CIRC"
                        [attr.stroke-dashoffset]="CIRC * (1 - k.pct / 100)"
                        transform="rotate(-90 50 50)"/>
              </svg>
              <div class="gauge-center">
                <span class="gauge-value">{{ k.value }}</span>
                @if (k.unit) { <span class="gauge-unit">{{ k.unit }}</span> }
              </div>
            </div>
            <div class="gauge-label">{{ k.label }}</div>
            @if (k.sub) { <div class="gauge-sub">{{ k.sub }}</div> }
          </div>
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
    .kpi-gauge-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: .85rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 600px) {
      .kpi-gauge-grid { grid-template-columns: repeat(3, 1fr); gap: .6rem; }
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
  `]
})
export class OverviewComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);

  @ViewChild('barChart')      barChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutChart') doughnutChartRef!: ElementRef<HTMLCanvasElement>;

  summary  = signal<any>(null);
  branches = signal<any[]>([]);
  alerts   = signal<any[]>([]);
  loading  = signal(false);
  alertsExpanded = signal(false);

  // Expose constant to template
  readonly CIRC = CIRC;

  private barChart: Chart | null = null;
  private doughnutChart: Chart | null = null;
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
        label: 'إجمالي المبيعات',
        value: this.fmtShort(s.totalSalesAmount ?? 0),
        unit: 'ر.س',
        pct: 100,
        color: '#c9a84c',
        sub: this.fmt(s.totalSalesAmount)
      },
      {
        label: 'إجمالي المشتريات',
        value: this.fmtShort(s.totalPurchasesAmount ?? 0),
        unit: 'ر.س',
        pct: Math.min(100, ((s.totalPurchasesAmount ?? 0) / totalSales) * 100),
        color: '#34d399',
        sub: this.fmt(s.totalPurchasesAmount)
      },
      {
        label: 'الصافي',
        value: this.fmtShort(s.netAmount ?? 0),
        unit: 'ر.س',
        pct: Math.min(100, Math.max(0, ((s.netAmount ?? 0) / totalSales) * 100)),
        color: (s.netAmount ?? 0) >= 0 ? '#34d399' : '#f87171',
        sub: ''
      },
      {
        label: 'الوزن الصافي',
        value: this.fmtWt(s.totalNetWeight ?? 0),
        unit: 'جم',
        pct: 72,
        color: '#c9a84c',
        sub: ''
      },
      {
        label: 'عدد الفواتير',
        value: String(s.totalInvoices ?? 0),
        unit: 'فاتورة',
        pct: 85,
        color: '#c9a84c',
        sub: ''
      },
      {
        label: 'متوسط الفاتورة',
        value: this.fmtShort(s.avgInvoice ?? 0),
        unit: 'ر.س',
        pct: 60,
        color: '#c9a84c',
        sub: this.fmt(s.avgInvoice)
      },
      {
        label: 'سعر البيع',
        value: this.fmtRate(s.saleRate),
        unit: 'ر.س/جم',
        pct: Math.min(100, ((s.saleRate ?? 0) / 260) * 100),
        color: '#c9a84c',
        sub: ''
      },
      {
        label: 'سعر الشراء',
        value: this.fmtRate(s.purchaseRate),
        unit: 'ر.س/جم',
        pct: Math.min(100, ((s.purchaseRate ?? 0) / 260) * 100),
        color: '#34d399',
        sub: ''
      },
      {
        label: 'فرق المعدل',
        value: this.fmtRate(s.rateDifference),
        unit: 'ر.س/جم',
        pct: Math.min(100, Math.max(0, ((s.rateDifference ?? 0) / 150) * 100)),
        color: (s.rateDifference ?? 0) >= 0 ? '#34d399' : '#f87171',
        sub: ''
      },
      {
        label: 'الفروع',
        value: String(branchCt),
        unit: 'فرع',
        pct: branchCt > 0 ? ((s.profitableBranches ?? 0) / branchCt) * 100 : 0,
        color: '#c9a84c',
        sub: `${s.profitableBranches ?? 0} رابح · ${s.lossBranches ?? 0} خاسر`
      },
      {
        label: 'أفضل فرع',
        value: s.topBranchName || '—',
        unit: '',
        pct: 100,
        color: '#c9a84c',
        sub: s.topBranchSar ? this.fmtShort(s.topBranchSar) + ' ر.س' : ''
      },
    ];
  });

  ngOnInit(): void { this.load(); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.branches().length > 0) {
      setTimeout(() => this.buildCharts(), 0);
    }
  }

  ngOnDestroy(): void {
    this.barChart?.destroy();
    this.doughnutChart?.destroy();
  }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    let done = 0;
    const check = () => { if (++done === 3) this.loading.set(false); };

    this.svc.getSummary(from, to).subscribe({
      next: r => { this.summary.set(r.data ?? null); check(); },
      error: () => check()
    });

    this.svc.getBranches(from, to).subscribe({
      next: r => {
        this.branches.set(r.data ?? []);
        check();
        if (this.viewReady) setTimeout(() => this.buildCharts(), 0);
      },
      error: () => check()
    });

    this.svc.getAlerts(from, to).subscribe({
      next: r => { this.alerts.set(r.data ?? []); check(); },
      error: () => check()
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
            { label: 'المبيعات',   data: top8.map(b => b.sar),             backgroundColor: 'rgba(201,168,76,.75)' },
            { label: 'المشتريات', data: top8.map(b => b.purch + b.mothan), backgroundColor: 'rgba(52,211,153,.55)'  },
          ]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
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
          datasets: [{ data: regions.map(r => regionMap[r]), backgroundColor: regions.map(r => this.ana.getRegionColor(r)) }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    }
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }

  fmtShort(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000)     return sign + (abs / 1_000).toFixed(0) + 'K';
    return sign + abs.toFixed(0);
  }

  fmtWt(n?: number): string   { return (n ?? 0).toFixed(1); }
  fmtRate(n?: number): string { return (n ?? 0).toFixed(2); }
}
