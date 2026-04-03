import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperAdminService } from '../../core/services/super-admin.service';

const ROLES = ['COMPANY_ADMIN','HEAD_OF_SALES','BRANCH_MANAGER','BRANCH_EMPLOYEE','REGION_MANAGER','DATA_ENTRY'];

@Component({
  selector: 'app-users-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page" dir="rtl">
      <div class="page-header">
        <div>
          <h2>إدارة المستخدمين</h2>
          <p class="page-sub">جميع المستخدمين عبر كل الشركات</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters">
        <input class="filter-input" type="search" placeholder="بحث بالاسم أو البريد..." [(ngModel)]="search" (input)="load()" />
        <select class="filter-select" [(ngModel)]="filterRole" (change)="load()">
          <option value="">كل الأدوار</option>
          @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
        </select>
        <select class="filter-select" [(ngModel)]="filterTenant" (change)="load()">
          <option value="">كل الشركات</option>
          @for (t of tenants(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }
        </select>
        <span class="count">{{ users().length }} مستخدم</span>
      </div>

      <!-- Table -->
      @if (loading()) {
        <div class="spinner-wrap"><span class="spinner spinner--green"></span></div>
      } @else if (users().length === 0) {
        <div class="empty">لا يوجد مستخدمون مطابقون</div>
      } @else {
        <div class="table-wrap">
          <table class="u-table">
            <thead>
              <tr>
                <th>المستخدم</th>
                <th>الدور</th>
                <th>الشركة</th>
                <th>الحالة</th>
                <th>آخر دخول</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.userId) {
                <tr [class.row-inactive]="!u.active">
                  <td>
                    <div class="u-name">{{ u.fullNameAr || u.fullNameEn }}</div>
                    <div class="u-email">{{ u.email }}</div>
                    @if (u.mustChangePassword) {
                      <span class="badge-change">يجب تغيير كلمة المرور</span>
                    }
                  </td>
                  <td><span class="role-badge">{{ u.role }}</span></td>
                  <td class="td-muted">{{ u.tenantName }}</td>
                  <td>
                    <span class="status-dot" [class.active]="u.active" [class.inactive]="!u.active">
                      {{ u.active ? 'نشط' : 'موقوف' }}
                    </span>
                  </td>
                  <td class="td-muted">{{ fmtDate(u.lastLoginAt) }}</td>
                  <td>
                    <div class="action-btns">
                      @if (u.active) {
                        <button class="btn-sm btn-danger" (click)="deactivate(u)" [disabled]="saving()">إيقاف</button>
                      } @else {
                        <button class="btn-sm btn-success" (click)="activate(u)" [disabled]="saving()">تفعيل</button>
                      }
                      <button class="btn-sm btn-gold" (click)="openReset(u)">إعادة ضبط كلمة المرور</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (feedback()) {
        <div class="feedback" [class.feedback--err]="feedbackErr()">{{ feedback() }}</div>
      }

      <!-- Reset Password Modal -->
      @if (resetTarget()) {
        <div class="modal-overlay" (click)="closeReset()">
          <div class="modal" dir="rtl" (click)="$event.stopPropagation()">
            <div class="modal-title">إعادة ضبط كلمة المرور</div>
            <div class="modal-sub">{{ resetTarget()!.email }}</div>
            <div class="form-field">
              <label class="form-label">كلمة المرور الجديدة</label>
              <input class="form-input" type="text" [(ngModel)]="newPassword" placeholder="6 أحرف على الأقل" />
            </div>
            <div class="modal-hint">سيُطلب من المستخدم تغيير كلمة المرور عند الدخول التالي.</div>
            <div class="modal-actions">
              <button class="btn-cancel" (click)="closeReset()">إلغاء</button>
              <button class="btn-confirm" (click)="confirmReset()" [disabled]="saving() || newPassword.length < 6">
                {{ saving() ? 'جاري...' : 'تأكيد' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { color: var(--mz-text, #e8e8e8); }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem; }
    h2 { font-size: 1.35rem; font-weight: 700; margin: 0 0 .2rem; }
    .page-sub { font-size: .82rem; color: var(--mz-text-muted, #8a9a8f); margin: 0; }

    .filters { display: flex; align-items: center; gap: .65rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .filter-input, .filter-select {
      background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
      border-radius: 8px; color: var(--mz-text, #e8e8e8); padding: .4rem .75rem;
      font-size: .82rem; outline: none;
    }
    .filter-input { min-width: 200px; }
    .count { font-size: .78rem; color: var(--mz-text-muted, #8a9a8f); margin-right: auto; }

    .spinner-wrap { display: flex; justify-content: center; padding: 3rem; }
    .empty { text-align: center; padding: 3rem; color: var(--mz-text-muted, #8a9a8f); }

    .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,.07); }
    .u-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .u-table thead tr { background: rgba(255,255,255,.04); }
    .u-table th {
      padding: .65rem 1rem; text-align: right; color: var(--mz-text-muted, #8a9a8f);
      font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap;
    }
    .u-table td { padding: .65rem 1rem; border-top: 1px solid rgba(255,255,255,.05); vertical-align: middle; }
    .u-table tbody tr:hover { background: rgba(255,255,255,.025); }
    .row-inactive { opacity: .6; }

    .u-name  { font-weight: 600; color: var(--mz-text, #e8e8e8); }
    .u-email { font-size: .75rem; color: var(--mz-text-muted, #8a9a8f); }
    .badge-change { display: inline-block; margin-top: .2rem; font-size: .68rem; background: rgba(245,158,11,.15); color: #f59e0b; border-radius: 20px; padding: .1rem .45rem; }
    .role-badge { font-size: .72rem; padding: .2rem .55rem; border-radius: 20px; background: rgba(100,180,255,.1); color: #64b4ff; border: 1px solid rgba(100,180,255,.25); }
    .td-muted { color: var(--mz-text-muted, #8a9a8f); font-size: .78rem; }
    .status-dot { font-size: .75rem; font-weight: 600; }
    .status-dot.active   { color: #22c55e; }
    .status-dot.inactive { color: #ef4444; }

    .action-btns { display: flex; gap: .4rem; flex-wrap: wrap; }
    .btn-sm { font-size: .72rem; padding: .3rem .65rem; border-radius: 6px; cursor: pointer; border: 1px solid; font-family: inherit; transition: opacity .15s; }
    .btn-sm:disabled { opacity: .45; cursor: not-allowed; }
    .btn-danger  { background: rgba(239,68,68,.1);  border-color: rgba(239,68,68,.3);  color: #ef4444; }
    .btn-success { background: rgba(34,197,94,.1);  border-color: rgba(34,197,94,.3);  color: #22c55e; }
    .btn-gold    { background: rgba(201,168,76,.1); border-color: rgba(201,168,76,.3); color: #c9a84c; }

    .feedback { margin-top: 1rem; padding: .65rem 1rem; border-radius: 8px; font-size: .84rem; background: rgba(34,197,94,.1); color: #22c55e; border: 1px solid rgba(34,197,94,.25); }
    .feedback--err { background: rgba(239,68,68,.1); color: #ef4444; border-color: rgba(239,68,68,.25); }

    /* Modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: #1a2a1f; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 1.75rem; width: 90%; max-width: 420px; }
    .modal-title { font-size: 1.05rem; font-weight: 700; margin-bottom: .25rem; }
    .modal-sub   { font-size: .82rem; color: #64b4ff; margin-bottom: 1.25rem; }
    .modal-hint  { font-size: .78rem; color: var(--mz-text-muted, #8a9a8f); margin-top: .5rem; line-height: 1.5; }
    .form-field  { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .5rem; }
    .form-label  { font-size: .8rem; color: var(--mz-text-muted, #8a9a8f); }
    .form-input  { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; color: var(--mz-text, #e8e8e8); padding: .5rem .75rem; font-size: .9rem; outline: none; }
    .form-input:focus { border-color: #c9a84c; }
    .modal-actions { display: flex; justify-content: flex-start; gap: .65rem; margin-top: 1.25rem; }
    .btn-cancel  { background: transparent; border: 1px solid rgba(255,255,255,.15); color: var(--mz-text-muted, #8a9a8f); border-radius: 8px; padding: .5rem 1rem; font-size: .85rem; cursor: pointer; }
    .btn-confirm { background: #c9a84c; border: none; color: #0f1a14; border-radius: 8px; padding: .5rem 1.25rem; font-size: .85rem; font-weight: 700; cursor: pointer; }
    .btn-confirm:disabled { opacity: .45; cursor: not-allowed; }
  `]
})
export class UsersManagementComponent implements OnInit {
  private svc = inject(SuperAdminService);

  users   = signal<any[]>([]);
  tenants = signal<{ id: string; name: string }[]>([]);
  loading = signal(false);
  saving  = signal(false);
  feedback    = signal<string | null>(null);
  feedbackErr = signal(false);
  resetTarget = signal<any | null>(null);
  newPassword = '';

  search       = '';
  filterRole   = '';
  filterTenant = '';
  roles = ROLES;

  private debounce: any;

  ngOnInit() {
    this.svc.getTenants().subscribe({
      next: res => {
        const list = (res.data as any[] ?? []);
        this.tenants.set(list.map((t: any) => ({ id: t.tenantId, name: t.companyNameAr })));
      }
    });
    this.load();
  }

  load() {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.loading.set(true);
      this.svc.getAllUsers({
        search:   this.search   || undefined,
        role:     this.filterRole   || undefined,
        tenantId: this.filterTenant || undefined
      }).subscribe({
        next: res => { this.users.set(res.data ?? []); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
    }, 300);
  }

  deactivate(u: any) {
    if (!confirm(`هل أنت متأكد من إيقاف ${u.email}؟`)) return;
    this.saving.set(true);
    this.svc.deactivateUser(u.userId).subscribe({
      next: () => { this.showFeedback('تم إيقاف المستخدم بنجاح', false); this.load(); },
      error: () => { this.showFeedback('فشل الإيقاف', true); this.saving.set(false); }
    });
  }

  activate(u: any) {
    this.saving.set(true);
    this.svc.activateUser(u.userId).subscribe({
      next: () => { this.showFeedback('تم تفعيل المستخدم بنجاح', false); this.load(); },
      error: () => { this.showFeedback('فشل التفعيل', true); this.saving.set(false); }
    });
  }

  openReset(u: any) { this.resetTarget.set(u); this.newPassword = ''; }
  closeReset() { this.resetTarget.set(null); this.newPassword = ''; }

  confirmReset() {
    if (this.newPassword.length < 6) return;
    this.saving.set(true);
    this.svc.resetUserPassword(this.resetTarget()!.userId, this.newPassword).subscribe({
      next: () => {
        this.closeReset();
        this.showFeedback('تمت إعادة ضبط كلمة المرور بنجاح', false);
      },
      error: () => { this.showFeedback('فشل إعادة الضبط', true); this.saving.set(false); }
    });
  }

  private showFeedback(msg: string, err: boolean) {
    this.saving.set(false);
    this.feedback.set(msg);
    this.feedbackErr.set(err);
    setTimeout(() => this.feedback.set(null), 4000);
  }

  fmtDate(dt: string): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
  }
}
