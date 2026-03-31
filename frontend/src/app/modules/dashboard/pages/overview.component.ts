import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { DashboardSummary } from '../../../shared/models/models';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h2>لوحة التحكم</h2>
        <p>نظرة عامة على أداء الشركة</p>
      </div>
      <div class="date-range">
        <label>من</label>
        <input type="date" [(ngModel)]="from" (change)="load()">
        <label>إلى</label>
        <input type="date" [(ngModel)]="to" (change)="load()">
      </div>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (summary()) {
      <div class="grid-4">
        <div class="stat-card">
          <div class="stat-card__label">إجمالي الوزن المباع (غرام)</div>
          <div class="stat-card__value">{{ fmt(summary()!.totalWeightSold) }}</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card__label">إجمالي الإيراد (ريال)</div>
          <div class="stat-card__value">{{ fmt(summary()!.totalRevenue) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">إجمالي المشتريات (ريال)</div>
          <div class="stat-card__value">{{ fmt(summary()!.totalPurchases) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">متوسط سعر البيع</div>
          <div class="stat-card__value">{{ summary()!.avgSaleRate?.toFixed(2) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">متوسط سعر الشراء</div>
          <div class="stat-card__value">{{ summary()!.avgPurchaseRate?.toFixed(2) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">عدد الفروع</div>
          <div class="stat-card__value">{{ summary()!.branchCount }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">عدد الموظفين</div>
          <div class="stat-card__value">{{ summary()!.employeeCount }}</div>
        </div>
        @if (summary()!.topBranch) {
          <div class="stat-card">
            <div class="stat-card__label">أفضل فرع</div>
            <div class="stat-card__value" style="font-size:1rem">{{ summary()!.topBranch }}</div>
          </div>
        }
      </div>
    } @else {
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>لا توجد بيانات للفترة المحددة</p>
      </div>
    }
  `
})
export class OverviewComponent implements OnInit {
  private svc = inject(DashboardService);
  summary = signal<DashboardSummary | null>(null);
  loading = signal(false);

  from = this.firstOfMonth();
  to = this.today();

  ngOnInit() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getSummary(this.from, this.to).subscribe({
      next: res => { this.loading.set(false); this.summary.set(res.data ?? null); },
      error: () => { this.loading.set(false); }
    });
  }

  fmt(n?: number): string {
    if (n == null) return '—';
    return n.toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }

  private firstOfMonth(): string {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0,10);
  }
  private today(): string { return new Date().toISOString().slice(0,10); }
}
