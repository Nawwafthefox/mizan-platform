import {
  Component, OnInit, OnDestroy, inject, signal, effect, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';

type SortField = 'date' | 'amountSar' | 'branchName';
type SortDir   = 'asc' | 'desc';

@Component({
  selector: 'app-v3-mothan',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; }

    .page-header {
      margin-bottom: 1.5rem;
    }
    .page-title {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--mizan-gold);
      margin: 0 0 0.25rem 0;
    }
    .page-subtitle {
      font-size: 0.85rem;
      color: var(--mizan-text-muted);
    }

    /* KPI Cards */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .kpi-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      position: relative;
      overflow: hidden;
    }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; right: 0;
      width: 4px;
      height: 100%;
      background: var(--mizan-gold);
      border-radius: 0 12px 12px 0;
    }
    .kpi-label {
      font-size: 0.78rem;
      color: var(--mizan-text-muted);
      margin-bottom: 0.4rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .kpi-value {
      font-size: 1.7rem;
      font-weight: 700;
      color: var(--mizan-text);
      line-height: 1;
    }
    .kpi-unit {
      font-size: 0.8rem;
      color: var(--mizan-text-muted);
      margin-right: 0.25rem;
    }
    .kpi-badge {
      display: inline-block;
      background: rgba(201,168,76,0.15);
      color: var(--mizan-gold);
      border: 1px solid rgba(201,168,76,0.3);
      border-radius: 20px;
      padding: 0.15rem 0.6rem;
      font-size: 0.75rem;
      font-weight: 600;
      margin-top: 0.5rem;
    }

    /* Tables */
    .section-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      margin-bottom: 1.5rem;
      overflow: hidden;
    }
    .section-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--mizan-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .section-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--mizan-text);
      margin: 0;
    }
    .row-count {
      font-size: 0.78rem;
      color: var(--mizan-text-muted);
      background: rgba(255,255,255,0.05);
      padding: 0.15rem 0.55rem;
      border-radius: 10px;
    }
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    thead th {
      padding: 0.75rem 1rem;
      text-align: right;
      color: var(--mizan-text-muted);
      font-weight: 600;
      font-size: 0.78rem;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--mizan-border);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }
    thead th:hover {
      color: var(--mizan-gold);
    }
    thead th.sorted {
      color: var(--mizan-gold);
    }
    .sort-icon { margin-right: 4px; font-style: normal; }
    tbody tr {
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background 0.15s;
    }
    tbody tr:hover { background: rgba(255,255,255,0.03); }
    tbody tr:last-child { border-bottom: none; }
    td {
      padding: 0.75rem 1rem;
      color: var(--mizan-text);
      text-align: right;
      white-space: nowrap;
    }
    .td-muted { color: var(--mizan-text-muted); font-size: 0.8rem; }
    .td-gold { color: var(--mizan-gold); font-weight: 600; }
    .td-mono { font-variant-numeric: tabular-nums; }

    .branch-badge {
      display: inline-block;
      background: rgba(201,168,76,0.1);
      color: var(--mizan-gold);
      border-radius: 6px;
      padding: 0.1rem 0.45rem;
      font-size: 0.75rem;
    }
    .region-badge {
      display: inline-block;
      background: rgba(255,255,255,0.06);
      color: var(--mizan-text-muted);
      border-radius: 6px;
      padding: 0.1rem 0.45rem;
      font-size: 0.75rem;
    }

    /* Loading / Error */
    .state-box {
      padding: 3rem;
      text-align: center;
      color: var(--mizan-text-muted);
    }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid rgba(201,168,76,0.2);
      border-top-color: var(--mizan-gold);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-box {
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.25);
      color: #ef4444;
      border-radius: 10px;
      padding: 1rem 1.5rem;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }

    .no-data { color: var(--mizan-text-muted); font-size: 0.85rem; }
  `],
  template: `
    <div class="page-header">
      <h2 class="page-title">تفاصيل الموطن</h2>
      <p class="page-subtitle">تحليل معاملات الموطن للفترة المحددة</p>
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="state-box"><div class="spinner"></div><div>جاري التحميل...</div></div>
    } @else if (data()) {
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">إجمالي المبيعات</div>
          <div class="kpi-value">
            {{ fmt(data()?.totalSar) }}
            <span class="kpi-unit">ر.س</span>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">الوزن الإجمالي</div>
          <div class="kpi-value">
            {{ fmtRate(data()?.totalWt) }}
            <span class="kpi-unit">جرام</span>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">متوسط المعدل</div>
          <div class="kpi-value">
            {{ fmtRate(data()?.avgRate) }}
            <span class="kpi-unit">ر/ج</span>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">عدد المعاملات</div>
          <div class="kpi-value">{{ fmt(data()?.txnCount) }}</div>
          <div class="kpi-badge">{{ data()?.txnCount }} معاملة</div>
        </div>
      </div>

      <!-- Transactions Table -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">المعاملات التفصيلية</h3>
          <span class="row-count">{{ sortedTxns().length }} سجل</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th (click)="sort('date')" [class.sorted]="sortField()==='date'">
                  <i class="sort-icon">{{ sortIcon('date') }}</i>التاريخ
                </th>
                <th (click)="sort('branchName')" [class.sorted]="sortField()==='branchName'">
                  <i class="sort-icon">{{ sortIcon('branchName') }}</i>الفرع
                </th>
                <th>المنطقة</th>
                <th>رقم المستند</th>
                <th>الوصف</th>
                <th (click)="sort('amountSar')" [class.sorted]="sortField()==='amountSar'">
                  <i class="sort-icon">{{ sortIcon('amountSar') }}</i>المبلغ (ر.س)
                </th>
                <th>الوزن (جرام)</th>
                <th>المعدل</th>
              </tr>
            </thead>
            <tbody>
              @for (txn of sortedTxns(); track txn.docRef) {
                <tr>
                  <td class="td-muted td-mono">{{ fmtDate(txn.date) }}</td>
                  <td><span class="branch-badge">{{ txn.branchName }}</span></td>
                  <td><span class="region-badge">{{ txn.region }}</span></td>
                  <td class="td-muted td-mono">{{ txn.docRef }}</td>
                  <td>{{ txn.description }}</td>
                  <td class="td-gold td-mono">{{ fmt(txn.amountSar) }}</td>
                  <td class="td-mono">{{ fmtRate(txn.weightDebitG) }}</td>
                  <td class="td-mono">{{ fmtRate(txn.rate) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="no-data" style="text-align:center;padding:2rem">لا توجد معاملات</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- By Branch Table -->
      <div class="section-card">
        <div class="section-header">
          <h3 class="section-title">ملخص حسب الفرع</h3>
          <span class="row-count">{{ data()?.byBranch?.length ?? 0 }} فرع</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الفرع</th>
                <th>المنطقة</th>
                <th>إجمالي (ر.س)</th>
                <th>الوزن (جرام)</th>
                <th>متوسط المعدل</th>
                <th>عدد المعاملات</th>
              </tr>
            </thead>
            <tbody>
              @for (b of data()?.byBranch ?? []; track b.branchCode) {
                <tr>
                  <td><span class="branch-badge">{{ b.branchName }}</span></td>
                  <td><span class="region-badge">{{ b.region }}</span></td>
                  <td class="td-gold td-mono">{{ fmt(b.totalSar) }}</td>
                  <td class="td-mono">{{ fmtRate(b.totalWt) }}</td>
                  <td class="td-mono">{{ fmtRate(b.avgRate) }}</td>
                  <td class="td-mono">{{ b.txnCount }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="no-data" style="text-align:center;padding:2rem">لا توجد بيانات</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `
})
export class V3MothanComponent implements OnInit, OnDestroy {
  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);

  data    = signal<any>(null);
  loading = signal(true);
  error   = signal<string | null>(null);

  sortField = signal<SortField>('date');
  sortDir   = signal<SortDir>('desc');

  sortedTxns = signal<any[]>([]);

  private effectRef: any;

  ngOnInit(): void {
    this.effectRef = effect(() => {
      const from = this.dateRange.from();
      const to   = this.dateRange.to();
      if (from && to) this.load(from, to);
    });
  }

  ngOnDestroy(): void {
    if (this.effectRef) this.effectRef.destroy();
  }

  private load(from: string, to: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getMothanDetail(from, to).subscribe({
      next: (d) => {
        this.data.set(d);
        this.rebuildSort(d?.transactions ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set('تعذّر تحميل بيانات الموطن: ' + (e?.message ?? ''));
        this.loading.set(false);
      }
    });
  }

  sort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('desc');
    }
    this.rebuildSort(this.data()?.transactions ?? []);
  }

  private rebuildSort(txns: any[]): void {
    const field = this.sortField();
    const dir   = this.sortDir() === 'asc' ? 1 : -1;
    const sorted = [...txns].sort((a, b) => {
      const av = a[field] ?? '';
      const bv = b[field] ?? '';
      if (typeof av === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ar') * dir;
    });
    this.sortedTxns.set(sorted);
  }

  sortIcon(field: SortField): string {
    if (this.sortField() !== field) return '⇅';
    return this.sortDir() === 'asc' ? '↑' : '↓';
  }

  fmt(n: number | null | undefined): string {
    return n?.toLocaleString('ar', { maximumFractionDigits: 0 }) ?? '0';
  }
  fmtRate(n: number | null | undefined): string {
    return (n ?? 0).toFixed(1);
  }
  fmtDate(d: string): string {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
}
