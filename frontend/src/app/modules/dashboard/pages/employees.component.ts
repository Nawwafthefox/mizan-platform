import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, DateFilterComponent],
  template: `
    <div class="page-header">
      <div><h2>الموظفون</h2><p>أداء الموظفين خلال الفترة</p></div>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    <div class="filter-bar">
      <input type="search" placeholder="بحث بالاسم..." [(ngModel)]="search" class="search-input">
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (employees().length === 0) {
      <div class="empty-state"><div class="empty-icon">👤</div><p>لا توجد بيانات للموظفين في هذه الفترة</p></div>
    } @else {
      <div class="card chart-card mb-4">
        <div class="card__header"><h3>أفضل الموظفين (مبيعات)</h3></div>
        <canvas #barChart style="max-height:280px"></canvas>
      </div>

      <div class="card">
        <div class="card__header"><h3>قائمة الموظفين ({{ filtered().length }})</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th><th>الاسم</th><th>رمز الموظف</th><th>الفرع</th><th>المنطقة</th>
                <th>المبيعات</th><th>الوزن</th><th>الفواتير</th><th>سعر البيع</th><th>التصنيف</th>
              </tr>
            </thead>
            <tbody>
              @for (e of filtered(); track e.employeeId; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td><strong>{{ e.employeeName }}</strong></td>
                  <td dir="ltr">{{ e.employeeId }}</td>
                  <td>{{ e.branchName }}</td>
                  <td>{{ e.region }}</td>
                  <td>{{ fmt(e.totalSar) }}</td>
                  <td>{{ e.totalWt?.toFixed(2) }}</td>
                  <td>{{ e.invoiceCount }}</td>
                  <td>{{ e.saleRate?.toFixed(2) }}</td>
                  <td>
                    <span class="badge" [class]="ana.classifyEmployee(e.saleRate).css">
                      {{ ana.classifyEmployee(e.saleRate).label }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [`
    .filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; }
    .search-input {
      padding: .4rem .75rem; border: 1px solid var(--mizan-border); border-radius: 6px;
      background: var(--mizan-surface); color: var(--mizan-text); font-size: .85rem;
      min-width: 220px;
    }
    .mb-4 { margin-bottom: 1.5rem; }
    .table-wrap { overflow-x: auto; }
    .card__header { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    .chart-card { padding: 1rem; }
    .badge { padding: .2rem .5rem; border-radius: 10px; font-size: .72rem; font-weight: 600; }
    .badge-gold { background: rgba(201,168,76,.2); color: #b8860b; }
    .badge-green { background: rgba(16,185,129,.2); color: #059669; }
    .badge-yellow { background: rgba(245,158,11,.2); color: #d97706; }
    .badge-red { background: rgba(220,53,69,.2); color: #dc3545; }
  `]
})
export class EmployeesComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);

  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;

  employees = signal<any[]>([]);
  loading = signal(false);
  search = '';

  private chart: Chart | null = null;
  private viewReady = false;

  filtered = () => {
    const s = this.search.toLowerCase();
    return this.employees().filter(e =>
      !s || e.employeeName?.toLowerCase().includes(s) || e.employeeId?.toLowerCase().includes(s)
    );
  };

  ngOnInit(): void { this.load(); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.employees().length > 0) setTimeout(() => this.buildChart(), 0);
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    this.svc.getEmployees(from, to).subscribe({
      next: r => {
        this.employees.set(r.data ?? []);
        this.loading.set(false);
        if (this.viewReady) setTimeout(() => this.buildChart(), 0);
      },
      error: () => this.loading.set(false)
    });
  }

  private buildChart(): void {
    this.chart?.destroy();
    const top10 = [...this.employees()].sort((a, b) => b.totalSar - a.totalSar).slice(0, 10);
    if (!top10.length || !this.barChartRef?.nativeElement) return;
    this.chart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: top10.map(e => e.employeeName),
        datasets: [{
          label: 'المبيعات (ريال)',
          data: top10.map(e => e.totalSar),
          backgroundColor: 'rgba(201,168,76,.8)'
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
}
