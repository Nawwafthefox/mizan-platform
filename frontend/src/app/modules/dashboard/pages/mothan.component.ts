import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { MothanSummary } from '../../../shared/models/models';

@Component({
  selector: 'app-mothan',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>المثان</h2><p>بيانات معاملات المثان</p></div>
      <div class="date-range">
        <label>من</label><input type="date" [(ngModel)]="from" (change)="load()">
        <label>إلى</label><input type="date" [(ngModel)]="to" (change)="load()">
      </div>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (mothan()) {
      <div class="grid-2 mb-4">
        <div class="stat-card stat-card--gold">
          <div class="stat-card__label">إجمالي الذهب (غرام)</div>
          <div class="stat-card__value">{{ fmt(mothan()!.totalGoldGrams) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">عدد المعاملات</div>
          <div class="stat-card__value">{{ mothan()!.transactionCount }}</div>
        </div>
      </div>

      @if (mothan()!.branches?.length) {
        <div class="card">
          <div class="card__header"><h3>توزيع حسب الفروع</h3></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>الفرع</th><th>الرمز</th><th>وزن الذهب (غ)</th></tr></thead>
              <tbody>
                @for (b of mothan()!.branches; track b.branchCode) {
                  <tr>
                    <td>{{ b.branchName }}</td>
                    <td dir="ltr">{{ b.branchCode }}</td>
                    <td>{{ fmt(b.goldGrams) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    } @else {
      <div class="empty-state"><div class="empty-icon">◈</div><p>لا توجد بيانات</p></div>
    }
  `
})
export class MothanComponent implements OnInit {
  private svc = inject(DashboardService);
  mothan = signal<MothanSummary | null>(null);
  loading = signal(false);
  from = this.firstOfMonth();
  to = this.today();

  ngOnInit() { this.load(); }
  load(): void {
    this.loading.set(true);
    this.svc.getMothan(this.from, this.to).subscribe({
      next: res => { this.loading.set(false); this.mothan.set(res.data ?? null); },
      error: () => this.loading.set(false)
    });
  }
  fmt(n?: number): string { return n?.toLocaleString('ar-SA', { maximumFractionDigits: 2 }) ?? '—'; }
  private firstOfMonth(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); }
  private today(): string { return new Date().toISOString().slice(0,10); }
}
