import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { AuthService } from '../../../core/services/auth.service';
import { MizanPipe } from '../../../shared/pipes/mizan.pipe';
import { KpiRingCardComponent } from '../../../shared/components/kpi-ring-card/kpi-ring-card.component';
import { fmtWt } from '../../../shared/utils/format.utils';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-targets',
  standalone: true,
  imports: [CommonModule, FormsModule, MizanPipe, KpiRingCardComponent],
  template: `
    <div class="page-wrap">
      <div class="page-header">
        <h1 class="page-title">{{ 'الأهداف' | mizan }}</h1>
        <select class="month-sel" [(ngModel)]="selectedMonth" (ngModelChange)="loadData()">
          @for (m of months; track m.value) {
            <option [value]="m.value">{{ m.label }}</option>
          }
        </select>
      </div>

      <div class="kpi-grid" style="margin-bottom:1.5rem">
        @for (k of kpiCards(); track k.label) {
          <app-kpi-ring-card [icon]="k.icon" [label]="k.label" [value]="k.value"
            [sub]="k.sub" [ringColor]="k.color" [ringPct]="k.pct"></app-kpi-ring-card>
        }
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ 'الفرع' | mizan }}</th>
              <th>{{ 'الموظفون' | mizan }}</th>
              <th>{{ 'الهدف الشهري (جم)' | mizan }}</th>
              <th>{{ 'الهدف اليومي (جم)' | mizan }}</th>
              <th>{{ 'للموظف/يوم (جم)' | mizan }}</th>
              <th>{{ 'فرق المعدل المستهدف' | mizan }}</th>
              <th>{{ 'الفعلي (جم)' | mizan }}</th>
              <th>{{ 'التحقق' | mizan }}</th>
              <th>{{ 'الحالة' | mizan }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of tableRows(); track row.branchCode; let i = $index) {
              <tr>
                <td class="muted">{{ i + 1 }}</td>
                <td class="branch-cell">
                  <div class="branch-name">{{ row.branchName }}</div>
                  <div class="branch-code muted">{{ row.branchCode }}</div>
                </td>
                <td class="num">{{ row.empCount }}</td>
                <td class="num">{{ row.monthlyTarget.toFixed(1) }}</td>
                <td class="num">{{ row.dailyTarget.toFixed(2) }}</td>
                <td class="num">{{ row.dailyPerEmp.toFixed(2) }}</td>
                <td class="num">{{ row.targetRateDiff.toFixed(1) }}</td>
                <td class="num">{{ row.actual.toFixed(1) }}</td>
                <td style="min-width:120px">
                  <div style="display:flex;align-items:center;gap:5px">
                    <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px">
                      <div [style.width.%]="Math.min(row.pct, 100)"
                           [style.background]="row.pct >= 100 ? '#22c55e' : row.pct >= 70 ? '#f59e0b' : '#ef4444'"
                           style="height:100%;border-radius:3px;transition:width 700ms ease"></div>
                    </div>
                    <span [style.color]="row.pct >= 100 ? '#22c55e' : row.pct >= 70 ? '#f59e0b' : '#ef4444'"
                          style="font-size:10px;font-weight:700;min-width:35px">{{ row.pct.toFixed(0) }}%</span>
                  </div>
                </td>
                <td>
                  <span class="status-badge"
                    [class.achieved]="row.pct >= 100"
                    [class.on-track]="row.pct >= 70 && row.pct < 100"
                    [class.behind]="row.pct < 70">
                    {{ row.pct >= 100 ? ('محقق' | mizan) : row.pct >= 70 ? ('في المسار' | mizan) : ('متأخر' | mizan) }}
                  </span>
                </td>
              </tr>
            } @empty {
              <tr><td [colSpan]="10" style="text-align:center;padding:2rem;color:rgba(255,255,255,0.3)">
                {{ 'لا توجد أهداف لهذا الشهر' | mizan }}
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .page-wrap { padding: 0; }
    .page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .page-title { font-size: 1.4rem; font-weight: 800; color: var(--mz-gold); margin: 0; }
    .month-sel { background: var(--mz-surface); border: 1px solid var(--mz-border); color: var(--mz-text); border-radius: 8px; padding: .45rem .75rem; font-size: .85rem; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .75rem; }
    .table-card { background: var(--mz-surface); border: 1px solid var(--mz-border); border-radius: 10px; overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .data-table th { padding: .6rem 1rem; text-align: start; font-weight: 700; font-size: .72rem; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.4); background: rgba(0,0,0,.2); border-bottom: 1px solid var(--mz-border); white-space: nowrap; }
    .data-table td { padding: .65rem 1rem; border-bottom: 1px solid rgba(255,255,255,.04); color: var(--mz-text); vertical-align: middle; }
    .data-table tr:hover td { background: rgba(255,255,255,.03); }
    .num { text-align: end; font-weight: 600; }
    .muted { color: rgba(255,255,255,.4); font-size: .78rem; }
    .branch-name { font-weight: 600; }
    .branch-code { font-size: .75rem; }
    .status-badge { font-size: .7rem; font-weight: 700; padding: .25rem .6rem; border-radius: 20px; white-space: nowrap; }
    .status-badge.achieved { background: rgba(34,197,94,.15); color: #22c55e; }
    .status-badge.on-track { background: rgba(245,158,11,.15); color: #f59e0b; }
    .status-badge.behind { background: rgba(239,68,68,.15); color: #ef4444; }
  `]
})
export class TargetsComponent implements OnInit {
  private dashSvc = inject(DashboardService);
  auth = inject(AuthService);
  Math = Math;

  selectedMonth = this.getCurrentMonth();
  months = this.generateMonths();

  private targets = signal<any[]>([]);
  private actuals = signal<Record<string, number>>({});

  kpiCards = computed(() => {
    const tgts = this.targets();
    const acts = this.actuals();
    const totTarget = tgts.reduce((s, t) => s + (t.monthlyTarget ?? 0), 0);
    const totActual = Object.values(acts).reduce((s: number, v) => s + (v as number), 0);
    const achievePct = totTarget > 0 ? Math.round(totActual / totTarget * 100) : 0;
    const achieved = tgts.filter(t => (acts[t.branchCode] ?? 0) >= (t.monthlyTarget ?? 0)).length;
    const behind = tgts.length - achieved;
    return [
      { icon: '🎯', label: 'الهدف الشهري', value: fmtWt(totTarget), sub: 'وزن نقي', pct: 100, color: '#c9a84c' },
      { icon: '📊', label: 'نسبة التحقق', value: achievePct + '%', sub: fmtWt(totActual) + ' فعلي', pct: Math.min(100, achievePct), color: achievePct >= 100 ? '#22c55e' : achievePct >= 70 ? '#f59e0b' : '#ef4444' },
      { icon: '✅', label: 'فروع محققة', value: String(achieved), sub: 'من ' + tgts.length + ' فرع', pct: tgts.length ? Math.round(achieved / tgts.length * 100) : 0, color: '#22c55e' },
      { icon: '⚠️', label: 'دون الهدف', value: String(behind), sub: 'فرع متأخر', pct: tgts.length ? Math.round(behind / tgts.length * 100) : 0, color: '#ef4444' },
    ];
  });

  tableRows = computed(() => {
    const tgts = this.targets();
    const acts = this.actuals();
    return tgts.map(t => {
      const actual = acts[t.branchCode] ?? 0;
      const pct = (t.monthlyTarget ?? 0) > 0 ? actual / t.monthlyTarget * 100 : 0;
      return {
        branchCode: t.branchCode,
        branchName: t.branchName,
        empCount: t.empCount ?? 0,
        monthlyTarget: t.monthlyTarget ?? 0,
        dailyTarget: (t.monthlyTarget ?? 0) / 30,
        dailyPerEmp: t.dailyPerEmp ?? 0,
        targetRateDiff: t.targetRateDiff ?? 0,
        actual,
        pct,
      };
    }).sort((a, b) => b.pct - a.pct);
  });

  ngOnInit(): void { this.loadData(); }

  loadData(): void {
    const month = this.selectedMonth;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const from = `${month}-01`;
    const to = `${month}-${String(lastDay).padStart(2, '0')}`;

    forkJoin({
      targets: this.dashSvc.getTargets(month),
      branches: this.dashSvc.getBranches(from, to),
    }).subscribe({
      next: ({ targets, branches }: any) => {
        this.targets.set(targets?.data ?? []);
        const actMap: Record<string, number> = {};
        for (const b of (branches?.data ?? [])) {
          actMap[b.branchCode ?? b.code] = (actMap[b.branchCode ?? b.code] ?? 0) + Math.abs(b.netWeight ?? b.wn ?? 0);
        }
        this.actuals.set(actMap);
      },
      error: () => {}
    });
  }

  private getCurrentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private generateMonths(): { value: string; label: string }[] {
    const y = new Date().getFullYear();
    const ar = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    return Array.from({ length: 12 }, (_, i) => ({
      value: `${y}-${String(i + 1).padStart(2, '0')}`,
      label: ar[i] + ' ' + y,
    }));
  }
}
