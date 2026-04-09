import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';

interface FieldIssue {
  field: string;
  type: string;          // "corrupt_value" | "invalid" | "missing" | "zero_value" | "multiline"
  suggestedValue: string | null;
  confidence: number;
  method: string;
}

interface StagedRecord {
  id: string;
  tenantId: string;
  importId: string;
  fileType: string;
  sourceRow: number;
  branchCode: string;
  status: string;        // "pending" | "saved" | "saved_with_suggestion" | "omitted"
  parsedRecord: Record<string, any>;
  issues: FieldIssue[];
  branchStats: Record<string, any> | null;
  availableEmployees: { empId: string; empName: string }[] | null;
  createdAt: string;
  reviewedAt: string | null;
  // transient UI state
  _editValues?: Record<string, any>;
}

interface StagedCounts {
  'branch-sales': number;
  'employee-sales': number;
  purchases: number;
  mothan: number;
  total: number;
}

@Component({
  selector: 'app-v3-staged-review',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="review-page" dir="rtl">

      <!-- ── Header ── -->
      <div class="page-header">
        <h2 class="page-title">مراجعة السجلات المعلقة</h2>
        <button class="btn-refresh" (click)="load()">🔄 تحديث</button>
      </div>

      <!-- ── Summary Cards ── -->
      <div class="summary-row">
        <div class="summary-card" [class.has-pending]="counts()['branch-sales'] > 0"
             (click)="setFilter('branch-sales')" [class.active-filter]="fileFilter() === 'branch-sales'">
          <div class="file-icon">📈</div>
          <div class="file-name">مبيعات الفروع</div>
          <div class="count">{{ counts()['branch-sales'] }}</div>
        </div>
        <div class="summary-card" [class.has-pending]="counts()['employee-sales'] > 0"
             (click)="setFilter('employee-sales')" [class.active-filter]="fileFilter() === 'employee-sales'">
          <div class="file-icon">👤</div>
          <div class="file-name">مبيعات الموظفين</div>
          <div class="count">{{ counts()['employee-sales'] }}</div>
        </div>
        <div class="summary-card" [class.has-pending]="counts()['purchases'] > 0"
             (click)="setFilter('purchases')" [class.active-filter]="fileFilter() === 'purchases'">
          <div class="file-icon">🛒</div>
          <div class="file-name">المشتريات</div>
          <div class="count">{{ counts()['purchases'] }}</div>
        </div>
        <div class="summary-card" [class.has-pending]="counts()['mothan'] > 0"
             (click)="setFilter('mothan')" [class.active-filter]="fileFilter() === 'mothan'">
          <div class="file-icon">⚖️</div>
          <div class="file-name">موطن الذهب</div>
          <div class="count">{{ counts()['mothan'] }}</div>
        </div>
        <div class="summary-card total-card" (click)="setFilter(null)" [class.active-filter]="fileFilter() === null">
          <div class="file-icon">📋</div>
          <div class="file-name">الكل</div>
          <div class="count">{{ counts()['total'] }}</div>
        </div>
      </div>

      <!-- ── Bulk Actions ── -->
      @if (highConfCount() > 0) {
        <div class="bulk-bar">
          <button class="btn-gold" (click)="bulkAccept(0.8)" [disabled]="busy()">
            ✅ قبول التصحيحات التلقائية (ثقة ≥ 80%)
          </button>
          <span class="bulk-info">{{ highConfCount() }} سجل سيتم قبوله تلقائياً</span>
        </div>
      }

      <!-- ── Status filter tabs ── -->
      <div class="status-tabs">
        @for (s of statusOptions; track s.value) {
          <button class="status-tab" [class.active]="statusFilter() === s.value"
                  (click)="statusFilter.set(s.value)">
            {{ s.label }}
          </button>
        }
      </div>

      <!-- ── Loading ── -->
      @if (loading()) {
        <div class="loading-msg">جارٍ التحميل...</div>
      } @else if (filtered().length === 0) {
        <div class="empty-msg">
          @if (counts()['total'] === 0) {
            ✅ لا توجد سجلات معلقة — كل البيانات تمت مراجعتها
          } @else {
            لا توجد سجلات تطابق هذا الفلتر
          }
        </div>
      } @else {

        <!-- ── Records Table ── -->
        <div class="table-wrap">
          <table class="staged-table">
            <thead>
              <tr>
                <th>الصف</th>
                <th>الملف</th>
                <th>الفرع</th>
                <th>التاريخ</th>
                <th>المبلغ (ر.س)</th>
                <th>المشكلة</th>
                <th>القيمة الأصلية</th>
                <th>التصحيح المقترح</th>
                <th>الثقة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              @for (rec of filtered(); track rec.id) {
                <tr [class]="'row-status-' + rec.status">
                  <td class="row-num">{{ rec.sourceRow }}</td>
                  <td><span class="file-badge" [class]="'ft-' + rec.fileType.replace('-','')">{{ fileLabel(rec.fileType) }}</span></td>
                  <td class="branch-name">{{ branchName(rec) }}</td>
                  <td class="date-cell">{{ recordDate(rec) }}</td>
                  <td class="sar">{{ recordSar(rec) | number:'1.0-0' }}</td>

                  <!-- Issues -->
                  <td>
                    @for (issue of rec.issues; track issue.field) {
                      <span class="issue-tag" [class]="'it-' + issue.type" [title]="issue.method">
                        {{ issueLabel(issue) }}
                      </span>
                    }
                  </td>

                  <!-- Original values -->
                  <td class="original">
                    @for (issue of rec.issues; track issue.field) {
                      <div class="orig-val">{{ originalDisplay(issue, rec) }}</div>
                    }
                  </td>

                  <!-- Editable fix controls -->
                  <td class="fix-cell">
                    @if (rec.status === 'pending') {
                      @for (issue of rec.issues; track issue.field) {
                        @if (issue.field === 'pieces') {
                          <div class="fix-group">
                            <input type="number" class="fix-input"
                                   min="1" max="500"
                                   [ngModel]="getEditVal(rec, 'pieces') ?? issue.suggestedValue"
                                   (ngModelChange)="setEditVal(rec, 'pieces', $event)"
                                   placeholder="{{ issue.suggestedValue ?? '' }}">
                            @if (rec.branchStats?.['medianSarPerPiece']) {
                              <div class="hint">الوسيط: {{ rec.branchStats!['medianSarPerPiece'] | number:'1.0-0' }} ر.س/قطعة</div>
                            }
                          </div>
                        }
                        @if (issue.field === 'empId') {
                          <div class="fix-group">
                            <select class="fix-select"
                                    [ngModel]="getEditVal(rec, 'empId') ?? ''"
                                    (ngModelChange)="setEditVal(rec, 'empId', $event)">
                              <option value="">— اختر الموظف —</option>
                              @for (emp of rec.availableEmployees ?? []; track emp.empId) {
                                <option [value]="emp.empId">{{ emp.empId }} — {{ emp.empName }}</option>
                              }
                            </select>
                          </div>
                        }
                        @if (issue.field === 'transactionDate') {
                          <div class="fix-group date-options">
                            @for (d of dateOptions(issue); track d) {
                              <label class="date-opt">
                                <input type="radio"
                                       [name]="'date-' + rec.id"
                                       [value]="d"
                                       [ngModel]="getEditVal(rec, 'transactionDate') ?? issue.suggestedValue"
                                       (ngModelChange)="setEditVal(rec, 'transactionDate', $event)">
                                {{ d }}
                              </label>
                            }
                          </div>
                        }
                      }
                    } @else {
                      <span class="status-label" [class]="'sl-' + rec.status">{{ statusLabel(rec.status) }}</span>
                    }
                  </td>

                  <!-- Confidence -->
                  <td class="conf-cell">
                    @if (rec.issues.length > 0) {
                      <div class="conf-bar">
                        <div class="conf-fill"
                             [style.width.%]="rec.issues[0].confidence * 100"
                             [class.conf-hi]="rec.issues[0].confidence >= 0.8"
                             [class.conf-mid]="rec.issues[0].confidence >= 0.5 && rec.issues[0].confidence < 0.8"
                             [class.conf-lo]="rec.issues[0].confidence < 0.5">
                        </div>
                      </div>
                      <div class="conf-pct">{{ rec.issues[0].confidence * 100 | number:'1.0-0' }}%</div>
                    }
                  </td>

                  <!-- Actions -->
                  <td class="action-cell">
                    @if (rec.status === 'pending') {
                      <div class="action-group">
                        <button class="btn-accept" (click)="acceptSuggestion(rec)" [disabled]="busy()"
                                title="قبول التصحيح التلقائي">✅</button>
                        <button class="btn-save"   (click)="saveWithEdits(rec)"    [disabled]="busy()"
                                title="حفظ بعد التعديل">💾</button>
                        <button class="btn-omit"   (click)="omit(rec)"             [disabled]="busy()"
                                title="حذف السجل">🗑️</button>
                      </div>
                    } @else {
                      <span class="done-label">{{ statusLabel(rec.status) }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .review-page {
      padding: 1.5rem;
      max-width: 1400px;
      margin: 0 auto;
      color: rgba(232,228,220,.9);
      font-family: inherit;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .page-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #c9a84c;
      margin: 0;
    }
    .btn-refresh {
      background: rgba(201,168,76,.12);
      border: 1px solid rgba(201,168,76,.25);
      color: #c9a84c;
      border-radius: 8px;
      padding: .4rem .9rem;
      font-size: .82rem;
      cursor: pointer;
      &:hover { background: rgba(201,168,76,.2); }
    }

    /* ── Summary cards ── */
    .summary-row {
      display: flex;
      gap: .75rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .summary-card {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 12px;
      padding: .9rem 1.2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .3rem;
      cursor: pointer;
      transition: all 180ms ease;
      min-width: 110px;
      &:hover { background: rgba(255,255,255,.07); }
      &.has-pending { border-color: rgba(251,191,36,.3); }
      &.active-filter { border-color: #c9a84c; background: rgba(201,168,76,.1); }
    }
    .total-card { border-color: rgba(201,168,76,.2); }
    .file-icon { font-size: 1.5rem; }
    .file-name { font-size: .72rem; color: rgba(232,228,220,.5); text-align: center; }
    .count {
      font-size: 1.6rem;
      font-weight: 700;
      color: #fbbf24;
      line-height: 1;
    }

    /* ── Bulk bar ── */
    .bulk-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: rgba(201,168,76,.07);
      border: 1px solid rgba(201,168,76,.2);
      border-radius: 10px;
      padding: .75rem 1.25rem;
      margin-bottom: 1rem;
    }
    .btn-gold {
      background: linear-gradient(135deg, #c9a84c, #b8912f);
      color: #0d1a10;
      border: none;
      border-radius: 8px;
      padding: .45rem 1.1rem;
      font-weight: 700;
      font-size: .82rem;
      cursor: pointer;
      &:hover { opacity: .9; }
      &:disabled { opacity: .5; cursor: default; }
    }
    .bulk-info { font-size: .82rem; color: rgba(232,228,220,.6); }

    /* ── Status filter tabs ── */
    .status-tabs {
      display: flex;
      gap: .5rem;
      margin-bottom: 1rem;
    }
    .status-tab {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      color: rgba(232,228,220,.6);
      border-radius: 20px;
      padding: .3rem .85rem;
      font-size: .78rem;
      cursor: pointer;
      transition: all 150ms;
      &:hover { background: rgba(255,255,255,.08); }
      &.active {
        background: rgba(201,168,76,.15);
        border-color: rgba(201,168,76,.4);
        color: #c9a84c;
      }
    }

    /* ── Messages ── */
    .loading-msg, .empty-msg {
      text-align: center;
      padding: 3rem;
      color: rgba(232,228,220,.4);
      font-size: .95rem;
    }

    /* ── Table ── */
    .table-wrap { overflow-x: auto; }
    .staged-table {
      width: 100%;
      border-collapse: collapse;
      font-size: .8rem;

      th {
        background: rgba(255,255,255,.04);
        color: rgba(232,228,220,.5);
        font-size: .72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .04em;
        padding: .55rem .75rem;
        text-align: right;
        border-bottom: 1px solid rgba(255,255,255,.06);
        white-space: nowrap;
      }
      td {
        padding: .55rem .75rem;
        border-bottom: 1px solid rgba(255,255,255,.04);
        vertical-align: middle;
      }

      .row-status-pending   { background: rgba(251,191,36,.025); }
      .row-status-saved, .row-status-saved_with_suggestion {
        background: rgba(34,197,94,.03);
        opacity: .7;
      }
      .row-status-omitted { opacity: .45; }
    }

    .row-num { color: rgba(232,228,220,.35); font-size: .72rem; }

    .file-badge {
      font-size: .68rem;
      padding: .2rem .5rem;
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
    }
    .ft-branchsales   { background: rgba(99,102,241,.2);  color: #a5b4fc; }
    .ft-employeesales { background: rgba(20,184,166,.2);  color: #5eead4; }
    .ft-purchases     { background: rgba(245,158,11,.2);  color: #fcd34d; }
    .ft-mothan        { background: rgba(236,72,153,.2);  color: #f9a8d4; }

    .branch-name { white-space: nowrap; max-width: 130px; overflow: hidden; text-overflow: ellipsis; }
    .date-cell { white-space: nowrap; color: rgba(232,228,220,.65); font-size: .75rem; }
    .sar { text-align: left; font-weight: 600; color: #c9a84c; }

    .issue-tag {
      display: inline-block;
      font-size: .67rem;
      padding: .15rem .45rem;
      border-radius: 4px;
      margin: 1px;
      white-space: nowrap;
    }
    .it-corrupt_value { background: rgba(239,68,68,.2); color: #fca5a5; }
    .it-invalid       { background: rgba(239,68,68,.2); color: #fca5a5; }
    .it-missing       { background: rgba(156,163,175,.15); color: #9ca3af; }
    .it-zero_value    { background: rgba(156,163,175,.15); color: #9ca3af; }
    .it-multiline     { background: rgba(251,191,36,.15); color: #fde68a; }

    .original { color: rgba(239,68,68,.8); font-size: .75rem; text-decoration: line-through; }
    .orig-val { margin-bottom: .15rem; }

    .fix-cell { min-width: 160px; }
    .fix-group { margin-bottom: .4rem; }
    .fix-input {
      width: 80px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(201,168,76,.25);
      border-radius: 6px;
      color: rgba(232,228,220,.9);
      padding: .3rem .5rem;
      font-size: .78rem;
      outline: none;
      &:focus { border-color: #c9a84c; }
    }
    .fix-select {
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(201,168,76,.25);
      border-radius: 6px;
      color: rgba(232,228,220,.9);
      padding: .3rem .5rem;
      font-size: .78rem;
      outline: none;
      max-width: 200px;
      option { background: #0d1a10; }
      &:focus { border-color: #c9a84c; }
    }
    .hint { font-size: .67rem; color: rgba(232,228,220,.4); margin-top: .2rem; }
    .date-options { display: flex; flex-direction: column; gap: .2rem; }
    .date-opt {
      display: flex;
      align-items: center;
      gap: .4rem;
      font-size: .74rem;
      color: rgba(232,228,220,.8);
      cursor: pointer;
    }

    .conf-cell { width: 80px; }
    .conf-bar { height: 4px; background: rgba(255,255,255,.08); border-radius: 2px; margin-bottom: .2rem; }
    .conf-fill { height: 100%; border-radius: 2px; transition: width 300ms; }
    .conf-hi  { background: #22c55e; }
    .conf-mid { background: #fbbf24; }
    .conf-lo  { background: #ef4444; }
    .conf-pct { font-size: .68rem; color: rgba(232,228,220,.5); text-align: center; }

    .action-group { display: flex; gap: .3rem; }
    .btn-accept, .btn-save, .btn-omit {
      background: none;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 6px;
      font-size: .9rem;
      padding: .25rem .4rem;
      cursor: pointer;
      transition: background 150ms;
      &:hover { background: rgba(255,255,255,.08); }
      &:disabled { opacity: .4; cursor: default; }
    }
    .btn-accept { border-color: rgba(34,197,94,.3); }
    .btn-omit   { border-color: rgba(239,68,68,.3); }

    .status-label, .done-label {
      font-size: .72rem;
      padding: .2rem .5rem;
      border-radius: 4px;
    }
    .sl-saved, .sl-saved_with_suggestion { background: rgba(34,197,94,.15); color: #4ade80; }
    .sl-omitted                          { background: rgba(239,68,68,.12); color: #f87171; }
  `]
})
export class V3StagedReviewComponent implements OnInit {
  private http   = inject(HttpClient);
  private route  = inject(ActivatedRoute);

  records  = signal<StagedRecord[]>([]);
  counts   = signal<StagedCounts>({ 'branch-sales': 0, 'employee-sales': 0, purchases: 0, mothan: 0, total: 0 });
  loading  = signal(false);
  busy     = signal(false);
  fileFilter   = signal<string | null>(null);
  statusFilter = signal<string>('pending');

  statusOptions = [
    { value: 'pending',              label: 'معلق' },
    { value: 'saved',                label: 'محفوظ' },
    { value: 'saved_with_suggestion',label: 'قُبل تلقائياً' },
    { value: 'omitted',              label: 'محذوف' },
    { value: 'all',                  label: 'الكل' },
  ];

  filtered = computed(() => {
    let recs = this.records();
    const ft = this.fileFilter();
    if (ft) recs = recs.filter(r => r.fileType === ft);
    const sf = this.statusFilter();
    if (sf !== 'all') recs = recs.filter(r => r.status === sf);
    return recs;
  });

  highConfCount = computed(() =>
    this.records().filter(r =>
      r.status === 'pending' &&
      r.issues.every(i => i.confidence >= 0.8)
    ).length
  );

  ngOnInit() {
    // Check if a specific importId was passed via query params
    this.route.queryParams.subscribe(p => {
      this.load(p['importId'] ?? undefined);
    });
  }

  load(importId?: string) {
    this.loading.set(true);
    const params = importId ? `?importId=${importId}` : '';
    this.http.get<any>(`/api/v3/staged${params}`).subscribe({
      next: res => {
        const recs: StagedRecord[] = (res.data ?? []).map((r: StagedRecord) => ({
          ...r,
          _editValues: {}
        }));
        this.records.set(recs);
        this.loading.set(false);
        this.refreshCounts();
      },
      error: () => this.loading.set(false)
    });
  }

  refreshCounts() {
    this.http.get<any>('/api/v3/staged/counts').subscribe({
      next: res => this.counts.set(res.data ?? this.counts())
    });
  }

  setFilter(ft: string | null) {
    this.fileFilter.set(ft === this.fileFilter() ? null : ft);
  }

  // ── Edit value helpers ──
  getEditVal(rec: StagedRecord, field: string): any {
    return rec._editValues?.[field];
  }
  setEditVal(rec: StagedRecord, field: string, val: any) {
    if (!rec._editValues) rec._editValues = {};
    rec._editValues[field] = val;
  }

  // ── Actions ──
  async acceptSuggestion(rec: StagedRecord) {
    this.busy.set(true);
    this.http.post<any>(`/api/v3/staged/${rec.id}/accept-suggestion`, {}).subscribe({
      next: () => { rec.status = 'saved_with_suggestion'; this.refreshCounts(); this.busy.set(false); },
      error: () => this.busy.set(false)
    });
  }

  async saveWithEdits(rec: StagedRecord) {
    const modifications: Record<string, any> = {};
    for (const issue of rec.issues) {
      const edited = rec._editValues?.[issue.field];
      if (edited !== undefined && edited !== '') {
        modifications[issue.field] = issue.field === 'pieces' ? Number(edited) : edited;
      }
    }
    this.busy.set(true);
    this.http.post<any>(`/api/v3/staged/${rec.id}/save`, { modifications }).subscribe({
      next: () => { rec.status = 'saved'; this.refreshCounts(); this.busy.set(false); },
      error: () => this.busy.set(false)
    });
  }

  async omit(rec: StagedRecord) {
    if (!confirm('هل أنت متأكد؟ لن يتم حفظ هذا السجل في قاعدة البيانات.')) return;
    this.busy.set(true);
    this.http.post<any>(`/api/v3/staged/${rec.id}/omit`, {}).subscribe({
      next: () => { rec.status = 'omitted'; this.refreshCounts(); this.busy.set(false); },
      error: () => this.busy.set(false)
    });
  }

  async bulkAccept(minConfidence: number) {
    const n = this.highConfCount();
    if (!confirm(`سيتم حفظ ${n} سجل بثقة ≥ ${minConfidence * 100}%. متأكد؟`)) return;
    this.busy.set(true);
    const ft = this.fileFilter();
    this.http.post<any>('/api/v3/staged/bulk-accept',
      { minConfidence, ...(ft ? { fileType: ft } : {}) }
    ).subscribe({
      next: () => { this.load(); this.busy.set(false); },
      error: () => this.busy.set(false)
    });
  }

  // ── Display helpers ──
  fileLabel(ft: string): string {
    return { 'branch-sales': 'مبيعات', 'employee-sales': 'موظفين', purchases: 'مشتريات', mothan: 'موطن' }[ft] ?? ft;
  }

  issueLabel(issue: FieldIssue): string {
    const map: Record<string, string> = {
      corrupt_value: `قيمة خاطئة (${issue.field})`,
      invalid: `قيمة غير صالحة (${issue.field})`,
      missing: `حقل مفقود (${issue.field})`,
      zero_value: `قيمة صفر (${issue.field})`,
      multiline: 'تاريخ متعدد الأسطر',
    };
    return map[issue.type] ?? issue.type;
  }

  originalDisplay(issue: FieldIssue, rec: StagedRecord): string {
    const raw = rec.parsedRecord?.[issue.field];
    if (raw !== undefined && raw !== null) return String(raw);
    return '—';
  }

  branchName(rec: StagedRecord): string {
    return rec.parsedRecord?.['branchName'] ?? rec.branchCode ?? '—';
  }

  recordDate(rec: StagedRecord): string {
    const d = rec.parsedRecord?.['saleDate']
           ?? rec.parsedRecord?.['transactionDate']
           ?? rec.parsedRecord?.['purchaseDate'];
    return d ? String(d) : '—';
  }

  recordSar(rec: StagedRecord): number {
    return Math.abs(
      rec.parsedRecord?.['sarAmount']
      ?? rec.parsedRecord?.['amountSar']
      ?? 0
    );
  }

  dateOptions(issue: FieldIssue): string[] {
    if (!issue.suggestedValue) return [];
    // original value stored with " | " separator
    const raw = issue.suggestedValue;
    return raw.includes(' | ') ? raw.split(' | ').map(s => s.trim()) : [raw];
  }

  statusLabel(s: string): string {
    return { saved: '✅ محفوظ', saved_with_suggestion: '✅ قُبل', omitted: '🗑️ محذوف' }[s] ?? s;
  }

  confidenceColor(c: number): string {
    if (c >= 0.8) return '#22c55e';
    if (c >= 0.5) return '#fbbf24';
    return '#ef4444';
  }
}
