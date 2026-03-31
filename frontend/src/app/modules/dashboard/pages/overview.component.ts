import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

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
      <!-- KPI Grid -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-card--gold">
          <div class="kpi-label">إجمالي المبيعات</div>
          <div class="kpi-value">{{ fmt(summary()?.totalSalesAmount) }}</div>
          <div class="kpi-sub">ريال سعودي</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">إجمالي المشتريات</div>
          <div class="kpi-value">{{ fmt(summary()?.totalPurchasesAmount) }}</div>
          <div class="kpi-sub">ريال سعودي</div>
        </div>
        <div class="kpi-card" [class.kpi-card--green]="(summary()?.netAmount ?? 0) > 0" [class.kpi-card--danger]="(summary()?.netAmount ?? 0) < 0">
          <div class="kpi-label">الصافي</div>
          <div class="kpi-value">{{ fmt(summary()?.netAmount) }}</div>
          <div class="kpi-sub">ريال سعودي</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">الوزن الصافي</div>
          <div class="kpi-value">{{ fmtWt(summary()?.totalNetWeight) }}</div>
          <div class="kpi-sub">غرام</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">عدد الفواتير</div>
          <div class="kpi-value">{{ summary()?.totalInvoices ?? 0 }}</div>
          <div class="kpi-sub">فاتورة</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">متوسط الفاتورة</div>
          <div class="kpi-value">{{ fmt(summary()?.avgInvoice) }}</div>
          <div class="kpi-sub">ريال</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">سعر البيع</div>
          <div class="kpi-value">{{ fmtRate(summary()?.saleRate) }}</div>
          <div class="kpi-sub">ر.س/جم</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">سعر الشراء</div>
          <div class="kpi-value">{{ fmtRate(summary()?.purchaseRate) }}</div>
          <div class="kpi-sub">ر.س/جم</div>
        </div>
        <div class="kpi-card" [class.kpi-card--green]="(summary()?.rateDifference ?? 0) > 0">
          <div class="kpi-label">فرق المعدل</div>
          <div class="kpi-value">{{ fmtRate(summary()?.rateDifference) }}</div>
          <div class="kpi-sub">ر.س/جم</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">الفروع</div>
          <div class="kpi-value">{{ summary()?.branchCount ?? 0 }}</div>
          <div class="kpi-sub">{{ summary()?.profitableBranches ?? 0 }} رابح / {{ summary()?.lossBranches ?? 0 }} خاسر</div>
        </div>
        <div class="kpi-card kpi-card--gold">
          <div class="kpi-label">أفضل فرع</div>
          <div class="kpi-value kpi-value--sm">{{ summary()?.topBranchName || '—' }}</div>
          <div class="kpi-sub">{{ fmt(summary()?.topBranchSar) }} ر.س</div>
        </div>
      </div>

      <!-- Charts Row -->
      @if (branches().length > 0) {
        <div class="charts-row">
          <div class="card chart-card chart-card--lg">
            <div class="card__header"><h3>المبيعات والمشتريات بالفروع</h3></div>
            <canvas #barChart style="max-height:320px"></canvas>
          </div>
          <div class="card chart-card chart-card--sm">
            <div class="card__header"><h3>المبيعات بالمناطق</h3></div>
            <canvas #doughnutChart style="max-height:320px"></canvas>
          </div>
        </div>

        <!-- Top/Bottom Tables -->
        <div class="tables-row">
          <div class="card">
            <div class="card__header"><h3>أفضل 5 فروع</h3></div>
            <table class="data-table">
              <thead><tr><th>الفرع</th><th>المنطقة</th><th>المبيعات</th><th>الفرق</th></tr></thead>
              <tbody>
                @for (b of top5(); track b.code) {
                  <tr>
                    <td>{{ b.name }}</td>
                    <td><span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>{{ b.region }}</td>
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
              <thead><tr><th>الفرع</th><th>المنطقة</th><th>المبيعات</th><th>الفرق</th></tr></thead>
              <tbody>
                @for (b of bottom5(); track b.code) {
                  <tr>
                    <td>{{ b.name }}</td>
                    <td><span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>{{ b.region }}</td>
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
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-card {
      background: var(--mizan-surface); border: 1px solid var(--mizan-border);
      border-radius: 10px; padding: 1rem 1.25rem;
    }
    .kpi-card--gold { border-color: var(--mizan-gold); background: rgba(201,168,76,.08); }
    .kpi-card--green { border-color: var(--mizan-green); background: rgba(16,185,129,.08); }
    .kpi-card--danger { border-color: var(--mizan-danger); background: rgba(220,53,69,.08); }
    .kpi-label { font-size: .75rem; color: var(--mizan-text-muted); margin-bottom: .3rem; }
    .kpi-value { font-size: 1.3rem; font-weight: 700; color: var(--mizan-text); }
    .kpi-value--sm { font-size: 1rem; }
    .kpi-sub { font-size: .72rem; color: var(--mizan-text-muted); margin-top: .25rem; }
    .charts-row { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    @media(max-width:900px) { .charts-row { grid-template-columns: 1fr; } }
    .chart-card { padding: 1rem; }
    .tables-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    @media(max-width:800px) { .tables-row { grid-template-columns: 1fr; } }
    .region-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
    .pos { color: var(--mizan-green); font-weight: 600; }
    .neg { color: var(--mizan-danger); font-weight: 600; }
    .alerts-list { padding: .5rem 0; }
    .alert-row {
      display: flex; align-items: center; gap: 1rem; padding: .5rem 1rem;
      border-bottom: 1px solid var(--mizan-border); font-size: .85rem;
    }
    .alert-row--critical { color: var(--mizan-danger); }
    .alert-row--warning { color: #f59e0b; }
    .alert-row--info { color: var(--mizan-text-muted); }
    .alert-rate { margin-right: auto; font-weight: 600; }
    .clickable { cursor: pointer; user-select: none; }
    .mt-4 { margin-top: 1.5rem; }
    .badge--warning { background: rgba(245,158,11,.2); color: #d97706; border: 1px solid rgba(245,158,11,.3); padding: .2rem .6rem; border-radius: 12px; font-size: .75rem; }
    .card__header { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
  `]
})
export class OverviewComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);

  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutChart') doughnutChartRef!: ElementRef<HTMLCanvasElement>;

  summary = signal<any>(null);
  branches = signal<any[]>([]);
  alerts = signal<any[]>([]);
  loading = signal(false);
  alertsExpanded = signal(false);

  private barChart: Chart | null = null;
  private doughnutChart: Chart | null = null;
  private viewReady = false;

  top5 = () => [...this.branches()].sort((a, b) => b.sar - a.sar).slice(0, 5);
  bottom5 = () => [...this.branches()].sort((a, b) => a.sar - b.sar).slice(0, 5);

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

    // Bar chart - top 8 branches
    this.barChart?.destroy();
    const top8 = [...bs].sort((a, b) => b.sar - a.sar).slice(0, 8);
    if (this.barChartRef?.nativeElement) {
      this.barChart = new Chart(this.barChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: top8.map(b => b.name),
          datasets: [
            { label: 'المبيعات', data: top8.map(b => b.sar), backgroundColor: 'rgba(201,168,76,.8)' },
            { label: 'المشتريات', data: top8.map(b => b.purch + b.mothan), backgroundColor: 'rgba(16,185,129,.6)' },
          ]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
      });
    }

    // Doughnut chart - by region
    this.doughnutChart?.destroy();
    const regionMap: Record<string, number> = {};
    for (const b of bs) regionMap[b.region] = (regionMap[b.region] || 0) + b.sar;
    const regions = Object.keys(regionMap);
    if (this.doughnutChartRef?.nativeElement && regions.length > 0) {
      this.doughnutChart = new Chart(this.doughnutChartRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels: regions,
          datasets: [{
            data: regions.map(r => regionMap[r]),
            backgroundColor: regions.map(r => this.ana.getRegionColor(r))
          }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    }
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
  fmtWt(n?: number): string { return (n ?? 0).toFixed(2); }
  fmtRate(n?: number): string { return (n ?? 0).toFixed(2); }
}
