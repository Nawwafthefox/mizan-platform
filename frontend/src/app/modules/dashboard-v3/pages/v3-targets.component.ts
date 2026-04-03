import {
  Component, inject, signal, effect, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';

type TargetStatus = 'exceeded' | 'onTrack' | 'behind';

@Component({
  selector: 'app-v3-targets',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; }

    .page-header { margin-bottom: 1.5rem; }
    .page-title { font-size: 1.4rem; font-weight: 700; color: var(--mizan-gold); margin: 0 0 0.25rem 0; }
    .page-subtitle { font-size: 0.85rem; color: var(--mizan-text-muted); }

    /* Summary KPI row */
    .summary-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;
    }
    .summary-card {
      border-radius: 12px; padding: 1.25rem 1.5rem; text-align: center;
      border: 1px solid var(--mizan-border);
    }
    .summary-card.exceeded { background: rgba(201,168,76,0.08); border-color: rgba(201,168,76,0.3); }
    .summary-card.onTrack  { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.3); }
    .summary-card.behind   { background: rgba(239,68,68,0.08);  border-color: rgba(239,68,68,0.25); }
    .summary-icon { font-size: 1.6rem; margin-bottom: 0.35rem; }
    .summary-value { font-size: 2rem; font-weight: 800; line-height: 1; margin-bottom: 0.25rem; }
    .summary-card.exceeded .summary-value { color: var(--mizan-gold); }
    .summary-card.onTrack  .summary-value { color: #3b82f6; }
    .summary-card.behind   .summary-value { color: var(--mizan-danger); }
    .summary-label { font-size: 0.8rem; color: var(--mizan-text-muted); }

    /* Filter buttons */
    .filter-bar {
      display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; align-items: center;
    }
    .filter-btn {
      padding: 0.35rem 1rem;
      border-radius: 20px; border: 1px solid var(--mizan-border);
      background: var(--mizan-surface); color: var(--mizan-text-muted);
      font-size: 0.82rem; cursor: pointer; transition: all 0.2s;
    }
    .filter-btn:hover { border-color: var(--mizan-gold); color: var(--mizan-gold); }
    .filter-btn.active { border-color: var(--mizan-gold); background: rgba(201,168,76,0.1); color: var(--mizan-gold); font-weight: 600; }

    /* Target cards grid */
    .cards-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;
    }
    .target-card {
      background: var(--mizan-surface); border: 1px solid var(--mizan-border);
      border-radius: 12px; padding: 1.25rem; transition: transform 0.15s;
    }
    .target-card:hover { transform: translateY(-2px); }

    .card-header {
      display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1rem;
    }
    .branch-info {}
    .branch-name { font-weight: 700; color: var(--mizan-text); font-size: 0.95rem; }
    .branch-region {
      font-size: 0.75rem; color: var(--mizan-text-muted);
      background: rgba(255,255,255,0.06); border-radius: 5px;
      padding: 0.1rem 0.4rem; display: inline-block; margin-top: 0.2rem;
    }
    .status-badge {
      font-size: 0.73rem; font-weight: 700;
      padding: 0.25rem 0.65rem; border-radius: 20px;
      white-space: nowrap;
    }
    .status-exceeded { background: rgba(201,168,76,0.15); color: var(--mizan-gold); border: 1px solid rgba(201,168,76,0.3); }
    .status-onTrack  { background: rgba(59,130,246,0.12);  color: #3b82f6;           border: 1px solid rgba(59,130,246,0.3); }
    .status-behind   { background: rgba(239,68,68,0.1);    color: var(--mizan-danger);border: 1px solid rgba(239,68,68,0.3); }

    /* Achievement percentage */
    .achieve-row { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 0.75rem; }
    .achieve-pct {
      font-size: 2.2rem; font-weight: 800; line-height: 1;
    }
    .achieve-pct.exceeded { color: var(--mizan-gold); }
    .achieve-pct.onTrack  { color: #3b82f6; }
    .achieve-pct.behind   { color: var(--mizan-danger); }
    .achieve-sub { font-size: 0.75rem; color: var(--mizan-text-muted); text-align: left; }

    /* Progress bar */
    .progress-wrap { margin-bottom: 0.85rem; }
    .progress-meta {
      display: flex; justify-content: space-between; font-size: 0.75rem;
      color: var(--mizan-text-muted); margin-bottom: 0.35rem;
    }
    .progress-track {
      height: 7px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden;
    }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
    .fill-exceeded { background: linear-gradient(90deg, var(--mizan-gold), #f0e68c); }
    .fill-onTrack  { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
    .fill-behind   { background: linear-gradient(90deg, var(--mizan-danger), #f87171); }

    /* Profit section */
    .profit-row {
      display: flex; gap: 0.5rem; border-top: 1px solid var(--mizan-border);
      padding-top: 0.85rem; margin-top: 0.25rem;
    }
    .profit-half { flex: 1; }
    .profit-label { font-size: 0.7rem; color: var(--mizan-text-muted); margin-bottom: 0.15rem; }
    .profit-value { font-size: 0.95rem; font-weight: 700; color: var(--mizan-text); font-variant-numeric: tabular-nums; }
    .profit-value.actual { color: var(--mizan-gold); }
    .profit-pct-badge {
      font-size: 0.7rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 8px;
      margin-right: 0.25rem;
    }
    .pct-pos { background: rgba(34,197,94,0.12); color: var(--mizan-green); }
    .pct-neg { background: rgba(239,68,68,0.1);  color: var(--mizan-danger); }

    .state-box { padding: 3rem; text-align: center; color: var(--mizan-text-muted); }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid rgba(201,168,76,0.2); border-top-color: var(--mizan-gold);
      border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-box {
      background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
      color: #ef4444; border-radius: 10px; padding: 1rem 1.5rem; margin-bottom: 1rem; font-size: 0.9rem;
    }
    .no-results { text-align: center; padding: 3rem; color: var(--mizan-text-muted); }
  `],
  template: `
    <div class="page-header">
      <h2 class="page-title">تحقيق الأهداف</h2>
      <p class="page-subtitle">مدى تحقيق الفروع للأهداف المحددة</p>
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="state-box"><div class="spinner"></div><div>جاري التحميل...</div></div>
    } @else if (allData().length > 0) {

      <!-- Summary KPIs -->
      <div class="summary-grid">
        <div class="summary-card exceeded">
          <div class="summary-icon">⭐</div>
          <div class="summary-value">{{ countOf('exceeded') }}</div>
          <div class="summary-label">تجاوزت الهدف</div>
        </div>
        <div class="summary-card onTrack">
          <div class="summary-icon">✅</div>
          <div class="summary-value">{{ countOf('onTrack') }}</div>
          <div class="summary-label">على المسار</div>
        </div>
        <div class="summary-card behind">
          <div class="summary-icon">⚠️</div>
          <div class="summary-value">{{ countOf('behind') }}</div>
          <div class="summary-label">متأخرة</div>
        </div>
      </div>

      <!-- Filter buttons -->
      <div class="filter-bar">
        <button class="filter-btn" [class.active]="filterStatus() === null" (click)="setFilter(null)">
          الكل ({{ allData().length }})
        </button>
        <button class="filter-btn" [class.active]="filterStatus() === 'exceeded'" (click)="setFilter('exceeded')">
          ⭐ تجاوزت ({{ countOf('exceeded') }})
        </button>
        <button class="filter-btn" [class.active]="filterStatus() === 'onTrack'" (click)="setFilter('onTrack')">
          ✅ على المسار ({{ countOf('onTrack') }})
        </button>
        <button class="filter-btn" [class.active]="filterStatus() === 'behind'" (click)="setFilter('behind')">
          ⚠️ متأخرة ({{ countOf('behind') }})
        </button>
      </div>

      <!-- Cards Grid -->
      <div class="cards-grid">
        @for (item of filtered(); track item.branchCode) {
          <div class="target-card">
            <div class="card-header">
              <div class="branch-info">
                <div class="branch-name">{{ item.branchName }}</div>
                <span class="branch-region">{{ item.region }}</span>
              </div>
              <span class="status-badge" [ngClass]="'status-' + item.status">
                {{ statusLabel(item.status) }}
              </span>
            </div>

            <div class="achieve-row">
              <div class="achieve-pct" [ngClass]="item.status">{{ item.achievePct }}%</div>
              <div class="achieve-sub">
                <div>{{ fmtRate(item.actualWt) }} / {{ fmtRate(item.targetWt) }} جرام</div>
                <div style="color:var(--mizan-text-muted)">الفعلي / الهدف</div>
              </div>
            </div>

            <div class="progress-wrap">
              <div class="progress-meta">
                <span>الوزن: {{ fmtRate(item.actualWt) }}ج</span>
                <span>الهدف: {{ fmtRate(item.targetWt) }}ج</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" [ngClass]="'fill-' + item.status"
                     [style.width.%]="progressWidth(item)">
                </div>
              </div>
            </div>

            <div class="profit-row">
              <div class="profit-half">
                <div class="profit-label">الربح الفعلي</div>
                <div class="profit-value actual">
                  {{ fmt(item.actualProfit) }} ر.س
                  @if (item.profitPct > 0) {
                    <span class="profit-pct-badge pct-pos">+{{ item.profitPct?.toFixed(1) }}%</span>
                  } @else if (item.profitPct < 0) {
                    <span class="profit-pct-badge pct-neg">{{ item.profitPct?.toFixed(1) }}%</span>
                  }
                </div>
              </div>
              <div class="profit-half">
                <div class="profit-label">الربح المستهدف</div>
                <div class="profit-value">{{ fmt(item.targetProfit) }} ر.س</div>
              </div>
            </div>
          </div>
        } @empty {
          <div class="no-results" style="grid-column:1/-1">لا توجد نتائج للفلتر المحدد</div>
        }
      </div>
    }
  `
})
export class V3TargetsComponent {
  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);

  loading      = signal(true);
  error        = signal<string | null>(null);
  allData      = signal<any[]>([]);
  filterStatus = signal<TargetStatus | null>(null);

  filtered = computed(() => {
    const f = this.filterStatus();
    if (!f) return this.allData();
    return this.allData().filter(d => d.status === f);
  });

  constructor() {
    effect(() => {
      const from = this.dateRange.from();
      const to   = this.dateRange.to();
      if (from && to) this.load(from, to);
    });
  }

  private load(from: string, to: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getTargets(from, to).subscribe({
      next: (data) => {
        this.allData.set(data ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set('تعذّر تحميل بيانات الأهداف: ' + (e?.message ?? ''));
        this.loading.set(false);
      }
    });
  }

  setFilter(s: TargetStatus | null): void {
    this.filterStatus.set(s);
  }

  countOf(s: TargetStatus): number {
    return this.allData().filter(d => d.status === s).length;
  }

  statusLabel(s: TargetStatus): string {
    if (s === 'exceeded') return '⭐ تجاوزت الهدف';
    if (s === 'onTrack')  return '✅ على المسار';
    return '⚠️ متأخرة';
  }

  progressWidth(item: any): number {
    const pct = item.achievePct ?? 0;
    return Math.min(pct, 100);
  }

  fmt(n: number | null | undefined): string {
    return n?.toLocaleString('ar', { maximumFractionDigits: 0 }) ?? '0';
  }
  fmtRate(n: number | null | undefined): string {
    return (n ?? 0).toFixed(1);
  }
}
