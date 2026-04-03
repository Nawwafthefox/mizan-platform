import {
  Component,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  signal,
  effect,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { fmtCompact, barDataLabels } from '../../../core/chart-config';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

Chart.register(...registerables);

interface FlatEmployee {
  empId: string;
  empName: string;
  branchCode: string;
  branchName: string;
  region: string;
  totalSar: number;
  totalWeight: number;
  totalPieces: number;
  days: number;
  returns: number;
  returnDays: number;
  saleRate: number;
  purchRate: number;
  diffRate: number;
  profitMargin: number;
  avgInvoice: number;
  achieved: boolean;
  rating: string;
}

@Component({
  selector: 'app-v3-employees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="employees-root" dir="rtl">

      <!-- Error -->
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <!-- Filter Bar -->
      <div class="filter-bar">
        <div class="filter-group search-group">
          <label class="filter-label">بحث بالاسم أو الرقم</label>
          <input
            class="filter-input"
            type="text"
            placeholder="ابحث..."
            [(ngModel)]="searchText"
            (ngModelChange)="applyFilters()"
          />
        </div>
        <div class="filter-group">
          <label class="filter-label">الفرع</label>
          <select class="filter-select" [(ngModel)]="branchFilter" (ngModelChange)="applyFilters()">
            <option value="">الكل</option>
            @for (b of branches(); track b) {
              <option [value]="b">{{ b }}</option>
            }
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">المنطقة</label>
          <select class="filter-select" [(ngModel)]="regionFilter" (ngModelChange)="applyFilters()">
            <option value="">الكل</option>
            @for (r of regions(); track r) {
              <option [value]="r">{{ r }}</option>
            }
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">التقييم</label>
          <select class="filter-select" [(ngModel)]="ratingFilter" (ngModelChange)="applyFilters()">
            <option value="">الكل</option>
            <option value="excellent">ممتاز</option>
            <option value="good">جيد</option>
            <option value="average">متوسط</option>
            <option value="weak">ضعيف</option>
          </select>
        </div>
        <div class="filter-count">
          @if (!loading()) {
            <span>{{ filteredGroups().reduce(totalEmpCount, 0) }} موظف</span>
          }
        </div>
      </div>

      @if (!loading() && likelyLeftIds().size > 0) {
        <div class="left-notice">
          <span class="left-badge-demo">غادر ؟</span>
          موظفون لم يسجّلوا أي مبيعات في آخر 30 يوماً من الفترة المحددة — يُرجَّح أنهم غادروا الفرع.
          المجموع: <strong>{{ likelyLeftIds().size }} موظف</strong>
        </div>
      }

      <!-- Employee Table -->
      <div class="table-card">
        @if (loading()) {
          <div class="skeleton-block" style="height:420px"></div>
        } @else {
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الاسم</th>
                  <th>الرقم</th>
                  <th>الفرع</th>
                  <th>المنطقة</th>
                  <th>المبيعات</th>
                  <th>الوزن (غ)</th>
                  <th>الفواتير</th>
                  <th>متوسط الفاتورة</th>
                  <th>م. البيع</th>
                  <th>م. الشراء</th>
                  <th>فرق المعدل</th>
                  <th>هامش الربح</th>
                  <th>المرتجعات</th>
                  <th>الأيام</th>
                  <th>التقييم</th>
                </tr>
              </thead>
              <tbody>
                @for (group of filteredGroups(); track group.branchCode) {
                  <tr class="branch-header-row">
                    <td colspan="16">
                      <span class="branch-label">{{ group.branchName }}</span>
                      <span class="branch-region">{{ group.region }}</span>
                      <span class="branch-badge">{{ group.employees.length }} موظف</span>
                      <span class="branch-total">{{ fmt(group.totalSar) }} ريال</span>
                    </td>
                  </tr>
                  @for (emp of group.employees; track emp.empId; let i = $index) {
                    <tr class="data-row" [class.likely-left-row]="likelyLeftIds().has(emp.empId)">
                      <td class="idx">{{ i + 1 }}</td>
                      <td class="emp-name">
                        {{ emp.empName }}
                        @if (emp.achieved) {
                          <span class="achieved-badge">✓</span>
                        }
                        @if (likelyLeftIds().has(emp.empId)) {
                          <span class="left-badge" title="لا يوجد نشاط في الشهر الأخير من الفترة المحددة — يُرجَّح أن الموظف غادر الفرع">
                            غادر ؟
                          </span>
                        }
                      </td>
                      <td class="emp-id">{{ emp.empId }}</td>
                      <td>{{ emp.branchName }}</td>
                      <td>{{ emp.region }}</td>
                      <td class="num">{{ fmt(emp.totalSar) }}</td>
                      <td class="num">{{ fmt(emp.totalWeight) }}</td>
                      <td class="num">{{ fmt(emp.totalPieces) }}</td>
                      <td class="num">{{ fmtRate(emp.avgInvoice) }}</td>
                      <td class="num">{{ fmtRate(emp.saleRate) }}</td>
                      <td class="num">{{ fmtRate(emp.purchRate) }}</td>
                      <td class="num" [class.pos]="emp.diffRate > 0" [class.neg]="emp.diffRate < 0">
                        {{ fmtRate(emp.diffRate) }}
                      </td>
                      <td class="num" [class.pos]="emp.profitMargin > 0" [class.neg]="emp.profitMargin < 0">
                        {{ fmt(emp.profitMargin) }}
                      </td>
                      <td class="num neg">{{ fmt(emp.returns) }}</td>
                      <td class="num">{{ emp.days }}</td>
                      <td>
                        <span class="rating-badge" [class]="'rating-' + emp.rating">
                          {{ ratingLabel(emp.rating) }}
                        </span>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- Top 10 Chart: horizontal bar by profit margin -->
      <div class="chart-card">
        <div class="chart-title">أعلى 10 موظفين بهامش الربح</div>
        @if (loading()) {
          <div class="skeleton-block" style="height:320px"></div>
        } @else {
          <div class="chart-wrap">
            <canvas #profitCanvas></canvas>
          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    .employees-root {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
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

    /* Filter Bar */
    .filter-bar {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: flex-end;
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      padding: 1rem 1.25rem;
    }
    .filter-group { display: flex; flex-direction: column; gap: .35rem; }
    .search-group { flex: 1; min-width: 180px; }
    .filter-label { font-size: .75rem; color: var(--mizan-text-muted); font-weight: 500; }
    .filter-select,
    .filter-input {
      background: var(--mizan-bg);
      border: 1px solid var(--mizan-border);
      border-radius: 8px;
      color: var(--mizan-text);
      padding: .45rem .75rem;
      font-size: .85rem;
      outline: none;
      min-width: 130px;
    }
    .filter-input { width: 100%; }
    .filter-select:focus,
    .filter-input:focus { border-color: var(--mizan-gold); }
    .filter-count {
      display: flex;
      align-items: flex-end;
      font-size: .82rem;
      color: var(--mizan-text-muted);
      padding-bottom: .1rem;
    }
    .left-notice {
      display: flex;
      align-items: center;
      gap: .6rem;
      padding: .65rem 1rem;
      background: rgba(251,191,36,.07);
      border: 1px solid rgba(251,191,36,.22);
      border-radius: 10px;
      font-size: .82rem;
      color: var(--mizan-text-muted);
      strong { color: #fbbf24; }
    }
    .left-badge-demo {
      background: rgba(251,191,36,.13);
      color: #fbbf24;
      border: 1px solid rgba(251,191,36,.3);
      border-radius: 20px;
      font-size: .68rem;
      font-weight: 600;
      padding: .15rem .5rem;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Table */
    .table-card {
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 12px;
      overflow: hidden;
    }
    .table-scroll { overflow-x: auto; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: .8rem;
      min-width: 1100px;
    }
    .data-table th {
      text-align: right;
      padding: .65rem .6rem;
      color: var(--mizan-text-muted);
      border-bottom: 1px solid var(--mizan-border);
      font-weight: 500;
      white-space: nowrap;
      background: var(--mizan-surface);
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .data-table td {
      padding: .5rem .6rem;
      border-bottom: 1px solid rgba(255,255,255,.04);
      white-space: nowrap;
    }
    .data-row:hover td { background: rgba(255,255,255,.03); }
    .data-table tr:last-child td { border-bottom: none; }
    .num { font-variant-numeric: tabular-nums; }
    .pos { color: var(--mizan-green); }
    .neg { color: var(--mizan-danger); }
    .idx    { color: var(--mizan-text-muted); font-size: .72rem; }
    .emp-id { color: var(--mizan-text-muted); font-size: .78rem; }
    .emp-name { font-weight: 500; }
    .achieved-badge {
      display: inline-block;
      margin-right: .35rem;
      background: rgba(34,197,94,.2);
      color: var(--mizan-green);
      border-radius: 50%;
      width: 16px;
      height: 16px;
      font-size: .65rem;
      line-height: 16px;
      text-align: center;
      vertical-align: middle;
    }
    .left-badge {
      display: inline-block;
      margin-right: .4rem;
      background: rgba(251,191,36,.13);
      color: #fbbf24;
      border: 1px solid rgba(251,191,36,.3);
      border-radius: 20px;
      font-size: .65rem;
      font-weight: 600;
      padding: .1rem .45rem;
      vertical-align: middle;
      cursor: help;
      letter-spacing: .02em;
    }
    .likely-left-row td { opacity: .65; }

    .branch-header-row td {
      background: rgba(201,168,76,.06);
      padding: .55rem .75rem;
      border-top: 1px solid rgba(201,168,76,.2);
      border-bottom: 1px solid rgba(201,168,76,.2);
    }
    .branch-label  { font-weight: 700; color: var(--mizan-gold); margin-left: .65rem; font-size: .87rem; }
    .branch-region { color: var(--mizan-text-muted); font-size: .78rem; margin-left: .5rem; }
    .branch-badge  {
      font-size: .72rem;
      background: rgba(201,168,76,.12);
      color: var(--mizan-gold);
      border-radius: 20px;
      padding: .12rem .5rem;
      margin-left: .5rem;
    }
    .branch-total { color: var(--mizan-text-muted); font-size: .78rem; margin-left: .75rem; }

    /* Rating badges */
    .rating-badge {
      display: inline-block;
      font-size: .72rem;
      font-weight: 600;
      padding: .2rem .55rem;
      border-radius: 20px;
      white-space: nowrap;
    }
    .rating-excellent { background: rgba(201,168,76,.2); color: var(--mizan-gold); }
    .rating-good      { background: rgba(34,197,94,.15); color: var(--mizan-green); }
    .rating-average   { background: rgba(234,179,8,.15);  color: #eab308; }
    .rating-weak      { background: rgba(239,68,68,.15);  color: var(--mizan-danger); }

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
    .chart-wrap { position: relative; height: 320px; }
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
export class V3EmployeesComponent implements OnDestroy {
  @ViewChild('profitCanvas') profitCanvas!: ElementRef<HTMLCanvasElement>;

  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);

  loading        = signal(true);
  error          = signal<string | null>(null);
  rawGroups      = signal<any[]>([]);
  allEmployees   = signal<FlatEmployee[]>([]);
  branches       = signal<string[]>([]);
  regions        = signal<string[]>([]);
  likelyLeftIds  = signal<Set<string>>(new Set());

  searchText   = '';
  branchFilter = '';
  regionFilter = '';
  ratingFilter = '';

  filteredGroups = signal<any[]>([]);

  totalEmpCount = (acc: number, g: any) => acc + (g.employees?.length ?? 0);

  private profitChart: Chart | null = null;

  constructor() {
    effect(() => {
      const from = this.dateRange.from();
      const to   = this.dateRange.to();
      if (!from || !to) return;
      this.load(from, to);
    });
  }

  totalElements = signal(0);

  private load(from: string, to: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.profitChart?.destroy();
    this.profitChart = null;
    this.likelyLeftIds.set(new Set());

    // Compute the "recent 30 days" window — last month of the selected range
    const toDate     = new Date(to);
    const recentFrom = new Date(toDate);
    recentFrom.setDate(recentFrom.getDate() - 30);
    const recentFromStr = recentFrom.toISOString().split('T')[0];
    // Only flag if the range is longer than 45 days (short ranges can't meaningfully detect departure)
    const rangeDays  = (toDate.getTime() - new Date(from).getTime()) / 86_400_000;
    const checkLeft  = rangeDays > 45;

    forkJoin({
      full:   this.svc.getEmployeePerformance(from, to, 0, 500, 'totalSar'),
      recent: checkLeft
        ? this.svc.getEmployeePerformance(recentFromStr, to, 0, 500, 'totalSar').pipe(catchError(() => of(null)))
        : of(null),
    }).subscribe({
      next: ({ full, recent }) => {
        const flat: FlatEmployee[] = full?.data ?? [];
        this.totalElements.set(full?.totalElements ?? flat.length);
        this.allEmployees.set(flat);

        // Detect likely-left employees: had activity in the full range but not in last 30 days
        if (checkLeft && recent?.data) {
          const recentIds = new Set<string>((recent.data as any[]).map((e: any) => e.empId));
          const leftIds   = new Set<string>(
            flat.filter(e => e.totalSar > 0 && !recentIds.has(e.empId)).map(e => e.empId)
          );
          this.likelyLeftIds.set(leftIds);
        }

        // Re-group flat employees by branch for the branch-header display
        const groupMap = new Map<string, any>();
        for (const e of flat) {
          if (!groupMap.has(e.branchCode)) {
            groupMap.set(e.branchCode, {
              branchCode: e.branchCode, branchName: e.branchName,
              region: e.region, employees: [], totalSar: 0
            });
          }
          const g = groupMap.get(e.branchCode);
          g.employees.push(e);
          g.totalSar += e.totalSar;
        }
        this.rawGroups.set([...groupMap.values()]);
        this.branches.set([...new Set(flat.map(e => e.branchName).filter(Boolean))].sort());
        this.regions.set([...new Set(flat.map(e => e.region).filter(Boolean))].sort());
        this.searchText   = '';
        this.branchFilter = '';
        this.regionFilter = '';
        this.ratingFilter = '';
        this.applyFilters();
        this.loading.set(false);
        setTimeout(() => this.buildProfitChart(flat), 50);
      },
      error: (err) => {
        this.error.set('فشل تحميل بيانات الموظفين: ' + (err?.message ?? 'خطأ'));
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void {
    const q  = this.searchText.trim().toLowerCase();
    const bf = this.branchFilter;
    const rf = this.regionFilter;
    const rat = this.ratingFilter;

    const groups = this.rawGroups()
      .map(g => {
        const emps = (g.employees ?? []).filter((e: FlatEmployee) => {
          const matchQ  = !q  || (e.empName ?? '').toLowerCase().includes(q) || (e.empId ?? '').toLowerCase().includes(q);
          const matchB  = !bf || e.branchName === bf;
          const matchR  = !rf || e.region === rf;
          const matchRat = !rat || e.rating === rat;
          return matchQ && matchB && matchR && matchRat;
        });
        return emps.length ? { ...g, employees: emps } : null;
      })
      .filter(Boolean);

    this.filteredGroups.set(groups as any[]);
  }

  private buildProfitChart(allEmps: FlatEmployee[]): void {
    const el = this.profitCanvas?.nativeElement;
    if (!el) return;
    this.profitChart?.destroy();

    const top10 = [...allEmps]
      .sort((a, b) => b.profitMargin - a.profitMargin)
      .slice(0, 10);

    this.profitChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: top10.map(e => e.empName),
        datasets: [{
          label: 'هامش الربح',
          data: top10.map(e => e.profitMargin),
          backgroundColor: top10.map(e => e.profitMargin >= 0 ? 'rgba(201,168,76,.75)' : 'rgba(239,68,68,.65)'),
          borderColor:     top10.map(e => e.profitMargin >= 0 ? '#c9a84c' : '#ef4444'),
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.85,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' هامش الربح: ' + Number(ctx.raw).toLocaleString('ar')
            }
          },
          datalabels: barDataLabels(),
        },
        scales: {
          x: {
            ticks: {
              color: 'rgba(255,255,255,.6)',
              font: { size: 10 },
              callback: (v: any) => fmtCompact(+v)
            },
            grid: { color: 'rgba(255,255,255,.08)' }
          },
          y: {
            ticks: { color: 'rgba(255,255,255,.7)', font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,.06)' }
          }
        }
      }
    });
  }

  ratingLabel(r: string): string {
    const map: Record<string, string> = {
      excellent: '⭐ ممتاز',
      good:      '✔ جيد',
      average:   '◎ متوسط',
      weak:      '✖ ضعيف',
    };
    return map[r] ?? r;
  }

  fmt(n: number): string {
    return n.toLocaleString('ar', { maximumFractionDigits: 0 });
  }

  fmtRate(n: number): string {
    return n.toFixed(1);
  }

  ngOnDestroy(): void {
    this.profitChart?.destroy();
  }
}
