import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { AuthService } from '../../../core/services/auth.service';
import { Chart, registerables } from 'chart.js';
import { fmtCompact } from '../../../core/chart-config';

Chart.register(...registerables);

@Component({
  selector: 'app-my-performance',
  standalone: true,
  imports: [CommonModule, DateFilterComponent],
  template: `
    <div class="page-header">
      <div>
        <h2>أدائي</h2>
        <p>مرحبًا {{ userName() }} — أداؤك خلال الفترة</p>
      </div>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (records().length === 0) {
      <div class="empty-state">
        <div class="empty-icon">📈</div>
        <p>لا توجد بيانات لأدائك في هذه الفترة</p>
      </div>
    } @else {
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-card--gold">
          <div class="kpi-label">إجمالي المبيعات</div>
          <div class="kpi-value">{{ fmt(totals().totalSar) }}</div>
          <div class="kpi-sub">ريال سعودي</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">إجمالي الوزن</div>
          <div class="kpi-value">{{ totals().totalWt?.toFixed(2) }}</div>
          <div class="kpi-sub">غرام</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">عدد الفواتير</div>
          <div class="kpi-value">{{ totals().invoiceCount }}</div>
          <div class="kpi-sub">فاتورة</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">متوسط سعر البيع</div>
          <div class="kpi-value">{{ totals().saleRate?.toFixed(2) }}</div>
          <div class="kpi-sub">ر.س/جم</div>
        </div>
        <div class="kpi-card" [class]="'kpi-card--' + ana.classifyEmployee(totals().saleRate).css">
          <div class="kpi-label">التصنيف</div>
          <div class="kpi-value kpi-value--sm">{{ ana.classifyEmployee(totals().saleRate).label }}</div>
        </div>
      </div>

      <!-- Chart -->
      <div class="card chart-card mb-4">
        <div class="card__header"><h3>المبيعات اليومية</h3></div>
        <canvas #lineChart style="max-height:260px"></canvas>
      </div>

      <!-- Records table -->
      <div class="card">
        <div class="card__header"><h3>سجل الأداء</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>التاريخ</th><th>الفرع</th><th>المبيعات</th><th>الوزن</th><th>الفواتير</th><th>س.بيع</th></tr>
            </thead>
            <tbody>
              @for (r of records(); track r.saleDate) {
                <tr>
                  <td>{{ r.saleDate }}</td>
                  <td>{{ r.branchName }}</td>
                  <td>{{ fmt(r.totalSarAmount) }}</td>
                  <td>{{ r.netWeight?.toFixed(2) }}</td>
                  <td>{{ r.invoiceCount }}</td>
                  <td>{{ r.saleRate?.toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [`
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-card { background: var(--mizan-surface); border: 1px solid var(--mizan-border); border-radius: 10px; padding: 1rem; }
    .kpi-card--gold { border-color: var(--mizan-gold); background: rgba(201,168,76,.08); }
    .kpi-card--badge-gold { border-color: var(--mizan-gold); }
    .kpi-card--badge-green { border-color: var(--mizan-green); }
    .kpi-card--badge-yellow { border-color: #f59e0b; }
    .kpi-card--badge-red { border-color: var(--mizan-danger); }
    .kpi-label { font-size: .75rem; color: var(--mizan-text-muted); margin-bottom: .3rem; }
    .kpi-value { font-size: 1.3rem; font-weight: 700; }
    .kpi-value--sm { font-size: 1rem; }
    .kpi-sub { font-size: .72rem; color: var(--mizan-text-muted); }
    .mb-4 { margin-bottom: 1.5rem; }
    .chart-card { padding: 1rem; }
    .table-wrap { overflow-x: auto; }
    .card__header { display: flex; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
  `]
})
export class MyPerformanceComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);
  private auth = inject(AuthService);

  @ViewChild('lineChart') lineRef!: ElementRef<HTMLCanvasElement>;

  records = signal<any[]>([]);
  loading = signal(false);

  private chart: Chart | null = null;
  private viewReady = false;

  userName = () => this.auth.currentUser?.fullName || 'الموظف';

  totals = () => {
    const rs = this.records();
    if (!rs.length) return { totalSar: 0, totalWt: 0, invoiceCount: 0, saleRate: 0 };
    const totalSar = rs.reduce((s, r) => s + (r.totalSarAmount || 0), 0);
    const totalWt = rs.reduce((s, r) => s + (r.netWeight || 0), 0);
    const invoiceCount = rs.reduce((s, r) => s + (r.invoiceCount || 0), 0);
    return { totalSar, totalWt, invoiceCount, saleRate: totalWt > 0 ? totalSar / totalWt : 0 };
  };

  ngOnInit(): void { this.load(); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.records().length > 0) setTimeout(() => this.buildChart(), 0);
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    const empId = this.auth.currentUser?.linkedEmployeeId;
    if (!empId) {
      this.loading.set(false);
      return;
    }
    this.svc.getEmployees(from, to).subscribe({
      next: r => {
        const all = r.data ?? [];
        // Filter to current employee
        const mine = all.filter((e: any) => e.employeeId === empId);
        this.records.set(mine);
        this.loading.set(false);
        if (this.viewReady) setTimeout(() => this.buildChart(), 0);
      },
      error: () => this.loading.set(false)
    });
  }

  private buildChart(): void {
    this.chart?.destroy();
    const rs = this.records();
    if (!rs.length || !this.lineRef?.nativeElement) return;
    this.chart = new Chart(this.lineRef.nativeElement, {
      type: 'line',
      data: {
        labels: rs.map(r => r.saleDate),
        datasets: [{
          label: 'المبيعات اليومية',
          data: rs.map(r => r.totalSarAmount || r.totalSar || 0),
          borderColor: '#c9a84c',
          backgroundColor: 'rgba(201,168,76,.15)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          datalabels: { display: false }
        },
        scales: {
          y: {
            ticks: { callback: (v: any) => fmtCompact(+v) }
          }
        }
      }
    });
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
}
