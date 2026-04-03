import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperAdminService } from '../../core/services/super-admin.service';

@Component({
  selector: 'app-upload-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page" dir="rtl">
      <div class="page-header">
        <div>
          <h2>سجل الرفع</h2>
          <p class="page-sub">جميع عمليات رفع البيانات عبر كل الشركات</p>
        </div>
        <button class="btn-refresh" (click)="load()">تحديث</button>
      </div>

      <!-- Summary strips -->
      @if (!loading() && logs().length > 0) {
        <div class="summary-row">
          <div class="summary-pill">
            <span class="s-val">{{ totalSaved() }}</span>
            <span class="s-label">سجل محفوظ</span>
          </div>
          <div class="summary-pill">
            <span class="s-val s-skip">{{ totalSkipped() }}</span>
            <span class="s-label">سجل متخطى</span>
          </div>
          <div class="summary-pill">
            <span class="s-val s-err">{{ countFailed() }}</span>
            <span class="s-label">عمليات فاشلة</span>
          </div>
          <div class="summary-pill">
            <span class="s-val s-ok">{{ countSuccess() }}</span>
            <span class="s-label">عمليات ناجحة</span>
          </div>
        </div>
      }

      <!-- Filters -->
      <div class="filters">
        <select class="filter-select" [(ngModel)]="filterTenant" (change)="load()">
          <option value="">كل الشركات</option>
          @for (t of tenants(); track t.id) {
            <option [value]="t.id">{{ t.name }}</option>
          }
        </select>
        <select class="filter-select" [(ngModel)]="filterStatus" (ngModelChange)="applyFilter()">
          <option value="">كل الحالات</option>
          <option value="SUCCESS">ناجح</option>
          <option value="FAILED">فاشل</option>
          <option value="PARTIAL">جزئي</option>
        </select>
        <span class="count">{{ filtered().length }} عملية</span>
      </div>

      @if (loading()) {
        <div class="spinner-wrap"><span class="spinner spinner--green"></span></div>
      } @else if (filtered().length === 0) {
        <div class="empty">لا توجد عمليات رفع</div>
      } @else {
        <div class="table-wrap">
          <table class="ul-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الشركة</th>
                <th>الملف</th>
                <th>النوع</th>
                <th>محفوظ</th>
                <th>متخطى</th>
                <th>الحالة</th>
                <th>المنفذ</th>
              </tr>
            </thead>
            <tbody>
              @for (l of filtered(); track l.id) {
                <tr>
                  <td class="td-date">{{ fmtDate(l.uploadedAt) }}</td>
                  <td class="td-tenant">{{ l.tenantName }}</td>
                  <td class="td-file">{{ l.fileName || '—' }}</td>
                  <td class="td-type">{{ l.fileType || '—' }}</td>
                  <td class="td-num td-ok">{{ l.recordsSaved }}</td>
                  <td class="td-num td-skip">{{ l.recordsSkipped }}</td>
                  <td>
                    <span class="status-pill" [ngClass]="statusClass(l.status)">
                      {{ statusLabel(l.status) }}
                    </span>
                    @if (l.errorMessage) {
                      <div class="err-msg">{{ l.errorMessage }}</div>
                    }
                  </td>
                  <td class="td-date">{{ l.uploadedBy || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { color: var(--mz-text, #e8e8e8); }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem; }
    h2 { font-size: 1.35rem; font-weight: 700; margin: 0 0 .2rem; }
    .page-sub { font-size: .82rem; color: var(--mz-text-muted, #8a9a8f); margin: 0; }
    .btn-refresh { background: rgba(201,168,76,.12); border: 1px solid rgba(201,168,76,.3); color: #c9a84c; border-radius: 8px; padding: .45rem 1rem; font-size: .82rem; cursor: pointer; }
    .btn-refresh:hover { background: rgba(201,168,76,.22); }

    .summary-row { display: flex; gap: .75rem; margin-bottom: 1.1rem; flex-wrap: wrap; }
    .summary-pill {
      background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
      border-radius: 10px; padding: .6rem 1rem; display: flex; align-items: center; gap: .5rem;
    }
    .s-val   { font-size: 1.3rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--mz-text, #e8e8e8); }
    .s-skip  { color: #f59e0b; }
    .s-err   { color: #ef4444; }
    .s-ok    { color: #22c55e; }
    .s-label { font-size: .75rem; color: var(--mz-text-muted, #8a9a8f); }

    .filters { display: flex; align-items: center; gap: .65rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .filter-select { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: var(--mz-text, #e8e8e8); padding: .4rem .75rem; font-size: .82rem; outline: none; }
    .count { font-size: .78rem; color: var(--mz-text-muted, #8a9a8f); margin-right: auto; }

    .spinner-wrap { display: flex; justify-content: center; padding: 3rem; }
    .empty { text-align: center; padding: 3rem; color: var(--mz-text-muted, #8a9a8f); }

    .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,.07); }
    .ul-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .ul-table thead tr { background: rgba(255,255,255,.04); }
    .ul-table th { padding: .65rem 1rem; text-align: right; color: var(--mz-text-muted, #8a9a8f); font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
    .ul-table td { padding: .6rem 1rem; border-top: 1px solid rgba(255,255,255,.05); vertical-align: middle; }
    .ul-table tbody tr:hover { background: rgba(255,255,255,.025); }

    .td-date   { white-space: nowrap; color: var(--mz-text-muted, #8a9a8f); font-size: .75rem; }
    .td-tenant { color: #64b4ff; font-size: .78rem; }
    .td-file   { max-width: 180px; word-break: break-all; font-size: .78rem; }
    .td-type   { color: var(--mz-text-muted, #8a9a8f); font-size: .75rem; }
    .td-num    { text-align: center; font-variant-numeric: tabular-nums; font-weight: 600; }
    .td-ok     { color: #22c55e; }
    .td-skip   { color: #f59e0b; }

    .status-pill { font-size: .72rem; font-weight: 600; padding: .2rem .6rem; border-radius: 20px; }
    .s-success { background: rgba(34,197,94,.12);  color: #22c55e; }
    .s-failed  { background: rgba(239,68,68,.12);  color: #ef4444; }
    .s-partial { background: rgba(245,158,11,.12); color: #f59e0b; }
    .s-unknown { background: rgba(255,255,255,.06); color: var(--mz-text-muted, #8a9a8f); }
    .err-msg { font-size: .7rem; color: #ef4444; margin-top: .2rem; word-break: break-word; }
  `]
})
export class UploadLogsComponent implements OnInit {
  private svc = inject(SuperAdminService);

  logs     = signal<any[]>([]);
  filtered = signal<any[]>([]);
  tenants  = signal<{ id: string; name: string }[]>([]);
  loading  = signal(false);

  filterTenant = '';
  filterStatus = '';

  ngOnInit() {
    this.svc.getTenants().subscribe({
      next: res => {
        const list = (res.data as any[] ?? []);
        this.tenants.set(list.map((t: any) => ({ id: t.tenantId, name: t.companyNameAr })));
      }
    });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.getUploadLogs(this.filterTenant || undefined).subscribe({
      next: res => {
        this.logs.set(res.data ?? []);
        this.applyFilter();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  applyFilter() {
    const all = this.logs();
    if (!this.filterStatus) { this.filtered.set(all); return; }
    this.filtered.set(all.filter(l => l.status === this.filterStatus));
  }

  totalSaved()   { return this.logs().reduce((s, l) => s + (l.recordsSaved   || 0), 0); }
  totalSkipped() { return this.logs().reduce((s, l) => s + (l.recordsSkipped || 0), 0); }
  countFailed()  { return this.logs().filter(l => l.status === 'FAILED').length; }
  countSuccess() { return this.logs().filter(l => l.status === 'SUCCESS').length; }

  statusLabel(s: string): string {
    return s === 'SUCCESS' ? 'ناجح' : s === 'FAILED' ? 'فاشل' : s === 'PARTIAL' ? 'جزئي' : (s || '—');
  }

  statusClass(s: string): string {
    return s === 'SUCCESS' ? 's-success' : s === 'FAILED' ? 's-failed' : s === 'PARTIAL' ? 's-partial' : 's-unknown';
  }

  fmtDate(dt: string): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
  }
}
