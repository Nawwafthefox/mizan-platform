import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { EmployeeSummary } from '../../../shared/models/models';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>الموظفون</h2><p>أداء الموظفين خلال الفترة</p></div>
      <div class="date-range">
        <label>من</label><input type="date" [(ngModel)]="from" (change)="load()">
        <label>إلى</label><input type="date" [(ngModel)]="to" (change)="load()">
      </div>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (employees().length) {
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الموظف</th><th>رمز الموظف</th><th>الفرع</th>
              <th>الوزن المباع (غ)</th><th>الإيراد (ريال)</th><th>المعاملات</th><th>متوسط السعر</th>
            </tr>
          </thead>
          <tbody>
            @for (e of employees(); track e.employeeId) {
              <tr>
                <td><strong>{{ e.employeeName }}</strong></td>
                <td dir="ltr">{{ e.employeeId }}</td>
                <td>{{ e.branchName }}</td>
                <td>{{ fmt(e.totalWeightSold) }}</td>
                <td>{{ fmt(e.totalRevenue) }}</td>
                <td>{{ e.transactions }}</td>
                <td>{{ e.avgSaleRate?.toFixed(2) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty-state"><div class="empty-icon">👤</div><p>لا توجد بيانات</p></div>
    }
  `
})
export class EmployeesComponent implements OnInit {
  private svc = inject(DashboardService);
  employees = signal<EmployeeSummary[]>([]);
  loading = signal(false);
  from = this.firstOfMonth();
  to = this.today();

  ngOnInit() { this.load(); }
  load(): void {
    this.loading.set(true);
    this.svc.getEmployees(this.from, this.to).subscribe({
      next: res => { this.loading.set(false); this.employees.set(res.data ?? []); },
      error: () => this.loading.set(false)
    });
  }
  fmt(n?: number): string { return n?.toLocaleString('ar-SA', { maximumFractionDigits: 0 }) ?? '—'; }
  private firstOfMonth(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); }
  private today(): string { return new Date().toISOString().slice(0,10); }
}
