import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { KaratBreakdown } from '../../../shared/models/models';

@Component({
  selector: 'app-karat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>عيارات الذهب</h2><p>توزيع الوزن حسب العيار</p></div>
      <div class="date-range">
        <label>من</label><input type="date" [(ngModel)]="from" (change)="load()">
        <label>إلى</label><input type="date" [(ngModel)]="to" (change)="load()">
      </div>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (karat()) {
      <div class="grid-4">
        <div class="stat-card">
          <div class="stat-card__label">عيار 18 (غرام)</div>
          <div class="stat-card__value">{{ fmt(karat()!.karat18Weight) }}</div>
          <div class="stat-card__sub">{{ pct(karat()!.karat18Weight) }}% من الإجمالي</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card__label">عيار 21 (غرام)</div>
          <div class="stat-card__value">{{ fmt(karat()!.karat21Weight) }}</div>
          <div class="stat-card__sub">{{ pct(karat()!.karat21Weight) }}% من الإجمالي</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">عيار 22 (غرام)</div>
          <div class="stat-card__value">{{ fmt(karat()!.karat22Weight) }}</div>
          <div class="stat-card__sub">{{ pct(karat()!.karat22Weight) }}% من الإجمالي</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">عيار 24 (غرام)</div>
          <div class="stat-card__value">{{ fmt(karat()!.karat24Weight) }}</div>
          <div class="stat-card__sub">{{ pct(karat()!.karat24Weight) }}% من الإجمالي</div>
        </div>
      </div>
      <div class="card mt-4">
        <div class="card__header"><h3>إجمالي الوزن</h3></div>
        <div style="font-size:2rem; font-weight:700; color: var(--mizan-green-dark)">
          {{ fmt(karat()!.totalWeight) }} <span style="font-size:1rem; color:var(--mizan-text-muted)">غرام</span>
        </div>
      </div>
    } @else {
      <div class="empty-state"><div class="empty-icon">◇</div><p>لا توجد بيانات</p></div>
    }
  `
})
export class KaratComponent implements OnInit {
  private svc = inject(DashboardService);
  karat = signal<KaratBreakdown | null>(null);
  loading = signal(false);
  from = this.firstOfMonth();
  to = this.today();

  ngOnInit() { this.load(); }
  load(): void {
    this.loading.set(true);
    this.svc.getKarat(this.from, this.to).subscribe({
      next: res => { this.loading.set(false); this.karat.set(res.data ?? null); },
      error: () => this.loading.set(false)
    });
  }
  fmt(n?: number): string { return n?.toLocaleString('ar-SA', { maximumFractionDigits: 2 }) ?? '—'; }
  pct(n?: number): string {
    const total = this.karat()?.totalWeight;
    if (!n || !total) return '0';
    return ((n / total) * 100).toFixed(1);
  }
  private firstOfMonth(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); }
  private today(): string { return new Date().toISOString().slice(0,10); }
}
