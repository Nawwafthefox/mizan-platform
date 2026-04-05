import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface ImputedRecord {
  id: string;
  tenantId: string;
  importId: string;
  fileType: string;
  sourceRow: number;
  branchCode: string;
  branchName: string;
  recordDate: string;
  anomalyType: 'corrupt_pieces' | 'missing_employee' | 'multiline_date' | 'sum_mismatch';
  fieldName: string;
  originalValue: string;
  imputedValue: string;
  imputationMethod: string;
  confidence: number;
  recordSnapshot: Record<string, any>;
  branchStats: Record<string, any>;
  availableOptions: string[];
  status: 'pending_review' | 'approved' | 'modified' | 'rejected';
  reviewedAt: string;
  modifiedValue: string;
  createdAt: string;
  // UI state
  expanded?: boolean;
  editValue?: string;
}

@Component({
  selector: 'app-v3-imputed-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ir-page" dir="rtl">

      <!-- Header + bulk actions -->
      <div class="ir-header">
        <div class="ir-header-title">
          <h1>مراجعة البيانات المعدلة</h1>
          <p class="ir-subtitle">سجلات تم رصد شذوذ فيها وتعديلها تلقائياً — راجعها وأقرّ أو عدّل أو ارفض</p>
        </div>
        <button class="btn-bulk-approve" (click)="bulkApproveAll()" [disabled]="pendingIds().length === 0">
          موافقة على الكل ({{ pendingIds().length }})
        </button>
      </div>

      <!-- Summary bar -->
      <div class="ir-summary">
        <div class="sum-card">
          <span class="sum-label">معلّقة</span>
          <span class="sum-val pending">{{ countByStatus('pending_review') }}</span>
        </div>
        <div class="sum-card">
          <span class="sum-label">مقبولة</span>
          <span class="sum-val approved">{{ countByStatus('approved') }}</span>
        </div>
        <div class="sum-card">
          <span class="sum-label">معدّلة</span>
          <span class="sum-val modified">{{ countByStatus('modified') }}</span>
        </div>
        <div class="sum-card">
          <span class="sum-label">مرفوضة</span>
          <span class="sum-val rejected">{{ countByStatus('rejected') }}</span>
        </div>
        <div class="sum-card">
          <span class="sum-label">الإجمالي</span>
          <span class="sum-val total">{{ records().length }}</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="ir-filters">
        <select class="filter-select" [(ngModel)]="filterType" (ngModelChange)="applyFilters()">
          <option value="">جميع الأنواع</option>
          <option value="corrupt_pieces">قطع فاسدة</option>
          <option value="missing_employee">موظف مجهول</option>
          <option value="multiline_date">تاريخ متعدد الأسطر</option>
          <option value="sum_mismatch">عدم تطابق الإجمالي</option>
        </select>
        <select class="filter-select" [(ngModel)]="filterStatus" (ngModelChange)="applyFilters()">
          <option value="">جميع الحالات</option>
          <option value="pending_review">معلّقة</option>
          <option value="approved">مقبولة</option>
          <option value="modified">معدّلة</option>
          <option value="rejected">مرفوضة</option>
        </select>
        <select class="filter-select" [(ngModel)]="filterFile" (ngModelChange)="applyFilters()">
          <option value="">جميع الملفات</option>
          <option value="branch-sales">مبيعات الفروع</option>
          <option value="employee-sales">مبيعات الموظفين</option>
          <option value="mothan">موطن الذهب</option>
        </select>
        <button class="btn-refresh" (click)="load()">↻ تحديث</button>
      </div>

      <!-- Loading / empty states -->
      @if (loading()) {
        <div class="ir-loading">جاري التحميل...</div>
      } @else if (filtered().length === 0) {
        <div class="ir-empty">
          @if (records().length === 0) {
            <span>لا توجد سجلات معدّلة حتى الآن</span>
          } @else {
            <span>لا توجد نتائج تطابق الفلاتر المحددة</span>
          }
        </div>
      } @else {

        <!-- Records table -->
        <div class="ir-table-wrap">
          <table class="ir-table">
            <thead>
              <tr>
                <th></th>
                <th>النوع</th>
                <th>الفرع</th>
                <th>الحقل</th>
                <th>القيمة الأصلية</th>
                <th>القيمة المقترحة</th>
                <th>الثقة</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              @for (rec of filtered(); track rec.id) {
                <tr class="ir-row" [class.expanded]="rec.expanded" [class.status-approved]="rec.status === 'approved'" [class.status-modified]="rec.status === 'modified'" [class.status-rejected]="rec.status === 'rejected'">
                  <td>
                    <button class="expand-btn" (click)="toggle(rec)">{{ rec.expanded ? '▲' : '▼' }}</button>
                  </td>
                  <td>
                    <span class="anomaly-badge" [class]="'anomaly-' + rec.anomalyType">
                      {{ anomalyLabel(rec.anomalyType) }}
                    </span>
                  </td>
                  <td class="branch-cell">{{ rec.branchCode }}</td>
                  <td class="field-cell">{{ rec.fieldName }}</td>
                  <td class="orig-val">{{ rec.originalValue }}</td>
                  <td class="imputed-val">{{ rec.imputedValue }}</td>
                  <td>
                    <div class="conf-bar-wrap">
                      <div class="conf-bar" [style.width.%]="rec.confidence * 100" [class]="confClass(rec.confidence)"></div>
                      <span class="conf-pct">{{ (rec.confidence * 100) | number:'1.0-0' }}%</span>
                    </div>
                  </td>
                  <td>
                    <span class="status-pill" [class]="'st-' + rec.status">{{ statusLabel(rec.status) }}</span>
                  </td>
                  <td class="actions-cell">
                    @if (rec.status === 'pending_review') {
                      <button class="btn-approve" (click)="approve(rec)">✓</button>
                      <button class="btn-reject" (click)="reject(rec)">✗</button>
                    }
                  </td>
                </tr>

                <!-- Expand panel -->
                @if (rec.expanded) {
                  <tr class="expand-panel-row">
                    <td colspan="9">
                      <div class="expand-panel">

                        <!-- Snapshot -->
                        <div class="panel-section">
                          <h4>بيانات السطر</h4>
                          <div class="snapshot-grid">
                            @for (entry of snapEntries(rec); track entry.key) {
                              <div class="snap-item">
                                <span class="snap-key">{{ entry.key }}</span>
                                <span class="snap-val">{{ entry.value }}</span>
                              </div>
                            }
                          </div>
                        </div>

                        <!-- Stats -->
                        @if (rec.branchStats && hasKeys(rec.branchStats)) {
                          <div class="panel-section">
                            <h4>إحصاءات الفرع</h4>
                            <div class="snapshot-grid">
                              @for (entry of statsEntries(rec); track entry.key) {
                                <div class="snap-item">
                                  <span class="snap-key">{{ entry.key }}</span>
                                  <span class="snap-val">{{ entry.value }}</span>
                                </div>
                              }
                            </div>
                          </div>
                        }

                        <!-- Edit section (only for pending, not for sum_mismatch) -->
                        @if (rec.status === 'pending_review' && rec.anomalyType !== 'sum_mismatch') {
                          <div class="panel-section edit-section">
                            <h4>تعديل القيمة</h4>

                            @if (rec.anomalyType === 'corrupt_pieces') {
                              <div class="edit-row">
                                <label class="edit-label">عدد القطع المعدّل:</label>
                                <input
                                  type="number"
                                  class="edit-input"
                                  [(ngModel)]="rec.editValue"
                                  [placeholder]="rec.imputedValue"
                                  min="1" max="500"
                                />
                                <button class="btn-save-edit" (click)="modify(rec)">حفظ التعديل</button>
                              </div>
                            }

                            @if (rec.anomalyType === 'missing_employee') {
                              <div class="edit-row">
                                <label class="edit-label">اختر الموظف:</label>
                                <select class="edit-select" [(ngModel)]="rec.editValue">
                                  <option value="">-- اختر --</option>
                                  @for (opt of rec.availableOptions; track opt) {
                                    <option [value]="opt.split(' - ')[0]">{{ opt }}</option>
                                  }
                                </select>
                                <button class="btn-save-edit" (click)="modify(rec)" [disabled]="!rec.editValue">حفظ</button>
                              </div>
                            }

                            @if (rec.anomalyType === 'multiline_date') {
                              <div class="edit-row">
                                <label class="edit-label">اختر التاريخ الصحيح:</label>
                                <div class="radio-group">
                                  @for (opt of rec.availableOptions; track opt) {
                                    <label class="radio-label">
                                      <input type="radio" [(ngModel)]="rec.editValue" [value]="opt" />
                                      {{ opt }}
                                    </label>
                                  }
                                </div>
                                <button class="btn-save-edit" (click)="modify(rec)" [disabled]="!rec.editValue">حفظ</button>
                              </div>
                            }

                          </div>
                        }

                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .ir-page {
      padding: 1.5rem 0;
      color: var(--mizan-text, #e8e8e8);
    }

    /* Header */
    .ir-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .ir-header h1 {
      font-size: 1.35rem;
      font-weight: 700;
      color: #fbbf24;
      margin: 0 0 .3rem;
    }
    .ir-subtitle {
      font-size: .8rem;
      color: rgba(232,228,220,.45);
      margin: 0;
    }
    .btn-bulk-approve {
      background: rgba(201,168,76,0.12);
      border: 1px solid rgba(201,168,76,0.3);
      color: #c9a84c;
      padding: .55rem 1.1rem;
      border-radius: 8px;
      font-size: .82rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      font-family: inherit;
      transition: background 200ms, border-color 200ms;
      &:hover:not(:disabled) { background: rgba(201,168,76,0.22); border-color: rgba(201,168,76,0.5); }
      &:disabled { opacity: .4; cursor: default; }
    }

    /* Summary */
    .ir-summary {
      display: flex;
      gap: .75rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
    }
    .sum-card {
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 10px;
      padding: .7rem 1.1rem;
      display: flex;
      flex-direction: column;
      gap: .25rem;
      min-width: 90px;
    }
    .sum-label { font-size: .72rem; color: rgba(232,228,220,.4); text-transform: uppercase; letter-spacing: .04em; }
    .sum-val { font-size: 1.4rem; font-weight: 700; }
    .sum-val.pending  { color: #fbbf24; }
    .sum-val.approved { color: #34d399; }
    .sum-val.modified { color: #60a5fa; }
    .sum-val.rejected { color: #f87171; }
    .sum-val.total    { color: #e8e8e8; }

    /* Filters */
    .ir-filters {
      display: flex;
      gap: .6rem;
      flex-wrap: wrap;
      margin-bottom: 1.25rem;
      align-items: center;
    }
    .filter-select {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(201,168,76,0.12);
      border-radius: 7px;
      color: rgba(232,228,220,.8);
      padding: .38rem .7rem;
      font-size: .8rem;
      font-family: inherit;
      outline: none;
      &:focus { border-color: rgba(201,168,76,0.4); }
      option { background: #1a2b1f; }
    }
    .btn-refresh {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 7px;
      color: rgba(232,228,220,.55);
      padding: .38rem .75rem;
      font-size: .8rem;
      cursor: pointer;
      font-family: inherit;
      &:hover { background: rgba(255,255,255,.07); color: rgba(232,228,220,.85); }
    }

    /* Loading / empty */
    .ir-loading, .ir-empty {
      text-align: center;
      padding: 3rem 1rem;
      color: rgba(232,228,220,.35);
      font-size: .9rem;
    }

    /* Table */
    .ir-table-wrap { overflow-x: auto; }
    .ir-table {
      width: 100%;
      border-collapse: collapse;
      font-size: .82rem;
    }
    .ir-table thead th {
      text-align: right;
      padding: .55rem .75rem;
      color: rgba(232,228,220,.4);
      font-size: .72rem;
      text-transform: uppercase;
      letter-spacing: .04em;
      border-bottom: 1px solid rgba(255,255,255,.06);
      white-space: nowrap;
    }
    .ir-row td {
      padding: .6rem .75rem;
      border-bottom: 1px solid rgba(255,255,255,.04);
      vertical-align: middle;
    }
    .ir-row:hover td { background: rgba(255,255,255,.02); }
    .ir-row.status-approved td { opacity: .65; }
    .ir-row.status-rejected td { opacity: .45; }

    .expand-btn {
      background: transparent;
      border: none;
      color: rgba(232,228,220,.35);
      cursor: pointer;
      font-size: .75rem;
      padding: .2rem .35rem;
      border-radius: 4px;
      &:hover { background: rgba(255,255,255,.06); color: rgba(232,228,220,.7); }
    }

    /* Anomaly badge */
    .anomaly-badge {
      display: inline-block;
      padding: .2rem .55rem;
      border-radius: 20px;
      font-size: .72rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .anomaly-corrupt_pieces   { background: rgba(251,191,36,.12); color: #fbbf24; }
    .anomaly-missing_employee { background: rgba(96,165,250,.12); color: #60a5fa; }
    .anomaly-multiline_date   { background: rgba(167,139,250,.12); color: #a78bfa; }
    .anomaly-sum_mismatch     { background: rgba(248,113,113,.12); color: #f87171; }

    .branch-cell { font-family: monospace; font-size: .8rem; color: rgba(232,228,220,.7); }
    .field-cell  { color: rgba(232,228,220,.55); font-size: .78rem; }
    .orig-val    { color: #f87171; font-family: monospace; }
    .imputed-val { color: #34d399; font-family: monospace; }

    /* Confidence bar */
    .conf-bar-wrap {
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    .conf-bar {
      height: 6px;
      border-radius: 3px;
      min-width: 4px;
    }
    .conf-bar.conf-high   { background: #34d399; }
    .conf-bar.conf-medium { background: #fbbf24; }
    .conf-bar.conf-low    { background: #f87171; }
    .conf-pct { font-size: .72rem; color: rgba(232,228,220,.5); white-space: nowrap; }

    /* Status pill */
    .status-pill {
      display: inline-block;
      padding: .18rem .5rem;
      border-radius: 20px;
      font-size: .7rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .st-pending_review { background: rgba(251,191,36,.12); color: #fbbf24; }
    .st-approved       { background: rgba(52,211,153,.12); color: #34d399; }
    .st-modified       { background: rgba(96,165,250,.12); color: #60a5fa; }
    .st-rejected       { background: rgba(248,113,113,.12); color: #f87171; }

    .actions-cell { white-space: nowrap; }
    .btn-approve, .btn-reject {
      border: none;
      border-radius: 6px;
      padding: .25rem .55rem;
      font-size: .82rem;
      cursor: pointer;
      font-weight: 700;
      font-family: inherit;
      margin-inline-start: .3rem;
    }
    .btn-approve { background: rgba(52,211,153,.15); color: #34d399; &:hover { background: rgba(52,211,153,.25); } }
    .btn-reject  { background: rgba(248,113,113,.12); color: #f87171; &:hover { background: rgba(248,113,113,.22); } }

    /* Expand panel */
    .expand-panel-row td { padding: 0; }
    .expand-panel {
      background: rgba(0,0,0,.2);
      border-bottom: 1px solid rgba(255,255,255,.05);
      padding: 1rem 1.25rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
    }
    .panel-section { flex: 1 1 220px; min-width: 180px; }
    .panel-section h4 { font-size: .75rem; color: rgba(232,228,220,.4); text-transform: uppercase; letter-spacing: .05em; margin: 0 0 .6rem; }
    .snapshot-grid { display: flex; flex-direction: column; gap: .3rem; }
    .snap-item { display: flex; gap: .5rem; align-items: baseline; }
    .snap-key { font-size: .72rem; color: rgba(232,228,220,.4); min-width: 90px; flex-shrink: 0; }
    .snap-val { font-size: .78rem; color: rgba(232,228,220,.8); font-family: monospace; }

    .edit-section { flex: 2 1 320px; }
    .edit-row { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-top: .4rem; }
    .edit-label { font-size: .78rem; color: rgba(232,228,220,.55); white-space: nowrap; }
    .edit-input, .edit-select {
      background: rgba(255,255,255,.05);
      border: 1px solid rgba(201,168,76,0.2);
      border-radius: 6px;
      color: rgba(232,228,220,.85);
      padding: .32rem .6rem;
      font-size: .8rem;
      font-family: inherit;
      outline: none;
      &:focus { border-color: rgba(201,168,76,0.45); }
      option { background: #1a2b1f; }
    }
    .edit-input { width: 90px; }
    .radio-group { display: flex; flex-direction: column; gap: .35rem; }
    .radio-label { display: flex; align-items: center; gap: .4rem; font-size: .8rem; color: rgba(232,228,220,.75); cursor: pointer; }
    .btn-save-edit {
      background: rgba(201,168,76,0.12);
      border: 1px solid rgba(201,168,76,0.25);
      border-radius: 6px;
      color: #c9a84c;
      padding: .3rem .75rem;
      font-size: .78rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      &:hover:not(:disabled) { background: rgba(201,168,76,0.22); }
      &:disabled { opacity: .35; cursor: default; }
    }
  `]
})
export class V3ImputedReviewComponent implements OnInit {
  private http = inject(HttpClient);

  records   = signal<ImputedRecord[]>([]);
  loading   = signal(true);

  filterType   = '';
  filterStatus = '';
  filterFile   = '';

  filtered = computed(() => {
    let list = this.records();
    if (this.filterType)   list = list.filter(r => r.anomalyType === this.filterType);
    if (this.filterStatus) list = list.filter(r => r.status === this.filterStatus);
    if (this.filterFile)   list = list.filter(r => r.fileType === this.filterFile);
    return list;
  });

  pendingIds = computed(() => this.records().filter(r => r.status === 'pending_review').map(r => r.id));

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.http.get<any>('/api/v3/import/imputed-records').subscribe({
      next: res => {
        const data: ImputedRecord[] = (res?.data ?? []).map((r: ImputedRecord) => ({
          ...r,
          expanded: false,
          editValue: r.imputedValue
        }));
        this.records.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  applyFilters(): void { /* computed() auto-tracks — no-op needed for ngModel change */ }

  countByStatus(status: string): number {
    return this.records().filter(r => r.status === status).length;
  }

  toggle(rec: ImputedRecord): void { rec.expanded = !rec.expanded; }

  approve(rec: ImputedRecord): void {
    this.http.put<any>(`/api/v3/import/imputed-records/${rec.id}/approve`, {}).subscribe({
      next: () => this.updateLocal(rec.id, { status: 'approved' }),
      error: err => console.error('approve failed', err)
    });
  }

  modify(rec: ImputedRecord): void {
    if (!rec.editValue) return;
    this.http.put<any>(`/api/v3/import/imputed-records/${rec.id}/modify`, {
      modifiedValue: rec.editValue
    }).subscribe({
      next: () => this.updateLocal(rec.id, { status: 'modified', modifiedValue: rec.editValue }),
      error: err => console.error('modify failed', err)
    });
  }

  reject(rec: ImputedRecord): void {
    this.http.put<any>(`/api/v3/import/imputed-records/${rec.id}/reject`, {}).subscribe({
      next: () => this.updateLocal(rec.id, { status: 'rejected' }),
      error: err => console.error('reject failed', err)
    });
  }

  bulkApproveAll(): void {
    const ids = this.pendingIds();
    if (ids.length === 0) return;
    this.http.post<any>('/api/v3/import/imputed-records/bulk-approve', { ids }).subscribe({
      next: () => {
        this.records.update(list =>
          list.map(r => r.status === 'pending_review' ? { ...r, status: 'approved' as const } : r)
        );
      },
      error: err => console.error('bulk-approve failed', err)
    });
  }

  private updateLocal(id: string, patch: Partial<ImputedRecord>): void {
    this.records.update(list => list.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  anomalyLabel(type: string): string {
    return {
      corrupt_pieces:  'قطع فاسدة',
      missing_employee: 'موظف مجهول',
      multiline_date:  'تاريخ مزدوج',
      sum_mismatch:    'عدم تطابق الإجمالي',
    }[type] ?? type;
  }

  statusLabel(s: string): string {
    return { pending_review: 'معلّقة', approved: 'مقبولة', modified: 'معدّلة', rejected: 'مرفوضة' }[s] ?? s;
  }

  confClass(c: number): string {
    return c >= 0.8 ? 'conf-high' : c >= 0.5 ? 'conf-medium' : 'conf-low';
  }

  snapEntries(rec: ImputedRecord): { key: string; value: string }[] {
    return Object.entries(rec.recordSnapshot ?? {}).map(([key, value]) => ({ key, value: String(value) }));
  }

  statsEntries(rec: ImputedRecord): { key: string; value: string }[] {
    return Object.entries(rec.branchStats ?? {}).map(([key, value]) => ({ key, value: String(value) }));
  }

  hasKeys(obj: Record<string, any>): boolean {
    return obj && Object.keys(obj).length > 0;
  }
}
