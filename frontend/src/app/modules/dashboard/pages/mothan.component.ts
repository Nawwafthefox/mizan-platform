import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../core/services/dashboard.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { DateFilterComponent } from '../../../shared/components/date-filter/date-filter.component';

@Component({
  selector: 'app-mothan',
  standalone: true,
  imports: [CommonModule, DateFilterComponent],
  template: `
    <div class="page-header">
      <div><h2>موطن الذهب</h2><p>معاملات موطن الذهب</p></div>
    </div>

    <app-date-filter (dateChange)="load()"></app-date-filter>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (!data()) {
      <div class="empty-state"><div class="empty-icon">🏦</div><p>لا توجد بيانات موطن الذهب في هذه الفترة</p></div>
    } @else {
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-card--gold">
          <div class="kpi-label">إجمالي المبالغ</div>
          <div class="kpi-value">{{ fmt(data()!.totalSar) }}</div>
          <div class="kpi-sub">ريال سعودي</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">إجمالي الوزن</div>
          <div class="kpi-value">{{ data()!.totalWt?.toFixed(2) }}</div>
          <div class="kpi-sub">غرام</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">متوسط السعر</div>
          <div class="kpi-value">{{ data()!.avgRate?.toFixed(2) }}</div>
          <div class="kpi-sub">ر.س/جم</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">عدد المعاملات</div>
          <div class="kpi-value">{{ data()!.txnCount }}</div>
          <div class="kpi-sub">معاملة</div>
        </div>
      </div>

      <!-- Branch Summary -->
      @if (data()!.byBranch?.length > 0) {
        <div class="card mb-4">
          <div class="card__header"><h3>ملخص بالفروع</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>الفرع</th><th>المبلغ</th><th>الوزن</th><th>المعاملات</th><th>متوسط السعر</th></tr>
              </thead>
              <tbody>
                @for (b of data()!.byBranch; track b.branchCode) {
                  <tr>
                    <td>{{ b.branchName }}</td>
                    <td>{{ fmt(b.totalSar) }}</td>
                    <td>{{ b.totalWt?.toFixed(2) }}</td>
                    <td>{{ b.txnCount }}</td>
                    <td>{{ b.avgRate?.toFixed(2) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Transactions -->
      @if (data()!.transactions?.length > 0) {
        <div class="card">
          <div class="card__header"><h3>المعاملات التفصيلية</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>التاريخ</th><th>الفرع</th><th>المرجع</th>
                  <th>البيان</th><th>الدائن</th><th>الوزن</th>
                </tr>
              </thead>
              <tbody>
                @for (t of data()!.transactions; track t.id) {
                  <tr>
                    <td>{{ t.transactionDate }}</td>
                    <td>{{ t.branchName }}</td>
                    <td dir="ltr">{{ t.docReference }}</td>
                    <td>{{ t.description }}</td>
                    <td>{{ fmt(t.creditSar) }}</td>
                    <td>{{ t.goldWeightGrams?.toFixed(2) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-card { background: var(--mizan-surface); border: 1px solid var(--mizan-border); border-radius: 10px; padding: 1rem; }
    .kpi-card--gold { border-color: var(--mizan-gold); background: rgba(201,168,76,.08); }
    .kpi-label { font-size: .75rem; color: var(--mizan-text-muted); margin-bottom: .3rem; }
    .kpi-value { font-size: 1.3rem; font-weight: 700; }
    .kpi-sub { font-size: .72rem; color: var(--mizan-text-muted); margin-top: .2rem; }
    .mb-4 { margin-bottom: 1.5rem; }
    .table-wrap { overflow-x: auto; }
    .card__header { display: flex; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--mizan-border); }
    .card__header h3 { font-size: .95rem; font-weight: 600; margin: 0; }
  `]
})
export class MothanComponent implements OnInit {
  private svc = inject(DashboardService);
  private dr = inject(DateRangeService);

  data = signal<any>(null);
  loading = signal(false);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    const from = this.dr.getFrom(), to = this.dr.getTo();
    this.svc.getMothan(from, to).subscribe({
      next: r => {
        const d = r.data as any;
        // Handle both old and new response format
        if (d && typeof d === 'object' && 'txnCount' in d) {
          this.data.set(d.txnCount === 0 ? null : d);
        } else {
          this.data.set(null);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  fmt(n?: number): string {
    return (n ?? 0).toLocaleString('ar-SA', { maximumFractionDigits: 0 });
  }
}
