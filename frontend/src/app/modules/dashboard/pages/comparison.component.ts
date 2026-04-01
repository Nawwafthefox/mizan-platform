import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { fmtN } from '../../../shared/utils/format.utils';

@Component({
  selector: 'app-comparison',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>مقارنة الأيام</h2><p>قارن بين يومين من البيانات</p></div>
    </div>

    <div class="compare-controls card">
      <div class="control-group">
        <label>اليوم الأول</label>
        <input type="date" [(ngModel)]="d1" class="date-input">
      </div>
      <div class="vs-label">VS</div>
      <div class="control-group">
        <label>اليوم الثاني</label>
        <input type="date" [(ngModel)]="d2" class="date-input">
      </div>
      <button class="compare-btn" (click)="compare()" [disabled]="loading()">
        {{ loading() ? 'جاري المقارنة...' : 'مقارنة' }}
      </button>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (!result()) {
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <p>اختر يومين وانقر مقارنة</p>
      </div>
    } @else {
      @let d = result()!.delta;

      <!-- Day Summaries -->
      <div class="days-row">
        <div class="day-card card">
          <div class="day-header">
            <h3>{{ result()!.day1.date }}</h3>
            <span class="day-badge day-badge--1">اليوم الأول</span>
          </div>
          <div class="day-stats">
            <div class="day-stat"><span>المبيعات</span><strong>{{ fmt(result()!.day1.totalSar) }}</strong></div>
            <div class="day-stat"><span>المشتريات</span><strong>{{ fmt(result()!.day1.totalPurch) }}</strong></div>
            <div class="day-stat"><span>الصافي</span><strong [class]="dc(result()!.day1.net)">{{ fmt(result()!.day1.net) }}</strong></div>
            <div class="day-stat"><span>الفواتير</span><strong>{{ result()!.day1.totalPcs }}</strong></div>
            <div class="day-stat"><span>الفروع</span><strong>{{ result()!.day1.branchCount }}</strong></div>
            <div class="day-stat"><span>س.بيع</span><strong>{{ result()!.day1.saleRate?.toFixed(2) }}</strong></div>
            <div class="day-stat"><span>س.شراء</span><strong>{{ result()!.day1.purchRate?.toFixed(2) }}</strong></div>
          </div>
        </div>
        <div class="day-card card">
          <div class="day-header">
            <h3>{{ result()!.day2.date }}</h3>
            <span class="day-badge day-badge--2">اليوم الثاني</span>
          </div>
          <div class="day-stats">
            <div class="day-stat"><span>المبيعات</span><strong>{{ fmt(result()!.day2.totalSar) }}</strong></div>
            <div class="day-stat"><span>المشتريات</span><strong>{{ fmt(result()!.day2.totalPurch) }}</strong></div>
            <div class="day-stat"><span>الصافي</span><strong [class]="dc(result()!.day2.net)">{{ fmt(result()!.day2.net) }}</strong></div>
            <div class="day-stat"><span>الفواتير</span><strong>{{ result()!.day2.totalPcs }}</strong></div>
            <div class="day-stat"><span>الفروع</span><strong>{{ result()!.day2.branchCount }}</strong></div>
            <div class="day-stat"><span>س.بيع</span><strong>{{ result()!.day2.saleRate?.toFixed(2) }}</strong></div>
            <div class="day-stat"><span>س.شراء</span><strong>{{ result()!.day2.purchRate?.toFixed(2) }}</strong></div>
          </div>
        </div>
      </div>

      <!-- Delta Row -->
      <div class="delta-grid">
        <div class="delta-card">
          <div class="delta-label">فرق المبيعات</div>
          <div class="delta-value" [class]="dc(d.totalSar)">{{ fmtDiff(d.totalSar) }}</div>
          <div class="delta-pct" [class]="dc(d.totalSarPct)">{{ pct(d.totalSarPct) }}</div>
        </div>
        <div class="delta-card">
          <div class="delta-label">فرق المشتريات</div>
          <div class="delta-value" [class]="dc(d.totalPurch)">{{ fmtDiff(d.totalPurch) }}</div>
          <div class="delta-pct" [class]="dc(d.totalPurchPct)">{{ pct(d.totalPurchPct) }}</div>
        </div>
        <div class="delta-card">
          <div class="delta-label">فرق الصافي</div>
          <div class="delta-value" [class]="dc(d.net)">{{ fmtDiff(d.net) }}</div>
          <div class="delta-pct" [class]="dc(d.netPct)">{{ pct(d.netPct) }}</div>
        </div>
      </div>

      <!-- Branch Comparison Table -->
      @if (result()!.byBranch?.length > 0) {
        <div class="card">
          <div class="card__header"><h3>مقارنة الفروع ({{ result()!.byBranch.length }})</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>الفرع</th>
                  <th>المنطقة</th>
                  <!-- Sales -->
                  <th class="grp-hdr">مبيعات يوم1</th>
                  <th class="grp-hdr">مبيعات يوم2</th>
                  <th class="grp-hdr">Δ مبيعات</th>
                  <th class="grp-hdr">%</th>
                  <!-- Purchases -->
                  <th class="grp-hdr grp-hdr--purch">مشت. يوم1</th>
                  <th class="grp-hdr grp-hdr--purch">مشت. يوم2</th>
                  <th class="grp-hdr grp-hdr--purch">Δ مشت.</th>
                  <th class="grp-hdr grp-hdr--purch">%</th>
                  <!-- Net -->
                  <th class="grp-hdr grp-hdr--net">صافي يوم1</th>
                  <th class="grp-hdr grp-hdr--net">صافي يوم2</th>
                  <th class="grp-hdr grp-hdr--net">Δ صافي</th>
                  <th class="grp-hdr grp-hdr--net">%</th>
                </tr>
              </thead>
              <tbody>
                @for (b of result()!.byBranch; track b.branchCode) {
                  <tr>
                    <td><strong>{{ b.branchName }}</strong></td>
                    <td>
                      <span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>
                      {{ b.region }}
                    </td>
                    <!-- Sales cols -->
                    <td class="num">{{ fmt(b.sar1) }}</td>
                    <td class="num">{{ fmt(b.sar2) }}</td>
                    <td class="num" [class]="dc(b.sarDelta)">{{ fmtDiff(b.sarDelta) }}</td>
                    <td class="num" [class]="dc(b.sarDeltaPct)">{{ pct(b.sarDeltaPct) }}</td>
                    <!-- Purchase cols -->
                    <td class="num muted">{{ fmt(b.purch1) }}</td>
                    <td class="num muted">{{ fmt(b.purch2) }}</td>
                    <td class="num" [class]="dc(b.purchDelta)">{{ fmtDiff(b.purchDelta) }}</td>
                    <td class="num" [class]="dc(b.purchDeltaPct)">{{ pct(b.purchDeltaPct) }}</td>
                    <!-- Net cols -->
                    <td class="num" [class]="dc(b.net1)">{{ fmt(b.net1) }}</td>
                    <td class="num" [class]="dc(b.net2)">{{ fmt(b.net2) }}</td>
                    <td class="num" [class]="dc(b.netDelta)">{{ fmtDiff(b.netDelta) }}</td>
                    <td class="num" [class]="dc(b.netDeltaPct)">{{ pct(b.netDeltaPct) }}</td>
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
    .compare-controls {
      display: flex; align-items: flex-end; gap: 1.5rem; padding: 1.25rem;
      margin-bottom: 1.5rem; flex-wrap: wrap;
    }
    .control-group { display: flex; flex-direction: column; gap: .35rem; }
    .control-group label { font-size: .8rem; color: var(--mizan-text-muted, rgba(242,237,228,.5)); }
    .date-input {
      padding: .4rem .75rem; border: 1px solid var(--mizan-border); border-radius: 6px;
      background: var(--mizan-surface); color: var(--mizan-text); font-size: .9rem;
    }
    .vs-label { font-size: 1.2rem; font-weight: 700; color: var(--mizan-gold); padding-bottom: .3rem; }
    .compare-btn {
      padding: .5rem 1.5rem; background: var(--mizan-gold); color: var(--mizan-green-dark);
      border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: .9rem;
    }
    .compare-btn:disabled { opacity: .6; cursor: not-allowed; }

    /* Delta cards */
    .delta-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;
    }
    @media(max-width:600px) { .delta-grid { grid-template-columns: 1fr; } }
    .delta-card {
      background: var(--mizan-surface); border: 1px solid var(--mizan-border);
      border-radius: 10px; padding: 1rem;
    }
    .delta-label { font-size: .75rem; color: var(--mizan-text-muted, rgba(242,237,228,.5)); margin-bottom: .3rem; }
    .delta-value { font-size: 1.2rem; font-weight: 700; }
    .delta-pct   { font-size: .8rem; margin-top: .2rem; font-weight: 600; }

    /* Day cards */
    .days-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    @media(max-width:700px) { .days-row { grid-template-columns: 1fr; } }
    .day-card { padding: 1rem; }
    .day-header { display: flex; align-items: center; gap: .75rem; margin-bottom: .75rem; }
    .day-header h3 { margin: 0; font-size: 1rem; }
    .day-badge { padding: .2rem .6rem; border-radius: 10px; font-size: .72rem; font-weight: 600; }
    .day-badge--1 { background: rgba(59,130,246,.15);  color: #3b82f6; }
    .day-badge--2 { background: rgba(236,72,153,.15); color: #ec4899; }
    .day-stats { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    .day-stat { display: flex; flex-direction: column; gap: .1rem; font-size: .85rem; }
    .day-stat span { font-size: .72rem; color: var(--mizan-text-muted, rgba(242,237,228,.5)); }

    /* Table */
    .table-wrap { overflow-x: auto; }
    .card__header { display: flex; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: var(--mz-surface-2, #213d2e); }
    thead th {
      padding: 8px 10px; font-size: 10px; font-weight: 700; color: var(--mz-gold, #c9a84c);
      text-align: end; white-space: nowrap; letter-spacing: .4px;
    }
    thead th:first-child, thead th:nth-child(2) { text-align: start; }
    .grp-hdr        { border-inline-start: 1px solid rgba(201,168,76,.12); }
    .grp-hdr--purch { color: rgba(52,211,153,.8) !important; }
    .grp-hdr--net   { color: rgba(148,163,184,.8) !important; }
    tbody tr {
      border-bottom: 1px solid rgba(201,168,76,.1);
      transition: background .12s;
      &:hover { background: rgba(201,168,76,.04); }
    }
    tbody td { padding: 7px 10px; font-size: 12px; color: var(--mz-text, #f2ede4); }
    .num  { text-align: end; }
    .muted { color: rgba(242,237,228,.4); }
    .pos  { color: #34d399; font-weight: 600; }
    .neg  { color: #f87171; font-weight: 600; }
    .region-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
  `]
})
export class ComparisonComponent implements OnInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);

  d1 = '';
  d2 = '';
  result  = signal<any>(null);
  loading = signal(false);

  ngOnInit(): void {
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    this.d2 = today;
    this.d1 = yesterday;
  }

  compare(): void {
    if (!this.d1 || !this.d2) return;
    this.loading.set(true);
    this.svc.getComparison(this.d1, this.d2).subscribe({
      next: r => { this.result.set(r.data ?? null); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  /** Shorthand for AnalyticsService.getDiffClass */
  dc(n?: number): string { return this.ana.getDiffClass(n ?? 0); }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }

  fmtDiff(n?: number): string {
    const v = n ?? 0;
    return (v >= 0 ? '+' : '') + v.toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }

  pct(n?: number): string {
    const v = n ?? 0;
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }
}
