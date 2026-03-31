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
  selector: 'app-branches',
  standalone: true,
  imports: [CommonModule, FormsModule, DateFilterComponent],
  template: `
    <div class="page-header">
      <div><h2>الفروع</h2><p>تفاصيل أداء الفروع</p></div>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    <div class="filter-bar">
      <input type="search" placeholder="بحث بالفرع..." [(ngModel)]="search" class="search-input">
      <select [(ngModel)]="regionFilter" (ngModelChange)="load()" class="region-select">
        <option value="">كل المناطق</option>
        @for (r of regions(); track r) {
          <option [value]="r">{{ r }}</option>
        }
      </select>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (filtered().length === 0) {
      <div class="empty-state"><div class="empty-icon">🏪</div><p>لا توجد بيانات</p></div>
    } @else {
      <div class="card chart-card" style="margin-bottom:1.5rem">
        <div class="card__header"><h3>فرق المعدل بالفروع</h3></div>
        <canvas #diffChart style="max-height:280px"></canvas>
      </div>

      <div class="card">
        <div class="card__header">
          <h3>قائمة الفروع ({{ filtered().length }})</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>الفرع</th><th>المنطقة</th>
                <th>المبيعات</th><th>الوزن</th><th>الفواتير</th>
                <th>المشتريات</th><th>الصافي</th>
                <th>س.بيع</th><th>س.شراء</th><th>الفرق</th>
              </tr>
            </thead>
            <tbody>
              @for (b of filtered(); track b.code) {
                <tr>
                  <td><strong>{{ b.name }}</strong></td>
                  <td><span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>{{ b.region }}</td>
                  <td>{{ fmt(b.sar) }}</td>
                  <td>{{ b.wn?.toFixed(2) }}</td>
                  <td>{{ b.pcs }}</td>
                  <td>{{ fmt(b.purch + b.mothan) }}</td>
                  <td [class]="ana.getDiffClass(b.net)">{{ fmt(b.net) }}</td>
                  <td>{{ b.saleRate?.toFixed(2) }}</td>
                  <td>{{ b.purchRate?.toFixed(2) }}</td>
                  <td [class]="ana.getDiffClass(b.diffRate)">{{ b.diffRate?.toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [`
    .filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .search-input, .region-select {
      padding: .4rem .75rem; border: 1px solid var(--mizan-border); border-radius: 6px;
      background: var(--mizan-surface); color: var(--mizan-text); font-size: .85rem;
    }
    .search-input { flex: 1; min-width: 180px; }
    .region-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
    .pos, .text-success { color: var(--mizan-green); font-weight: 600; }
    .neg, .text-danger { color: var(--mizan-danger); font-weight: 600; }
    .table-wrap { overflow-x: auto; }
    .card__header { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    .chart-card { padding: 1rem; }
  `]
})
export class BranchesComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);

  @ViewChild('diffChart') diffChartRef!: ElementRef<HTMLCanvasElement>;

  branches = signal<any[]>([]);
  regions = signal<string[]>([]);
  loading = signal(false);
  search = '';
  regionFilter = '';

  private chart: Chart | null = null;
  private viewReady = false;

  filtered = () => {
    const s = this.search.toLowerCase();
    return this.branches().filter(b =>
      !s || b.name?.toLowerCase().includes(s) || b.code?.toLowerCase().includes(s)
    );
  };

  ngOnInit(): void { this.load(); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.branches().length > 0) setTimeout(() => this.buildChart(), 0);
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    this.svc.getBranches(from, to, this.regionFilter || undefined).subscribe({
      next: r => {
        const data = r.data ?? [];
        this.branches.set(data);
        const rs = [...new Set(data.map((b: any) => b.region as string))].filter(Boolean);
        this.regions.set(rs);
        this.loading.set(false);
        if (this.viewReady) setTimeout(() => this.buildChart(), 0);
      },
      error: () => this.loading.set(false)
    });
  }

  private buildChart(): void {
    this.chart?.destroy();
    const bs = [...this.branches()].sort((a, b) => b.diffRate - a.diffRate).slice(0, 15);
    if (!bs.length || !this.diffChartRef?.nativeElement) return;
    this.chart = new Chart(this.diffChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: bs.map(b => b.name),
        datasets: [{
          label: 'فرق المعدل',
          data: bs.map(b => b.diffRate),
          backgroundColor: bs.map(b => b.diffRate >= 0 ? 'rgba(16,185,129,.7)' : 'rgba(220,53,69,.7)')
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
}
