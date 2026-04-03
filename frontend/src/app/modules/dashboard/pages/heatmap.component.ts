import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { Chart, registerables } from 'chart.js';
import { fmtCompact, barDataLabels } from '../../../core/chart-config';

Chart.register(...registerables);

@Component({
  selector: 'app-heatmap',
  standalone: true,
  imports: [CommonModule, DateFilterComponent],
  template: `
    <div class="page-header">
      <div><h2>الخارطة الحرارية</h2><p>توزيع فرق المعدل بالفروع والمناطق</p></div>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (branches().length === 0) {
      <div class="empty-state"><div class="empty-icon">🌡</div><p>لا توجد بيانات</p></div>
    } @else {
      <div class="card chart-card mb-4">
        <div class="card__header"><h3>ترتيب الفروع بفرق المعدل</h3></div>
        <canvas #rankChart style="max-height:350px"></canvas>
      </div>

      <div class="card">
        <div class="card__header"><h3>جدول الخارطة الحرارية</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th><th>الفرع</th><th>المنطقة</th>
                <th>المبيعات</th><th>الصافي</th>
                <th>س.بيع</th><th>س.شراء</th><th>الفرق</th>
                <th>حالة الأداء</th>
              </tr>
            </thead>
            <tbody>
              @for (b of sorted(); track b.code; let i = $index) {
                <tr [class]="rowClass(b.diffRate)">
                  <td>{{ i + 1 }}</td>
                  <td><strong>{{ b.name }}</strong></td>
                  <td>
                    <span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>
                    {{ b.region }}
                  </td>
                  <td>{{ fmt(b.sar) }}</td>
                  <td [class]="ana.getDiffClass(b.net)">{{ fmt(b.net) }}</td>
                  <td>{{ b.saleRate?.toFixed(2) }}</td>
                  <td>{{ b.purchRate?.toFixed(2) }}</td>
                  <td>
                    <span class="diff-badge" [class]="diffBadgeClass(b.diffRate)">
                      {{ b.diffRate?.toFixed(2) }}
                    </span>
                  </td>
                  <td>{{ perfLabel(b.diffRate, b.purchRate) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [`
    .mb-4 { margin-bottom: 1.5rem; }
    .card__header { display: flex; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    .chart-card { padding: 1rem; }
    .table-wrap { overflow-x: auto; }
    .region-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
    .pos { color: var(--mizan-green); font-weight: 600; }
    .neg { color: var(--mizan-danger); font-weight: 600; }
    .row-critical { background: rgba(220,53,69,.06); }
    .row-warning { background: rgba(245,158,11,.04); }
    .row-good { background: rgba(16,185,129,.04); }
    .diff-badge { padding: .15rem .45rem; border-radius: 8px; font-size: .78rem; font-weight: 600; }
    .diff-badge.badge-green { background: rgba(16,185,129,.15); color: #059669; }
    .diff-badge.badge-yellow { background: rgba(245,158,11,.15); color: #d97706; }
    .diff-badge.badge-red { background: rgba(220,53,69,.15); color: #dc3545; }
  `]
})
export class HeatmapComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);

  @ViewChild('rankChart') rankChartRef!: ElementRef<HTMLCanvasElement>;

  branches = signal<any[]>([]);
  loading = signal(false);

  private chart: Chart | null = null;
  private viewReady = false;

  sorted = () => [...this.branches()].sort((a, b) => b.diffRate - a.diffRate);

  ngOnInit(): void { this.load(); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.branches().length > 0) setTimeout(() => this.buildChart(), 0);
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    this.svc.getBranches(from, to).subscribe({
      next: r => {
        this.branches.set(r.data ?? []);
        this.loading.set(false);
        if (this.viewReady) setTimeout(() => this.buildChart(), 0);
      },
      error: () => this.loading.set(false)
    });
  }

  private buildChart(): void {
    this.chart?.destroy();
    const bs = this.sorted().slice(0, 20);
    if (!bs.length || !this.rankChartRef?.nativeElement) return;
    this.chart = new Chart(this.rankChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: bs.map(b => b.name),
        datasets: [{
          label: 'فرق المعدل',
          data: bs.map(b => b.diffRate),
          backgroundColor: bs.map(b => {
            if (b.diffRate >= 10) return 'rgba(16,185,129,.8)';
            if (b.diffRate >= 0) return 'rgba(245,158,11,.8)';
            return 'rgba(220,53,69,.8)';
          }),
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        indexAxis: 'y' as const,
        plugins: {
          legend: { display: false },
          datalabels: barDataLabels(),
        },
        scales: {
          x: {
            ticks: { callback: (v: any) => fmtCompact(+v) }
          }
        }
      }
    });
  }

  rowClass(diff: number): string {
    if (diff < 0) return 'row-critical';
    if (diff < 5) return 'row-warning';
    return 'row-good';
  }

  diffBadgeClass(diff: number): string {
    if (diff >= 10) return 'badge-green';
    if (diff >= 0) return 'badge-yellow';
    return 'badge-red';
  }

  perfLabel(diff: number, purchRate: number): string {
    if (!purchRate) return 'لا يوجد سعر شراء';
    if (diff >= 10) return 'ممتاز';
    if (diff >= 5) return 'جيد';
    if (diff >= 0) return 'مقبول';
    return 'يحتاج مراجعة';
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
}
