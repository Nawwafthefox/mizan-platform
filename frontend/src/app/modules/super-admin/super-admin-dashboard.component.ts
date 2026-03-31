import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuperAdminService } from '../../core/services/super-admin.service';
import { SuperAdminStats } from '../../shared/models/models';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header"><div><h2>لوحة تحكم المدير</h2><p>إحصائيات النظام</p></div></div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (stats()) {
      <div class="grid-4">
        <div class="stat-card">
          <div class="stat-card__label">إجمالي الشركات</div>
          <div class="stat-card__value">{{ stats()!.totalTenants }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">شركات نشطة</div>
          <div class="stat-card__value text-success">{{ stats()!.activeTenants }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">شركات موقوفة</div>
          <div class="stat-card__value text-danger">{{ stats()!.suspendedTenants }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">إجمالي المستخدمين</div>
          <div class="stat-card__value">{{ stats()!.totalUsers }}</div>
        </div>
      </div>
    }
  `
})
export class SuperAdminDashboardComponent implements OnInit {
  private svc = inject(SuperAdminService);
  stats = signal<SuperAdminStats | null>(null);
  loading = signal(false);

  ngOnInit() {
    this.loading.set(true);
    this.svc.getStats().subscribe({
      next: res => { this.loading.set(false); this.stats.set(res.data ?? null); },
      error: () => this.loading.set(false)
    });
  }
}
