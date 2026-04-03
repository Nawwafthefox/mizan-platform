import {
  Component, inject, signal, effect, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';

interface KpiMeta {
  key:   string;
  label: string;
  unit:  string;
  d1Key: string;
  d2Key: string;
}

@Component({
  selector: 'app-v3-comparison',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; }

    .page-header { margin-bottom: 1.5rem; }
    .page-title { font-size: 1.4rem; font-weight: 700; color: var(--mizan-gold); margin: 0 0 0.25rem 0; }
    .page-subtitle { font-size: 0.85rem; color: var(--mizan-text-muted); }

    .date-hint {
      font-size: 0.8rem; color: var(--mizan-text-muted);
      margin-bottom: 1.5rem;
    }
    .date-hint strong { color: var(--mizan-gold); }

    /* KPI comparison cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .kpi-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
    }
    .kpi-card-label { font-size: 0.78rem; color: var(--mizan-text-muted); margin-bottom: 0.75rem; font-weight: 600; }
    .kpi-side-row { display: flex; gap: 1.5rem; align-items: flex-end; margin-bottom: 0.75rem; }
    .kpi-side { flex: 1; }
    .kpi-side-tag { font-size: 0.7rem; color: var(--mizan-text-muted); margin-bottom: 0.2rem; }
    .kpi-side-val {
      font-size: 1.35rem; font-weight: 700; color: var(--mizan-text);
      font-variant-numeric: tabular-nums;
    }
    .kpi-unit { font-size: 0.75rem; color: var(--mizan-text-muted); margin-right: 2px; }
    .divider-line {
      width: 1px; background: var(--mizan-border); align-self: stretch; margin: 0 0.25rem;
    }
    .delta-row { display: flex; align-items: center; gap: 0.5rem; }
    .delta-arrow { font-size: 1rem; font-weight: 700; }
    .delta-positive { color: var(--mizan-green); }
    .delta-negative { color: var(--mizan-danger); }
    .delta-neutral   { color: var(--mizan-text-muted); }
    .delta-badge {
      font-size: 0.75rem; font-weight: 700;
      padding: 0.15rem 0.5rem; border-radius: 12px;
    }
    .badge-pos { background: rgba(34,197,94,0.12); color: var(--mizan-green); }
    .badge-neg { background: rgba(239,68,68,0.12); color: var(--mizan-danger); }
    .badge-neu { background: rgba(255,255,255,0.07); color: var(--mizan-text-muted); }

    /* Branch table */
    .section-card {
      background: var(--mizan-surface); border: 1px solid var(--mizan-border);
      border-radius: 12px; margin-bottom: 1.5rem; overflow: hidden;
    }
    .section-header {
      padding: 1rem 1.5rem; border-bottom: 1px solid var(--mizan-border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .section-title { font-size: 1rem; font-weight: 600; color: var(--mizan-text); margin: 0; }
    .row-count {
      font-size: 0.78rem; color: var(--mizan-text-muted);
      background: rgba(255,255,255,0.05); padding: 0.15rem 0.55rem; border-radius: 10px;
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
    thead th {
      padding: 0.7rem 1rem; text-align: right;
      color: var(--mizan-text-muted); font-weight: 600; font-size: 0.75rem;
      background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--mizan-border);
      white-space: nowrap;
    }
    td {
      padding: 0.65rem 1rem; text-align: right;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      color: var(--mizan-text); white-space: nowrap;
    }
    tbody tr:hover { background: rgba(255,255,255,0.025); }
    tbody tr:last-child td { border-bottom: none; }
    .td-mono { font-variant-numeric: tabular-nums; }
    .positive { color: var(--mizan-green); font-weight: 600; }
    .negative { color: var(--mizan-danger); font-weight: 600; }
    .branch-badge {
      background: rgba(201,168,76,0.1); color: var(--mizan-gold);
      border-radius: 6px; padding: 0.1rem 0.45rem; font-size: 0.75rem;
    }
    .pct-badge {
      font-size: 0.7rem; font-weight: 700;
      padding: 0.1rem 0.4rem; border-radius: 10px; margin-right: 0.25rem;
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
    .placeholder-box {
      text-align: center; padding: 3rem;
      color: var(--mizan-text-muted); font-size: 0.9rem;
    }
    .placeholder-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
  `],
  template: `
    <div class="page-header">
      <h2 class="page-title">مقارنة اليومين</h2>
      <p class="page-subtitle">قارن أداء يومين مختلفين بالتفصيل</p>
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    <div class="date-hint">
      مقارنة يوم البداية <strong>{{ dateRange.from() | date:'dd/MM/yyyy' }}</strong>
      بيوم النهاية <strong>{{ dateRange.to() | date:'dd/MM/yyyy' }}</strong>
      من شريط التاريخ أعلاه
    </div>

    @if (loading()) {
      <div class="state-box"><div class="spinner"></div><div>جاري المقارنة...</div></div>
    } @else if (!data()) {
      <div class="placeholder-box">
        <div class="placeholder-icon">📊</div>
        <div>اختر يومين واضغط "مقارنة" لعرض النتائج</div>
      </div>
    } @else {

      <!-- KPI comparison cards -->
      <div class="kpi-grid">
        @for (kpi of kpiMeta; track kpi.key) {
          <div class="kpi-card">
            <div class="kpi-card-label">{{ kpi.label }}</div>
            <div class="kpi-side-row">
              <div class="kpi-side">
                <div class="kpi-side-tag">{{ data()?.d1 | date:'dd/MM/yyyy' }}</div>
                <div class="kpi-side-val">
                  {{ fmt(data()?.day1?.[kpi.d1Key]) }}<span class="kpi-unit">{{ kpi.unit }}</span>
                </div>
              </div>
              <div class="divider-line"></div>
              <div class="kpi-side">
                <div class="kpi-side-tag">{{ data()?.d2 | date:'dd/MM/yyyy' }}</div>
                <div class="kpi-side-val">
                  {{ fmt(data()?.day2?.[kpi.d2Key]) }}<span class="kpi-unit">{{ kpi.unit }}</span>
                </div>
              </div>
            </div>
            <div class="delta-row">
              <span class="delta-arrow" [ngClass]="deltaClass(data()?.day2?.[kpi.d2Key] - data()?.day1?.[kpi.d1Key])">
                {{ deltaArrow(data()?.day2?.[kpi.d2Key] - data()?.day1?.[kpi.d1Key]) }}
              </span>
              <span [ngClass]="deltaClass(data()?.day2?.[kpi.d2Key] - data()?.day1?.[kpi.d1Key])">
                {{ fmtDelta(data()?.day2?.[kpi.d2Key] - data()?.day1?.[kpi.d1Key]) }} {{ kpi.unit }}
              </span>
              @if (pctDelta(data()?.day1?.[kpi.d1Key], data()?.day2?.[kpi.d2Key]) !== null) {
                <span class="pct-badge"
                      [ngClass]="(data()?.day2?.[kpi.d2Key] > data()?.day1?.[kpi.d1Key]) ? 'badge-pos' : 'badge-neg'">
                  {{ pctDelta(data()?.day1?.[kpi.d1Key], data()?.day2?.[kpi.d2Key]) }}%
                </span>
              }
            </div>
          </div>
        }
      </div>

      <!-- By-branch comparison table -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">مقارنة حسب الفرع</h3>
          <span class="row-count">{{ data()?.byBranch?.length ?? 0 }} فرع</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الفرع</th>
                <th>المنطقة</th>
                <th>مبيعات 1</th>
                <th>مبيعات 2</th>
                <th>الفارق</th>
                <th>%</th>
                <th>صافي 1</th>
                <th>صافي 2</th>
                <th>فارق الصافي</th>
              </tr>
            </thead>
            <tbody>
              @for (b of data()?.byBranch ?? []; track b.branchCode) {
                <tr>
                  <td><span class="branch-badge">{{ b.branchName }}</span></td>
                  <td style="color:var(--mizan-text-muted);font-size:0.8rem">{{ b.region }}</td>
                  <td class="td-mono">{{ fmt(b.sar1) }}</td>
                  <td class="td-mono">{{ fmt(b.sar2) }}</td>
                  <td class="td-mono" [ngClass]="b.sarDelta >= 0 ? 'positive' : 'negative'">
                    {{ b.sarDelta >= 0 ? '+' : '' }}{{ fmt(b.sarDelta) }}
                  </td>
                  <td>
                    <span class="pct-badge" [ngClass]="b.sarDeltaPct >= 0 ? 'badge-pos' : 'badge-neg'">
                      {{ b.sarDeltaPct >= 0 ? '+' : '' }}{{ (b.sarDeltaPct ?? 0).toFixed(1) }}%
                    </span>
                  </td>
                  <td class="td-mono">{{ fmt(b.net1) }}</td>
                  <td class="td-mono">{{ fmt(b.net2) }}</td>
                  <td class="td-mono" [ngClass]="b.netDelta >= 0 ? 'positive' : 'negative'">
                    {{ b.netDelta >= 0 ? '+' : '' }}{{ fmt(b.netDelta) }}
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--mizan-text-muted)">لا توجد بيانات</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `
})
export class V3ComparisonComponent {
  private svc = inject(V3DashboardService);
  private cdr = inject(ChangeDetectorRef);
  dateRange   = inject(V3DateRangeService);

  loading = signal(false);
  error   = signal<string | null>(null);
  data    = signal<any>(null);

  kpiMeta: KpiMeta[] = [
    { key: 'totalSar',    label: 'إجمالي المبيعات',  unit: 'ر.س', d1Key: 'totalSar',    d2Key: 'totalSar'    },
    { key: 'totalPurch',  label: 'إجمالي المشتريات', unit: 'ر.س', d1Key: 'totalPurch',  d2Key: 'totalPurch'  },
    { key: 'net',         label: 'الصافي',            unit: 'ر.س', d1Key: 'net',         d2Key: 'net'         },
    { key: 'totalWeight', label: 'الوزن الإجمالي',   unit: 'جم',  d1Key: 'totalWeight', d2Key: 'totalWeight' },
    { key: 'saleRate',    label: 'معدل البيع',         unit: 'ر/ج', d1Key: 'saleRate',    d2Key: 'saleRate'    },
    { key: 'purchRate',   label: 'معدل الشراء',        unit: 'ر/ج', d1Key: 'purchRate',   d2Key: 'purchRate'   },
  ];

  constructor() {
    effect(() => {
      const d1 = this.dateRange.from();
      const d2 = this.dateRange.to();
      if (!d1 || !d2) return;
      this.load(d1, d2);
    });
  }

  private load(d1: string, d2: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getComparison(d1, d2).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.error.set('تعذّر تحميل بيانات المقارنة: ' + (e?.message ?? ''));
        this.loading.set(false);
        this.cdr.markForCheck();
      }
    });
  }

  deltaArrow(delta: number): string {
    if (delta > 0)  return '↑';
    if (delta < 0)  return '↓';
    return '→';
  }

  deltaClass(delta: number): string {
    if (delta > 0) return 'delta-positive';
    if (delta < 0) return 'delta-negative';
    return 'delta-neutral';
  }

  fmtDelta(delta: number): string {
    const abs = Math.abs(delta ?? 0);
    return (delta >= 0 ? '+' : '-') + this.fmt(abs);
  }

  pctDelta(v1: number, v2: number): string | null {
    if (!v1) return null;
    return (((v2 - v1) / v1) * 100).toFixed(1);
  }

  fmt(n: number | null | undefined): string {
    return n?.toLocaleString('ar', { maximumFractionDigits: 0 }) ?? '0';
  }

}
