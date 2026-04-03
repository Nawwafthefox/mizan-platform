import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../core/services/dashboard.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { fmtCompact, barDataLabels, pieDataLabels } from '../../../core/chart-config';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-karat',
  standalone: true,
  imports: [CommonModule, DateFilterComponent],
  template: `
    <div class="page-header">
      <div><h2>عيارات الذهب</h2><p>توزيع المبيعات حسب العيار</p></div>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (!karat()) {
      <div class="empty-state"><div class="empty-icon">💎</div><p>لا توجد بيانات</p></div>
    } @else {
      <div class="kpi-grid">
        @for (k of karatList(); track k.label) {
          <div class="kpi-card" [style.border-color]="k.color">
            <div class="kpi-label">{{ k.label }}</div>
            <div class="kpi-value">{{ fmt(k.sar) }} ر.س</div>
            <div class="kpi-sub">{{ k.wt?.toFixed(2) }} جم | {{ k.rate?.toFixed(2) }} ر.س/جم</div>
            <div class="kpi-bar">
              <div class="kpi-bar-fill" [style.width]="k.pct + '%'" [style.background]="k.color"></div>
            </div>
          </div>
        }
      </div>

      @if (byBranch().length > 0) {
        <div class="charts-row">
          <div class="card chart-card">
            <div class="card__header"><h3>توزيع الوزن بالعيار</h3></div>
            <canvas #doughnutChart style="max-height:280px"></canvas>
          </div>
          <div class="card chart-card">
            <div class="card__header"><h3>المبيعات بالعيار والفرع</h3></div>
            <canvas #barChart style="max-height:280px"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="card__header"><h3>تفصيل العيارات بالفروع</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>الفرع</th><th>المنطقة</th>
                  <th>18 (ريال)</th><th>18 (جم)</th>
                  <th>21 (ريال)</th><th>21 (جم)</th>
                  <th>22 (ريال)</th><th>22 (جم)</th>
                  <th>24 (ريال)</th><th>24 (جم)</th>
                </tr>
              </thead>
              <tbody>
                @for (b of byBranch(); track b.branchCode) {
                  <tr>
                    <td>{{ b.branchName }}</td>
                    <td>{{ b.region }}</td>
                    <td>{{ fmt(b.k18Sar) }}</td><td>{{ b.k18Wt?.toFixed(2) }}</td>
                    <td>{{ fmt(b.k21Sar) }}</td><td>{{ b.k21Wt?.toFixed(2) }}</td>
                    <td>{{ fmt(b.k22Sar) }}</td><td>{{ b.k22Wt?.toFixed(2) }}</td>
                    <td>{{ fmt(b.k24Sar) }}</td><td>{{ b.k24Wt?.toFixed(2) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-card { background: var(--mizan-surface); border: 1px solid var(--mizan-border); border-radius: 10px; padding: 1rem; }
    .kpi-label { font-size: .8rem; color: var(--mizan-text-muted); margin-bottom: .3rem; }
    .kpi-value { font-size: 1.2rem; font-weight: 700; }
    .kpi-sub { font-size: .72rem; color: var(--mizan-text-muted); margin-top: .25rem; }
    .kpi-bar { height: 4px; background: var(--mizan-border); border-radius: 2px; margin-top: .5rem; }
    .kpi-bar-fill { height: 100%; border-radius: 2px; transition: width .3s; }
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    @media(max-width:800px) { .charts-row { grid-template-columns: 1fr; } }
    .chart-card { padding: 1rem; }
    .table-wrap { overflow-x: auto; }
    .card__header { display: flex; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
  `]
})
export class KaratComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  private dr = inject(DateRangeService);

  @ViewChild('doughnutChart') doughnutRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChart') barRef!: ElementRef<HTMLCanvasElement>;

  karat = signal<any>(null);
  loading = signal(false);

  private doughnutChart: Chart | null = null;
  private barChart: Chart | null = null;
  private viewReady = false;

  karatList = () => {
    const k = this.karat();
    if (!k) return [];
    const totalSar = (k.k18?.sar || 0) + (k.k21?.sar || 0) + (k.k22?.sar || 0) + (k.k24?.sar || 0);
    const make = (label: string, d: any, color: string) => ({
      label, sar: d?.sar || 0, wt: d?.wt || 0, rate: d?.rate || 0,
      color, pct: totalSar > 0 ? ((d?.sar || 0) / totalSar * 100) : 0
    });
    return [
      make('عيار 18', k.k18, '#94a3b8'),
      make('عيار 21', k.k21, '#c9a84c'),
      make('عيار 22', k.k22, '#f59e0b'),
      make('عيار 24', k.k24, '#10b981'),
    ];
  };

  byBranch = () => (this.karat()?.byBranch || []) as any[];

  ngOnInit(): void { this.load(); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.karat()) setTimeout(() => this.buildCharts(), 0);
  }

  ngOnDestroy(): void {
    this.doughnutChart?.destroy();
    this.barChart?.destroy();
  }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    this.svc.getKarat(from, to).subscribe({
      next: r => {
        this.karat.set(r.data ?? null);
        this.loading.set(false);
        if (this.viewReady) setTimeout(() => this.buildCharts(), 0);
      },
      error: () => this.loading.set(false)
    });
  }

  private buildCharts(): void {
    const k = this.karat();
    if (!k) return;

    this.doughnutChart?.destroy();
    if (this.doughnutRef?.nativeElement) {
      const list = this.karatList().filter(x => x.wt > 0);
      if (list.length > 0) {
        this.doughnutChart = new Chart(this.doughnutRef.nativeElement, {
          type: 'doughnut',
          data: {
            labels: list.map(x => x.label),
            datasets: [{ data: list.map(x => x.wt), backgroundColor: list.map(x => x.color), hoverOffset: 8 }]
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

    this.barChart?.destroy();
    const bs = this.byBranch().slice(0, 8);
    if (bs.length > 0 && this.barRef?.nativeElement) {
      this.barChart = new Chart(this.barRef.nativeElement, {
        type: 'bar',
        data: {
          labels: bs.map((b: any) => b.branchName),
          datasets: [
            { label: 'عيار 18', data: bs.map((b: any) => b.k18Sar), backgroundColor: '#94a3b8', borderRadius: 4 },
            { label: 'عيار 21', data: bs.map((b: any) => b.k21Sar), backgroundColor: '#c9a84c', borderRadius: 4 },
            { label: 'عيار 22', data: bs.map((b: any) => b.k22Sar), backgroundColor: '#f59e0b', borderRadius: 4 },
            { label: 'عيار 24', data: bs.map((b: any) => b.k24Sar), backgroundColor: '#10b981', borderRadius: 4 },
          ]
        },
        options: {
          responsive: true,
          barPercentage: 0.72,
          categoryPercentage: 0.85,
          plugins: {
            legend: { position: 'top' },
            datalabels: barDataLabels()
          },
          scales: {
            x: { stacked: true },
            y: { stacked: true, ticks: { callback: (v: any) => fmtCompact(+v) } }
          }
        }
      });
    }
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
}
