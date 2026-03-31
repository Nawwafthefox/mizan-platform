import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';

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
      <!-- Delta Cards -->
      <div class="delta-grid">
        <div class="delta-card">
          <div class="delta-label">فرق المبيعات</div>
          <div class="delta-value" [class]="ana.getDiffClass(result()!.delta.totalSar)">
            {{ fmtDiff(result()!.delta.totalSar) }}
          </div>
          <div class="delta-pct" [class]="ana.getDiffClass(result()!.delta.totalSarPct)">
            {{ result()!.delta.totalSarPct?.toFixed(1) }}%
          </div>
        </div>
        <div class="delta-card">
          <div class="delta-label">فرق المشتريات</div>
          <div class="delta-value" [class]="ana.getDiffClass(result()!.delta.totalPurch)">
            {{ fmtDiff(result()!.delta.totalPurch) }}
          </div>
        </div>
        <div class="delta-card">
          <div class="delta-label">فرق الصافي</div>
          <div class="delta-value" [class]="ana.getDiffClass(result()!.delta.net)">
            {{ fmtDiff(result()!.delta.net) }}
          </div>
          <div class="delta-pct" [class]="ana.getDiffClass(result()!.delta.netPct)">
            {{ result()!.delta.netPct?.toFixed(1) }}%
          </div>
        </div>
      </div>

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
            <div class="day-stat"><span>الصافي</span><strong [class]="ana.getDiffClass(result()!.day1.net)">{{ fmt(result()!.day1.net) }}</strong></div>
            <div class="day-stat"><span>الفواتير</span><strong>{{ result()!.day1.totalPcs }}</strong></div>
            <div class="day-stat"><span>الفروع</span><strong>{{ result()!.day1.branchCount }}</strong></div>
            <div class="day-stat"><span>س.بيع</span><strong>{{ result()!.day1.saleRate?.toFixed(2) }}</strong></div>
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
            <div class="day-stat"><span>الصافي</span><strong [class]="ana.getDiffClass(result()!.day2.net)">{{ fmt(result()!.day2.net) }}</strong></div>
            <div class="day-stat"><span>الفواتير</span><strong>{{ result()!.day2.totalPcs }}</strong></div>
            <div class="day-stat"><span>الفروع</span><strong>{{ result()!.day2.branchCount }}</strong></div>
            <div class="day-stat"><span>س.بيع</span><strong>{{ result()!.day2.saleRate?.toFixed(2) }}</strong></div>
          </div>
        </div>
      </div>

      <!-- Branch Comparison Table -->
      @if (result()!.byBranch?.length > 0) {
        <div class="card">
          <div class="card__header"><h3>مقارنة الفروع</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>الفرع</th><th>المنطقة</th>
                  <th>يوم 1</th><th>يوم 2</th><th>الفرق</th><th>%</th>
                </tr>
              </thead>
              <tbody>
                @for (b of result()!.byBranch; track b.branchCode) {
                  <tr>
                    <td>{{ b.branchName }}</td>
                    <td>
                      <span class="region-dot" [style.background]="ana.getRegionColor(b.region)"></span>
                      {{ b.region }}
                    </td>
                    <td>{{ fmt(b.sar1) }}</td>
                    <td>{{ fmt(b.sar2) }}</td>
                    <td [class]="ana.getDiffClass(b.sarDelta)">{{ fmtDiff(b.sarDelta) }}</td>
                    <td [class]="ana.getDiffClass(b.sarDeltaPct)">{{ b.sarDeltaPct?.toFixed(1) }}%</td>
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
    .control-group label { font-size: .8rem; color: var(--mizan-text-muted); }
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
    .delta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .delta-card { background: var(--mizan-surface); border: 1px solid var(--mizan-border); border-radius: 10px; padding: 1rem; }
    .delta-label { font-size: .75rem; color: var(--mizan-text-muted); margin-bottom: .3rem; }
    .delta-value { font-size: 1.2rem; font-weight: 700; }
    .delta-pct { font-size: .78rem; margin-top: .2rem; }
    .pos { color: var(--mizan-green); }
    .neg { color: var(--mizan-danger); }
    .days-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    @media(max-width:700px) { .days-row { grid-template-columns: 1fr; } }
    .day-card { padding: 1rem; }
    .day-header { display: flex; align-items: center; gap: .75rem; margin-bottom: .75rem; }
    .day-header h3 { margin: 0; font-size: 1rem; }
    .day-badge { padding: .2rem .6rem; border-radius: 10px; font-size: .72rem; font-weight: 600; }
    .day-badge--1 { background: rgba(59,130,246,.15); color: #3b82f6; }
    .day-badge--2 { background: rgba(236,72,153,.15); color: #ec4899; }
    .day-stats { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
    .day-stat { display: flex; flex-direction: column; gap: .1rem; font-size: .85rem; }
    .day-stat span { font-size: .72rem; color: var(--mizan-text-muted); }
    .table-wrap { overflow-x: auto; }
    .card__header { display: flex; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
    .region-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
  `]
})
export class ComparisonComponent implements OnInit {
  private svc = inject(DashboardService);
  ana = inject(AnalyticsService);

  d1 = '';
  d2 = '';
  result = signal<any>(null);
  loading = signal(false);

  ngOnInit(): void {
    const today = new Date().toISOString().slice(0, 10);
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

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }

  fmtDiff(n?: number): string {
    const v = n ?? 0;
    return (v >= 0 ? '+' : '') + v.toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
}
