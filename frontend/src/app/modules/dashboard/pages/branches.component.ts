import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { BranchSummary } from '../../../shared/models/models';

@Component({
  selector: 'app-branches',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>الفروع</h2><p>أداء الفروع خلال الفترة المحددة</p></div>
      <div class="date-range">
        <label>من</label><input type="date" [(ngModel)]="from" (change)="load()">
        <label>إلى</label><input type="date" [(ngModel)]="to" (change)="load()">
        <select class="form-control" style="width:auto" [(ngModel)]="region" (change)="load()">
          <option value="">كل المناطق</option>
          @for (r of regions(); track r) { <option [value]="r">{{ r }}</option> }
        </select>
      </div>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else if (branches().length) {
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الفرع</th><th>المنطقة</th><th>الوزن المباع (غ)</th>
              <th>الإيراد (ريال)</th><th>سعر البيع</th><th>سعر الشراء</th><th>الفارق</th>
            </tr>
          </thead>
          <tbody>
            @for (b of branches(); track b.branchCode) {
              <tr>
                <td><strong>{{ b.branchName }}</strong><br><small class="text-muted">{{ b.branchCode }}</small></td>
                <td>{{ b.region }}</td>
                <td>{{ fmt(b.totalWeightSold ?? b.netWeight) }}</td>
                <td>{{ fmt(b.totalRevenue) }}</td>
                <td>{{ (b.avgSaleRate ?? b.saleRate)?.toFixed(2) }}</td>
                <td>{{ (b.avgPurchaseRate ?? b.purchaseRate)?.toFixed(2) }}</td>
                <td [class]="diffClass(b.diffRate)">{{ b.diffRate?.toFixed(2) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="empty-state"><div class="empty-icon">🏪</div><p>لا توجد بيانات</p></div>
    }
  `
})
export class BranchesComponent implements OnInit {
  private svc = inject(DashboardService);
  branches = signal<BranchSummary[]>([]);
  regions = signal<string[]>([]);
  loading = signal(false);
  from = this.firstOfMonth();
  to = this.today();
  region = '';

  ngOnInit() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getBranches(this.from, this.to, this.region || undefined).subscribe({
      next: res => {
        this.loading.set(false);
        const list = res.data ?? [];
        this.branches.set(list);
        const rs = [...new Set(list.map(b => b.region).filter(Boolean))];
        this.regions.set(rs);
      },
      error: () => this.loading.set(false)
    });
  }

  fmt(n?: number): string { return n?.toLocaleString('ar-SA', { maximumFractionDigits: 0 }) ?? '—'; }

  diffClass(d?: number): string {
    if (d == null) return '';
    return d >= 0 ? 'text-success' : 'text-danger';
  }

  private firstOfMonth(): string { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); }
  private today(): string { return new Date().toISOString().slice(0,10); }
}
