import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperAdminService } from '../../core/services/super-admin.service';
import { AuthService } from '../../core/services/auth.service';
import { Tenant } from '../../shared/models/models';

@Component({
  selector: 'app-tenants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>الشركات</h2><p>إدارة المستأجرين</p></div>
      <button class="btn btn--primary" (click)="openCreate()">+ شركة جديدة</button>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (tenants().length) {
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>اسم الشركة</th><th>الخطة</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            @for (t of tenants(); track t.tenantId) {
              <tr>
                <td><strong>{{ t.companyName }}</strong><br><small class="text-muted" dir="ltr">{{ t.tenantId }}</small></td>
                <td><span class="badge badge--gold">{{ t.planTier }}</span></td>
                <td>
                  <span [class]="'badge badge--' + (t.suspended ? 'danger' : t.active ? 'success' : 'warning')">
                    {{ t.suspended ? 'موقوف' : t.active ? 'نشط' : 'غير نشط' }}
                  </span>
                </td>
                <td dir="ltr">{{ t.createdAt | date:'mediumDate' }}</td>
                <td>
                  <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                    <button class="btn btn--outline btn--sm" (click)="impersonate(t)">انتحال</button>
                    @if (t.suspended) {
                      <button class="btn btn--primary btn--sm" (click)="activate(t)">تفعيل</button>
                    } @else {
                      <button class="btn btn--danger btn--sm" (click)="suspend(t)">إيقاف</button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty-state"><div class="empty-icon">🏢</div><p>لا توجد شركات</p></div>
    }

    @if (error()) { <div class="alert alert--error mt-3">{{ error() }}</div> }

    <!-- Create Modal -->
    @if (showModal()) {
      <div class="modal-overlay" (click)="closeModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal__header">
            <h3>شركة جديدة</h3>
            <button class="close-btn" (click)="closeModal()">×</button>
          </div>
          <div class="modal__body">
            <div class="form-group">
              <label>اسم الشركة (عربي)</label>
              <input class="form-control" [(ngModel)]="form.companyNameAr">
            </div>
            <div class="form-group">
              <label>اسم الشركة (إنجليزي)</label>
              <input class="form-control" [(ngModel)]="form.companyNameEn" dir="ltr">
            </div>
            <div class="form-group">
              <label>بريد المدير</label>
              <input class="form-control" type="email" [(ngModel)]="form.initialAdminEmail" dir="ltr">
            </div>
            <div class="form-group">
              <label>كلمة مرور المدير</label>
              <input class="form-control" type="password" [(ngModel)]="form.initialAdminPassword" dir="ltr">
            </div>
            <div class="form-group">
              <label>خطة الاشتراك</label>
              <select class="form-control" [(ngModel)]="form.subscriptionTierId">
                <option value="starter">Starter</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
                <option value="white_label">White Label</option>
              </select>
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn btn--ghost" (click)="closeModal()">إلغاء</button>
            <button class="btn btn--primary" (click)="createTenant()" [disabled]="saving()">
              @if (saving()) { <span class="spinner"></span> } إنشاء
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class TenantsComponent implements OnInit {
  private svc = inject(SuperAdminService);
  private auth = inject(AuthService);

  tenants = signal<Tenant[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal('');
  showModal = signal(false);

  form = { companyNameAr: '', companyNameEn: '', initialAdminEmail: '', initialAdminPassword: '', subscriptionTierId: 'starter' };

  ngOnInit() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getTenants().subscribe({
      next: res => { this.loading.set(false); this.tenants.set(res.data?.content ?? res.data ?? []); },
      error: () => this.loading.set(false)
    });
  }

  openCreate(): void { this.form = { companyNameAr:'', companyNameEn:'', initialAdminEmail:'', initialAdminPassword:'', subscriptionTierId:'starter' }; this.showModal.set(true); }
  closeModal(): void { this.showModal.set(false); }

  createTenant(): void {
    this.saving.set(true);
    this.svc.createTenant(this.form).subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.load(); },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'فشل الإنشاء'); }
    });
  }

  suspend(t: Tenant): void {
    this.svc.suspendTenant(t.tenantId).subscribe({ next: () => this.load() });
  }

  activate(t: Tenant): void {
    this.svc.activateTenant(t.tenantId).subscribe({ next: () => this.load() });
  }

  impersonate(t: Tenant): void {
    this.svc.impersonate(t.tenantId).subscribe({
      next: res => {
        if (res.data?.token) {
          this.auth.startImpersonation(res.data.token, t.tenantId, t.companyName);
        }
      },
      error: err => this.error.set(err?.error?.message || 'فشل الانتحال')
    });
  }
}
