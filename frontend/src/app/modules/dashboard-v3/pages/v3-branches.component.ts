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
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';
import { V3KpiCardComponent } from '../shared/v3-kpi-card.component';

Chart.register(...registerables);

type SortKey = 'totalSar' | 'net' | 'diffRate' | 'returns' | 'region';

@Component({
  selector: 'app-v3-branches',
  standalone: true,
  imports: [CommonModule, FormsModule, V3KpiCardComponent],
  template: `
    <div class="branches-root" dir="rtl">

      <!-- Summary KPIs -->
      <div class="kpi-row">
        <v3-kpi-card
          label="إجمالي المبيعات"
          icon="💰"
          color="gold"
          [value]="loading() ? null : fmt(summary().totalSales) + ' ريال'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="إجمالي المشتريات"
          icon="🛒"
          color="gold"
          [value]="loading() ? null : fmt(summary().totalPurch) + ' ريال'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="الصافي الكلي"
          icon="📈"
          [color]="summary().net >= 0 ? 'green' : 'red'"
          [value]="loading() ? null : fmt(summary().net) + ' ريال'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="إجمالي المرتجعات"
          icon="🔄"
          color="red"
          [value]="loading() ? null : fmt(summary().returns) + ' ريال'"
          [loading]="loading()"
        />
        <v3-kpi-card
          label="عدد الفروع"
          icon="🏪"
          color="blue"
          [value]="loading() ? null : summary().count.toString()"
          [loading]="loading()"
        />
      </div>

      <!-- Error -->
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <!-- Filter / Sort Bar -->
      <div class="filter-bar">
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
          <label class="filter-label">ترتيب حسب</label>
          <select class="filter-select" [(ngModel)]="sortKey" (ngModelChange)="applyFilters()">
            <option value="totalSar">المبيعات</option>
            <option value="net">الصافي</option>
            <option value="diffRate">فرق المعدل</option>
            <option value="returns">المرتجعات</option>
            <option value="region">المنطقة</option>
          </select>
        </div>
        <div class="filter-group search-group">
          <label class="filter-label">بحث</label>
          <input
            class="filter-input"
            type="text"
            placeholder="اسم الفرع أو الرمز..."
            [(ngModel)]="searchText"
            (ngModelChange)="applyFilters()"
          />
        </div>
      </div>

      <!-- Branches Table -->
      <div class="table-card">
        @if (loading()) {
          <div class="skeleton-block" style="height:360px"></div>
        } @else {
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الفرع</th>
                  <th>المنطقة</th>
                  <th>المبيعات</th>
                  <th>الوزن (غ)</th>
                  <th>الفواتير</th>
                  <th>متوسط الفاتورة</th>
                  <th>المشتريات</th>
                  <th>الصافي</th>
                  <th>م.البيع</th>
                  <th>م.الشراء</th>
                  <th>فرق المعدل</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                @if (sortKey === 'region') {
                  @for (group of regionGroups(); track group.region) {
                    <tr class="region-header-row">
                      <td colspan="13">
                        <span class="region-label">{{ group.region }}</span>
                        <span class="region-badge">{{ group.items.length }} فرع</span>
                        <span class="region-total">{{ fmt(group.totalSar) }} ريال</span>
                        <span class="region-net" [class.pos]="group.net >= 0" [class.neg]="group.net < 0">
                          صافي: {{ fmt(group.net) }}
                        </span>
                      </td>
                    </tr>
                    @for (b of group.items; track b.branchCode; let i = $index) {
                      <tr class="data-row">
                        <td class="idx">{{ i + 1 }}</td>
                        <td class="branch-name">{{ b.branchName }}</td>
                        <td>{{ b.region }}</td>
                        <td class="num">{{ fmt(b.totalSar) }}</td>
                        <td class="num">{{ fmt(b.totalWeight) }}</td>
                        <td class="num">{{ fmt(b.totalPieces) }}</td>
                        <td class="num">{{ fmtRate(b.avgInvoice) }}</td>
                        <td class="num">{{ fmt(b.purchSar) }}</td>
                        <td class="num" [class.pos]="b.net >= 0" [class.neg]="b.net < 0">{{ fmt(b.net) }}</td>
                        <td class="num">{{ fmtRate(b.saleRate) }}</td>
                        <td class="num">{{ fmtRate(b.purchRate) }}</td>
                        <td class="num" [class.pos]="b.diffRate > 0" [class.neg]="b.diffRate < 0">{{ fmtRate(b.diffRate) }}</td>
                        <td><span class="dot" [class.dot-green]="b.diffRate >= 0" [class.dot-red]="b.diffRate < 0"></span></td>
                      </tr>
                    }
                  }
                } @else {
                  @for (b of filtered(); track b.branchCode; let i = $index) {
                    <tr class="data-row">
                      <td class="idx">{{ i + 1 }}</td>
                      <td class="branch-name">{{ b.branchName }}</td>
                      <td>{{ b.region }}</td>
                      <td class="num">{{ fmt(b.totalSar) }}</td>
                      <td class="num">{{ fmt(b.totalWeight) }}</td>
                      <td class="num">{{ fmt(b.totalPieces) }}</td>
                      <td class="num">{{ fmtRate(b.avgInvoice) }}</td>
                      <td class="num">{{ fmt(b.purchSar) }}</td>
                      <td class="num" [class.pos]="b.net >= 0" [class.neg]="b.net < 0">{{ fmt(b.net) }}</td>
                      <td class="num">{{ fmtRate(b.saleRate) }}</td>
                      <td class="num">{{ fmtRate(b.purchRate) }}</td>
                      <td class="num" [class.pos]="b.diffRate > 0" [class.neg]="b.diffRate < 0">{{ fmtRate(b.diffRate) }}</td>
                      <td><span class="dot" [class.dot-green]="b.diffRate >= 0" [class.dot-red]="b.diffRate < 0"></span></td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- Diff Rate Bar Chart -->
      <div class="chart-card">
        <div class="chart-title">فرق المعدل لكل فرع</div>
        @if (loading()) {
          <div class="skeleton-block" style="height:260px"></div>
        } @else {
          <div class="chart-wrap">
            <canvas #diffBarCanvas></canvas>
          </div>
          <div class="chart-insight">
            الأشرطة الخضراء تعني أن سعر البيع أعلى من سعر الشراء — أي أن الفرع يحقق هامش ربح إيجابي. الأشرطة الحمراء تنبّهك لفروع يُباع فيها بأقل من تكلفة الشراء وتستوجب المراجعة الفورية. كلما طال الشريط الأخضر، كان الهامش أفضل.
          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    .branches-root {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      color: var(--mizan-text);
    }

    .kpi-row {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: .85rem;
    }
    @media (max-width: 1000px) { .kpi-row { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 600px)  { .kpi-row { grid-template-columns: repeat(2, 1fr); } }

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
    .search-group { flex: 1; min-width: 200px; }
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
      min-width: 140px;
    }
    .filter-input { width: 100%; }
    .filter-select:focus,
    .filter-input:focus { border-color: var(--mizan-gold); }

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
      font-size: .82rem;
      min-width: 900px;
    }
    .data-table th {
      text-align: right;
      padding: .65rem .75rem;
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
      padding: .55rem .75rem;
      border-bottom: 1px solid rgba(255,255,255,.04);
      white-space: nowrap;
    }
    .data-table .data-row:hover td { background: rgba(255,255,255,.03); }
    .data-table tr:last-child td { border-bottom: none; }
    .num { font-variant-numeric: tabular-nums; }
    .pos { color: var(--mizan-green); }
    .neg { color: var(--mizan-danger); }
    .idx { color: var(--mizan-text-muted); font-size: .75rem; }
    .branch-name { font-weight: 500; }

    .region-header-row td {
      background: rgba(201,168,76,.06);
      padding: .5rem .75rem;
      border-top: 1px solid rgba(201,168,76,.2);
      border-bottom: 1px solid rgba(201,168,76,.2);
    }
    .region-label { font-weight: 700; color: var(--mizan-gold); margin-left: .75rem; font-size: .88rem; }
    .region-badge {
      font-size: .75rem;
      background: rgba(201,168,76,.15);
      color: var(--mizan-gold);
      border-radius: 20px;
      padding: .15rem .55rem;
      margin-left: .5rem;
    }
    .region-total { color: var(--mizan-text-muted); font-size: .8rem; margin-left: .75rem; }
    .region-net { font-size: .8rem; margin-left: .75rem; }

    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot-green { background: var(--mizan-green); }
    .dot-red   { background: var(--mizan-danger); }

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
    .chart-wrap { position: relative; height: 260px; }
    .chart-wrap canvas { width: 100% !important; height: 100% !important; }
    .chart-insight {
      margin-top: 0.85rem;
      font-size: 0.9rem;
      color: rgba(232,228,220,0.65);
      line-height: 1.75;
      padding: 0.7rem 1rem;
      background: rgba(201,168,76,0.05);
      border-right: 3px solid rgba(201,168,76,0.35);
      border-radius: 0 8px 8px 0;
    }

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
export class V3BranchesComponent implements OnDestroy {
  @ViewChild('diffBarCanvas') diffBarCanvas!: ElementRef<HTMLCanvasElement>;

  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);

  loading    = signal(true);
  error      = signal<string | null>(null);
  allBranches = signal<any[]>([]);
  filtered   = signal<any[]>([]);
  regions    = signal<string[]>([]);

  regionFilter = '';
  searchText   = '';
  sortKey: SortKey = 'totalSar';

  summary = computed(() => {
    const b = this.allBranches();
    return {
      totalSales: b.reduce((s, x) => s + (x.totalSar ?? 0), 0),
      totalPurch: b.reduce((s, x) => s + (x.purchSar ?? 0), 0),
      net:        b.reduce((s, x) => s + (x.net ?? 0), 0),
      returns:    b.reduce((s, x) => s + (x.returns ?? 0), 0),
      count:      b.length,
    };
  });

  regionGroups = computed(() => {
    const map = new Map<string, any[]>();
    for (const b of this.filtered()) {
      const r = b.region ?? '—';
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(b);
    }
    return Array.from(map.entries()).map(([region, items]) => ({
      region,
      items,
      totalSar: items.reduce((s, x) => s + (x.totalSar ?? 0), 0),
      net:      items.reduce((s, x) => s + (x.net ?? 0), 0),
    }));
  });

  private diffChart: Chart | null = null;

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
    this.diffChart?.destroy();
    this.diffChart = null;

    this.svc.getBranchSummary(from, to).subscribe({
      next: (branches) => {
        const unique = [...new Set(branches.map((b: any) => b.region).filter(Boolean))].sort() as string[];
        this.regions.set(unique);
        this.allBranches.set(branches);
        this.regionFilter = '';
        this.searchText   = '';
        this.sortKey      = 'totalSar';
        this.applyFilters();
        this.loading.set(false);
        setTimeout(() => this.buildDiffChart(), 50);
      },
      error: (err) => {
        this.error.set('فشل تحميل بيانات الفروع: ' + (err?.message ?? 'خطأ'));
        this.loading.set(false);
      }
    });
  }

  applyFilters(): void {
    let data = [...this.allBranches()];
    if (this.regionFilter) {
      data = data.filter(b => b.region === this.regionFilter);
    }
    if (this.searchText.trim()) {
      const q = this.searchText.trim().toLowerCase();
      data = data.filter(b =>
        (b.branchName ?? '').toLowerCase().includes(q) ||
        (b.branchCode ?? '').toLowerCase().includes(q)
      );
    }
    data.sort((a, b) => {
      if (this.sortKey === 'region') return (a.region ?? '').localeCompare(b.region ?? '');
      return (b[this.sortKey] ?? 0) - (a[this.sortKey] ?? 0);
    });
    this.filtered.set(data);
    setTimeout(() => this.buildDiffChart(), 50);
  }

  private buildDiffChart(): void {
    const el = this.diffBarCanvas?.nativeElement;
    if (!el) return;
    this.diffChart?.destroy();
    const data = this.filtered().slice(0, 30);
    this.diffChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: data.map(b => b.branchName),
        datasets: [{
          label: 'فرق المعدل',
          data: data.map(b => b.diffRate ?? 0),
          backgroundColor: data.map(b => (b.diffRate ?? 0) >= 0 ? 'rgba(34,197,94,.7)' : 'rgba(239,68,68,.7)'),
          borderColor:     data.map(b => (b.diffRate ?? 0) >= 0 ? '#22c55e' : '#ef4444'),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: 'rgba(255,255,255,.6)', font: { size: 10 } },
            grid:  { color: 'rgba(255,255,255,.08)' }
          },
          y: {
            ticks: { color: 'rgba(255,255,255,.6)', font: { size: 10 } },
            grid:  { color: 'rgba(255,255,255,.08)' }
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
    this.diffChart?.destroy();
  }
}
