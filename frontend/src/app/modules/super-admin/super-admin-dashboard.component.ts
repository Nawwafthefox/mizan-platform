import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SuperAdminService } from '../../core/services/super-admin.service';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div dir="rtl">
      <div class="page-header">
        <div>
          <h2>لوحة تحكم المدير العام</h2>
          <p class="page-sub">إحصائيات النظام ونظرة شاملة</p>
        </div>
      </div>

      @if (loading()) {
        <div class="spinner-wrap"><span class="spinner spinner--green"></span></div>
      } @else if (stats()) {
        <!-- KPI Grid -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">إجمالي الشركات</div>
            <div class="kpi-val">{{ stats()!.totalTenants }}</div>
          </div>
          <div class="kpi-card kpi-card--green">
            <div class="kpi-label">شركات نشطة</div>
            <div class="kpi-val">{{ stats()!.activeTenants }}</div>
            <div class="kpi-sub">منها {{ stats()!.trialTenants }} تجريبية</div>
          </div>
          <div class="kpi-card kpi-card--red">
            <div class="kpi-label">شركات موقوفة</div>
            <div class="kpi-val">{{ stats()!.suspendedTenants }}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">إجمالي المستخدمين</div>
            <div class="kpi-val">{{ stats()!.totalUsers }}</div>
          </div>
          <div class="kpi-card kpi-card--blue">
            <div class="kpi-label">عمليات الرفع الكلية</div>
            <div class="kpi-val">{{ stats()!.totalUploads }}</div>
          </div>
          <div class="kpi-card kpi-card--gold">
            <div class="kpi-label">الإعلانات النشطة</div>
            <div class="kpi-val">{{ stats()!.activeAnnouncements }}</div>
          </div>
        </div>

        <!-- Quick Access Cards -->
        <div class="section-title">وصول سريع</div>
        <div class="nav-grid">
          <a routerLink="/super-admin/tenants" class="nav-card">
            <div class="nav-card__icon">🏢</div>
            <div class="nav-card__label">إدارة الشركات</div>
            <div class="nav-card__desc">إنشاء، تعديل، إيقاف وتفعيل الشركات</div>
          </a>
          <a routerLink="/super-admin/users" class="nav-card">
            <div class="nav-card__icon">👥</div>
            <div class="nav-card__label">إدارة المستخدمين</div>
            <div class="nav-card__desc">بحث عبر كل المستخدمين، إيقاف تفعيل، إعادة ضبط كلمة المرور</div>
          </a>
          <a routerLink="/super-admin/audit-logs" class="nav-card">
            <div class="nav-card__icon">📋</div>
            <div class="nav-card__label">سجل التدقيق</div>
            <div class="nav-card__desc">تتبع كل الأحداث والتغييرات على النظام</div>
          </a>
          <a routerLink="/super-admin/upload-logs" class="nav-card">
            <div class="nav-card__icon">📤</div>
            <div class="nav-card__label">سجل الرفع</div>
            <div class="nav-card__desc">مراقبة عمليات رفع البيانات وحالتها</div>
          </a>
          <a routerLink="/super-admin/tiers" class="nav-card">
            <div class="nav-card__icon">💎</div>
            <div class="nav-card__label">الباقات والأسعار</div>
            <div class="nav-card__desc">ضبط أسعار وميزات باقات الاشتراك</div>
          </a>
          <a routerLink="/super-admin/system" class="nav-card nav-card--danger">
            <div class="nav-card__icon">⚙️</div>
            <div class="nav-card__label">ضبط النظام</div>
            <div class="nav-card__desc">الإعلانات، صلاحيات الشركات، حذف البيانات</div>
          </a>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header { margin-bottom: 1.75rem; }
    .page-header h2 { font-size: 1.4rem; font-weight: 700; color: var(--mz-text, #e8e8e8); margin: 0 0 .25rem; }
    .page-sub { font-size: .85rem; color: var(--mz-text-muted, #8a9a8f); margin: 0; }
    .spinner-wrap { display: flex; justify-content: center; padding: 3rem; }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .kpi-card {
      background: var(--mz-surface, #1a2a1f);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px;
      padding: 1.25rem;
    }
    .kpi-card--green { border-color: rgba(20,184,166,.25); }
    .kpi-card--red   { border-color: rgba(239,68,68,.25); }
    .kpi-card--blue  { border-color: rgba(100,180,255,.25); }
    .kpi-card--gold  { border-color: rgba(201,168,76,.25); }

    .kpi-label { font-size: .78rem; color: var(--mz-text-muted, #8a9a8f); font-weight: 500; margin-bottom: .5rem; }
    .kpi-val   { font-size: 2rem; font-weight: 700; color: var(--mz-text, #e8e8e8); font-variant-numeric: tabular-nums; }
    .kpi-sub   { font-size: .72rem; color: var(--mz-text-muted, #8a9a8f); margin-top: .25rem; }
    .kpi-card--green .kpi-val { color: #14b8a6; }
    .kpi-card--red   .kpi-val { color: #ef4444; }
    .kpi-card--blue  .kpi-val { color: #64b4ff; }
    .kpi-card--gold  .kpi-val { color: #c9a84c; }

    .section-title {
      font-size: .75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--mz-text-muted, #8a9a8f);
      margin-bottom: .85rem;
    }

    .nav-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
    }
    .nav-card {
      background: var(--mz-surface, #1a2a1f);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px;
      padding: 1.25rem;
      text-decoration: none;
      display: flex;
      flex-direction: column;
      gap: .4rem;
      transition: border-color .2s, box-shadow .2s;
      cursor: pointer;
    }
    .nav-card:hover {
      border-color: rgba(201,168,76,.35);
      box-shadow: 0 4px 20px rgba(0,0,0,.25);
    }
    .nav-card--danger:hover { border-color: rgba(239,68,68,.35); }

    .nav-card__icon  { font-size: 1.6rem; }
    .nav-card__label { font-size: .95rem; font-weight: 600; color: var(--mz-text, #e8e8e8); }
    .nav-card__desc  { font-size: .78rem; color: var(--mz-text-muted, #8a9a8f); line-height: 1.5; }
  `]
})
export class SuperAdminDashboardComponent implements OnInit {
  private svc = inject(SuperAdminService);
  stats   = signal<any | null>(null);
  loading = signal(false);

  ngOnInit() {
    this.loading.set(true);
    this.svc.getStats().subscribe({
      next: res => { this.loading.set(false); this.stats.set(res.data ?? null); },
      error: () => this.loading.set(false)
    });
  }
}
