import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperAdminService } from '../../core/services/super-admin.service';
import { SubscriptionTier } from '../../shared/models/models';

@Component({
  selector: 'app-tiers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>خطط الاشتراك</h2><p>إدارة خطط الاشتراك والأسعار</p></div>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (tiers().length) {
      <div class="grid-3">
        @for (t of tiers(); track t.id) {
          <div class="card">
            <div class="card__header">
              <h3>{{ t.displayName }}</h3>
              <span [class]="'badge badge--' + (t.active ? 'success' : 'danger')">
                {{ t.active ? 'نشط' : 'معطّل' }}
              </span>
            </div>
            <div class="tier-info">
              <div class="tier-row">
                <span>السعر الشهري</span>
                <strong>{{ t.monthlyPrice }} $</strong>
              </div>
              <div class="tier-row">
                <span>السعر السنوي</span>
                <strong>{{ t.annualPrice }} $</strong>
              </div>
              <div class="tier-row">
                <span>الحد الأقصى للفروع</span>
                <strong>{{ t.maxBranches }}</strong>
              </div>
              <div class="tier-row">
                <span>الحد الأقصى للمستخدمين</span>
                <strong>{{ t.maxUsers }}</strong>
              </div>
            </div>
            <button class="btn btn--outline btn--sm mt-3 w-full" (click)="openEdit(t)">تعديل</button>
          </div>
        }
      </div>
    }

    @if (showModal()) {
      <div class="modal-overlay" (click)="closeModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal__header">
            <h3>تعديل الخطة</h3>
            <button class="close-btn" (click)="closeModal()">×</button>
          </div>
          <div class="modal__body">
            <div class="form-group">
              <label>الاسم</label>
              <input class="form-control" [(ngModel)]="form.displayName">
            </div>
            <div class="form-group">
              <label>السعر الشهري ($)</label>
              <input class="form-control" type="number" [(ngModel)]="form.monthlyPrice" dir="ltr">
            </div>
            <div class="form-group">
              <label>السعر السنوي ($)</label>
              <input class="form-control" type="number" [(ngModel)]="form.annualPrice" dir="ltr">
            </div>
            <div class="form-group">
              <label>الحد الأقصى للفروع</label>
              <input class="form-control" type="number" [(ngModel)]="form.maxBranches" dir="ltr">
            </div>
            <div class="form-group">
              <label>الحد الأقصى للمستخدمين</label>
              <input class="form-control" type="number" [(ngModel)]="form.maxUsers" dir="ltr">
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn btn--ghost" (click)="closeModal()">إلغاء</button>
            <button class="btn btn--primary" (click)="save()" [disabled]="saving()">
              @if (saving()) { <span class="spinner"></span> } حفظ
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .tier-info { display: flex; flex-direction: column; gap: .5rem; margin-top: .5rem; }
    .tier-row { display: flex; justify-content: space-between; font-size: .875rem; padding: .35rem 0; border-bottom: 1px solid var(--mizan-border); }
  `]
})
export class TiersComponent implements OnInit {
  private svc = inject(SuperAdminService);
  tiers = signal<SubscriptionTier[]>([]);
  loading = signal(false);
  saving = signal(false);
  showModal = signal(false);
  editTier = signal<SubscriptionTier | null>(null);

  form = { displayName: '', monthlyPrice: 0, annualPrice: 0, maxBranches: 5, maxUsers: 10 };

  ngOnInit() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getTiers().subscribe({
      next: res => { this.loading.set(false); this.tiers.set(res.data ?? []); },
      error: () => this.loading.set(false)
    });
  }

  openEdit(t: SubscriptionTier): void {
    this.editTier.set(t);
    this.form = { displayName: t.displayName, monthlyPrice: t.monthlyPrice, annualPrice: t.annualPrice, maxBranches: t.maxBranches, maxUsers: t.maxUsers };
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); this.editTier.set(null); }

  save(): void {
    const et = this.editTier();
    if (!et) return;
    this.saving.set(true);
    this.svc.updateTier(et.id, this.form).subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.load(); },
      error: () => this.saving.set(false)
    });
  }
}
