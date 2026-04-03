import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuperAdminService } from '../../core/services/super-admin.service';

const ACTION_COLORS: Record<string, string> = {
  CREATE_TENANT:        '#14b8a6',
  UPDATE_TENANT:        '#64b4ff',
  SUSPEND_TENANT:       '#ef4444',
  ACTIVATE_TENANT:      '#22c55e',
  ADD_ADMIN:            '#a78bfa',
  IMPERSONATE:          '#f59e0b',
  UPDATE_TIER:          '#64b4ff',
  DEACTIVATE_USER:      '#ef4444',
  ACTIVATE_USER:        '#22c55e',
  RESET_PASSWORD:       '#f59e0b',
  WIPE_DATA:            '#ef4444',
  CREATE_ANNOUNCEMENT:  '#c9a84c',
  UPDATE_ANNOUNCEMENT:  '#c9a84c',
  DELETE_ANNOUNCEMENT:  '#ef4444',
  UPDATE_FEATURES:      '#a78bfa',
};

const ALL_ACTIONS = Object.keys(ACTION_COLORS);

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page" dir="rtl">
      <div class="page-header">
        <div>
          <h2>سجل التدقيق</h2>
          <p class="page-sub">جميع الأحداث والتغييرات على مستوى النظام</p>
        </div>
        <button class="btn-refresh" (click)="load()">تحديث</button>
      </div>

      <!-- Filters -->
      <div class="filters">
        <select class="filter-select" [(ngModel)]="filterAction" (change)="load()">
          <option value="">كل الأحداث</option>
          @for (a of actions; track a) {
            <option [value]="a">{{ a }}</option>
          }
        </select>
        <select class="filter-select" [(ngModel)]="filterTenant" (change)="load()">
          <option value="">كل الشركات</option>
          @for (t of tenants(); track t.id) {
            <option [value]="t.id">{{ t.name }}</option>
          }
        </select>
        <span class="log-count">{{ logs().length }} سجل</span>
      </div>

      <!-- Table -->
      @if (loading()) {
        <div class="spinner-wrap"><span class="spinner spinner--green"></span></div>
      } @else if (logs().length === 0) {
        <div class="empty">لا توجد سجلات مطابقة</div>
      } @else {
        <div class="table-wrap">
          <table class="log-table">
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>الحدث</th>
                <th>المنفذ</th>
                <th>الشركة</th>
                <th>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              @for (log of logs(); track log.id) {
                <tr>
                  <td class="td-date">{{ fmtDate(log.createdAt) }}</td>
                  <td>
                    <span class="action-badge" [style.color]="actionColor(log.action)" [style.borderColor]="actionColor(log.action)">
                      {{ log.action }}
                    </span>
                  </td>
                  <td class="td-actor">{{ log.actorEmail }}</td>
                  <td class="td-tenant">{{ tenantName(log.tenantId) }}</td>
                  <td class="td-details">{{ log.details }}</td>
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
    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 1.25rem; flex-wrap: wrap; gap: .75rem;
    }
    h2 { font-size: 1.35rem; font-weight: 700; margin: 0 0 .2rem; }
    .page-sub { font-size: .82rem; color: var(--mz-text-muted, #8a9a8f); margin: 0; }

    .btn-refresh {
      background: rgba(201,168,76,.12); border: 1px solid rgba(201,168,76,.3);
      color: #c9a84c; border-radius: 8px; padding: .45rem 1rem;
      font-size: .82rem; cursor: pointer; transition: background .15s;
    }
    .btn-refresh:hover { background: rgba(201,168,76,.22); }

    .filters {
      display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap;
    }
    .filter-select {
      background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1);
      border-radius: 8px; color: var(--mz-text, #e8e8e8); padding: .4rem .75rem;
      font-size: .82rem; outline: none; cursor: pointer;
    }
    .log-count { font-size: .78rem; color: var(--mz-text-muted, #8a9a8f); margin-right: auto; }

    .spinner-wrap { display: flex; justify-content: center; padding: 3rem; }
    .empty { text-align: center; padding: 3rem; color: var(--mz-text-muted, #8a9a8f); }

    .table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,.07); }
    .log-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .log-table thead tr { background: rgba(255,255,255,.04); }
    .log-table th {
      padding: .65rem 1rem; text-align: right; color: var(--mz-text-muted, #8a9a8f);
      font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em;
      white-space: nowrap;
    }
    .log-table td {
      padding: .6rem 1rem; border-top: 1px solid rgba(255,255,255,.05);
      color: var(--mz-text, #e8e8e8); vertical-align: middle;
    }
    .log-table tbody tr:hover { background: rgba(255,255,255,.025); }

    .action-badge {
      display: inline-block; padding: .2rem .55rem; border-radius: 20px;
      border: 1px solid; font-size: .72rem; font-weight: 600; letter-spacing: .03em;
      background: rgba(255,255,255,.04);
    }
    .td-date   { white-space: nowrap; color: var(--mz-text-muted, #8a9a8f); font-size: .78rem; }
    .td-actor  { color: #64b4ff; font-size: .8rem; }
    .td-tenant { color: var(--mz-text-muted, #8a9a8f); font-size: .78rem; }
    .td-details { max-width: 280px; word-break: break-word; color: rgba(232,228,220,.7); }
  `]
})
export class AuditLogsComponent implements OnInit {
  private svc = inject(SuperAdminService);

  logs     = signal<any[]>([]);
  tenants  = signal<{ id: string; name: string }[]>([]);
  loading  = signal(false);

  filterAction = '';
  filterTenant = '';
  actions = ALL_ACTIONS;

  private tenantMap: Record<string, string> = {};

  ngOnInit() {
    this.svc.getTenants().subscribe({
      next: res => {
        const list = (res.data as any[] ?? []);
        this.tenants.set(list.map((t: any) => ({ id: t.tenantId, name: t.companyNameAr })));
        list.forEach((t: any) => this.tenantMap[t.tenantId] = t.companyNameAr);
      }
    });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.getAuditLogs({
      tenantId: this.filterTenant || undefined,
      action:   this.filterAction || undefined,
      limit: 500
    }).subscribe({
      next: res => { this.logs.set(res.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  fmtDate(dt: string): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
  }

  actionColor(action: string): string {
    return ACTION_COLORS[action] ?? 'rgba(232,228,220,.4)';
  }

  tenantName(id: string): string {
    return id ? (this.tenantMap[id] ?? id) : 'النظام';
  }
}
