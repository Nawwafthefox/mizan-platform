import {
  Component, OnInit, signal, computed,
  ChangeDetectionStrategy, inject
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-super-admin-ai-usage',
  standalone: true,
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="ai-usage-wrap" dir="rtl">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">🤖 إدارة استخدام الذكاء الاصطناعي</h1>
      <p class="page-sub">مراقبة استهلاك Gemini API لجميع الشركات وضبط الميزانيات اليومية</p>
    </div>
    <button class="refresh-btn" (click)="loadAll()" [disabled]="loading()">
      @if (loading()) { <span class="spin">↻</span> } @else { ↻ تحديث }
    </button>
  </div>

  <!-- Fleet summary cards -->
  @if (!loading() && summary()) {
    <div class="fleet-grid">
      <div class="fleet-card">
        <div class="fleet-icon">🏢</div>
        <div class="fleet-val">{{ summary().totalTenants }}</div>
        <div class="fleet-lbl">إجمالي الشركات</div>
      </div>
      <div class="fleet-card">
        <div class="fleet-icon">⚡</div>
        <div class="fleet-val">{{ summary().totalRequestsToday }}</div>
        <div class="fleet-lbl">طلبات اليوم</div>
      </div>
      <div class="fleet-card">
        <div class="fleet-icon">💰</div>
        <div class="fleet-val">{{ '$' + (summary().totalCostToday?.toFixed(4) ?? '0.0000') }}</div>
        <div class="fleet-lbl">تكلفة اليوم (USD)</div>
      </div>
      <div class="fleet-card fleet-card--warn">
        <div class="fleet-icon">⚠️</div>
        <div class="fleet-val">{{ summary().exceededCount }}</div>
        <div class="fleet-lbl">شركات تجاوزت الميزانية</div>
      </div>
    </div>
  }

  <!-- Tenants table -->
  <div class="section-card">
    <h3 class="section-title">استخدام الشركات — اليوم</h3>

    @if (loading()) {
      <div class="loading-row">جارٍ التحميل…</div>
    } @else if (tenantsUsage().length === 0) {
      <div class="empty-row">لا توجد بيانات</div>
    } @else {
      <div class="table-wrap">
        <table class="at">
          <thead>
            <tr>
              <th>الشركة</th>
              <th>مفعّل</th>
              <th>الميزانية (USD/يوم)</th>
              <th>الاستهلاك اليوم</th>
              <th>% المستخدم</th>
              <th>الطلبات</th>
              <th>كاش</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            @for (t of tenantsUsage(); track t.tenantId) {
              <tr [class.row-exceeded]="t.budgetExceeded">
                <td class="company-cell">
                  <div class="company-name">{{ t.companyNameAr || t.companyNameEn }}</div>
                  <div class="tenant-id">{{ t.tenantId }}</div>
                </td>
                <td>
                  @if (t.aiEnabled) { <span class="badge badge-on">مفعّل</span> }
                  @else { <span class="badge badge-off">معطّل</span> }
                </td>
                <td>
                  @if (editingId() === t.tenantId) {
                    <input type="number" class="budget-input" min="0" step="0.5"
                      [(ngModel)]="editBudget" (keydown.enter)="saveBudget(t.tenantId)">
                  } @else {
                    <span class="budget-val">{{ '$' + (t.dailyBudgetUsd?.toFixed(2) ?? '0.00') }}</span>
                  }
                </td>
                <td>{{ '$' + (t.todaySpentUsd?.toFixed(4) ?? '0.0000') }}</td>
                <td>
                  <div class="pct-bar-wrap">
                    <div class="pct-bar">
                      <div class="pct-fill"
                        [style.width.%]="minMax(t.budgetUsedPct)"
                        [class.fill-warn]="t.budgetUsedPct > 80 && !t.budgetExceeded"
                        [class.fill-danger]="t.budgetExceeded">
                      </div>
                    </div>
                    <span class="pct-label"
                      [class.pct-warn]="t.budgetUsedPct > 80"
                      [class.pct-danger]="t.budgetExceeded">
                      {{ t.budgetUsedPct?.toFixed(1) }}%
                    </span>
                  </div>
                </td>
                <td>{{ t.todayRequests }}</td>
                <td>{{ t.todayCacheHits }}</td>
                <td>
                  @if (t.budgetExceeded) { <span class="status-exceeded">محدود</span> }
                  @else if (!t.aiEnabled) { <span class="status-disabled">معطّل</span> }
                  @else { <span class="status-ok">✓ نشط</span> }
                </td>
                <td class="actions-cell">
                  @if (editingId() === t.tenantId) {
                    <button class="action-btn action-save" (click)="saveBudget(t.tenantId)">حفظ</button>
                    <button class="action-btn action-cancel" (click)="cancelEdit()">إلغاء</button>
                  } @else {
                    <button class="action-btn" (click)="startEdit(t)">✏️ ميزانية</button>
                    <button class="action-btn" (click)="toggleAI(t)">
                      {{ t.aiEnabled ? '🔒 إيقاف' : '🔓 تفعيل' }}
                    </button>
                    <button class="action-btn action-details" (click)="openDetails(t.tenantId)">
                      📊 تفاصيل
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </div>

  <!-- Tenant detail drawer -->
  @if (detailTenantId()) {
    <div class="detail-overlay" (click)="closeDetail()"></div>
    <div class="detail-drawer">
      <div class="detail-header">
        <h3 class="detail-title">تفاصيل الاستخدام — {{ detailTenantId() }}</h3>
        <button class="close-btn" (click)="closeDetail()">✕</button>
      </div>

      @if (detailLoading()) {
        <div class="loading-row">جارٍ التحميل…</div>
      } @else if (detail()) {
        <!-- Today stats -->
        <div class="detail-section">
          <div class="detail-kpis">
            <div class="d-kpi">
              <span class="d-val">{{ detail().today?.totalRequests ?? 0 }}</span>
              <span class="d-lbl">طلبات اليوم</span>
            </div>
            <div class="d-kpi">
              <span class="d-val">{{ '$' + (detail().today?.totalCostUsd?.toFixed(4) ?? '0.0000') }}</span>
              <span class="d-lbl">تكلفة اليوم</span>
            </div>
            <div class="d-kpi">
              <span class="d-val">{{ detail().today?.cacheHits ?? 0 }}</span>
              <span class="d-lbl">كاش</span>
            </div>
            <div class="d-kpi">
              <span class="d-val">{{ detail().today?.errors ?? 0 }}</span>
              <span class="d-lbl">أخطاء</span>
            </div>
          </div>
        </div>

        <!-- Range logs table -->
        @if (detail().logs?.length > 0) {
          <div class="detail-section">
            <h4 class="detail-sub">آخر الطلبات (30 يوم)</h4>
            <div class="table-wrap">
              <table class="at at-sm">
                <thead>
                  <tr>
                    <th>الميزة</th>
                    <th>المستخدم</th>
                    <th>كاش</th>
                    <th>التكلفة</th>
                    <th>الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  @for (log of detail().logs.slice(0, 50); track log.id) {
                    <tr>
                      <td>{{ log.feature }}</td>
                      <td class="email-cell">{{ log.userEmail }}</td>
                      <td>
                        @if (log.cached) { <span class="badge badge-cache">كاش</span> }
                        @else { <span class="badge badge-api">API</span> }
                      </td>
                      <td>{{ '$' + (log.costUsd?.toFixed(4) ?? '0.0000') }}</td>
                      <td class="time-cell">{{ log.createdAt | date:'dd/MM HH:mm' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </div>
  }

</div>
  `,
  styles: [`
    .ai-usage-wrap { max-width: 1300px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }

    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;
      background: linear-gradient(135deg, rgba(15,45,31,.9), rgba(10,30,20,.95));
      border: 1px solid rgba(201,168,76,.15); border-radius: 16px; padding: 1.5rem 2rem; }
    .page-title { font-size: 1.4rem; font-weight: 700; color: #c9a84c; margin: 0; }
    .page-sub { color: rgba(232,228,220,.5); font-size: .83rem; margin: .3rem 0 0; }

    .refresh-btn { background: rgba(201,168,76,.12); border: 1px solid rgba(201,168,76,.25);
      color: #c9a84c; padding: .5rem 1.2rem; border-radius: 8px; cursor: pointer; font-size: .85rem; }
    .refresh-btn:hover:not(:disabled) { background: rgba(201,168,76,.2); }
    .spin { display: inline-block; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .fleet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
    .fleet-card { background: rgba(15,45,31,.6); border: 1px solid rgba(201,168,76,.12);
      border-radius: 14px; padding: 1.25rem; text-align: center; }
    .fleet-card--warn { border-color: rgba(239,68,68,.3); }
    .fleet-icon { font-size: 1.4rem; margin-bottom: .3rem; }
    .fleet-val { font-size: 1.6rem; font-weight: 700; color: #c9a84c; }
    .fleet-lbl { font-size: .78rem; color: rgba(232,228,220,.45); margin-top: .2rem; }

    .section-card { background: rgba(15,45,31,.5); border: 1px solid rgba(201,168,76,.12);
      border-radius: 14px; padding: 1.25rem 1.5rem; }
    .section-title { font-size: 1rem; font-weight: 600; color: #c9a84c; margin: 0 0 1rem; }

    .loading-row, .empty-row { text-align: center; color: rgba(232,228,220,.35); padding: 2rem; }

    .table-wrap { overflow-x: auto; }
    .at { width: 100%; border-collapse: collapse; font-size: .8rem; }
    .at th { background: rgba(201,168,76,.08); color: rgba(232,228,220,.6); font-weight: 600;
      padding: .6rem .75rem; text-align: right; white-space: nowrap;
      border-bottom: 1px solid rgba(201,168,76,.12); }
    .at td { padding: .55rem .75rem; border-bottom: 1px solid rgba(255,255,255,.04);
      color: rgba(232,228,220,.75); vertical-align: middle; }
    .at-sm td, .at-sm th { padding: .4rem .6rem; }
    .row-exceeded td { background: rgba(239,68,68,.04); }

    .company-cell .company-name { font-weight: 600; color: rgba(232,228,220,.85); }
    .company-cell .tenant-id { font-size: .7rem; color: rgba(232,228,220,.3); margin-top: .1rem; }

    .badge { display: inline-block; padding: .15rem .5rem; border-radius: 99px; font-size: .7rem; font-weight: 700; }
    .badge-on  { background: rgba(74,222,128,.15); color: #4ade80; }
    .badge-off { background: rgba(239,68,68,.15); color: #f87171; }
    .badge-cache { background: rgba(147,51,234,.15); color: #c084fc; }
    .badge-api  { background: rgba(59,130,246,.15); color: #93c5fd; }

    .budget-val { font-weight: 700; color: #c9a84c; }
    .budget-input { width: 80px; background: rgba(255,255,255,.07); border: 1px solid rgba(201,168,76,.3);
      color: #e3c76a; border-radius: 6px; padding: .25rem .5rem; font-size: .82rem; }

    .pct-bar-wrap { display: flex; align-items: center; gap: .5rem; min-width: 100px; }
    .pct-bar { flex: 1; height: 6px; background: rgba(255,255,255,.06); border-radius: 99px; overflow: hidden; }
    .pct-fill { height: 100%; background: linear-gradient(90deg, #c9a84c, #e3c76a); border-radius: 99px; transition: width 500ms; }
    .fill-warn  { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
    .fill-danger { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .pct-label { font-size: .75rem; color: rgba(232,228,220,.5); white-space: nowrap; }
    .pct-warn  { color: #fbbf24 !important; font-weight: 700; }
    .pct-danger { color: #f87171 !important; font-weight: 700; }

    .status-ok { color: #4ade80; font-size: .8rem; }
    .status-exceeded { color: #f87171; font-weight: 700; font-size: .8rem; }
    .status-disabled { color: rgba(232,228,220,.3); font-size: .8rem; }

    .actions-cell { display: flex; gap: .35rem; flex-wrap: wrap; }
    .action-btn { background: rgba(201,168,76,.08); border: 1px solid rgba(201,168,76,.18);
      color: rgba(232,228,220,.7); padding: .25rem .6rem; border-radius: 6px; cursor: pointer;
      font-size: .74rem; white-space: nowrap; transition: all 150ms; }
    .action-btn:hover { background: rgba(201,168,76,.18); color: #c9a84c; }
    .action-save { background: rgba(74,222,128,.1); border-color: rgba(74,222,128,.3); color: #4ade80; }
    .action-save:hover { background: rgba(74,222,128,.2); }
    .action-cancel { background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.2); color: #f87171; }
    .action-details { background: rgba(59,130,246,.08); border-color: rgba(59,130,246,.2); color: #93c5fd; }

    /* Detail drawer */
    .detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 200; }
    .detail-drawer { position: fixed; top: 0; left: 0; bottom: 0; width: min(600px, 95vw);
      background: #0e1e16; border-right: 1px solid rgba(201,168,76,.2);
      z-index: 201; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
    .detail-header { display: flex; justify-content: space-between; align-items: center; }
    .detail-title { font-size: 1.05rem; font-weight: 700; color: #c9a84c; margin: 0; }
    .close-btn { background: none; border: 1px solid rgba(232,228,220,.15); color: rgba(232,228,220,.5);
      width: 30px; height: 30px; border-radius: 6px; cursor: pointer; font-size: .9rem; }
    .close-btn:hover { border-color: rgba(201,168,76,.3); color: #c9a84c; }
    .detail-section { background: rgba(15,45,31,.4); border: 1px solid rgba(201,168,76,.1);
      border-radius: 12px; padding: 1rem 1.25rem; }
    .detail-kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .d-kpi { text-align: center; }
    .d-val { display: block; font-size: 1.25rem; font-weight: 700; color: #c9a84c; }
    .d-lbl { font-size: .75rem; color: rgba(232,228,220,.4); }
    .detail-sub { font-size: .9rem; font-weight: 600; color: rgba(232,228,220,.6); margin: 0 0 .75rem; }
    .email-cell { font-size: .72rem; color: rgba(232,228,220,.4); max-width: 140px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .time-cell { font-size: .72rem; color: rgba(232,228,220,.35); white-space: nowrap; }
  `]
})
export class SuperAdminAiUsageComponent implements OnInit {
  private http = inject(HttpClient);

  loading       = signal(false);
  tenantsUsage  = signal<any[]>([]);
  editingId     = signal<string | null>(null);
  editBudget    = 1.0;
  detailTenantId= signal<string | null>(null);
  detailLoading = signal(false);
  detail        = signal<any>(null);

  summary = computed(() => {
    const list = this.tenantsUsage();
    return {
      totalTenants:    list.length,
      totalRequestsToday: list.reduce((s, t) => s + (t.todayRequests ?? 0), 0),
      totalCostToday:  list.reduce((s, t) => s + (t.todaySpentUsd ?? 0), 0),
      exceededCount:   list.filter(t => t.budgetExceeded).length
    };
  });

  ngOnInit() { this.loadAll(); }

  loadAll() {
    this.loading.set(true);
    this.http.get<any>(`${environment.apiUrl}/super-admin/ai-usage/today`).subscribe({
      next: r => { this.tenantsUsage.set(r.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  startEdit(t: any) {
    this.editingId.set(t.tenantId);
    this.editBudget = t.dailyBudgetUsd ?? 1.0;
  }

  cancelEdit() { this.editingId.set(null); }

  saveBudget(tenantId: string) {
    this.http.put<any>(`${environment.apiUrl}/super-admin/tenants/${tenantId}/ai-config`,
      { dailyBudgetUsd: this.editBudget }).subscribe({
      next: () => { this.editingId.set(null); this.loadAll(); },
      error: () => this.editingId.set(null)
    });
  }

  toggleAI(t: any) {
    this.http.put<any>(`${environment.apiUrl}/super-admin/tenants/${t.tenantId}/ai-config`,
      { aiEnabled: !t.aiEnabled }).subscribe({
      next: () => this.loadAll()
    });
  }

  openDetails(tenantId: string) {
    this.detailTenantId.set(tenantId);
    this.detail.set(null);
    this.detailLoading.set(true);
    this.http.get<any>(`${environment.apiUrl}/super-admin/ai-usage/${tenantId}`).subscribe({
      next: r => { this.detail.set(r.data); this.detailLoading.set(false); },
      error: () => this.detailLoading.set(false)
    });
  }

  closeDetail() { this.detailTenantId.set(null); this.detail.set(null); }
  minMax(v: number) { return Math.min(Math.max(v ?? 0, 0), 100); }
}
