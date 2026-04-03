import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperAdminService } from '../../core/services/super-admin.service';

const MODULES = [
  { key: 'branch_sales',      label: 'مبيعات الفروع' },
  { key: 'purchase',          label: 'المشتريات' },
  { key: 'employees',         label: 'الموظفون' },
  { key: 'rate_analytics',    label: 'تحليل المعدلات' },
  { key: 'heatmap',           label: 'الخارطة الحرارية' },
  { key: 'mothan',            label: 'موطن الذهب' },
  { key: 'karat',             label: 'العيار' },
  { key: 'regions',           label: 'المناطق' },
  { key: 'targets',           label: 'الأهداف' },
  { key: 'comparison',        label: 'المقارنة' },
  { key: 'alerts',            label: 'التنبيهات' },
  { key: 'report_export',     label: 'تصدير التقارير' },
  { key: 'api_access',        label: 'الوصول عبر API' },
  { key: 'premium',           label: 'بريميوم' },
];

type Tab = 'announcements' | 'features' | 'danger';

@Component({
  selector: 'app-system-controls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page" dir="rtl">
      <div class="page-header">
        <div>
          <h2>ضبط النظام</h2>
          <p class="page-sub">إعلانات النظام، صلاحيات الشركات، وأدوات المخاطر العالية</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'announcements'" (click)="tab.set('announcements')">الإعلانات</button>
        <button class="tab" [class.active]="tab() === 'features'"      (click)="tab.set('features')">صلاحيات الشركات</button>
        <button class="tab tab--danger" [class.active]="tab() === 'danger'" (click)="tab.set('danger')">منطقة الخطر ⚠</button>
      </div>

      <!-- ── ANNOUNCEMENTS ── -->
      @if (tab() === 'announcements') {
        <div class="section">
          <div class="section-header">
            <div class="section-title">إعلانات النظام</div>
            <button class="btn-primary" (click)="openAnnounce()">+ إعلان جديد</button>
          </div>

          @if (loadingAnn()) {
            <div class="spinner-wrap"><span class="spinner spinner--green"></span></div>
          } @else if (announcements().length === 0) {
            <div class="empty">لا توجد إعلانات</div>
          } @else {
            <div class="ann-list">
              @for (a of announcements(); track a.id) {
                <div class="ann-card" [class.ann-inactive]="!a.active">
                  <div class="ann-top">
                    <span class="ann-type" [ngClass]="typeClass(a.type)">{{ a.type }}</span>
                    <span class="ann-status">{{ a.active ? 'نشط' : 'مخفي' }}</span>
                    <div class="ann-actions">
                      <button class="btn-sm btn-toggle" (click)="toggleAnn(a)">{{ a.active ? 'إخفاء' : 'إظهار' }}</button>
                      <button class="btn-sm btn-del" (click)="deleteAnn(a.id)">حذف</button>
                    </div>
                  </div>
                  <div class="ann-title">{{ a.title }}</div>
                  <div class="ann-msg">{{ a.message }}</div>
                  <div class="ann-date">{{ fmtDate(a.createdAt) }}</div>
                </div>
              }
            </div>
          }

          <!-- New announcement form -->
          @if (showAnnForm()) {
            <div class="modal-overlay" (click)="showAnnForm.set(false)">
              <div class="modal" dir="rtl" (click)="$event.stopPropagation()">
                <div class="modal-title">إعلان جديد</div>
                <div class="form-field">
                  <label class="form-label">العنوان</label>
                  <input class="form-input" [(ngModel)]="annForm.title" placeholder="عنوان الإعلان" />
                </div>
                <div class="form-field">
                  <label class="form-label">الرسالة</label>
                  <textarea class="form-input form-textarea" [(ngModel)]="annForm.message" placeholder="نص الإعلان..."></textarea>
                </div>
                <div class="form-field">
                  <label class="form-label">النوع</label>
                  <select class="form-input" [(ngModel)]="annForm.type">
                    <option value="INFO">معلومات</option>
                    <option value="WARNING">تحذير</option>
                    <option value="MAINTENANCE">صيانة</option>
                    <option value="CRITICAL">حرج</option>
                  </select>
                </div>
                <div class="modal-actions">
                  <button class="btn-cancel" (click)="showAnnForm.set(false)">إلغاء</button>
                  <button class="btn-confirm" (click)="submitAnn()" [disabled]="saving() || !annForm.title">
                    {{ saving() ? 'جاري...' : 'نشر الإعلان' }}
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- ── FEATURES ── -->
      @if (tab() === 'features') {
        <div class="section">
          <div class="section-title">صلاحيات وحدود الشركات</div>
          <p class="section-desc">اختر شركة لتعديل الوحدات المتاحة لها والحدود الخاصة بها.</p>

          <div class="feat-row">
            <select class="filter-select feat-select" [(ngModel)]="featTenantId" (change)="loadTenant()">
              <option value="">اختر شركة...</option>
              @for (t of tenants(); track t.tenantId) {
                <option [value]="t.tenantId">{{ t.companyNameAr }}</option>
              }
            </select>
          </div>

          @if (loadingTenant()) {
            <div class="spinner-wrap"><span class="spinner spinner--green"></span></div>
          } @else if (featTenant()) {
            <div class="feat-body">
              <!-- Modules -->
              <div class="feat-section">
                <div class="feat-sub">الوحدات المتاحة</div>
                <div class="modules-grid">
                  @for (m of moduleList; track m.key) {
                    <label class="module-toggle">
                      <input type="checkbox" [checked]="isEnabled(m.key)" (change)="toggleModule(m.key, $event)" />
                      <span class="module-label">{{ m.label }}</span>
                    </label>
                  }
                </div>
              </div>
              <!-- Limits -->
              <div class="feat-section">
                <div class="feat-sub">الحدود</div>
                <div class="limits-grid">
                  <div class="limit-field">
                    <label class="form-label">أقصى عدد فروع (-1 = غير محدود)</label>
                    <input class="form-input limit-input" type="number" [(ngModel)]="featLimits.maxBranches" />
                  </div>
                  <div class="limit-field">
                    <label class="form-label">أقصى عدد موظفين</label>
                    <input class="form-input limit-input" type="number" [(ngModel)]="featLimits.maxEmployees" />
                  </div>
                  <div class="limit-field">
                    <label class="form-label">أقصى عدد مدراء</label>
                    <input class="form-input limit-input" type="number" [(ngModel)]="featLimits.maxAdminUsers" />
                  </div>
                </div>
              </div>
              <button class="btn-primary" (click)="saveFeatures()" [disabled]="saving()">
                {{ saving() ? 'جاري الحفظ...' : 'حفظ التغييرات' }}
              </button>
            </div>
          }
        </div>
      }

      <!-- ── DANGER ZONE ── -->
      @if (tab() === 'danger') {
        <div class="section danger-section">
          <div class="danger-warning">
            <div class="dw-icon">⚠️</div>
            <div>
              <div class="dw-title">منطقة الخطر</div>
              <div class="dw-desc">العمليات في هذا القسم لا يمكن التراجع عنها. تأكد تماماً قبل المتابعة.</div>
            </div>
          </div>

          <div class="danger-card">
            <div class="dc-title">حذف بيانات شركة</div>
            <div class="dc-desc">يحذف جميع بيانات المبيعات والمشتريات والموظفين لشركة محددة. لا يُحذف المستخدمون.</div>
            <div class="dc-controls">
              <select class="filter-select" [(ngModel)]="wipeTenantId">
                <option value="">اختر شركة...</option>
                @for (t of tenants(); track t.tenantId) {
                  <option [value]="t.tenantId">{{ t.companyNameAr }}</option>
                }
              </select>
              <input class="form-input dc-reason" [(ngModel)]="wipeReason" placeholder="سبب الحذف (اختياري)" />
              <button class="btn-danger-lg" [disabled]="!wipeTenantId || saving()" (click)="confirmWipe()">
                حذف البيانات
              </button>
            </div>
          </div>
        </div>
      }

      @if (feedback()) {
        <div class="feedback" [class.feedback--err]="feedbackErr()">{{ feedback() }}</div>
      }
    </div>
  `,
  styles: [`
    .page { color: var(--mz-text, #e8e8e8); }
    .page-header { margin-bottom: 1.5rem; }
    h2 { font-size: 1.35rem; font-weight: 700; margin: 0 0 .2rem; }
    .page-sub { font-size: .82rem; color: var(--mz-text-muted, #8a9a8f); margin: 0; }

    /* Tabs */
    .tabs { display: flex; gap: 0; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,.07); }
    .tab { background: none; border: none; border-bottom: 2px solid transparent; padding: .65rem 1.1rem; font-size: .85rem; font-weight: 500; color: rgba(232,228,220,.45); cursor: pointer; transition: color .2s; }
    .tab:hover { color: rgba(232,228,220,.85); }
    .tab.active { color: #c9a84c; border-bottom-color: #c9a84c; }
    .tab--danger { color: rgba(239,68,68,.5); }
    .tab--danger:hover { color: rgba(239,68,68,.85); }
    .tab--danger.active { color: #ef4444; border-bottom-color: #ef4444; }

    /* Section */
    .section { }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .section-title { font-size: .85rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--mz-text-muted, #8a9a8f); }
    .section-desc { font-size: .82rem; color: var(--mz-text-muted, #8a9a8f); margin: 0 0 1.25rem; line-height: 1.55; }

    .spinner-wrap { display: flex; justify-content: center; padding: 3rem; }
    .empty { padding: 2rem; text-align: center; color: var(--mz-text-muted, #8a9a8f); }

    /* Announcements */
    .ann-list { display: flex; flex-direction: column; gap: .75rem; }
    .ann-card {
      background: var(--mz-surface, #1a2a1f); border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px; padding: 1rem 1.1rem;
    }
    .ann-inactive { opacity: .55; }
    .ann-top { display: flex; align-items: center; gap: .6rem; margin-bottom: .5rem; flex-wrap: wrap; }
    .ann-actions { margin-right: auto; display: flex; gap: .4rem; }
    .ann-type { font-size: .7rem; font-weight: 700; padding: .15rem .5rem; border-radius: 20px; }
    .t-INFO        { background: rgba(100,180,255,.12); color: #64b4ff; }
    .t-WARNING     { background: rgba(245,158,11,.12);  color: #f59e0b; }
    .t-MAINTENANCE { background: rgba(167,139,250,.12); color: #a78bfa; }
    .t-CRITICAL    { background: rgba(239,68,68,.12);   color: #ef4444; }
    .ann-status { font-size: .72rem; color: var(--mz-text-muted, #8a9a8f); }
    .ann-title { font-size: .95rem; font-weight: 600; margin-bottom: .25rem; }
    .ann-msg   { font-size: .82rem; color: rgba(232,228,220,.7); line-height: 1.5; }
    .ann-date  { font-size: .72rem; color: var(--mz-text-muted, #8a9a8f); margin-top: .4rem; }

    .btn-sm { font-size: .72rem; padding: .25rem .6rem; border-radius: 6px; cursor: pointer; border: 1px solid; font-family: inherit; }
    .btn-toggle { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.12); color: rgba(232,228,220,.65); }
    .btn-toggle:hover { color: rgba(232,228,220,.95); }
    .btn-del { background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.25); color: #ef4444; }
    .btn-del:hover { background: rgba(239,68,68,.15); }

    /* Features */
    .feat-row { margin-bottom: 1.25rem; }
    .feat-select { min-width: 260px; }
    .feat-body { display: flex; flex-direction: column; gap: 1.5rem; }
    .feat-section { }
    .feat-sub { font-size: .82rem; font-weight: 600; color: var(--mz-text-muted, #8a9a8f); margin-bottom: .75rem; }
    .modules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: .5rem; }
    .module-toggle { display: flex; align-items: center; gap: .5rem; cursor: pointer; padding: .4rem .6rem; border-radius: 8px; transition: background .15s; }
    .module-toggle:hover { background: rgba(255,255,255,.04); }
    .module-toggle input { accent-color: #c9a84c; width: 1rem; height: 1rem; cursor: pointer; }
    .module-label { font-size: .82rem; }
    .limits-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .75rem; }
    .limit-field { display: flex; flex-direction: column; gap: .35rem; }
    .limit-input { padding: .4rem .65rem; font-size: .85rem; }

    /* Danger Zone */
    .danger-section { }
    .danger-warning {
      display: flex; gap: 1rem; align-items: flex-start;
      background: rgba(239,68,68,.06); border: 1px solid rgba(239,68,68,.2);
      border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.5rem;
    }
    .dw-icon  { font-size: 1.8rem; }
    .dw-title { font-size: .95rem; font-weight: 700; color: #ef4444; margin-bottom: .2rem; }
    .dw-desc  { font-size: .82rem; color: rgba(239,68,68,.75); line-height: 1.5; }
    .danger-card {
      background: var(--mz-surface, #1a2a1f); border: 1px solid rgba(239,68,68,.2);
      border-radius: 12px; padding: 1.25rem;
    }
    .dc-title { font-size: .95rem; font-weight: 600; margin-bottom: .35rem; }
    .dc-desc  { font-size: .82rem; color: var(--mz-text-muted, #8a9a8f); margin-bottom: 1rem; line-height: 1.5; }
    .dc-controls { display: flex; gap: .65rem; flex-wrap: wrap; align-items: center; }
    .dc-reason { min-width: 200px; }
    .btn-danger-lg {
      background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35);
      color: #ef4444; border-radius: 8px; padding: .5rem 1.1rem;
      font-size: .85rem; font-weight: 600; cursor: pointer; transition: background .15s;
    }
    .btn-danger-lg:hover:not(:disabled) { background: rgba(239,68,68,.22); }
    .btn-danger-lg:disabled { opacity: .4; cursor: not-allowed; }

    /* Shared */
    .filter-select { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: var(--mz-text, #e8e8e8); padding: .4rem .75rem; font-size: .82rem; outline: none; }
    .form-field  { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .75rem; }
    .form-label  { font-size: .8rem; color: var(--mz-text-muted, #8a9a8f); }
    .form-input  { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; color: var(--mz-text, #e8e8e8); padding: .5rem .75rem; font-size: .9rem; outline: none; font-family: inherit; }
    .form-input:focus { border-color: #c9a84c; }
    .form-textarea { min-height: 90px; resize: vertical; }

    .btn-primary { background: #c9a84c; border: none; color: #0f1a14; border-radius: 8px; padding: .5rem 1.25rem; font-size: .85rem; font-weight: 700; cursor: pointer; font-family: inherit; }
    .btn-primary:disabled { opacity: .45; cursor: not-allowed; }
    .btn-cancel  { background: transparent; border: 1px solid rgba(255,255,255,.15); color: var(--mz-text-muted, #8a9a8f); border-radius: 8px; padding: .5rem 1rem; font-size: .85rem; cursor: pointer; font-family: inherit; }
    .btn-confirm { background: #c9a84c; border: none; color: #0f1a14; border-radius: 8px; padding: .5rem 1.25rem; font-size: .85rem; font-weight: 700; cursor: pointer; font-family: inherit; }
    .btn-confirm:disabled { opacity: .45; cursor: not-allowed; }

    /* Modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: #1a2a1f; border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 1.75rem; width: 90%; max-width: 460px; }
    .modal-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 1.1rem; }
    .modal-actions { display: flex; justify-content: flex-start; gap: .65rem; margin-top: 1.25rem; }

    /* Feedback */
    .feedback { position: fixed; bottom: 1.5rem; right: 1.5rem; padding: .7rem 1.25rem; border-radius: 10px; font-size: .85rem; z-index: 2000; background: rgba(34,197,94,.12); color: #22c55e; border: 1px solid rgba(34,197,94,.25); }
    .feedback--err { background: rgba(239,68,68,.12); color: #ef4444; border-color: rgba(239,68,68,.25); }
  `]
})
export class SystemControlsComponent implements OnInit {
  private svc = inject(SuperAdminService);

  tab = signal<Tab>('announcements');

  announcements = signal<any[]>([]);
  tenants       = signal<any[]>([]);
  loadingAnn    = signal(false);
  loadingTenant = signal(false);
  saving        = signal(false);
  feedback      = signal<string | null>(null);
  feedbackErr   = signal(false);

  showAnnForm = signal(false);
  annForm = { title: '', message: '', type: 'INFO' };

  featTenantId  = '';
  featTenant    = signal<any | null>(null);
  featModules   = signal<string[]>([]);
  featLimits    = { maxBranches: -1, maxEmployees: -1, maxAdminUsers: -1 };
  moduleList    = MODULES;

  wipeTenantId  = '';
  wipeReason    = '';

  ngOnInit() {
    this.loadAnnouncements();
    this.svc.getTenants().subscribe({ next: res => this.tenants.set(res.data as any[] ?? []) });
  }

  // ── Announcements ──
  loadAnnouncements() {
    this.loadingAnn.set(true);
    this.svc.getAnnouncements().subscribe({
      next: res => { this.announcements.set(res.data ?? []); this.loadingAnn.set(false); },
      error: () => this.loadingAnn.set(false)
    });
  }

  openAnnounce() {
    this.annForm = { title: '', message: '', type: 'INFO' };
    this.showAnnForm.set(true);
  }

  submitAnn() {
    if (!this.annForm.title) return;
    this.saving.set(true);
    this.svc.createAnnouncement({ ...this.annForm, active: true }).subscribe({
      next: () => {
        this.showAnnForm.set(false);
        this.loadAnnouncements();
        this.showFeedback('تم نشر الإعلان', false);
      },
      error: () => { this.showFeedback('فشل النشر', true); this.saving.set(false); }
    });
  }

  toggleAnn(a: any) {
    this.svc.updateAnnouncement(a.id, { active: !a.active }).subscribe({
      next: () => this.loadAnnouncements(),
      error: () => this.showFeedback('فشل التعديل', true)
    });
  }

  deleteAnn(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;
    this.svc.deleteAnnouncement(id).subscribe({
      next: () => { this.loadAnnouncements(); this.showFeedback('تم حذف الإعلان', false); },
      error: () => this.showFeedback('فشل الحذف', true)
    });
  }

  typeClass(t: string): string {
    return 't-' + (t || 'INFO');
  }

  // ── Features ──
  loadTenant() {
    if (!this.featTenantId) { this.featTenant.set(null); return; }
    this.loadingTenant.set(true);
    this.svc.getTenants().subscribe({
      next: res => {
        const t = (res.data as any[] ?? []).find((t: any) => t.tenantId === this.featTenantId);
        if (t) {
          this.featTenant.set(t);
          this.featModules.set(t.billing?.enabledModules ?? []);
          this.featLimits = {
            maxBranches:   t.limits?.maxBranches   ?? -1,
            maxEmployees:  t.limits?.maxEmployees   ?? -1,
            maxAdminUsers: t.limits?.maxAdminUsers  ?? -1,
          };
        }
        this.loadingTenant.set(false);
      },
      error: () => this.loadingTenant.set(false)
    });
  }

  isEnabled(key: string): boolean {
    return this.featModules().includes(key);
  }

  toggleModule(key: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const mods = [...this.featModules()];
    if (checked && !mods.includes(key)) mods.push(key);
    if (!checked) { const i = mods.indexOf(key); if (i >= 0) mods.splice(i, 1); }
    this.featModules.set(mods);
  }

  saveFeatures() {
    if (!this.featTenantId) return;
    this.saving.set(true);
    this.svc.updateTenantFeatures(this.featTenantId, {
      enabledModules: this.featModules(),
      ...this.featLimits
    }).subscribe({
      next: () => { this.saving.set(false); this.showFeedback('تم حفظ الصلاحيات', false); },
      error: () => { this.saving.set(false); this.showFeedback('فشل الحفظ', true); }
    });
  }

  // ── Danger Zone ──
  confirmWipe() {
    const tenant = this.tenants().find((t: any) => t.tenantId === this.wipeTenantId);
    const name = tenant?.companyNameAr ?? this.wipeTenantId;
    if (!confirm(`تحذير: سيتم حذف جميع بيانات المبيعات والمشتريات والموظفين لـ "${name}".\n\nهذا الإجراء لا يمكن التراجع عنه.\n\nهل أنت متأكد تماماً؟`)) return;
    this.saving.set(true);
    this.svc.wipeTenantData(this.wipeTenantId, this.wipeReason).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.wipeTenantId = '';
        this.wipeReason   = '';
        this.showFeedback(`تم حذف البيانات بنجاح (${res.data?.deleted ?? 0} سجل)`, false);
      },
      error: () => { this.saving.set(false); this.showFeedback('فشل الحذف', true); }
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
