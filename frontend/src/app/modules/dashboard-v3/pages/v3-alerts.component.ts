import {
  Component, inject, signal, effect, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';

type Severity = 'critical' | 'warning' | 'info';
type AlertType = 'NEGATIVE_RATE' | 'NO_PURCHASES' | 'RETURNS' | 'CONSECUTIVE_RETURNS';

@Component({
  selector: 'app-v3-alerts',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; }

    .page-header { margin-bottom: 1.5rem; }
    .page-title { font-size: 1.4rem; font-weight: 700; color: var(--mizan-gold); margin: 0 0 0.25rem 0; }
    .page-subtitle { font-size: 0.85rem; color: var(--mizan-text-muted); }

    /* Summary KPI row */
    .summary-row {
      display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem;
    }
    .summary-chip {
      flex: 1; min-width: 150px;
      display: flex; align-items: center; gap: 0.75rem;
      border-radius: 12px; padding: 1rem 1.25rem;
      border: 1px solid var(--mizan-border);
    }
    .summary-chip.critical { background: rgba(239,68,68,0.08);  border-color: rgba(239,68,68,0.25); }
    .summary-chip.warning  { background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.3); }
    .summary-chip.info     { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.3); }
    .chip-icon { font-size: 1.5rem; }
    .chip-count { font-size: 1.75rem; font-weight: 800; line-height: 1; }
    .summary-chip.critical .chip-count { color: var(--mizan-danger); }
    .summary-chip.warning  .chip-count { color: #f59e0b; }
    .summary-chip.info     .chip-count { color: #3b82f6; }
    .chip-label { font-size: 0.78rem; color: var(--mizan-text-muted); margin-top: 0.1rem; }

    /* Filter buttons */
    .filter-bar {
      display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem;
    }
    .filter-btn {
      padding: 0.4rem 1.1rem; border-radius: 20px;
      border: 1px solid var(--mizan-border); background: var(--mizan-surface);
      color: var(--mizan-text-muted); font-size: 0.82rem; cursor: pointer; transition: all 0.2s;
    }
    .filter-btn:hover { border-color: var(--mizan-gold); color: var(--mizan-gold); }
    .filter-btn.active {
      border-color: var(--mizan-gold); background: rgba(201,168,76,0.1);
      color: var(--mizan-gold); font-weight: 600;
    }
    .filter-btn.critical.active { border-color: var(--mizan-danger); background: rgba(239,68,68,0.1); color: var(--mizan-danger); }
    .filter-btn.warning.active  { border-color: #f59e0b; background: rgba(245,158,11,0.1); color: #f59e0b; }
    .filter-btn.info.active     { border-color: #3b82f6; background: rgba(59,130,246,0.1); color: #3b82f6; }
    .count-badge {
      display: inline-block; font-size: 0.7rem; font-weight: 700;
      padding: 0.05rem 0.4rem; border-radius: 10px;
      background: rgba(255,255,255,0.1); margin-right: 0.3rem;
    }

    /* Alerts list */
    .alerts-list { display: flex; flex-direction: column; gap: 0.75rem; }

    .alert-item {
      display: flex; gap: 0; background: var(--mizan-surface);
      border: 1px solid var(--mizan-border); border-radius: 10px;
      overflow: hidden; transition: transform 0.15s;
    }
    .alert-item:hover { transform: translateX(-2px); }
    .alert-sidebar { width: 4px; flex-shrink: 0; }
    .sidebar-critical { background: var(--mizan-danger); }
    .sidebar-warning  { background: #f59e0b; }
    .sidebar-info     { background: #3b82f6; }

    .alert-body { flex: 1; padding: 0.9rem 1.1rem; display: flex; gap: 0.9rem; align-items: flex-start; }
    .alert-icon-wrap { font-size: 1.3rem; flex-shrink: 0; line-height: 1; padding-top: 0.1rem; }
    .alert-content { flex: 1; min-width: 0; }
    .alert-top-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.4rem; }
    .alert-title { font-weight: 700; color: var(--mizan-text); font-size: 0.9rem; }
    .sev-badge {
      font-size: 0.68rem; font-weight: 700;
      padding: 0.1rem 0.5rem; border-radius: 10px;
    }
    .sev-critical { background: rgba(239,68,68,0.12); color: var(--mizan-danger); }
    .sev-warning  { background: rgba(245,158,11,0.12); color: #f59e0b; }
    .sev-info     { background: rgba(59,130,246,0.12); color: #3b82f6; }
    .alert-msg { font-size: 0.82rem; color: var(--mizan-text-muted); line-height: 1.5; }
    .alert-footer { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; flex-wrap: wrap; }
    .branch-badge {
      background: rgba(201,168,76,0.1); color: var(--mizan-gold);
      border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.73rem;
    }
    .region-badge {
      background: rgba(255,255,255,0.06); color: var(--mizan-text-muted);
      border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.73rem;
    }
    .type-badge {
      background: rgba(255,255,255,0.04); color: var(--mizan-text-muted);
      border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.7rem; font-family: monospace;
    }
    .value-badge {
      font-size: 0.75rem; font-weight: 700;
      padding: 0.12rem 0.5rem; border-radius: 8px;
      background: rgba(239,68,68,0.1); color: var(--mizan-danger);
    }
    .value-badge.positive { background: rgba(34,197,94,0.1); color: var(--mizan-green); }

    /* Group header */
    .group-header {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.5rem 0; margin-top: 0.5rem; margin-bottom: 0.25rem;
      border-bottom: 1px solid var(--mizan-border);
    }
    .group-title { font-size: 0.82rem; font-weight: 600; color: var(--mizan-text-muted); }
    .group-count {
      font-size: 0.72rem; padding: 0.1rem 0.4rem; border-radius: 10px;
      background: rgba(255,255,255,0.07); color: var(--mizan-text-muted);
    }

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
    .no-alerts {
      text-align: center; padding: 3rem; color: var(--mizan-text-muted);
      background: var(--mizan-surface); border: 1px solid var(--mizan-border); border-radius: 12px;
    }
    .no-alerts-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
  `],
  template: `
    <div class="page-header">
      <h2 class="page-title">التنبيهات والمخاطر</h2>
      <p class="page-subtitle">تنبيهات تلقائية بناءً على بيانات الفترة المحددة</p>
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="state-box"><div class="spinner"></div><div>جاري التحميل...</div></div>
    } @else {

      <!-- Summary KPI row -->
      <div class="summary-row">
        <div class="summary-chip critical">
          <span class="chip-icon">🚨</span>
          <div>
            <div class="chip-count">{{ countBySeverity('critical') }}</div>
            <div class="chip-label">حرجة</div>
          </div>
        </div>
        <div class="summary-chip warning">
          <span class="chip-icon">⚠️</span>
          <div>
            <div class="chip-count">{{ countBySeverity('warning') }}</div>
            <div class="chip-label">تحذيرات</div>
          </div>
        </div>
        <div class="summary-chip info">
          <span class="chip-icon">ℹ️</span>
          <div>
            <div class="chip-count">{{ countBySeverity('info') }}</div>
            <div class="chip-label">معلومات</div>
          </div>
        </div>
      </div>

      <!-- Filter buttons -->
      <div class="filter-bar">
        <button class="filter-btn" [class.active]="activeSev() === null" (click)="setFilter(null)">
          الكل <span class="count-badge">{{ allAlerts().length }}</span>
        </button>
        <button class="filter-btn critical" [class.active]="activeSev() === 'critical'" (click)="setFilter('critical')">
          🚨 حرجة <span class="count-badge">{{ countBySeverity('critical') }}</span>
        </button>
        <button class="filter-btn warning" [class.active]="activeSev() === 'warning'" (click)="setFilter('warning')">
          ⚠️ تحذيرات <span class="count-badge">{{ countBySeverity('warning') }}</span>
        </button>
        <button class="filter-btn info" [class.active]="activeSev() === 'info'" (click)="setFilter('info')">
          ℹ️ معلومات <span class="count-badge">{{ countBySeverity('info') }}</span>
        </button>
      </div>

      <!-- Alerts list grouped by type -->
      @if (filtered().length === 0) {
        <div class="no-alerts">
          <div class="no-alerts-icon">✅</div>
          <div>لا توجد تنبيهات للفلتر المحدد</div>
        </div>
      } @else {
        @for (group of groups(); track group.type) {
          <div class="group-header">
            <span class="group-title">{{ typeLabel(group.type) }}</span>
            <span class="group-count">{{ group.items.length }}</span>
          </div>
          <div class="alerts-list">
            @for (alert of group.items; track alert.branchCode + alert.type) {
              <div class="alert-item">
                <div class="alert-sidebar" [ngClass]="'sidebar-' + alert.severity"></div>
                <div class="alert-body">
                  <div class="alert-icon-wrap">{{ sevIcon(alert.severity) }}</div>
                  <div class="alert-content">
                    <div class="alert-top-row">
                      <span class="alert-title">{{ alert.titleAr }}</span>
                      <span class="sev-badge" [ngClass]="'sev-' + alert.severity">
                        {{ sevLabel(alert.severity) }}
                      </span>
                    </div>
                    <div class="alert-msg">{{ alert.messageAr }}</div>
                    <div class="alert-footer">
                      <span class="branch-badge">{{ alert.branchName }}</span>
                      <span class="region-badge">{{ alert.region }}</span>
                      <span class="type-badge">{{ alert.type }}</span>
                      @if (alert.value !== null && alert.value !== undefined) {
                        <span class="value-badge" [class.positive]="alert.value > 0">
                          {{ alert.value > 0 ? '+' : '' }}{{ (alert.value ?? 0).toFixed(1) }} ر/ج
                        </span>
                      }
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      }
    }
  `
})
export class V3AlertsComponent implements OnInit, OnDestroy {
  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);

  loading   = signal(true);
  error     = signal<string | null>(null);
  allAlerts = signal<any[]>([]);
  activeSev = signal<Severity | null>(null);

  filtered = computed(() => {
    const s = this.activeSev();
    if (!s) return this.allAlerts();
    return this.allAlerts().filter(a => a.severity === s);
  });

  groups = computed(() => {
    const items = this.filtered();
    const typeOrder: AlertType[] = ['NEGATIVE_RATE', 'NO_PURCHASES', 'RETURNS', 'CONSECUTIVE_RETURNS'];
    const map = new Map<string, any[]>();
    for (const item of items) {
      if (!map.has(item.type)) map.set(item.type, []);
      map.get(item.type)!.push(item);
    }
    return typeOrder
      .filter(t => map.has(t))
      .map(t => ({ type: t, items: map.get(t)! }));
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
    this.svc.getAlerts(from, to).subscribe({
      next: (data) => {
        this.allAlerts.set(data ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set('تعذّر تحميل التنبيهات: ' + (e?.message ?? ''));
        this.loading.set(false);
      }
    });
  }

  setFilter(s: Severity | null): void {
    this.activeSev.set(s);
  }

  countBySeverity(s: Severity): number {
    return this.allAlerts().filter(a => a.severity === s).length;
  }

  sevIcon(s: Severity): string {
    if (s === 'critical') return '🚨';
    if (s === 'warning')  return '⚠️';
    return 'ℹ️';
  }

  sevLabel(s: Severity): string {
    if (s === 'critical') return 'حرجة';
    if (s === 'warning')  return 'تحذير';
    return 'معلومة';
  }

  typeLabel(t: string): string {
    const map: Record<string, string> = {
      NEGATIVE_RATE:        'فارق معدل سلبي',
      NO_PURCHASES:         'لا توجد مشتريات',
      RETURNS:              'مرتجعات',
      CONSECUTIVE_RETURNS:  'مرتجعات متتالية',
    };
    return map[t] ?? t;
  }
}
