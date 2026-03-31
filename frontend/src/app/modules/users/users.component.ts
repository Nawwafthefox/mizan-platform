import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserManagementService } from '../../core/services/user-management.service';
import { User } from '../../shared/models/models';

const ROLES = [
  { value: 'COMPANY_ADMIN', label: 'مدير الشركة' },
  { value: 'CEO', label: 'الرئيس التنفيذي' },
  { value: 'HEAD_OF_SALES', label: 'رئيس المبيعات' },
  { value: 'REGION_MANAGER', label: 'مدير المنطقة' },
  { value: 'BRANCH_MANAGER', label: 'مدير الفرع' },
  { value: 'BRANCH_EMPLOYEE', label: 'موظف فرع' },
  { value: 'DATA_ENTRY', label: 'إدخال البيانات' },
];

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>المستخدمون</h2><p>إدارة مستخدمي الشركة</p></div>
      <button class="btn btn--primary" (click)="openCreate()">+ مستخدم جديد</button>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (users().length) {
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr>
                <td><strong>{{ u.fullName }}</strong></td>
                <td dir="ltr">{{ u.email }}</td>
                <td><span class="badge badge--info">{{ roleLabel(u.role) }}</span></td>
                <td>
                  <span [class]="'badge badge--' + (u.active ? 'success' : 'danger')">
                    {{ u.active ? 'نشط' : 'معطّل' }}
                  </span>
                </td>
                <td>
                  <div style="display:flex; gap:.4rem">
                    <button class="btn btn--outline btn--sm" (click)="openEdit(u)">تعديل</button>
                    <button class="btn btn--ghost btn--sm" (click)="toggleStatus(u)">
                      {{ u.active ? 'تعطيل' : 'تفعيل' }}
                    </button>
                    <button class="btn btn--ghost btn--sm" (click)="openResetPw(u)">إعادة كلمة المرور</button>
                    <button class="btn btn--danger btn--sm" (click)="deleteUser(u)">حذف</button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty-state"><div class="empty-icon">👤</div><p>لا يوجد مستخدمون</p></div>
    }

    @if (error()) { <div class="alert alert--error mt-3">{{ error() }}</div> }

    <!-- Create / Edit Modal -->
    @if (showModal()) {
      <div class="modal-overlay" (click)="closeModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal__header">
            <h3>{{ editUser() ? 'تعديل المستخدم' : 'مستخدم جديد' }}</h3>
            <button class="close-btn" (click)="closeModal()">×</button>
          </div>
          <div class="modal__body">
            <div class="form-group">
              <label>الاسم الكامل</label>
              <input class="form-control" [(ngModel)]="form.fullName">
            </div>
            <div class="form-group">
              <label>البريد الإلكتروني</label>
              <input class="form-control" type="email" [(ngModel)]="form.email" dir="ltr">
            </div>
            <div class="form-group">
              <label>اسم المستخدم</label>
              <input class="form-control" [(ngModel)]="form.username" dir="ltr">
            </div>
            @if (!editUser()) {
              <div class="form-group">
                <label>كلمة المرور</label>
                <input class="form-control" type="password" [(ngModel)]="form.password" dir="ltr">
              </div>
            }
            <div class="form-group">
              <label>الدور</label>
              <select class="form-control" [(ngModel)]="form.role">
                @for (r of roles; track r.value) {
                  <option [value]="r.value">{{ r.label }}</option>
                }
              </select>
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn btn--ghost" (click)="closeModal()">إلغاء</button>
            <button class="btn btn--primary" (click)="saveUser()" [disabled]="saving()">
              @if (saving()) { <span class="spinner"></span> } حفظ
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Reset Password Modal -->
    @if (showResetModal()) {
      <div class="modal-overlay" (click)="showResetModal.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal__header">
            <h3>إعادة تعيين كلمة المرور</h3>
            <button class="close-btn" (click)="showResetModal.set(false)">×</button>
          </div>
          <div class="modal__body">
            <div class="form-group">
              <label>كلمة المرور الجديدة</label>
              <input class="form-control" type="password" [(ngModel)]="newPassword" dir="ltr">
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn btn--ghost" (click)="showResetModal.set(false)">إلغاء</button>
            <button class="btn btn--primary" (click)="resetPassword()" [disabled]="saving()">
              @if (saving()) { <span class="spinner"></span> } حفظ
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class UsersComponent implements OnInit {
  private svc = inject(UserManagementService);
  users = signal<User[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal('');
  showModal = signal(false);
  showResetModal = signal(false);
  editUser = signal<User | null>(null);
  resetTarget = signal<User | null>(null);
  newPassword = '';
  roles = ROLES;

  form = { fullName: '', email: '', username: '', password: '', role: 'BRANCH_EMPLOYEE' };

  ngOnInit() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getAll().subscribe({
      next: res => { this.loading.set(false); this.users.set(res.data?.content ?? res.data ?? []); },
      error: () => this.loading.set(false)
    });
  }

  openCreate(): void {
    this.editUser.set(null);
    this.form = { fullName: '', email: '', username: '', password: '', role: 'BRANCH_EMPLOYEE' };
    this.showModal.set(true);
  }

  openEdit(u: User): void {
    this.editUser.set(u);
    this.form = { fullName: u.fullName, email: u.email, username: (u as any).username ?? '', password: '', role: u.role };
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); this.editUser.set(null); }

  saveUser(): void {
    this.saving.set(true);
    const eu = this.editUser();
    const obs = eu ? this.svc.update(eu.id, this.form) : this.svc.create(this.form);
    obs.subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.load(); },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'فشل الحفظ'); }
    });
  }

  toggleStatus(u: User): void {
    this.svc.toggleStatus(u.id).subscribe({ next: () => this.load() });
  }

  deleteUser(u: User): void {
    if (!confirm(`هل أنت متأكد من حذف ${u.fullName}؟`)) return;
    this.svc.delete(u.id).subscribe({ next: () => this.load() });
  }

  openResetPw(u: User): void {
    this.resetTarget.set(u);
    this.newPassword = '';
    this.showResetModal.set(true);
  }

  resetPassword(): void {
    const u = this.resetTarget();
    if (!u || !this.newPassword) return;
    this.saving.set(true);
    this.svc.resetPassword(u.id, this.newPassword).subscribe({
      next: () => { this.saving.set(false); this.showResetModal.set(false); },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'فشل'); }
    });
  }

  roleLabel(r: string): string {
    return ROLES.find(x => x.value === r)?.label ?? r;
  }
}
