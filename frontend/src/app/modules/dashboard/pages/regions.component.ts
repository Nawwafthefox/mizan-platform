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
  selector: 'app-regions',
  standalone: true,
  imports: [CommonModule, DateFilterComponent],
  template: `
    <div class="page-header">
      <div><h2>المناطق</h2><p>أداء المناطق مقارنةً</p></div>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (regions().length === 0) {
      <div class="empty-state"><div class="empty-icon">🗺</div><p>لا توجد بيانات</p></div>
    } @else {
      <div class="card chart-card mb-4">
        <div class="card__header"><h3>مقارنة المبيعات بالمناطق</h3></div>
        <canvas #barChart style="max-height:300px"></canvas>
      </div>

      <div class="regions-grid">
        @for (r of regions(); track r.region) {
          <div class="region-card" [style.border-color]="ana.getRegionColor(r.region)">
            <div class="region-header" [style.background]="ana.getRegionColor(r.region) + '22'">
              <span class="region-dot" [style.background]="ana.getRegionColor(r.region)"></span>
              <strong>{{ r.region }}</strong>
              <span class="branch-count">{{ r.branchCount }} فرع</span>
            </div>
            <div class="region-stats">
              <div class="stat"><span class="stat-label">المبيعات</span><span class="stat-val">{{ fmt(r.totalSar) }}</span></div>
              <div class="stat"><span class="stat-label">المشتريات</span><span class="stat-val">{{ fmt(r.totalPurch) }}</span></div>
              <div class="stat"><span class="stat-label">الصافي</span>
                <span class="stat-val" [class]="ana.getDiffClass(r.net)">{{ fmt(r.net) }}</span>
              </div>
              <div class="stat"><span class="stat-label">فرق المعدل</span>
                <span class="stat-val" [class]="ana.getDiffClass(r.diffRate)">{{ r.diffRate?.toFixed(2) }}</span>
              </div>
            </div>
            <div class="region-expand" (click)="toggleRegion(r.region)">
              {{ expandedRegion() === r.region ? 'إخفاء الفروع ▲' : 'عرض الفروع ▼' }}
            </div>
            @if (expandedRegion() === r.region) {
              <div class="branch-list">
                @for (b of r.branches; track b.code) {
                  <div class="branch-row">
                    <span class="branch-name">{{ b.name }}</span>
                    <span class="branch-sar">{{ fmt(b.sar) }}</span>
                    <span [class]="'branch-diff ' + ana.getDiffClass(b.diffRate)">{{ b.diffRate?.toFixed(2) }}</span>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .mb-4 { margin-bottom: 1.5rem; }
    .card__header { display: flex; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    .chart-card { padding: 1rem; }
    .regions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .region-card { background: var(--mizan-surface); border: 1px solid var(--mizan-border); border-radius: 10px; overflow: hidden; }
    .region-header { display: flex; align-items: center; gap: .5rem; padding: .75rem 1rem; font-size: .9rem; }
    .region-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .branch-count { margin-right: auto; font-size: .75rem; color: var(--mizan-text-muted); }
    .region-stats { padding: .75rem 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    .stat { display: flex; flex-direction: column; gap: .15rem; }
    .stat-label { font-size: .7rem; color: var(--mizan-text-muted); }
    .stat-val { font-size: .88rem; font-weight: 600; }
    .pos { color: var(--mizan-green); }
    .neg { color: var(--mizan-danger); }
    .region-expand { padding: .5rem 1rem; font-size: .78rem; color: var(--mizan-gold); cursor: pointer; border-top: 1px solid var(--mizan-border); }
    .region-expand:hover { background: rgba(201,168,76,.05); }
    .branch-list { border-top: 1px solid var(--mizan-border); }
    .branch-row { display: flex; align-items: center; gap: .5rem; padding: .4rem 1rem; font-size: .82rem; border-bottom: 1px solid var(--mizan-border); }
    .branch-row:last-child { border-bottom: none; }
    .branch-name { flex: 1; }
    .branch-sar { color: var(--mizan-text-muted); font-size: .78rem; }
    .branch-diff { font-weight: 600; font-size: .8rem; }
  `]
})
export class RegionsComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);

  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;

  regions = signal<any[]>([]);
  loading = signal(false);
  expandedRegion = signal<string | null>(null);

  private chart: Chart | null = null;
  private viewReady = false;

  ngOnInit(): void { this.load(); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.regions().length > 0) setTimeout(() => this.buildChart(), 0);
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    this.svc.getRegions(from, to).subscribe({
      next: r => {
        this.regions.set(r.data ?? []);
        this.loading.set(false);
        if (this.viewReady) setTimeout(() => this.buildChart(), 0);
      },
      error: () => this.loading.set(false)
    });
  }

  toggleRegion(region: string): void {
    this.expandedRegion.set(this.expandedRegion() === region ? null : region);
  }

  private buildChart(): void {
    this.chart?.destroy();
    const rs = this.regions();
    if (!rs.length || !this.barChartRef?.nativeElement) return;
    this.chart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: rs.map(r => r.region),
        datasets: [
          { label: 'المبيعات', data: rs.map(r => r.totalSar), backgroundColor: rs.map(r => this.ana.getRegionColor(r.region)), borderRadius: 4, barPercentage: 0.72, categoryPercentage: 0.85 },
          { label: 'المشتريات', data: rs.map(r => r.totalPurch), backgroundColor: 'rgba(16,185,129,.4)', borderRadius: 4, barPercentage: 0.72, categoryPercentage: 0.85 },
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          datalabels: barDataLabels(),
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
