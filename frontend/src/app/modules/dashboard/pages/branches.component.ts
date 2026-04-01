import { Component, inject, signal, computed, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { UploadService } from '../../../core/services/upload.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';
import { MizanPipe } from '../../../shared/pipes/mizan.pipe';
import { fmtSar, fmtN } from '../../../shared/utils/format.utils';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-branches',
  standalone: true,
  imports: [CommonModule, FormsModule, DateFilterComponent, MizanPipe],
  template: `
    <div class="page-header">
      <div><h2>الفروع</h2><p>تفاصيل أداء الفروع</p></div>
      <button class="export-btn" (click)="exportCsv()">⬇ تصدير</button>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    <div class="filter-bar">
      <input type="search" placeholder="بحث بالفرع..." [(ngModel)]="search" class="search-input">
      <select [(ngModel)]="regionFilter" (ngModelChange)="load()" class="region-select">
        <option value="">كل المناطق</option>
        @for (r of regions(); track r) {
          <option [value]="r">{{ r }}</option>
        }
      </select>
      <select [(ngModel)]="sortKey" class="region-select">
        <option value="sar">ترتيب: المبيعات</option>
        <option value="region">ترتيب: المنطقة</option>
        <option value="diffRate">ترتيب: فرق المعدل</option>
        <option value="net">ترتيب: الصافي</option>
        <option value="returns">ترتيب: المرتجعات</option>
      </select>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (filtered().length === 0) {
      <div class="empty-state"><div class="empty-icon">🏪</div><p>لا توجد بيانات</p></div>
    } @else {

      <!-- Returns KPI strip -->
      @if (totalReturns() > 0) {
        <div class="returns-kpi-strip">
          <div class="rkpi-card">
            <span class="rkpi-icon">↩️</span>
            <div class="rkpi-body">
              <div class="rkpi-label">إجمالي المرتجعات</div>
              <div class="rkpi-value">{{ fmtN(totalReturns()) }} <span class="rkpi-unit">ر.س</span></div>
            </div>
          </div>
          <div class="rkpi-card">
            <span class="rkpi-icon">🏪</span>
            <div class="rkpi-body">
              <div class="rkpi-label">فروع لديها مرتجعات</div>
              <div class="rkpi-value">{{ returnBranchCount() }} <span class="rkpi-unit">فرع</span></div>
            </div>
          </div>
          <div class="rkpi-card">
            <span class="rkpi-icon">📊</span>
            <div class="rkpi-body">
              <div class="rkpi-label">نسبة المرتجعات من المبيعات</div>
              <div class="rkpi-value rkpi-value--warn">{{ returnsPct() }}<span class="rkpi-unit">%</span></div>
            </div>
          </div>
        </div>
      }

      <div class="card chart-card" style="margin-bottom:1.5rem">
        <div class="card__header"><h3>فرق المعدل بالفروع</h3></div>
        <canvas #diffChart style="max-height:280px"></canvas>
      </div>

      <div class="card">
        <div class="card__header">
          <h3>قائمة الفروع ({{ filtered().length }})</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>الفرع</th><th>المنطقة</th>
                <th>المبيعات</th><th>الوزن</th><th>الفواتير</th>
                <th>المشتريات</th><th>الصافي</th>
                <th>س.بيع</th><th>س.شراء</th><th>الفرق</th>
                <th>المرتجعات</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              @for (row of groupedRows; track $index) {
                @if (row.type === 'header') {
                  <tr class="region-header">
                    <td [colSpan]="12">
                      🗺 {{ row.region }}
                      <span style="opacity:.6">({{ row.count }} {{ 'فرع' | mizan }}) · {{ fmtSarFn(row.sar) }}</span>
                      <span [style.color]="row.net >= 0 ? '#22c55e' : '#ef4444'"> · {{ 'صافي' | mizan }}: {{ fmtSarFn(row.net) }}</span>
                      @if (row.returns > 0) {
                        <span class="rh-returns"> · ↩️ {{ fmtN(row.returns) }} ر.س</span>
                      }
                    </td>
                  </tr>
                } @else {
                  @let b = row.branch;
                  @let hasReturns = (b.returns ?? 0) > 0;
                  <tr [class.return-row]="hasReturns">
                    <td><strong>{{ b.name }}</strong></td>
                    <td><span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>{{ b.region }}</td>
                    <td>{{ fmt(b.sar) }}</td>
                    <td>{{ b.wn?.toFixed(2) }}</td>
                    <td>{{ b.pcs }}</td>
                    <td>{{ fmt(b.purch + b.mothan) }}</td>
                    <td [class]="ana.getDiffClass(b.net)">{{ fmt(b.net) }}</td>
                    <td>{{ b.saleRate?.toFixed(2) }}</td>
                    <td>{{ b.purchRate?.toFixed(2) }}</td>
                    <td [class]="ana.getDiffClass(b.diffRate)">{{ b.diffRate?.toFixed(2) }}</td>
                    <td>
                      @if (hasReturns) {
                        <span class="returns-pill">{{ fmtN(b.returns) }}</span>
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td>
                      @if (hasReturns) {
                        <span class="status-badge status-return">🔄 مرتجعات</span>
                      } @else if ((b.diffRate ?? 0) > 0) {
                        <span class="status-badge status-profit">✅ رابح</span>
                      } @else if ((b.diffRate ?? 0) < 0) {
                        <span class="status-badge status-loss">🔴 خاسر</span>
                      } @else {
                        <span class="status-badge status-neutral">— متعادل</span>
                      }
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
    .filter-bar { display: flex; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .search-input, .region-select {
      padding: .4rem .75rem; border: 1px solid var(--mizan-border); border-radius: 6px;
      background: var(--mizan-surface); color: var(--mizan-text); font-size: .85rem;
    }
    .search-input { flex: 1; min-width: 180px; }
    .region-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
    .pos, .text-success { color: var(--mizan-green); font-weight: 600; }
    .neg, .text-danger { color: var(--mizan-danger); font-weight: 600; }
    .muted { color: rgba(242,237,228,.4); }
    .export-btn {
      padding: .3rem .85rem; border-radius: 20px; font-size: .78rem; font-weight: 600; cursor: pointer;
      background: rgba(201,168,76,.12); color: var(--mz-gold, #c9a84c);
      border: 1px solid rgba(201,168,76,.3);
    }
    .export-btn:hover { background: rgba(201,168,76,.22); }
    .table-wrap { overflow-x: auto; }
    .card__header { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    .chart-card { padding: 1rem; }

    /* Region group header */
    .region-header td {
      background: rgba(255,255,255,0.06); font-weight: 700; font-size: 13px;
      color: var(--mz-gold); border-bottom: 2px solid rgba(255,255,255,0.1); padding: 10px 16px;
    }
    .rh-returns { color: #f87171; font-weight: 700; }

    /* Return row highlight */
    .return-row { background: rgba(248,113,113,.04) !important; }
    .return-row:hover { background: rgba(248,113,113,.08) !important; }

    /* Returns pill */
    .returns-pill {
      display: inline-block; padding: .18rem .5rem; border-radius: 10px;
      background: rgba(248,113,113,.15); color: #f87171;
      font-size: .72rem; font-weight: 700;
    }

    /* Status badges */
    .status-badge { display: inline-block; padding: .18rem .5rem; border-radius: 10px; font-size: .7rem; font-weight: 700; }
    .status-profit  { background: rgba(52,211,153,.12); color: #34d399; }
    .status-loss    { background: rgba(248,113,113,.12); color: #f87171; }
    .status-return  { background: rgba(251,191,36,.12);  color: #fbbf24; }
    .status-neutral { background: rgba(255,255,255,.06); color: rgba(242,237,228,.45); }

    /* Returns KPI strip */
    .returns-kpi-strip {
      display: flex; gap: .75rem; margin-bottom: 1.25rem; flex-wrap: wrap;
    }
    .rkpi-card {
      display: flex; align-items: center; gap: .75rem;
      padding: .75rem 1.1rem; border-radius: 10px;
      background: rgba(248,113,113,.07);
      border: 1px solid rgba(248,113,113,.2);
      flex: 1; min-width: 200px;
    }
    .rkpi-icon { font-size: 1.4rem; }
    .rkpi-label { font-size: .7rem; color: rgba(242,237,228,.5); margin-bottom: .15rem; }
    .rkpi-value { font-size: 1.1rem; font-weight: 700; color: #f87171; }
    .rkpi-value--warn { color: #fbbf24; }
    .rkpi-unit { font-size: .75rem; font-weight: 400; color: rgba(242,237,228,.5); margin-inline-start: .2rem; }
  `]
})
export class BranchesComponent implements OnInit, OnDestroy, AfterViewInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);
  private dr = inject(DateRangeService);
  private uploadSvc = inject(UploadService);

  @ViewChild('diffChart') diffChartRef!: ElementRef<HTMLCanvasElement>;

  branches = signal<any[]>([]);
  regions  = signal<string[]>([]);
  loading  = signal(false);
  search        = '';
  regionFilter  = '';
  sortKey       = 'sar';

  fmtSarFn = fmtSar;
  fmtN     = fmtN;

  private chart: Chart | null = null;
  private viewReady = false;

  filtered = () => {
    const s = this.search.toLowerCase();
    return this.branches().filter(b =>
      !s || b.name?.toLowerCase().includes(s) || b.code?.toLowerCase().includes(s)
    );
  };

  totalReturns     = computed(() => this.branches().reduce((s, b) => s + (b.returns ?? 0), 0));
  returnBranchCount = computed(() => this.branches().filter(b => (b.returns ?? 0) > 0).length);
  returnsPct       = computed(() => {
    const totalSar = this.branches().reduce((s, b) => s + (b.sar ?? 0), 0);
    return totalSar > 0 ? ((this.totalReturns() / totalSar) * 100).toFixed(1) : '0.0';
  });

  get sortedBranches(): any[] {
    const list = [...this.filtered()];
    if (this.sortKey === 'region') {
      list.sort((a, b) => {
        const rc = (a.region ?? '').localeCompare(b.region ?? '');
        return rc !== 0 ? rc : (b.sar ?? 0) - (a.sar ?? 0);
      });
    } else if (this.sortKey === 'diffRate') {
      list.sort((a, b) => (b.diffRate ?? 0) - (a.diffRate ?? 0));
    } else if (this.sortKey === 'net') {
      list.sort((a, b) => (b.net ?? 0) - (a.net ?? 0));
    } else if (this.sortKey === 'returns') {
      list.sort((a, b) => (b.returns ?? 0) - (a.returns ?? 0));
    } else {
      list.sort((a, b) => (b.sar ?? 0) - (a.sar ?? 0));
    }
    return list;
  }

  get groupedRows(): Array<
    { type: 'header'; region: string; count: number; sar: number; net: number; returns: number } |
    { type: 'row'; branch: any }
  > {
    if (this.sortKey !== 'region') {
      return this.sortedBranches.map(b => ({ type: 'row' as const, branch: b }));
    }
    const rows: any[] = [];
    let lastRegion = '';
    for (const b of this.sortedBranches) {
      const region = b.region ?? 'غير محدد';
      if (region !== lastRegion) {
        const rBranches = this.sortedBranches.filter(x => (x.region ?? 'غير محدد') === region);
        rows.push({
          type: 'header',
          region,
          count:   rBranches.length,
          sar:     rBranches.reduce((s: number, x: any) => s + (x.sar ?? 0), 0),
          net:     rBranches.reduce((s: number, x: any) => s + (x.net ?? 0), 0),
          returns: rBranches.reduce((s: number, x: any) => s + (x.returns ?? 0), 0),
        });
        lastRegion = region;
      }
      rows.push({ type: 'row', branch: b });
    }
    return rows;
  }

  ngOnInit(): void { this.load(); }

  exportCsv(): void { this.uploadSvc.exportCsv('branch-sales', this.dr.getFrom(), this.dr.getTo()); }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.branches().length > 0) setTimeout(() => this.buildChart(), 0);
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    this.svc.getBranches(from, to, this.regionFilter || undefined).subscribe({
      next: r => {
        const data = r.data ?? [];
        this.branches.set(data);
        const rs = [...new Set(data.map((b: any) => b.region as string))].filter(Boolean);
        this.regions.set(rs);
        this.loading.set(false);
        if (this.viewReady) setTimeout(() => this.buildChart(), 0);
      },
      error: () => this.loading.set(false)
    });
  }

  private buildChart(): void {
    this.chart?.destroy();
    const bs = [...this.branches()].sort((a, b) => b.diffRate - a.diffRate).slice(0, 15);
    if (!bs.length || !this.diffChartRef?.nativeElement) return;
    this.chart = new Chart(this.diffChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: bs.map(b => b.name),
        datasets: [{
          label: 'فرق المعدل',
          data: bs.map(b => b.diffRate),
          backgroundColor: bs.map(b => b.diffRate >= 0 ? 'rgba(16,185,129,.7)' : 'rgba(220,53,69,.7)')
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
}
