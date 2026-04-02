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

Chart.register(...registerables);

@Component({
  selector: 'app-v3-regions',
  standalone: true,
  imports: [CommonModule, V3KpiCardComponent],
  template: `
    <div class="regions-root" dir="rtl">

      <!-- Error -->
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <!-- Region Cards Grid -->
      @if (loading()) {
        <div class="cards-grid">
          @for (_ of skeletons; track $index) {
            <div class="region-card skeleton-card">
              <div class="skeleton sk-title"></div>
              <div class="skeleton sk-badge"></div>
              <div class="skeleton sk-big"></div>
              <div class="skeleton sk-line"></div>
              <div class="skeleton sk-line short"></div>
            </div>
          }
        </div>
      } @else {
        <div class="cards-grid">
          @for (r of regions(); track r.region) {
            <div class="region-card" [class.expanded]="expanded().has(r.region)">
              <div class="card-header">
                <div class="region-name">{{ r.region }}</div>
                <span class="branch-badge">{{ r.branchCount }} فرع</span>
              </div>
              <div class="card-sales">{{ fmt(r.totalSar) }} <span class="sar-label">ريال</span></div>
              <div class="card-row">
                <span class="muted-label">المشتريات</span>
                <span class="val">{{ fmt(r.totalPurch) }}</span>
              </div>
              <div class="card-row">
                <span class="muted-label">الصافي</span>
                <span class="val" [class.pos]="r.net >= 0" [class.neg]="r.net < 0">{{ fmt(r.net) }}</span>
              </div>
              <div class="card-row">
                <span class="muted-label">الوزن</span>
                <span class="val">{{ fmt(r.totalWeight) }} غ</span>
              </div>
              <div class="diff-row">
                <span class="diff-label">فرق المعدل</span>
                <span class="diff-val" [class.pos]="r.diffRate > 0" [class.neg]="r.diffRate < 0">
                  {{ fmtRate(r.diffRate) }}
                </span>
                <span class="rate-detail">بيع {{ fmtRate(r.saleRate) }} / شراء {{ fmtRate(r.purchRate) }}</span>
              </div>
              <button class="expand-btn" (click)="toggleRegion(r.region)">
                {{ expanded().has(r.region) ? 'إخفاء الفروع ▲' : 'عرض الفروع ▼' }}
              </button>
              @if (expanded().has(r.region) && r.branches?.length) {
                <div class="branch-list">
                  @for (b of r.branches; track b.branchCode) {
                    <div class="branch-row">
                      <span class="branch-name">{{ b.branchName }}</span>
                      <span class="branch-sal">{{ fmt(b.totalSar) }}</span>
                      <span class="branch-net" [class.pos]="b.net >= 0" [class.neg]="b.net < 0">
                        {{ fmt(b.net) }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Comparison Chart -->
      <div class="chart-card">
        <div class="chart-title">مقارنة المناطق: المبيعات مقابل المشتريات</div>
        @if (loading()) {
          <div class="skeleton-block" style="height:300px"></div>
        } @else {
          <div class="chart-wrap">
            <canvas #comparisonCanvas></canvas>
          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    .regions-root {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      color: var(--mizan-text);
    }

    .error-banner {
      background: rgba(239,68,68,.12);
      border: 1px solid rgba(239,68,68,.4);
      color: #ef4444;
      border-radius: 8px;
      padding: .75rem 1rem;
      font-size: .9rem;
    }

    /* Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }
    @media (max-width: 1000px) { .cards-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px)  { .cards-grid { grid-template-columns: 1fr; } }

    .region-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1.1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: .5rem;
      transition: border-color .2s ease, box-shadow .2s ease;
    }
    .region-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.25); }
    .region-card.expanded { border-color: rgba(201,168,76,.4); }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .region-name {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--mizan-gold);
    }
    .branch-badge {
      font-size: .75rem;
      background: rgba(201,168,76,.15);
      color: var(--mizan-gold);
      border-radius: 20px;
      padding: .2rem .6rem;
    }
    .card-sales {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--mizan-text);
      font-variant-numeric: tabular-nums;
    }
    .sar-label { font-size: .85rem; color: var(--mizan-text-muted); font-weight: 400; }

    .card-row {
      display: flex;
      justify-content: space-between;
      font-size: .83rem;
    }
    .muted-label { color: var(--mizan-text-muted); }
    .val { font-variant-numeric: tabular-nums; color: var(--mizan-text); }
    .pos { color: var(--mizan-green); }
    .neg { color: var(--mizan-danger); }

    .diff-row {
      display: flex;
      align-items: center;
      gap: .5rem;
      flex-wrap: wrap;
      font-size: .82rem;
      margin-top: .2rem;
    }
    .diff-label { color: var(--mizan-text-muted); }
    .diff-val   { font-weight: 700; font-size: 1rem; font-variant-numeric: tabular-nums; }
    .rate-detail { color: var(--mizan-text-muted); font-size: .75rem; }

    .expand-btn {
      background: rgba(201,168,76,.1);
      border: 1px solid rgba(201,168,76,.25);
      color: var(--mizan-gold);
      border-radius: 8px;
      padding: .35rem .75rem;
      font-size: .8rem;
      cursor: pointer;
      transition: background .15s ease;
      margin-top: .25rem;
    }
    .expand-btn:hover { background: rgba(201,168,76,.2); }

    .branch-list {
      display: flex;
      flex-direction: column;
      gap: .3rem;
      margin-top: .25rem;
      border-top: 1px solid var(--mizan-border);
      padding-top: .5rem;
    }
    .branch-row {
      display: flex;
      justify-content: space-between;
      font-size: .8rem;
      padding: .25rem .35rem;
      border-radius: 6px;
      gap: .5rem;
    }
    .branch-row:hover { background: rgba(255,255,255,.04); }
    .branch-name { color: var(--mizan-text); flex: 1; }
    .branch-sal  { color: var(--mizan-text-muted); font-variant-numeric: tabular-nums; }
    .branch-net  { font-variant-numeric: tabular-nums; min-width: 70px; text-align: left; }

    /* Skeleton */
    .skeleton-card {
      min-height: 220px;
    }
    .skeleton {
      background: linear-gradient(90deg, var(--mizan-border) 25%, rgba(255,255,255,.05) 50%, var(--mizan-border) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 6px;
    }
    .sk-title { height: 1rem; width: 50%; }
    .sk-badge { height: .7rem; width: 30%; }
    .sk-big   { height: 1.8rem; width: 70%; }
    .sk-line  { height: .7rem; width: 80%; }
    .sk-line.short { width: 55%; }

    /* Chart */
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
    .chart-wrap { position: relative; height: 300px; }
    .chart-wrap canvas { width: 100% !important; height: 100% !important; }
    .skeleton-block {
      background: linear-gradient(90deg, var(--mizan-border) 25%, rgba(255,255,255,.04) 50%, var(--mizan-border) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 8px;
    }

    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class V3RegionsComponent implements OnDestroy {
  @ViewChild('comparisonCanvas') comparisonCanvas!: ElementRef<HTMLCanvasElement>;

  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);

  loading  = signal(true);
  error    = signal<string | null>(null);
  regions  = signal<any[]>([]);
  expanded = signal<Set<string>>(new Set());

  skeletons = Array(6).fill(null);

  private compChart: Chart | null = null;

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
    this.compChart?.destroy();
    this.compChart = null;

    this.svc.getRegions(from, to).subscribe({
      next: (regions) => {
        this.regions.set(regions ?? []);
        this.expanded.set(new Set());
        this.loading.set(false);
        setTimeout(() => this.buildCompChart(regions ?? []), 50);
      },
      error: (err) => {
        this.error.set('فشل تحميل بيانات المناطق: ' + (err?.message ?? 'خطأ'));
        this.loading.set(false);
      }
    });
  }

  toggleRegion(region: string): void {
    const s = new Set(this.expanded());
    if (s.has(region)) {
      s.delete(region);
    } else {
      s.add(region);
    }
    this.expanded.set(s);
  }

  private buildCompChart(regions: any[]): void {
    const el = this.comparisonCanvas?.nativeElement;
    if (!el) return;
    this.compChart?.destroy();
    this.compChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: regions.map(r => r.region),
        datasets: [
          {
            label: 'المبيعات',
            data: regions.map(r => r.totalSar ?? 0),
            backgroundColor: 'rgba(201,168,76,.75)',
            borderColor: '#c9a84c',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'المشتريات',
            data: regions.map(r => r.totalPurch ?? 0),
            backgroundColor: 'rgba(20,184,166,.6)',
            borderColor: '#14b8a6',
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: 'rgba(255,255,255,.75)', font: { size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.dataset.label + ': ' + Number(ctx.raw).toLocaleString('ar') + ' ريال'
            }
          }
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
              callback: (v) => Number(v).toLocaleString('ar')
            },
            grid: { color: 'rgba(255,255,255,.08)' }
          }
        }
      }
    });
  }

  fmt(n: number): string {
    return n.toLocaleString('ar', { maximumFractionDigits: 0 });
  }

  fmtRate(n: number): string {
    return n.toFixed(1);
  }

  ngOnDestroy(): void {
    this.compChart?.destroy();
  }
}
