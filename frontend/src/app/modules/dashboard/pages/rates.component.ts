import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../../core/services/dashboard.service';
import { BranchPurchaseRate } from '../../../shared/models/models';

@Component({
  selector: 'app-rates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div><h2>أسعار الشراء</h2><p>تعديل أسعار شراء الذهب لكل فرع</p></div>
    </div>

    @if (loading()) {
      <div class="empty-state"><span class="spinner spinner--green"></span></div>
    } @else {
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>الفرع</th><th>الرمز</th><th>سعر الشراء</th><th>تعديل</th></tr></thead>
            <tbody>
              @for (r of rates(); track r.branchCode) {
                <tr>
                  <td>{{ r.branchName }}</td>
                  <td dir="ltr">{{ r.branchCode }}</td>
                  <td>
                    @if (editing()?.branchCode === r.branchCode) {
                      <input class="form-control" type="number" step="0.01"
                        [(ngModel)]="editRate" style="width:120px">
                    } @else {
                      {{ r.purchaseRate?.toFixed(2) ?? '—' }}
                    }
                  </td>
                  <td>
                    @if (editing()?.branchCode === r.branchCode) {
                      <button class="btn btn--primary btn--sm" (click)="save(r)">حفظ</button>
                      <button class="btn btn--ghost btn--sm" (click)="editing.set(null)">إلغاء</button>
                    } @else {
                      <button class="btn btn--outline btn--sm" (click)="startEdit(r)">تعديل</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (error()) { <div class="alert alert--error mt-3">{{ error() }}</div> }
    @if (successMsg()) { <div class="alert alert--success mt-3">{{ successMsg() }}</div> }
  `
})
export class RatesComponent implements OnInit {
  private svc = inject(DashboardService);
  rates = signal<BranchPurchaseRate[]>([]);
  loading = signal(false);
  editing = signal<BranchPurchaseRate | null>(null);
  editRate = 0;
  error = signal('');
  successMsg = signal('');

  ngOnInit() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.getPurchaseRates().subscribe({
      next: res => { this.loading.set(false); this.rates.set(res.data ?? []); },
      error: () => this.loading.set(false)
    });
  }

  startEdit(r: BranchPurchaseRate): void {
    this.editing.set(r);
    this.editRate = r.purchaseRate ?? 0;
  }

  save(r: BranchPurchaseRate): void {
    this.svc.upsertPurchaseRate({ branchCode: r.branchCode, branchName: r.branchName, purchaseRate: this.editRate }).subscribe({
      next: () => {
        this.editing.set(null);
        this.successMsg.set('تم الحفظ بنجاح');
        this.load();
        setTimeout(() => this.successMsg.set(''), 3000);
      },
      error: err => this.error.set(err?.error?.message || 'فشل الحفظ')
    });
  }
}
