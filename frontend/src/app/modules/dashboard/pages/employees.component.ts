import { Component, inject, signal, computed, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { UploadService } from '../../../core/services/upload.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { MizanPipe } from '../../../shared/pipes/mizan.pipe';
import { fmtN, fmtSar } from '../../../shared/utils/format.utils';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type SortKey = 'name' | 'branch' | 'sales' | 'diff' | 'profit' | 'returns' | 'rate' | 'purch' | 'achievement';
type SortDir = 'asc' | 'desc';
type TableRow = { type: 'header'; branchCode: string; branchName: string; region: string; count: number; totalSar: number }
              | { type: 'row'; idx: number; emp: any };

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule, DateFilterComponent, MizanPipe],
  template: `
    <div class="page-header">
      <div><h2>الموظفون</h2><p>أداء الموظفين خلال الفترة</p></div>
      <button class="export-btn" (click)="exportCsv()">⬇ تصدير</button>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    <div class="filter-bar">
      <input type="search" placeholder="بحث بالاسم أو الرقم..." [(ngModel)]="search" class="search-input">
      <div class="sort-pills">
        @for (s of sortOptions; track s.key) {
          <button class="sort-pill" [class.active]="sortKey() === s.key" (click)="setSort(s.key)">
            {{ s.label }}
            @if (sortKey() === s.key) {
              <span>{{ sortDir() === 'desc' ? '↓' : '↑' }}</span>
            }
          </button>
        }
      </div>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (employees().length === 0) {
      <div class="empty-state"><div class="empty-icon">👤</div><p>لا توجد بيانات للموظفين في هذه الفترة</p></div>
    } @else {
      <div class="card chart-card mb-4">
        <div class="card__header"><h3>أفضل الموظفين — مبيعات (ريال)</h3></div>
        <canvas #barChart style="max-height:260px"></canvas>
      </div>

      <div class="card">
        <div class="card__header">
          <h3>قائمة الموظفين ({{ filtered().length }})</h3>
          <span class="summary-pills">
            <span class="spill spill--green">{{ achievedCount() }} حقق الهدف</span>
            <span class="spill spill--red">{{ notAchievedCount() }} لم يحقق</span>
          </span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th class="col-idx">#</th>
                <th>الاسم</th>
                <th>الرقم</th>
                <th>الفرع</th>
                <th>المنطقة</th>
                <th class="num-col">المبيعات</th>
                <th class="num-col">الوزن</th>
                <th class="num-col">الفواتير</th>
                <th class="num-col">م. الفاتورة</th>
                <th class="num-col">معدل البيع</th>
                <th class="num-col">معدل الشراء</th>
                <th class="num-col">فرق المعدل</th>
                <th class="num-col">هامش الربح</th>
                <th class="num-col">المرتجعات</th>
                <th class="num-col" style="min-width:110px">الهدف</th>
                <th>التقييم</th>
              </tr>
            </thead>
            <tbody>
              @for (row of tableRows(); track rowKey(row)) {
                @if (row.type === 'header') {
                  <tr class="group-header">
                    <td colspan="16">
                      <div class="group-header__inner">
                        <span class="gh-name">🏪 {{ row.branchName }}</span>
                        <span class="gh-region">{{ row.region }}</span>
                        <span class="gh-count">{{ row.count }} موظف</span>
                        <span class="gh-sar">{{ fmtN(row.totalSar) }} ر.س</span>
                      </div>
                    </td>
                  </tr>
                } @else {
                  @let e = row.emp;
                  @let diff = e.diffRate ?? 0;
                  @let pm = e.profitMargin ?? 0;
                  @let ret = e.returns ?? 0;
                  @let pct = e.achievementPct ?? 0;
                  @let status = e.achievementStatus ?? 'behind';
                  <tr>
                    <td class="col-idx muted">{{ row.idx }}</td>
                    <td><strong>{{ e.employeeName }}</strong></td>
                    <td dir="ltr" class="muted mono">{{ e.employeeId }}</td>
                    <td>{{ e.branchName }}</td>
                    <td class="muted">{{ e.region }}</td>
                    <td class="num-col" [class.pos]="e.totalSar > 0">{{ fmtN(e.totalSar) }}</td>
                    <td class="num-col muted">{{ (e.totalWt ?? 0).toFixed(2) }}</td>
                    <td class="num-col muted">{{ e.invoiceCount }}</td>
                    <td class="num-col muted">{{ fmtN(e.avgInvoice ?? 0) }}</td>
                    <td class="num-col teal">{{ (e.saleRate ?? 0).toFixed(2) }}</td>
                    <td class="num-col amber">{{ (e.purchRate ?? 0).toFixed(2) }}</td>
                    <td class="num-col">
                      <span class="pill" [class.pill--pos]="diff >= 0" [class.pill--neg]="diff < 0">
                        {{ diff >= 0 ? '+' : '' }}{{ diff.toFixed(1) }}
                      </span>
                    </td>
                    <td class="num-col" [class.pos]="pm > 0" [class.neg]="pm < 0">
                      {{ pm.toFixed(0) }}
                    </td>
                    <td class="num-col">
                      @if (ret > 0) {
                        <span class="pill pill--neg">{{ fmtN(ret) }}</span>
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td class="num-col">
                      @if (e.targetWeight > 0) {
                        <div class="progress-wrap">
                          <div class="progress-bar">
                            <div class="progress-fill"
                                 [style.width.%]="Math.min(pct, 100)"
                                 [style.background]="status === 'exceeded' ? '#22c55e' : status === 'onTrack' ? '#f59e0b' : '#ef4444'">
                            </div>
                          </div>
                          <span class="progress-pct"
                                [style.color]="status === 'exceeded' ? '#22c55e' : status === 'onTrack' ? '#f59e0b' : '#ef4444'">
                            {{ pct.toFixed(0) }}%
                          </span>
                        </div>
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td>
                      <span class="badge" [class]="ratingClass(e.rating)">{{ ratingLabel(e.rating) }}</span>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [`
    .filter-bar { display: flex; flex-wrap: wrap; gap: .75rem; margin-bottom: 1rem; align-items: center; }
    .search-input {
      padding: .4rem .75rem; border: 1px solid var(--mizan-border, rgba(201,168,76,.2));
      border-radius: 6px; background: var(--mizan-surface, #1a2e21);
      color: var(--mizan-text, #f2ede4); font-size: .85rem; min-width: 220px;
    }
    .sort-pills { display: flex; gap: .4rem; flex-wrap: wrap; }
    .sort-pill {
      padding: .25rem .65rem; border-radius: 20px; font-size: .75rem; cursor: pointer;
      border: 1px solid rgba(201,168,76,.25); background: transparent;
      color: rgba(242,237,228,.55); transition: all .15s;
      &:hover { border-color: rgba(201,168,76,.5); color: #c9a84c; }
      &.active { background: rgba(201,168,76,.15); color: #c9a84c; border-color: rgba(201,168,76,.5); }
    }
    .mb-4 { margin-bottom: 1.5rem; }
    .table-wrap { overflow-x: auto; }
    .card__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border, rgba(201,168,76,.14));
    }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    .chart-card { padding: 1rem; }

    .summary-pills { display: flex; gap: .5rem; }
    .spill { padding: .2rem .6rem; border-radius: 10px; font-size: .72rem; font-weight: 600; }
    .spill--green { background: rgba(34,197,94,.12); color: #22c55e; }
    .spill--red   { background: rgba(248,113,113,.12); color: #f87171; }

    table { width: 100%; border-collapse: collapse; }
    thead tr { background: var(--mz-surface-2, #213d2e); }
    thead th {
      padding: 9px 10px; font-size: 10px; font-weight: 700; white-space: nowrap;
      color: var(--mz-gold, #c9a84c); text-align: start;
      text-transform: uppercase; letter-spacing: .5px;
    }
    tbody tr {
      border-bottom: 1px solid rgba(201,168,76,.1);
      transition: background .12s;
      &:hover { background: rgba(201,168,76,.04); }
      &:last-child { border-bottom: none; }
    }
    tbody td { padding: 8px 10px; font-size: 12px; color: var(--mz-text, #f2ede4); white-space: nowrap; }
    .num-col { text-align: end; }
    .col-idx { width: 32px; }

    .muted { color: rgba(242,237,228,.45); }
    .export-btn {
      padding: .3rem .85rem; border-radius: 20px; font-size: .78rem; font-weight: 600; cursor: pointer;
      background: rgba(201,168,76,.12); color: var(--mz-gold, #c9a84c);
      border: 1px solid rgba(201,168,76,.3);
    }
    .export-btn:hover { background: rgba(201,168,76,.22); }
    .mono { font-family: monospace; font-size: 11px; }
    .pos { color: #34d399; font-weight: 600; }
    .neg { color: #f87171; font-weight: 600; }
    .teal  { color: #2dd4bf; font-weight: 600; }
    .amber { color: #f59e0b; font-weight: 600; }

    .pill {
      display: inline-block; padding: .15rem .45rem; border-radius: 10px;
      font-size: .72rem; font-weight: 700;
    }
    .pill--pos { background: rgba(52,211,153,.15); color: #34d399; }
    .pill--neg { background: rgba(248,113,113,.15); color: #f87171; }

    .badge { padding: .18rem .5rem; border-radius: 10px; font-size: .7rem; font-weight: 700; }
    .badge-excellent { background: rgba(201,168,76,.2);  color: #c9a84c; }
    .badge-good      { background: rgba(52,211,153,.2);  color: #34d399; }
    .badge-average   { background: rgba(245,158,11,.2);  color: #f59e0b; }
    .badge-weak      { background: rgba(248,113,113,.2); color: #f87171; }

    .progress-wrap { display: flex; align-items: center; gap: 5px; min-width: 90px; }
    .progress-bar  { flex: 1; height: 5px; background: rgba(255,255,255,.1); border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 3px; transition: width 600ms ease; }
    .progress-pct  { font-size: 9px; font-weight: 700; min-width: 28px; text-align: end; }

    .group-header td { padding: 0; }
    .group-header__inner {
      display: flex; align-items: center; gap: 1rem;
      padding: .4rem 1rem; background: rgba(201,168,76,.07);
      border-top: 1px solid rgba(201,168,76,.2);
      border-bottom: 1px solid rgba(201,168,76,.1);
    }
    .gh-name   { font-size: .82rem; font-weight: 700; color: #c9a84c; }
    .gh-region { font-size: .75rem; color: rgba(242,237,228,.45); }
    .gh-count  { font-size: .75rem; color: rgba(242,237,228,.45); margin-inline-start: auto; }
    .gh-sar    { font-size: .82rem; font-weight: 700; color: #34d399; }
  `]
})
export class EmployeesComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private uploadSvc = inject(UploadService);
  private dr = inject(DateRangeService);

  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;

  employees = signal<any[]>([]);
  loading   = signal(false);
  search    = '';
  sortKey   = signal<SortKey>('sales');
  sortDir   = signal<SortDir>('desc');
  Math      = Math;
  fmtN      = fmtN;

  readonly sortOptions: { key: SortKey; label: string }[] = [
    { key: 'sales',       label: 'المبيعات'    },
    { key: 'diff',        label: 'فرق المعدل'  },
    { key: 'profit',      label: 'هامش الربح'  },
    { key: 'returns',     label: 'المرتجعات'   },
    { key: 'achievement', label: 'الهدف'       },
    { key: 'name',        label: 'الاسم'        },
    { key: 'branch',      label: 'الفرع'        },
  ];

  private chart: Chart | null = null;
  private viewReady = false;

  filtered = computed(() => {
    const s = this.search.toLowerCase();
    let list = this.employees().filter(e =>
      !s || e.employeeName?.toLowerCase().includes(s) || e.employeeId?.toLowerCase().includes(s)
    );
    const dir = this.sortDir() === 'desc' ? -1 : 1;
    const key = this.sortKey();
    list = [...list].sort((a, b) => {
      switch (key) {
        case 'sales':       return dir * (b.totalSar     - a.totalSar);
        case 'diff':        return dir * (b.diffRate     - a.diffRate);
        case 'profit':      return dir * (b.profitMargin - a.profitMargin);
        case 'returns':     return dir * (b.returns      - a.returns);
        case 'achievement': return dir * (b.achievementPct - a.achievementPct);
        case 'name':        return dir * (a.employeeName ?? '').localeCompare(b.employeeName ?? '', 'ar');
        case 'branch':      return dir * (a.branchName ?? '').localeCompare(b.branchName ?? '', 'ar');
        default:            return 0;
      }
    });
    return list;
  });

  tableRows = computed((): TableRow[] => {
    const list = this.filtered();
    if (this.sortKey() !== 'branch') {
      return list.map((emp, i) => ({ type: 'row' as const, idx: i + 1, emp }));
    }
    const rows: TableRow[] = [];
    let lastBranch = '';
    let idx = 0;
    // Group headers
    const groups: Map<string, any[]> = new Map();
    for (const emp of list) {
      const bc = emp.branchCode;
      if (!groups.has(bc)) groups.set(bc, []);
      groups.get(bc)!.push(emp);
    }
    for (const [, emps] of groups) {
      const first = emps[0];
      rows.push({
        type: 'header',
        branchCode: first.branchCode,
        branchName: first.branchName,
        region:     first.region,
        count:      emps.length,
        totalSar:   emps.reduce((s, e) => s + (e.totalSar ?? 0), 0)
      });
      for (const emp of emps) {
        rows.push({ type: 'row', idx: ++idx, emp });
      }
    }
    return rows;
  });

  achievedCount    = computed(() => this.filtered().filter(e => e.achieved).length);
  notAchievedCount = computed(() => this.filtered().filter(e => !e.achieved).length);

  setSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('desc');
    }
  }

  rowKey(row: TableRow): string {
    return row.type === 'header' ? 'hdr-' + row.branchCode : 'row-' + row.emp.employeeId;
  }

  ratingClass(r: string): string {
    return { excellent: 'badge-excellent', good: 'badge-good', average: 'badge-average', weak: 'badge-weak' }[r] ?? 'badge-average';
  }

  ratingLabel(r: string): string {
    return { excellent: 'ممتاز', good: 'جيد', average: 'متوسط', weak: 'ضعيف' }[r] ?? r;
  }

  ngOnInit(): void { this.load(); }

  exportCsv(): void { this.uploadSvc.exportCsv('employee-sales', this.dr.getFrom(), this.dr.getTo()); }

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
        datasets: [
          { label: 'المبيعات (ر.س)',  data: top10.map(e => e.totalSar),     backgroundColor: 'rgba(201,168,76,.8)' },
          { label: 'هامش الربح (ر.س)', data: top10.map(e => e.profitMargin ?? 0), backgroundColor: 'rgba(52,211,153,.55)' },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 }, color: 'rgba(255,255,255,0.6)' } } }
      }
    });
  }
}
