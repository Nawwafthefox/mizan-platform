import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

// ── Interfaces ──────────────────────────────────────────────────────────

interface FileSlot {
  key: string;
  label: string;
  icon: string;
  file: File | null;
}

interface ImportIssue {
  field: string;
  issueType: string;
  originalValue: string;
  suggestedValue: string;
  confidence: number;
  method: string;
}

interface V3StagedRecord {
  id: string;
  fileType: string;
  sourceRow: number;
  branchCode: string;
  status: string;
  parsedRecord: Record<string, any>;
  issues: ImportIssue[];
  suggestedFixes: Record<string, any>;
  context: Record<string, any>;
}

interface ImportProgress {
  importId: string;
  overallStatus: string;
  currentStep: number;
  totalSteps: number;
  overallPct: number;
  currentStepNameAr: string;
  parseResults: Record<string, { rows: number; status: string; fileName: string }>;
  knownBranches: number;
  newBranches: number;
  knownEmployees: number;
  newEmployees: number;
  saveProgress: Record<string, { saved: number; total: number; staged: number; status: string }>;
  totalAutoSaved: number;
  totalStaged: number;
  totalParsed: number;
  importConfidence: number;
  error: string | null;
  startedAt: number;
  completedAt: number;
}

interface BranchRecord {
  code: string;
  branchCode: string;
  branchName: string;
  regionId: number;
  city: string;
  status: string;
  source: string;
  editing?: boolean;
  editName?: string;
  editRegion?: number;
  editCity?: string;
}

interface StagedCounts {
  [key: string]: number;
}

// Step definitions for the 8-step pipeline
const STEP_DEFS: { step: number; nameAr: string; icon: string }[] = [
  { step: 1, nameAr: 'تحليل الملفات',     icon: '📄' },
  { step: 2, nameAr: 'تهيئة المناطق',     icon: '🗺️' },
  { step: 3, nameAr: 'اكتشاف الفروع',     icon: '🏪' },
  { step: 4, nameAr: 'اكتشاف الموظفين',   icon: '👤' },
  { step: 5, nameAr: 'التحقق من البيانات', icon: '✅' },
  { step: 6, nameAr: 'حفظ البيانات',       icon: '💾' },
  { step: 7, nameAr: 'حفظ السجلات المعلقة', icon: '📋' },
  { step: 8, nameAr: 'حساب النتائج',       icon: '📊' },
];

// ── Component ───────────────────────────────────────────────────────────

@Component({
  selector: 'app-v3-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Sub-tabs -->
    <div class="import-container">
      <div class="sub-tabs">
        <button
          class="sub-tab"
          [class.active]="activeTab() === 'upload'"
          (click)="activeTab.set('upload')">
          <span class="tab-icon">&#x1F4E5;</span> رفع الملفات
        </button>
        <button
          class="sub-tab"
          [class.active]="activeTab() === 'review'"
          (click)="switchToReview()">
          <span class="tab-icon">&#x1F50D;</span> مراجعة السجلات
          <span class="badge" *ngIf="totalPending() > 0">{{ totalPending() }}</span>
        </button>
        <button
          class="sub-tab"
          [class.active]="activeTab() === 'branches'"
          (click)="switchToBranches()">
          <span class="tab-icon">&#x1F3EA;</span> إدارة الفروع
          <span class="badge" *ngIf="pendingBranchCount() > 0">{{ pendingBranchCount() }}</span>
        </button>
      </div>

      <!-- ═══════════════════ TAB 1: UPLOAD ═══════════════════ -->
      <div class="tab-content" *ngIf="activeTab() === 'upload'">
        <h2 class="section-title">رفع الملفات</h2>

        <div class="file-slots">
          <div
            class="file-slot"
            *ngFor="let slot of fileSlots(); let i = index"
            [class.has-file]="slot.file"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event, i)">
            <input
              type="file"
              [id]="'file-' + slot.key"
              accept=".xlsx,.xls,.csv"
              (change)="onFileSelected($event, i)"
              hidden />

            <div class="slot-content" *ngIf="!slot.file">
              <div class="slot-icon">{{ slot.icon }}</div>
              <div class="slot-label">{{ slot.label }}</div>
              <label [for]="'file-' + slot.key" class="slot-browse">اختر ملف أو اسحبه هنا</label>
            </div>

            <div class="slot-file" *ngIf="slot.file">
              <div class="slot-icon-sm">{{ slot.icon }}</div>
              <div class="slot-file-info">
                <div class="slot-file-name">{{ slot.file.name }}</div>
                <div class="slot-file-size">{{ formatSize(slot.file.size) }}</div>
              </div>
              <button class="btn-remove" (click)="removeFile(i)">&#x2715;</button>
            </div>
          </div>
        </div>

        <div class="upload-actions">
          <button
            class="btn-primary btn-import"
            [disabled]="!hasAnyFile() || importing()"
            (click)="startImport()">
            <span *ngIf="!importing()">&#x1F680; بدء الاستيراد</span>
            <span *ngIf="importing()">جاري الاستيراد...</span>
          </button>
        </div>

        <!-- ═══ Upload Progress (file upload to server) ═══ -->
        <div class="progress-section" *ngIf="uploadPct() > 0 && uploadPct() < 100 && !progress()">
          <h3 class="section-subtitle">جاري رفع الملفات إلى الخادم...</h3>
          <div class="progress-bar-container">
            <div class="progress-bar uploading" [style.width.%]="uploadPct()">
              <span class="progress-pct">{{ uploadPct() | number:'1.0-0' }}%</span>
            </div>
          </div>
          <div class="progress-hint">يرجى عدم إغلاق الصفحة أثناء الرفع</div>
        </div>

        <!-- ═══ Import Progress Section ═══ -->
        <div class="progress-section" *ngIf="progress()">
          <h3 class="section-subtitle">
            <span *ngIf="!isDone() && !hasError()">جاري معالجة البيانات...</span>
            <span *ngIf="isDone() && !hasError()">اكتملت العملية بنجاح</span>
            <span *ngIf="hasError()">حدث خطأ أثناء الاستيراد</span>
          </h3>

          <!-- Elapsed time -->
          <div class="elapsed-row">
            <span class="elapsed-label">الوقت المنقضي:</span>
            <span class="elapsed-value">{{ elapsedDisplay() }}</span>
            <span class="stall-warning" *ngIf="isStalled()">
              &#x26A0;&#xFE0F; يبدو أن العملية متوقفة — يرجى الانتظار أو المحاولة لاحقاً
            </span>
          </div>

          <!-- Step timeline -->
          <div class="step-timeline">
            <div
              class="step-node"
              *ngFor="let sd of stepDefs; let i = index"
              [class.step-done]="progress()!.currentStep > sd.step || isDone()"
              [class.step-active]="progress()!.currentStep === sd.step && !isDone() && !hasError()"
              [class.step-pending]="progress()!.currentStep < sd.step && !isDone()"
              [class.step-error]="hasError() && progress()!.currentStep === sd.step">
              <div class="step-icon-circle">
                <span *ngIf="progress()!.currentStep > sd.step || isDone()">&#x2713;</span>
                <span *ngIf="progress()!.currentStep === sd.step && !isDone() && !hasError()" class="step-spinner"></span>
                <span *ngIf="hasError() && progress()!.currentStep === sd.step">&#x2717;</span>
                <span *ngIf="progress()!.currentStep < sd.step && !isDone() && !(hasError() && progress()!.currentStep === sd.step)">{{ sd.step }}</span>
              </div>
              <div class="step-text">{{ sd.icon }} {{ sd.nameAr }}</div>
              <div class="step-connector" *ngIf="i < stepDefs.length - 1"
                [class.connector-done]="progress()!.currentStep > sd.step || isDone()"></div>
            </div>
          </div>

          <!-- Current step detail -->
          <div class="current-step-detail" *ngIf="!isDone() && !hasError()">
            <div class="step-badge">الخطوة {{ progress()!.currentStep }} / {{ progress()!.totalSteps }}</div>
            <div class="step-description">{{ progress()!.currentStepNameAr || stepNameForStep(progress()!.currentStep) }}</div>
          </div>

          <!-- Overall progress bar -->
          <div class="progress-bar-container main-bar">
            <div class="progress-bar"
              [class.bar-complete]="isDone() && !hasError()"
              [class.bar-error]="hasError()"
              [style.width.%]="progress()!.overallPct">
              <span class="progress-pct">{{ progress()!.overallPct | number:'1.0-0' }}%</span>
            </div>
          </div>

          <!-- Error display -->
          <div class="error-block" *ngIf="hasError()">
            <div class="error-icon">&#x1F6A8;</div>
            <div class="error-content">
              <div class="error-title">فشل الاستيراد</div>
              <div class="error-message">{{ friendlyError() }}</div>
              <div class="error-hint">{{ errorHint() }}</div>
            </div>
            <button class="btn-secondary btn-retry" (click)="retryImport()">&#x1F504; إعادة المحاولة</button>
          </div>

          <!-- File parsing results -->
          <div class="progress-detail" *ngIf="parseResultEntries().length > 0">
            <h4>&#x1F4C4; نتائج قراءة الملفات</h4>
            <div class="detail-grid">
              <div class="detail-card" *ngFor="let fr of parseResultEntries()">
                <div class="detail-icon">{{ fileTypeIcon(fr.key) }}</div>
                <div class="detail-label">{{ fileTypeLabel(fr.key) }}</div>
                <div class="detail-value">{{ fr.value.rows }} صف</div>
                <div class="detail-status" [class.status-ok]="fr.value.status === 'done'" [class.status-skip]="fr.value.status === 'skipped'">
                  {{ fr.value.status === 'done' ? 'تم' : fr.value.status === 'parsing' ? 'جاري التحليل...' : 'تم تخطيه' }}
                </div>
                <div class="detail-filename">{{ fr.value.fileName }}</div>
              </div>
            </div>
          </div>

          <!-- Discovery stats -->
          <div class="progress-detail" *ngIf="hasDiscovery()">
            <h4>&#x1F50D; الاكتشافات</h4>
            <div class="detail-grid">
              <div class="detail-card">
                <div class="detail-label">فروع جديدة</div>
                <div class="detail-value accent">{{ progress()!.newBranches }}</div>
              </div>
              <div class="detail-card">
                <div class="detail-label">فروع معروفة</div>
                <div class="detail-value">{{ progress()!.knownBranches }}</div>
              </div>
              <div class="detail-card">
                <div class="detail-label">موظفين جدد</div>
                <div class="detail-value accent">{{ progress()!.newEmployees }}</div>
              </div>
              <div class="detail-card">
                <div class="detail-label">موظفين معروفين</div>
                <div class="detail-value">{{ progress()!.knownEmployees }}</div>
              </div>
            </div>
          </div>

          <!-- Collection save progress -->
          <div class="progress-detail" *ngIf="saveProgressEntries().length > 0">
            <h4>&#x1F4BE; حفظ البيانات</h4>
            <div class="detail-grid">
              <div class="detail-card" *ngFor="let sp of saveProgressEntries()">
                <div class="detail-label">{{ fileTypeLabel(sp.key) }}</div>
                <div class="mini-bar-container">
                  <div class="mini-bar" [style.width.%]="sp.value.total ? (sp.value.saved / sp.value.total * 100) : 0"></div>
                </div>
                <div class="detail-value">{{ sp.value.saved }} / {{ sp.value.total }}</div>
                <div class="detail-staged" *ngIf="sp.value.staged > 0">
                  {{ sp.value.staged }} بحاجة مراجعة
                </div>
                <div class="detail-status" [class.status-ok]="sp.value.status === 'done'">
                  {{ sp.value.status === 'done' ? 'تم' : sp.value.status === 'saving' ? 'جاري الحفظ...' : 'في الانتظار' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Completion summary -->
          <div class="progress-complete" *ngIf="isDone() && !hasError()">
            <div class="complete-banner">
              <div class="complete-icon">&#x2705;</div>
              <div class="complete-title">اكتمل الاستيراد بنجاح!</div>
              <div class="complete-time">في {{ elapsedDisplay() }}</div>
            </div>
            <div class="complete-stats">
              <div class="stat-item">
                <span class="stat-value">{{ progress()!.totalParsed }}</span>
                <span class="stat-label">إجمالي السجلات</span>
              </div>
              <div class="stat-item stat-success">
                <span class="stat-value">{{ progress()!.totalAutoSaved }}</span>
                <span class="stat-label">تم حفظها تلقائياً</span>
              </div>
              <div class="stat-item stat-warning" *ngIf="progress()!.totalStaged > 0">
                <span class="stat-value">{{ progress()!.totalStaged }}</span>
                <span class="stat-label">بحاجة مراجعة</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ (progress()!.importConfidence * 100) | number:'1.1-1' }}%</span>
                <span class="stat-label">نسبة الثقة</span>
              </div>
            </div>
            <div class="confidence-summary">
              <div class="confidence-big-bar-bg">
                <div class="confidence-big-bar"
                  [style.width.%]="progress()!.importConfidence * 100"
                  [class.conf-high]="progress()!.importConfidence >= 0.8"
                  [class.conf-mid]="progress()!.importConfidence >= 0.5 && progress()!.importConfidence < 0.8"
                  [class.conf-low]="progress()!.importConfidence < 0.5">
                </div>
              </div>
              <div class="confidence-label">
                {{ confidenceMessage() }}
              </div>
            </div>
            <button
              class="btn-primary btn-review-now"
              *ngIf="progress()!.totalStaged > 0"
              (click)="switchToReview()">
              &#x1F50D; مراجعة {{ progress()!.totalStaged }} سجل الآن
            </button>
            <button
              class="btn-secondary"
              *ngIf="progress()!.totalStaged === 0"
              (click)="resetImport()">
              &#x1F4E5; استيراد ملفات جديدة
            </button>
          </div>
        </div>

        <!-- Wipe data -->
        <div class="danger-zone">
          <button class="btn-danger" (click)="wipeData()" [disabled]="importing()">
            &#x1F5D1; مسح جميع بيانات V3
          </button>
        </div>
      </div>

      <!-- ═══════════════════ TAB 2: REVIEW ═══════════════════ -->
      <div class="tab-content" *ngIf="activeTab() === 'review'">
        <h2 class="section-title">مراجعة السجلات</h2>

        <!-- Summary cards -->
        <div class="summary-cards">
          <div class="summary-card" *ngFor="let entry of stagedCountEntries()">
            <div class="summary-type" [style.color]="fileTypeColor(entry.key)">{{ fileTypeLabel(entry.key) }}</div>
            <div class="summary-count">{{ entry.value }}</div>
          </div>
        </div>

        <!-- Bulk accept -->
        <div class="bulk-actions">
          <button class="btn-primary" (click)="bulkAccept()" [disabled]="bulkLoading()">
            &#x2705; قبول التصحيحات (ثقة > 80%)
          </button>
          <select class="filter-select" [(ngModel)]="bulkFileType">
            <option value="">كل الأنواع</option>
            <option value="branch-sales">مبيعات الفروع</option>
            <option value="employee-sales">مبيعات الموظفين</option>
            <option value="purchases">المشتريات</option>
            <option value="mothan">موطن الذهب</option>
          </select>
        </div>

        <!-- Status filter -->
        <div class="status-filters">
          <button
            class="filter-btn"
            [class.active]="reviewStatusFilter() === ''"
            (click)="setReviewFilter('')">الكل</button>
          <button
            class="filter-btn"
            [class.active]="reviewStatusFilter() === 'pending'"
            (click)="setReviewFilter('pending')">معلق</button>
          <button
            class="filter-btn"
            [class.active]="reviewStatusFilter() === 'saved'"
            (click)="setReviewFilter('saved')">محفوظ</button>
          <button
            class="filter-btn"
            [class.active]="reviewStatusFilter() === 'omitted'"
            (click)="setReviewFilter('omitted')">محذوف</button>
        </div>

        <!-- Records table -->
        <div class="table-wrapper">
          <table class="data-table" *ngIf="filteredRecords().length > 0">
            <thead>
              <tr>
                <th>الملف</th>
                <th>صف Excel</th>
                <th>الفرع</th>
                <th>التاريخ</th>
                <th>المبلغ</th>
                <th>بيانات Excel</th>
                <th>المشكلة</th>
                <th>الأصلي</th>
                <th>المقترح</th>
                <th>الثقة</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let rec of filteredRecords()"
                [class.row-saved]="rec.status === 'saved'"
                [class.row-omitted]="rec.status === 'omitted'"
                [class.row-pending]="rec.status === 'pending'">
                <td>
                  <span class="file-badge" [style.background]="fileTypeColor(rec.fileType)">
                    {{ fileTypeShort(rec.fileType) }}
                  </span>
                </td>
                <td>{{ rec.sourceRow }}</td>
                <td>{{ rec.context?.['rawExcel']?.['rawBranchCode'] || rec.branchCode || '-' }}</td>
                <td>{{ rec.context?.['rawExcel']?.['rawDate'] || rec.parsedRecord?.['date'] || rec.parsedRecord?.['hijriDate'] || '-' }}</td>
                <td>{{ rec.context?.['rawExcel']?.['totalSar'] ?? rec.parsedRecord?.['totalSar'] ?? rec.parsedRecord?.['amount'] ?? '-' }}</td>
                <td class="raw-excel-cell">
                  <button class="btn-raw-toggle" (click)="toggleRawExcel(rec.id)">
                    {{ expandedRawRows[rec.id] ? 'إخفاء' : 'عرض' }}
                  </button>
                  <div *ngIf="expandedRawRows[rec.id]" class="raw-excel-details">
                    <div class="raw-sheet-info" *ngIf="rec.context?.['rawExcel']?.['sheetName']">
                      ورقة: <strong>{{ rec.context['rawExcel']['sheetName'] }}</strong>
                      &nbsp;|&nbsp; صف: <strong>{{ rec.context['rawExcel']['excelRow'] }}</strong>
                      &nbsp;|&nbsp; نسق: <strong>{{ rec.context['rawExcel']['format'] }}</strong>
                    </div>
                    <div class="raw-section-title">القيم الخام من Excel</div>
                    <div *ngFor="let entry of rawExcelEntries(rec)" class="raw-entry">
                      <span class="raw-label">{{ rawFieldLabel(entry[0]) }}:</span>
                      <span class="raw-value">{{ entry[1] }}</span>
                    </div>
                    <div *ngIf="rec.context?.['rawExcel']?.['_columnMap']" class="raw-section-title" style="margin-top:8px">مواقع الأعمدة في Excel</div>
                    <div *ngFor="let c of columnMapEntries(rec)" class="raw-entry">
                      <span class="raw-label">{{ rawFieldLabel(c[0]) }}:</span>
                      <span class="formula-value">{{ c[1] }}</span>
                    </div>
                    <div *ngIf="rec.context?.['formulas']" class="raw-section-title" style="margin-top:8px">طريقة الحساب</div>
                    <div *ngFor="let f of formulaEntries(rec)" class="raw-entry formula-entry">
                      <span class="raw-label">{{ f[0] }}:</span>
                      <span class="formula-value">{{ f[1] }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span *ngFor="let issue of rec.issues" class="issue-tag">
                    {{ issueLabel(issue) }}
                  </span>
                </td>
                <td>
                  <span *ngFor="let issue of rec.issues" class="original-val">
                    {{ issue.originalValue }}
                  </span>
                </td>
                <td>
                  <!-- Dynamic inputs based on issue type -->
                  <ng-container *ngFor="let issue of rec.issues">
                    <!-- Pieces: number input -->
                    <div *ngIf="issue.issueType === 'pieces_outlier' || issue.issueType === 'pieces'" class="edit-input-group">
                      <input
                        type="number"
                        class="inline-input"
                        [value]="editValues[rec.id + '_' + issue.field] ?? issue.suggestedValue"
                        (input)="setEditValue(rec.id, issue.field, $event)" />
                      <span class="hint" *ngIf="rec.context?.['branchMedianSarPerPiece']">
                        متوسط: {{ rec.context['branchMedianSarPerPiece'] }}
                      </span>
                      <span class="method-hint" *ngIf="methodExplanation(issue)">{{ methodExplanation(issue) }}</span>
                    </div>
                    <!-- Employee: dropdown -->
                    <div *ngIf="issue.issueType === 'unknown_employee' || issue.issueType === 'employee'" class="edit-input-group">
                      <select
                        class="inline-select"
                        [value]="editValues[rec.id + '_' + issue.field] ?? issue.suggestedValue"
                        (change)="setEditValueSelect(rec.id, issue.field, $event)">
                        <option [value]="issue.suggestedValue">{{ issue.suggestedValue }}</option>
                        <option
                          *ngFor="let emp of rec.context?.['availableEmployees'] || []"
                          [value]="emp">{{ emp }}</option>
                      </select>
                      <span class="method-hint" *ngIf="methodExplanation(issue)">{{ methodExplanation(issue) }}</span>
                    </div>
                    <!-- Date: radio buttons -->
                    <div *ngIf="issue.issueType === 'multiline_date' || issue.issueType === 'date'" class="edit-input-group">
                      <label
                        *ngFor="let d of rec.context?.['bothDates'] || []"
                        class="radio-label">
                        <input
                          type="radio"
                          [name]="'date_' + rec.id"
                          [value]="d"
                          [checked]="(editValues[rec.id + '_' + issue.field] ?? issue.suggestedValue) === d"
                          (change)="setEditValueDirect(rec.id, issue.field, d)" />
                        {{ d }}
                      </label>
                      <span class="method-hint" *ngIf="methodExplanation(issue)">{{ methodExplanation(issue) }}</span>
                    </div>
                    <!-- Default: editable text input -->
                    <div *ngIf="issue.issueType !== 'pieces_outlier' && issue.issueType !== 'pieces' && issue.issueType !== 'unknown_employee' && issue.issueType !== 'employee' && issue.issueType !== 'multiline_date' && issue.issueType !== 'date'" class="edit-input-group">
                      <input
                        [type]="isNumericField(issue.field) ? 'number' : 'text'"
                        class="inline-input"
                        [placeholder]="fieldPlaceholder(issue)"
                        [value]="editValues[rec.id + '_' + issue.field] ?? issue.suggestedValue ?? ''"
                        (input)="setEditValue(rec.id, issue.field, $event)" />
                      <span class="method-hint" *ngIf="methodExplanation(issue)">{{ methodExplanation(issue) }}</span>
                    </div>
                  </ng-container>
                </td>
                <td>
                  <div class="confidence-cell" *ngFor="let issue of rec.issues">
                    <div class="confidence-bar-bg">
                      <div
                        class="confidence-bar"
                        [style.width.%]="issue.confidence * 100"
                        [class.conf-high]="issue.confidence >= 0.8"
                        [class.conf-mid]="issue.confidence >= 0.5 && issue.confidence < 0.8"
                        [class.conf-low]="issue.confidence < 0.5">
                      </div>
                    </div>
                    <span class="conf-text">{{ issue.confidence * 100 | number:'1.0-0' }}%</span>
                  </div>
                </td>
                <td>
                  <div class="action-btns" *ngIf="rec.status === 'pending'">
                    <button class="btn-action btn-accept" title="قبول" (click)="acceptRecord(rec)">&#x2705;</button>
                    <button class="btn-action btn-save" title="حفظ مع تعديل" (click)="saveRecord(rec)">&#x1F4BE;</button>
                    <button class="btn-action btn-omit" title="حذف" (click)="omitRecord(rec)">&#x1F5D1;</button>
                  </div>
                  <span class="status-label" *ngIf="rec.status !== 'pending'"
                    [class.status-saved]="rec.status === 'saved'"
                    [class.status-omitted]="rec.status === 'omitted'">
                    {{ rec.status === 'saved' ? 'محفوظ' : rec.status === 'omitted' ? 'محذوف' : rec.status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="empty-state" *ngIf="filteredRecords().length === 0 && !reviewLoading()">
            لا توجد سجلات{{ reviewStatusFilter() ? ' بهذه الحالة' : '' }}
          </div>
          <div class="loading-state" *ngIf="reviewLoading()">جاري التحميل...</div>
        </div>
      </div>

      <!-- ═══════════════════ TAB 3: BRANCHES ═══════════════════ -->
      <div class="tab-content" *ngIf="activeTab() === 'branches'">
        <h2 class="section-title">إدارة الفروع</h2>

        <div class="branch-actions">
          <button class="btn-secondary" (click)="seedBranches()" [disabled]="seedLoading()">
            &#x1F331; تهيئة الفروع المعروفة
          </button>
        </div>

        <!-- CSV Import -->
        <div class="csv-import-section">
          <h3 class="section-subtitle">&#x1F4C4; استيراد الفروع من ملف CSV</h3>
          <p class="csv-hint">
            ارفع ملف CSV يحتوي على أعمدة: <code>code</code>, <code>name</code>, <code>region</code>, <code>city</code>
            <br/>سيتم تحديث الفروع الموجودة وإنشاء الجديدة تلقائياً.
          </p>
          <div class="csv-upload-row">
            <input
              type="file"
              id="csv-branch-input"
              accept=".csv"
              (change)="onCsvSelected($event)"
              hidden />
            <label for="csv-branch-input" class="btn-secondary csv-browse-btn">
              &#x1F4C2; اختر ملف CSV
            </label>
            <span class="csv-file-name" *ngIf="csvFile()">{{ csvFile()!.name }} ({{ formatSize(csvFile()!.size) }})</span>
            <button
              class="btn-primary"
              [disabled]="!csvFile() || csvUploading()"
              (click)="importBranchesCsv()">
              <span *ngIf="!csvUploading()">&#x1F4E5; استيراد</span>
              <span *ngIf="csvUploading()">جاري الاستيراد...</span>
            </button>
          </div>
          <!-- CSV result -->
          <div class="csv-result" *ngIf="csvResult()">
            <div class="csv-result-item csv-created" *ngIf="csvResult()!.created > 0">
              &#x2795; {{ csvResult()!.created }} فرع جديد
            </div>
            <div class="csv-result-item csv-updated" *ngIf="csvResult()!.updated > 0">
              &#x270F;&#xFE0F; {{ csvResult()!.updated }} فرع محدّث
            </div>
            <div class="csv-result-item csv-skipped" *ngIf="csvResult()!.skipped > 0">
              &#x23ED;&#xFE0F; {{ csvResult()!.skipped }} صف تم تخطيه
            </div>
            <div class="csv-result-errors" *ngIf="csvResult()!.errors?.length">
              <div *ngFor="let e of csvResult()!.errors" class="csv-error-line">{{ e }}</div>
            </div>
          </div>
        </div>

        <!-- Branches table -->
        <div class="table-wrapper">
          <table class="data-table" *ngIf="branches().length > 0">
            <thead>
              <tr>
                <th>الرمز</th>
                <th>الاسم</th>
                <th>المنطقة</th>
                <th>المدينة</th>
                <th>الحالة</th>
                <th>المصدر</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let b of branches()"
                [class.row-pending-branch]="b.status === 'pending_name'">

                <td>{{ b.branchCode || b.code }}</td>

                <!-- View mode -->
                <ng-container *ngIf="!b.editing">
                  <td>{{ b.branchName }}</td>
                  <td>{{ regionName(b.regionId) }}</td>
                  <td>{{ b.city }}</td>
                </ng-container>
                <!-- Edit mode -->
                <ng-container *ngIf="b.editing">
                  <td><input class="inline-input" [(ngModel)]="b.editName" /></td>
                  <td>
                    <select class="inline-select" [(ngModel)]="b.editRegion">
                      <option *ngFor="let r of regions" [ngValue]="r.id">{{ r.name }}</option>
                    </select>
                  </td>
                  <td><input class="inline-input" [(ngModel)]="b.editCity" /></td>
                </ng-container>

                <td>
                  <span class="status-chip" [class.chip-pending]="b.status === 'pending_name'" [class.chip-active]="b.status !== 'pending_name'">
                    {{ b.status === 'pending_name' ? 'بحاجة تسمية' : 'فعال' }}
                  </span>
                </td>
                <td>{{ b.source || '-' }}</td>
                <td>
                  <div class="action-btns">
                    <button
                      class="btn-action"
                      *ngIf="!b.editing"
                      (click)="startEditBranch(b)"
                      title="تعديل">&#x270F;&#xFE0F;</button>
                    <button
                      class="btn-action btn-save"
                      *ngIf="b.editing"
                      (click)="saveBranch(b)"
                      title="حفظ">&#x1F4BE;</button>
                    <button
                      class="btn-action"
                      *ngIf="b.editing"
                      (click)="b.editing = false"
                      title="إلغاء">&#x2715;</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="empty-state" *ngIf="branches().length === 0 && !branchLoading()">
            لا توجد فروع مسجلة
          </div>
          <div class="loading-state" *ngIf="branchLoading()">جاري التحميل...</div>
        </div>

        <!-- Add new branch -->
        <div class="add-branch-form">
          <h3 class="section-subtitle">إضافة فرع جديد</h3>
          <div class="form-row">
            <div class="form-field">
              <label>الرمز</label>
              <input class="form-input" [(ngModel)]="newBranch.code" placeholder="مثال: 101" />
            </div>
            <div class="form-field">
              <label>الاسم</label>
              <input class="form-input" [(ngModel)]="newBranch.name" placeholder="اسم الفرع" />
            </div>
            <div class="form-field">
              <label>المنطقة</label>
              <select class="form-input" [(ngModel)]="newBranch.regionId">
                <option [ngValue]="0" disabled>اختر المنطقة</option>
                <option *ngFor="let r of regions" [ngValue]="r.id">{{ r.name }}</option>
              </select>
            </div>
            <div class="form-field">
              <label>المدينة</label>
              <input class="form-input" [(ngModel)]="newBranch.city" placeholder="المدينة" />
            </div>
            <div class="form-field form-field-btn">
              <button
                class="btn-primary"
                (click)="addBranch()"
                [disabled]="!newBranch.code || !newBranch.name || !newBranch.regionId">
                إضافة
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ── Base ────────────────────────────────────────────────── */
    :host {
      display: block;
      direction: rtl;
      font-family: 'Tajawal', 'Segoe UI', sans-serif;
      color: #e8e8e8;
    }

    .import-container {
      padding: 0;
    }

    /* ── Sub-tabs ────────────────────────────────────────────── */
    .sub-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 24px;
      border-bottom: 2px solid #1e2e23;
      padding-bottom: 0;
    }

    .sub-tab {
      background: transparent;
      border: none;
      color: #8a9b8e;
      font-size: 15px;
      padding: 12px 24px;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sub-tab:hover {
      color: #c9a84c;
      background: rgba(201, 168, 76, 0.05);
    }

    .sub-tab.active {
      color: #c9a84c;
      border-bottom-color: #c9a84c;
    }

    .tab-icon {
      font-size: 16px;
    }

    .badge {
      background: #c9a84c;
      color: #0f1a14;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      min-width: 20px;
      text-align: center;
    }

    /* ── Section titles ──────────────────────────────────────── */
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: #c9a84c;
      margin: 0 0 20px 0;
    }

    .section-subtitle {
      font-size: 16px;
      font-weight: 600;
      color: #c9a84c;
      margin: 0 0 16px 0;
    }

    .tab-content {
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── File slots ──────────────────────────────────────────── */
    .file-slots {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .file-slot {
      background: #162118;
      border: 2px dashed #2a3d2f;
      border-radius: 12px;
      padding: 24px 16px;
      text-align: center;
      transition: all 0.2s;
      min-height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .file-slot:hover {
      border-color: #c9a84c;
      background: #1a2a1e;
    }

    .file-slot.has-file {
      border-style: solid;
      border-color: #3a6b42;
      background: #1a2a1e;
    }

    .file-slot.dragover {
      border-color: #c9a84c;
      background: rgba(201, 168, 76, 0.08);
    }

    .slot-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .slot-icon {
      font-size: 32px;
    }

    .slot-icon-sm {
      font-size: 24px;
    }

    .slot-label {
      font-size: 14px;
      font-weight: 600;
      color: #c9a84c;
    }

    .slot-browse {
      font-size: 12px;
      color: #8a9b8e;
      cursor: pointer;
      padding: 6px 16px;
      border: 1px solid #2a3d2f;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .slot-browse:hover {
      color: #c9a84c;
      border-color: #c9a84c;
    }

    .slot-file {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    .slot-file-info {
      flex: 1;
      text-align: right;
    }

    .slot-file-name {
      font-size: 13px;
      font-weight: 600;
      color: #e8e8e8;
      word-break: break-all;
    }

    .slot-file-size {
      font-size: 11px;
      color: #8a9b8e;
      margin-top: 2px;
    }

    .btn-remove {
      background: rgba(220, 60, 60, 0.15);
      border: none;
      color: #e05555;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .btn-remove:hover {
      background: rgba(220, 60, 60, 0.3);
    }

    /* ── Buttons ──────────────────────────────────────────────── */
    .upload-actions {
      text-align: center;
      margin-bottom: 32px;
    }

    .btn-primary {
      background: linear-gradient(135deg, #c9a84c, #a8893a);
      color: #0f1a14;
      border: none;
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }

    .btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, #d4b55a, #c9a84c);
      transform: translateY(-1px);
    }

    .btn-primary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: transparent;
      color: #c9a84c;
      border: 1px solid #c9a84c;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }

    .btn-secondary:hover:not(:disabled) {
      background: rgba(201, 168, 76, 0.1);
    }

    .btn-secondary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn-danger {
      background: transparent;
      color: #e05555;
      border: 1px solid rgba(220, 60, 60, 0.3);
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }

    .btn-danger:hover:not(:disabled) {
      background: rgba(220, 60, 60, 0.1);
      border-color: #e05555;
    }

    .btn-danger:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn-import {
      padding: 14px 48px;
      font-size: 17px;
    }

    .danger-zone {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #2a1a1a;
      text-align: center;
    }

    /* ── Progress Section ──────────────────────────────────────── */
    .progress-section {
      background: #162118;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      border: 1px solid #1e2e23;
    }

    .progress-hint {
      text-align: center;
      font-size: 12px;
      color: #8a9b8e;
      margin-top: 8px;
    }

    /* Elapsed time */
    .elapsed-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 13px;
    }

    .elapsed-label {
      color: #8a9b8e;
    }

    .elapsed-value {
      color: #c9a84c;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .stall-warning {
      color: #e0a555;
      font-size: 12px;
      margin-right: 12px;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Step timeline */
    .step-timeline {
      display: flex;
      align-items: flex-start;
      gap: 0;
      margin-bottom: 20px;
      overflow-x: auto;
      padding: 8px 0;
    }

    .step-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      flex: 1;
      min-width: 80px;
    }

    .step-icon-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      border: 2px solid #2a3d2f;
      background: #0f1a14;
      color: #8a9b8e;
      transition: all 0.3s;
      z-index: 1;
    }

    .step-done .step-icon-circle {
      background: #3a6b42;
      border-color: #4ecb71;
      color: #fff;
    }

    .step-active .step-icon-circle {
      background: rgba(201, 168, 76, 0.2);
      border-color: #c9a84c;
      color: #c9a84c;
    }

    .step-error .step-icon-circle {
      background: rgba(220, 60, 60, 0.2);
      border-color: #e05555;
      color: #e05555;
    }

    .step-text {
      font-size: 10px;
      color: #8a9b8e;
      text-align: center;
      margin-top: 6px;
      line-height: 1.3;
      max-width: 80px;
    }

    .step-done .step-text { color: #4ecb71; }
    .step-active .step-text { color: #c9a84c; font-weight: 600; }
    .step-error .step-text { color: #e05555; }

    .step-connector {
      position: absolute;
      top: 16px;
      left: -50%;
      width: 100%;
      height: 2px;
      background: #2a3d2f;
      z-index: 0;
    }

    .step-connector.connector-done {
      background: #4ecb71;
    }

    .step-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid #c9a84c;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Current step detail */
    .current-step-detail {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .step-badge {
      background: rgba(201, 168, 76, 0.15);
      color: #c9a84c;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }

    .step-description {
      color: #e8e8e8;
      font-size: 14px;
    }

    /* Progress bar */
    .progress-bar-container {
      background: #0f1a14;
      border-radius: 8px;
      height: 28px;
      overflow: hidden;
      margin-bottom: 20px;
    }

    .progress-bar-container.main-bar {
      height: 32px;
      border: 1px solid #1e2e23;
    }

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #3a6b42, #c9a84c);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      min-width: 40px;
    }

    .progress-bar.uploading {
      background: linear-gradient(90deg, #2a5a9d, #5b9bd5);
    }

    .progress-bar.bar-complete {
      background: linear-gradient(90deg, #3a6b42, #4ecb71);
    }

    .progress-bar.bar-error {
      background: linear-gradient(90deg, #8b2020, #e05555);
    }

    .progress-pct {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }

    /* Error block */
    .error-block {
      background: rgba(220, 60, 60, 0.08);
      border: 1px solid rgba(220, 60, 60, 0.25);
      border-radius: 10px;
      padding: 20px;
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }

    .error-icon {
      font-size: 28px;
      flex-shrink: 0;
    }

    .error-content {
      flex: 1;
    }

    .error-title {
      font-size: 15px;
      font-weight: 700;
      color: #e05555;
      margin-bottom: 4px;
    }

    .error-message {
      font-size: 14px;
      color: #e8e8e8;
      margin-bottom: 8px;
      line-height: 1.5;
    }

    .error-hint {
      font-size: 12px;
      color: #8a9b8e;
      line-height: 1.4;
    }

    .btn-retry {
      flex-shrink: 0;
      align-self: center;
    }

    /* Progress details */
    .progress-detail {
      margin-bottom: 16px;
    }

    .progress-detail h4 {
      font-size: 13px;
      color: #8a9b8e;
      margin: 0 0 8px 0;
      font-weight: 600;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
    }

    .detail-card {
      background: #0f1a14;
      border-radius: 8px;
      padding: 12px;
    }

    .detail-icon {
      font-size: 16px;
      margin-bottom: 4px;
    }

    .detail-label {
      font-size: 12px;
      color: #8a9b8e;
      margin-bottom: 4px;
    }

    .detail-value {
      font-size: 18px;
      font-weight: 700;
      color: #e8e8e8;
    }

    .detail-value.accent {
      color: #c9a84c;
    }

    .detail-status {
      font-size: 11px;
      color: #8a9b8e;
      margin-top: 2px;
    }

    .detail-status.status-ok {
      color: #4ecb71;
    }

    .detail-status.status-skip {
      color: #e0a555;
    }

    .detail-filename {
      font-size: 10px;
      color: #5a6b5e;
      margin-top: 2px;
      word-break: break-all;
    }

    .detail-staged {
      font-size: 11px;
      color: #c9a84c;
      margin-top: 2px;
    }

    .mini-bar-container {
      background: #1e2e23;
      border-radius: 4px;
      height: 6px;
      margin: 6px 0;
      overflow: hidden;
    }

    .mini-bar {
      height: 100%;
      background: #3a6b42;
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    /* ── Complete ─────────────────────────────────────────────── */
    .progress-complete {
      text-align: center;
      padding: 8px 0;
    }

    .complete-banner {
      margin-bottom: 20px;
    }

    .complete-icon {
      font-size: 48px;
      margin-bottom: 8px;
    }

    .complete-title {
      font-size: 18px;
      font-weight: 700;
      color: #4ecb71;
      margin-bottom: 4px;
    }

    .complete-time {
      font-size: 13px;
      color: #8a9b8e;
    }

    .complete-stats {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 16px;
      background: #0f1a14;
      border-radius: 10px;
      min-width: 100px;
    }

    .stat-item.stat-success {
      border: 1px solid rgba(78, 203, 113, 0.3);
    }

    .stat-item.stat-warning {
      border: 1px solid rgba(201, 168, 76, 0.3);
    }

    .stat-label {
      font-size: 12px;
      color: #8a9b8e;
      margin-top: 4px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #e8e8e8;
    }

    .stat-success .stat-value { color: #4ecb71; }
    .stat-warning .stat-value { color: #c9a84c; }

    .confidence-summary {
      max-width: 400px;
      margin: 0 auto 20px;
    }

    .confidence-big-bar-bg {
      background: #0f1a14;
      border-radius: 6px;
      height: 12px;
      overflow: hidden;
      margin-bottom: 6px;
    }

    .confidence-big-bar {
      height: 100%;
      border-radius: 6px;
      transition: width 0.5s ease;
    }

    .confidence-label {
      font-size: 12px;
      color: #8a9b8e;
    }

    .conf-high { background: #4ecb71; }
    .conf-mid  { background: #c9a84c; }
    .conf-low  { background: #e05555; }

    .btn-review-now {
      padding: 14px 40px;
      font-size: 16px;
    }

    /* ── Summary cards ────────────────────────────────────────── */
    .summary-cards {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .summary-card {
      background: #162118;
      border-radius: 10px;
      padding: 16px 24px;
      min-width: 140px;
      text-align: center;
    }

    .summary-type {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .summary-count {
      font-size: 28px;
      font-weight: 700;
      color: #e8e8e8;
    }

    /* ── Bulk / Filters ──────────────────────────────────────── */
    .bulk-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .filter-select {
      background: #162118;
      color: #e8e8e8;
      border: 1px solid #2a3d2f;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
    }

    .status-filters {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
    }

    .filter-btn {
      background: #162118;
      border: 1px solid #2a3d2f;
      color: #8a9b8e;
      padding: 8px 20px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn:hover {
      border-color: #c9a84c;
      color: #c9a84c;
    }

    .filter-btn.active {
      background: rgba(201, 168, 76, 0.12);
      border-color: #c9a84c;
      color: #c9a84c;
    }

    /* ── Table ────────────────────────────────────────────────── */
    .table-wrapper {
      overflow-x: auto;
      margin-bottom: 24px;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .data-table th {
      background: #162118;
      color: #8a9b8e;
      font-weight: 600;
      padding: 12px 10px;
      text-align: right;
      border-bottom: 2px solid #1e2e23;
      white-space: nowrap;
    }

    .data-table td {
      padding: 10px;
      border-bottom: 1px solid #1a2a1e;
      vertical-align: middle;
    }

    .data-table tbody tr {
      transition: all 0.3s;
    }

    .data-table tbody tr:hover {
      background: rgba(201, 168, 76, 0.04);
    }

    .row-saved {
      opacity: 0.5;
    }

    .row-omitted {
      opacity: 0.35;
      text-decoration: line-through;
    }

    .row-pending-branch {
      background: rgba(201, 168, 76, 0.08) !important;
    }

    .file-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      color: #0f1a14;
      white-space: nowrap;
    }

    .issue-tag {
      display: inline-block;
      background: rgba(201, 168, 76, 0.12);
      color: #c9a84c;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin: 1px;
    }

    .original-val {
      display: block;
      font-size: 12px;
      color: #e05555;
      font-family: monospace;
    }

    .suggested-val {
      font-size: 12px;
      color: #4ecb71;
      font-family: monospace;
    }

    .method-hint {
      display: block;
      font-size: 10px;
      color: #999;
      margin-top: 2px;
      font-style: italic;
    }

    .raw-excel-cell { min-width: 140px; }
    .btn-raw-toggle {
      background: #2a2a3e;
      color: #8ab4f8;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 11px;
      cursor: pointer;
    }
    .btn-raw-toggle:hover { background: #3a3a5e; }
    .raw-excel-details {
      margin-top: 6px;
      padding: 6px 8px;
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 6px;
      font-size: 11px;
      direction: rtl;
    }
    .raw-entry {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 2px 0;
      border-bottom: 1px solid #222;
    }
    .raw-entry:last-child { border-bottom: none; }
    .raw-label { color: #999; white-space: nowrap; }
    .raw-value { color: #e0e0e0; font-family: monospace; text-align: left; direction: ltr; }
    .raw-sheet-info {
      font-size: 11px;
      color: #ffb74d;
      background: #1e1e30;
      padding: 4px 8px;
      border-radius: 4px;
      margin-bottom: 6px;
      font-family: monospace;
    }
    .raw-section-title {
      font-size: 10px;
      font-weight: 600;
      color: #8ab4f8;
      margin-bottom: 4px;
      padding-bottom: 2px;
      border-bottom: 1px solid #333;
    }
    .formula-entry { background: #111122; border-radius: 3px; padding: 2px 4px; }
    .formula-value { color: #c9a0dc; font-family: monospace; font-size: 10px; text-align: left; direction: ltr; }

    /* ── Inline inputs ───────────────────────────────────────── */
    .edit-input-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .inline-input {
      background: #0f1a14;
      border: 1px solid #2a3d2f;
      color: #e8e8e8;
      padding: 6px 10px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 12px;
      width: 100px;
    }

    .inline-input:focus {
      border-color: #c9a84c;
      outline: none;
    }

    .inline-select {
      background: #0f1a14;
      border: 1px solid #2a3d2f;
      color: #e8e8e8;
      padding: 6px 10px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 12px;
      min-width: 120px;
    }

    .inline-select:focus {
      border-color: #c9a84c;
      outline: none;
    }

    .hint {
      font-size: 10px;
      color: #8a9b8e;
    }

    .radio-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #e8e8e8;
      cursor: pointer;
    }

    .radio-label input[type="radio"] {
      accent-color: #c9a84c;
    }

    /* ── Confidence ───────────────────────────────────────────── */
    .confidence-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .confidence-bar-bg {
      width: 50px;
      height: 6px;
      background: #1e2e23;
      border-radius: 3px;
      overflow: hidden;
    }

    .confidence-bar {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s;
    }

    .conf-text {
      font-size: 11px;
      color: #8a9b8e;
      min-width: 30px;
    }

    /* ── Action buttons ──────────────────────────────────────── */
    .action-btns {
      display: flex;
      gap: 4px;
    }

    .btn-action {
      background: rgba(255,255,255,0.05);
      border: none;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s;
      line-height: 1;
    }

    .btn-action:hover {
      background: rgba(255,255,255,0.12);
    }

    .btn-accept:hover { background: rgba(78, 203, 113, 0.2); }
    .btn-save:hover   { background: rgba(201, 168, 76, 0.2); }
    .btn-omit:hover   { background: rgba(224, 85, 85, 0.2); }

    .status-label {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
    }

    .status-saved {
      color: #4ecb71;
      background: rgba(78, 203, 113, 0.1);
    }

    .status-omitted {
      color: #e05555;
      background: rgba(224, 85, 85, 0.1);
    }

    /* ── Branches ─────────────────────────────────────────────── */
    .branch-actions {
      margin-bottom: 20px;
    }

    .status-chip {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .chip-pending {
      background: rgba(201, 168, 76, 0.15);
      color: #c9a84c;
    }

    .chip-active {
      background: rgba(78, 203, 113, 0.12);
      color: #4ecb71;
    }

    /* ── Add branch form ─────────────────────────────────────── */
    .add-branch-form {
      background: #162118;
      border-radius: 12px;
      padding: 20px 24px;
      margin-top: 24px;
    }

    .form-row {
      display: flex;
      gap: 12px;
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 140px;
    }

    .form-field label {
      font-size: 12px;
      color: #8a9b8e;
      font-weight: 600;
    }

    .form-input {
      background: #0f1a14;
      border: 1px solid #2a3d2f;
      color: #e8e8e8;
      padding: 10px 14px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 13px;
    }

    .form-input:focus {
      border-color: #c9a84c;
      outline: none;
    }

    .form-field-btn {
      flex: 0 0 auto;
      min-width: auto;
    }

    /* ── CSV Import ─────────────────────────────────────────────── */
    .csv-import-section {
      background: #162118;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 24px;
      border: 1px dashed #2a3d2f;
    }

    .csv-hint {
      font-size: 13px;
      color: #8a9b8e;
      margin: 0 0 14px 0;
      line-height: 1.6;
    }

    .csv-hint code {
      background: #0f1a14;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: #c9a84c;
    }

    .csv-upload-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .csv-browse-btn {
      cursor: pointer;
      display: inline-block;
    }

    .csv-file-name {
      font-size: 13px;
      color: #e8e8e8;
      flex: 1;
    }

    .csv-result {
      margin-top: 14px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .csv-result-item {
      background: #0f1a14;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
    }

    .csv-created { color: #4ecb71; border: 1px solid rgba(78, 203, 113, 0.3); }
    .csv-updated { color: #5b9bd5; border: 1px solid rgba(91, 155, 213, 0.3); }
    .csv-skipped { color: #e0a555; border: 1px solid rgba(224, 165, 85, 0.3); }

    .csv-result-errors {
      width: 100%;
      margin-top: 4px;
    }

    .csv-error-line {
      font-size: 12px;
      color: #e05555;
      padding: 2px 0;
    }

    /* ── States ───────────────────────────────────────────────── */
    .empty-state,
    .loading-state {
      text-align: center;
      padding: 40px;
      color: #8a9b8e;
      font-size: 14px;
    }

    .loading-state {
      color: #c9a84c;
    }
  `]
})
export class V3ImportComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/v3/import`;
  private pollTimer: any = null;
  private elapsedTimer: any = null;
  private pollFailCount = 0;
  private lastPollPct = -1;
  private lastPctChangeAt = 0;

  stepDefs = STEP_DEFS;

  // ── Tab state ──────────────────────────────────────────────
  activeTab = signal<'upload' | 'review' | 'branches'>('upload');

  // ── Tab 1: Upload ──────────────────────────────────────────
  fileSlots = signal<FileSlot[]>([
    { key: 'branchSales',   label: 'مبيعات الفروع',    icon: '📈', file: null },
    { key: 'employeeSales', label: 'مبيعات الموظفين',   icon: '👤', file: null },
    { key: 'purchases',     label: 'المشتريات',        icon: '🛒', file: null },
    { key: 'mothan',        label: 'موطن الذهب',       icon: '⚖️', file: null },
  ]);

  importing = signal(false);
  progress = signal<ImportProgress | null>(null);
  uploadPct = signal(0);
  elapsedSeconds = signal(0);
  private importStartTime = 0;

  // ── Computed helpers ───────────────────────────────────────
  isDone = computed(() => this.progress()?.overallStatus === 'complete');
  hasError = computed(() => this.progress()?.overallStatus === 'error');

  parseResultEntries = computed(() => {
    const pr = this.progress()?.parseResults;
    if (!pr) return [];
    return Object.entries(pr).map(([key, value]) => ({ key, value }));
  });

  saveProgressEntries = computed(() => {
    const sp = this.progress()?.saveProgress;
    if (!sp) return [];
    return Object.entries(sp).map(([key, value]) => ({ key, value }));
  });

  elapsedDisplay = computed(() => {
    const sec = this.elapsedSeconds();
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0
      ? `${m} دقيقة و ${s} ثانية`
      : `${s} ثانية`;
  });

  isStalled = computed(() => {
    // Stalled if pct hasn't changed for 60+ seconds and not done/error
    const p = this.progress();
    if (!p || p.overallStatus === 'complete' || p.overallStatus === 'error') return false;
    const now = Date.now();
    return this.lastPctChangeAt > 0 && (now - this.lastPctChangeAt) > 60000;
  });

  friendlyError = computed(() => {
    const p = this.progress();
    if (!p?.error) return '';
    return this.toFriendlyArabicError(p.error);
  });

  errorHint = computed(() => {
    const p = this.progress();
    if (!p?.error) return '';
    return this.getErrorHint(p.error);
  });

  // ── Tab 2: Review ──────────────────────────────────────────
  stagedRecords = signal<V3StagedRecord[]>([]);
  stagedCounts = signal<StagedCounts>({});
  reviewStatusFilter = signal<string>('');
  reviewLoading = signal(false);
  bulkLoading = signal(false);
  bulkFileType = '';
  editValues: Record<string, any> = {};
  expandedRawRows: Record<string, boolean> = {};

  totalPending = computed(() => {
    const counts = this.stagedCounts();
    return counts['total'] || 0;
  });

  stagedCountEntries = computed(() => {
    const counts = this.stagedCounts();
    return Object.entries(counts)
      .filter(([k]) => k !== 'total')
      .map(([key, value]) => ({ key, value }));
  });

  filteredRecords = computed(() => {
    const filter = this.reviewStatusFilter();
    const records = this.stagedRecords();
    if (!filter) return records;
    return records.filter(r => r.status === filter);
  });

  // ── Tab 3: Branches ───────────────────────────────────────
  branches = signal<BranchRecord[]>([]);
  branchLoading = signal(false);
  seedLoading = signal(false);
  pendingBranchCount = signal(0);

  csvFile = signal<File | null>(null);
  csvUploading = signal(false);
  csvResult = signal<{ created: number; updated: number; skipped: number; errors?: string[] } | null>(null);

  newBranch = { code: '', name: '', regionId: 0, city: '' };

  regions = [
    { id: 1, name: 'الرياض' },
    { id: 2, name: 'الغربية' },
    { id: 3, name: 'المدينة المنورة' },
    { id: 4, name: 'حائل' },
    { id: 5, name: 'حفر الباطن' },
    { id: 6, name: 'عسير/جيزان' },
  ];

  // ── Lifecycle ──────────────────────────────────────────────

  ngOnInit(): void {
    this.loadStagedCounts();
    this.loadPendingBranchCount();
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.stopElapsedTimer();
  }

  // ── Helpers ────────────────────────────────────────────────

  hasAnyFile(): boolean {
    return this.fileSlots().some(s => s.file !== null);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  fileTypeLabel(type: string): string {
    const map: Record<string, string> = {
      'branch-sales': 'مبيعات الفروع',
      'employee-sales': 'مبيعات الموظفين',
      'purchases': 'المشتريات',
      'mothan': 'موطن الذهب',
    };
    return map[type] || type;
  }

  fileTypeShort(type: string): string {
    const map: Record<string, string> = {
      'branch-sales': 'فروع',
      'employee-sales': 'موظفين',
      'purchases': 'مشتريات',
      'mothan': 'موطن',
    };
    return map[type] || type;
  }

  fileTypeColor(type: string): string {
    const map: Record<string, string> = {
      'branch-sales': '#4ecb71',
      'employee-sales': '#5b9bd5',
      'purchases': '#c9a84c',
      'mothan': '#d4785c',
    };
    return map[type] || '#8a9b8e';
  }

  fileTypeIcon(type: string): string {
    const map: Record<string, string> = {
      'branch-sales': '📈',
      'employee-sales': '👤',
      'purchases': '🛒',
      'mothan': '⚖️',
    };
    return map[type] || '📄';
  }

  issueLabel(issue: ImportIssue): string {
    const map: Record<string, string> = {
      'pieces_outlier': 'قطع شاذة',
      'pieces': 'قطع',
      'unknown_employee': 'موظف غير معروف',
      'employee': 'موظف',
      'multiline_date': 'تاريخ متعدد',
      'date': 'تاريخ',
      'amount': 'مبلغ',
      'branch': 'فرع',
    };
    return map[issue.issueType] || issue.issueType;
  }

  methodExplanation(issue: ImportIssue): string | null {
    if (!issue.suggestedValue) return null;
    const map: Record<string, string> = {
      'branch_median_sar_per_piece': 'محسوب من متوسط سعر القطعة للفرع',
      'first_line_extraction': 'تم أخذ السطر الأول من التاريخ',
      'needs_manual_assignment': 'يحتاج تعيين يدوي',
    };
    if (issue.method && map[issue.method]) return map[issue.method];
    // Fallback explanations by issue type
    const typeMap: Record<string, string> = {
      'corrupt_value': 'القيمة الأصلية غير صالحة — المقترح مبني على بيانات الفرع',
      'pieces_outlier': 'عدد القطع شاذ — المقترح من متوسط الفرع',
      'unknown_branch': 'رمز الفرع غير موجود في النظام',
      'multiline': 'التاريخ يحتوي على أكثر من سطر',
    };
    return typeMap[issue.issueType] || null;
  }

  isNumericField(field: string): boolean {
    return ['sarAmount', 'pieces', 'pureWeightG', 'grossWeightG', 'amountSar',
            'metalValue', 'makingCharge', 'purity'].includes(field);
  }

  fieldPlaceholder(issue: any): string {
    const map: Record<string, string> = {
      'branchCode': 'أدخل رمز الفرع',
      'date': 'أدخل التاريخ (yyyy-MM-dd)',
      'sarAmount': 'أدخل المبلغ',
      'pieces': 'أدخل عدد القطع',
      'empId': 'أدخل رقم الموظف',
      'transactionDate': 'أدخل التاريخ',
    };
    return map[issue.field] || 'أدخل القيمة';
  }

  toggleRawExcel(id: string): void {
    this.expandedRawRows[id] = !this.expandedRawRows[id];
  }

  rawExcelEntries(rec: any): [string, any][] {
    const raw = rec.context?.rawExcel;
    if (!raw) return [];
    const skip = new Set(['sheetName', 'excelRow', 'format', '_columnMap']);
    return Object.entries(raw).filter(([k, v]) => !skip.has(k) && v !== null && v !== 0 && v !== '' && v !== 0.0);
  }

  columnMapEntries(rec: any): [string, string][] {
    const colMap = rec.context?.rawExcel?._columnMap;
    if (!colMap) return [];
    return Object.entries(colMap) as [string, string][];
  }

  formulaEntries(rec: any): [string, string][] {
    const formulas = rec.context?.formulas;
    if (!formulas) return [];
    return Object.entries(formulas) as [string, string][];
  }

  rawFieldLabel(field: string): string {
    const map: Record<string, string> = {
      'sheetName': 'اسم الورقة',
      'excelRow': 'رقم الصف',
      'format': 'نسق الملف',
      'rawBranchCode': 'رمز الفرع',
      'rawDate': 'التاريخ',
      'totalSar': 'المبلغ (ريال)',
      'pureWeight': 'الوزن الصافي',
      'grossWeight': 'الوزن الإجمالي',
      'rawPieces': 'عدد القطع',
      'purity': 'العيار',
      'metalValue': 'قيمة المعدن',
      'makingCharge': 'أجور التصنيع',
      'empId': 'رقم الموظف',
      'empName': 'اسم الموظف',
      'creditSar': 'دائن (ريال)',
      'debitGold': 'مدين ذهب',
      'weightCredit': 'وزن دائن',
      'balanceGold': 'رصيد ذهب',
      'balanceSar': 'رصيد ريال',
      'docRef': 'مرجع المستند',
      'description': 'الوصف',
    };
    return map[field] || field;
  }

  regionName(id: number): string {
    return this.regions.find(r => r.id === id)?.name || '-';
  }

  stepNameForStep(step: number): string {
    const def = STEP_DEFS.find(s => s.step === step);
    return def ? def.nameAr : '';
  }

  hasDiscovery(): boolean {
    const p = this.progress();
    if (!p) return false;
    return (p.knownBranches + p.newBranches + p.knownEmployees + p.newEmployees) > 0;
  }

  confidenceMessage(): string {
    const p = this.progress();
    if (!p) return '';
    const c = p.importConfidence;
    if (c >= 0.95) return 'ممتاز — تم حفظ جميع البيانات تقريباً بشكل تلقائي';
    if (c >= 0.8) return 'جيد جداً — معظم البيانات تم حفظها تلقائياً';
    if (c >= 0.5) return 'متوسط — بعض السجلات تحتاج مراجعة يدوية';
    return 'منخفض — يرجى مراجعة السجلات المعلقة بعناية';
  }

  // ── Error translation ──────────────────────────────────────

  private toFriendlyArabicError(error: string): string {
    const lower = error.toLowerCase();

    // File format errors
    if (lower.includes('invalid format') || lower.includes('format a') || lower.includes('format b'))
      return 'صيغة الملف غير صحيحة. تأكد من أن الملف بصيغة Excel المعتمدة (Format A أو Format B).';
    if (lower.includes('empty') || lower.includes('no data') || lower.includes('no rows'))
      return 'الملف فارغ أو لا يحتوي على بيانات. تأكد من أن الملف يحتوي على صفوف بيانات.';
    if (lower.includes('header') || lower.includes('column'))
      return 'أعمدة الملف غير متطابقة مع الصيغة المتوقعة. تأكد من ترتيب الأعمدة وأسمائها.';
    if (lower.includes('corrupt') || lower.includes('cannot read') || lower.includes('poi'))
      return 'الملف تالف أو غير قابل للقراءة. جرب إعادة تصدير الملف من Excel.';
    if (lower.includes('.xlsx') || lower.includes('.xls') || lower.includes('file type'))
      return 'نوع الملف غير مدعوم. يرجى استخدام ملفات Excel بصيغة .xlsx أو .xls';

    // Date errors
    if (lower.includes('date') || lower.includes('تاريخ'))
      return 'خطأ في تحويل التاريخ. تأكد من أن التواريخ بالصيغة الصحيحة (هجري أو ميلادي).';

    // Number errors
    if (lower.includes('number') || lower.includes('numeric') || lower.includes('parse'))
      return 'خطأ في قراءة الأرقام. تأكد من أن حقول المبالغ والأرقام لا تحتوي على نصوص.';

    // Branch errors
    if (lower.includes('branch') || lower.includes('فرع'))
      return 'خطأ في بيانات الفروع. تأكد من أن رموز الفروع صحيحة ومسجلة في النظام.';

    // Employee errors
    if (lower.includes('employee') || lower.includes('موظف'))
      return 'خطأ في بيانات الموظفين. تأكد من أن أسماء الموظفين مطابقة للمسجلين.';

    // Database errors
    if (lower.includes('mongo') || lower.includes('database') || lower.includes('duplicate'))
      return 'خطأ في قاعدة البيانات. قد تكون البيانات مكررة أو يوجد مشكلة في الاتصال بقاعدة البيانات.';
    if (lower.includes('timeout') || lower.includes('timed out'))
      return 'انتهت مهلة العملية. الملفات قد تكون كبيرة جداً. جرب تقسيمها أو المحاولة لاحقاً.';
    if (lower.includes('connection') || lower.includes('connect'))
      return 'فشل الاتصال بقاعدة البيانات. تحقق من اتصال الإنترنت وحاول مرة أخرى.';

    // Memory/size errors
    if (lower.includes('memory') || lower.includes('heap') || lower.includes('outofmemory'))
      return 'الملفات كبيرة جداً ولا تتسع في ذاكرة الخادم. جرب تقسيم الملفات إلى أجزاء أصغر.';
    if (lower.includes('size') || lower.includes('too large') || lower.includes('max'))
      return 'حجم الملف يتجاوز الحد المسموح. يرجى تقليل حجم الملف والمحاولة مرة أخرى.';

    // Auth errors
    if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('forbidden') || lower.includes('403'))
      return 'انتهت صلاحية الجلسة أو ليس لديك صلاحية لهذا الإجراء. يرجى إعادة تسجيل الدخول.';

    // Server errors
    if (lower.includes('500') || lower.includes('internal server'))
      return 'حدث خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى أو التواصل مع الدعم الفني.';

    // Network errors
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('offline'))
      return 'انقطع الاتصال بالشبكة. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.';

    // Tenant errors
    if (lower.includes('tenant'))
      return 'خطأ في تحديد الشركة. يرجى إعادة تسجيل الدخول والمحاولة مرة أخرى.';

    // Generic fallback
    return `حدث خطأ غير متوقع: ${error}`;
  }

  private getErrorHint(error: string): string {
    const lower = error.toLowerCase();

    if (lower.includes('format') || lower.includes('header') || lower.includes('column') || lower.includes('corrupt'))
      return 'تأكد من استخدام القالب الصحيح لكل نوع ملف. يمكنك تحميل نموذج القالب من قسم المساعدة.';
    if (lower.includes('timeout') || lower.includes('memory') || lower.includes('size'))
      return 'إذا كانت الملفات كبيرة (أكثر من 50,000 صف)، جرب تقسيمها إلى ملفات أصغر.';
    if (lower.includes('connection') || lower.includes('network') || lower.includes('offline'))
      return 'تحقق من اتصالك بالإنترنت واضغط على "إعادة المحاولة". إذا استمرت المشكلة، تواصل مع الدعم الفني.';
    if (lower.includes('duplicate') || lower.includes('mongo'))
      return 'قد تحتاج لمسح البيانات القديمة أولاً قبل إعادة الاستيراد.';
    if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized'))
      return 'اضغط على تسجيل الخروج ثم أعد تسجيل الدخول، وحاول مرة أخرى.';

    return 'إذا استمرت المشكلة، تواصل مع فريق الدعم الفني مع لقطة شاشة لهذا الخطأ.';
  }

  private toFriendlyHttpError(err: any): string {
    if (!err) return 'خطأ غير معروف';

    // Network/connectivity errors
    if (err.status === 0)
      return 'لا يمكن الاتصال بالخادم. تحقق من اتصالك بالإنترنت أو أن الخادم يعمل.';
    if (err.status === 401)
      return 'انتهت صلاحية الجلسة. يرجى إعادة تسجيل الدخول.';
    if (err.status === 403)
      return 'ليس لديك صلاحية لهذا الإجراء. تواصل مع مدير النظام.';
    if (err.status === 404)
      return 'الخدمة غير متوفرة. قد يكون الخادم قيد التحديث.';
    if (err.status === 408 || err.status === 504)
      return 'انتهت مهلة الطلب. الملفات قد تكون كبيرة جداً. جرب ملفات أصغر.';
    if (err.status === 413)
      return 'حجم الملفات كبير جداً. الحد الأقصى هو 50 ميجابايت لكل ملف.';
    if (err.status === 429)
      return 'طلبات كثيرة جداً. يرجى الانتظار دقيقة والمحاولة مرة أخرى.';
    if (err.status >= 500)
      return `خطأ في الخادم (${err.status}). يرجى المحاولة لاحقاً أو التواصل مع الدعم الفني.`;

    // Extract message from response body
    const msg = err.error?.message || err.message || err.statusText;
    if (msg) return this.toFriendlyArabicError(msg);

    return `خطأ غير متوقع (${err.status}). يرجى المحاولة مرة أخرى.`;
  }

  // ── File handling ──────────────────────────────────────────

  onFileSelected(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.updateSlotFile(index, input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).classList.add('dragover');
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('dragover');
  }

  onDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).classList.remove('dragover');
    if (event.dataTransfer?.files?.length) {
      this.updateSlotFile(index, event.dataTransfer.files[0]);
    }
  }

  removeFile(index: number): void {
    this.updateSlotFile(index, null);
  }

  private updateSlotFile(index: number, file: File | null): void {
    const slots = [...this.fileSlots()];
    slots[index] = { ...slots[index], file };
    this.fileSlots.set(slots);
  }

  // ── Tab 1: Import ─────────────────────────────────────────

  startImport(): void {
    const formData = new FormData();
    let totalSize = 0;
    for (const slot of this.fileSlots()) {
      if (slot.file) {
        formData.append(slot.key, slot.file);
        totalSize += slot.file.size;
      }
    }

    // Validate file sizes
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
    for (const slot of this.fileSlots()) {
      if (slot.file && slot.file.size > MAX_FILE_SIZE) {
        this.showError(`حجم ملف "${slot.label}" (${this.formatSize(slot.file.size)}) يتجاوز الحد المسموح (50 ميجابايت). يرجى تقليل حجم الملف.`);
        return;
      }
    }

    this.importing.set(true);
    this.progress.set(null);
    this.uploadPct.set(0);
    this.pollFailCount = 0;
    this.lastPollPct = -1;
    this.lastPctChangeAt = Date.now();
    this.importStartTime = Date.now();
    this.elapsedSeconds.set(0);
    this.startElapsedTimer();

    // Use HttpRequest for upload progress tracking
    const req = new HttpRequest('POST', `${this.base}/unified`, formData, {
      reportProgress: true
    });

    this.http.request(req).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadPct.set(Math.round(100 * event.loaded / event.total));
        }
        if (event.type === HttpEventType.Response) {
          const body = event.body;
          const importId = body?.importId || body?.data?.importId;
          if (importId) {
            this.uploadPct.set(100);
            this.startPolling(importId);
          } else {
            this.showError('لم يتم استلام معرف الاستيراد من الخادم. يرجى المحاولة مرة أخرى.');
            this.importing.set(false);
            this.stopElapsedTimer();
          }
        }
      },
      error: (err) => {
        this.importing.set(false);
        this.stopElapsedTimer();
        this.uploadPct.set(0);
        this.showError(this.toFriendlyHttpError(err));
      }
    });
  }

  retryImport(): void {
    this.progress.set(null);
    this.startImport();
  }

  resetImport(): void {
    this.progress.set(null);
    this.uploadPct.set(0);
    this.elapsedSeconds.set(0);
  }

  private showError(message: string): void {
    this.progress.set({
      importId: '',
      overallStatus: 'error',
      currentStep: 0,
      totalSteps: 8,
      overallPct: 0,
      currentStepNameAr: '',
      parseResults: {},
      knownBranches: 0, newBranches: 0,
      knownEmployees: 0, newEmployees: 0,
      saveProgress: {},
      totalAutoSaved: 0, totalStaged: 0, totalParsed: 0,
      importConfidence: 0,
      error: message,
      startedAt: this.importStartTime,
      completedAt: Date.now()
    });
  }

  private startPolling(importId: string): void {
    this.stopPolling();
    this.pollProgress(importId);
    this.pollTimer = setInterval(() => this.pollProgress(importId), 2000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      this.elapsedSeconds.set(Math.floor((Date.now() - this.importStartTime) / 1000));
    }, 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  private pollProgress(importId: string): void {
    this.http.get<any>(`${this.base}/progress/${importId}`).subscribe({
      next: (res) => {
        const data = res.data || res;
        this.pollFailCount = 0;

        // Map backend response to our ImportProgress interface
        const p: ImportProgress = {
          importId: data.importId || importId,
          overallStatus: data.overallStatus || 'unknown',
          currentStep: data.currentStep || 0,
          totalSteps: data.totalSteps || 8,
          overallPct: data.overallPct || 0,
          currentStepNameAr: data.currentStepNameAr || '',
          parseResults: data.parseResults || {},
          knownBranches: data.knownBranches || 0,
          newBranches: data.newBranches || 0,
          knownEmployees: data.knownEmployees || 0,
          newEmployees: data.newEmployees || 0,
          saveProgress: data.saveProgress || {},
          totalAutoSaved: data.totalAutoSaved || 0,
          totalStaged: data.totalStaged || 0,
          totalParsed: data.totalParsed || 0,
          importConfidence: data.importConfidence || 0,
          error: data.error || null,
          startedAt: data.startedAt || this.importStartTime,
          completedAt: data.completedAt || 0,
        };

        // Track pct changes for stall detection
        if (p.overallPct !== this.lastPollPct) {
          this.lastPollPct = p.overallPct;
          this.lastPctChangeAt = Date.now();
        }

        this.progress.set(p);

        if (p.overallStatus === 'complete' || p.overallStatus === 'error') {
          this.stopPolling();
          this.stopElapsedTimer();
          this.importing.set(false);
          this.loadStagedCounts();
          this.loadPendingBranchCount();
        }
      },
      error: (err) => {
        this.pollFailCount++;
        if (this.pollFailCount >= 10) {
          // Too many consecutive failures, stop polling
          this.stopPolling();
          this.stopElapsedTimer();
          this.importing.set(false);
          this.showError('فقد الاتصال بالخادم أثناء متابعة تقدم الاستيراد. قد تكون العملية لا تزال جارية في الخلفية — يرجى الانتظار ثم تحقق من النتائج.');
        }
        // Otherwise keep polling (transient error)
      }
    });
  }

  wipeData(): void {
    if (!confirm('هل أنت متأكد من مسح جميع بيانات V3؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
    this.http.delete<any>(`${this.base}/wipe`).subscribe({
      next: () => {
        this.progress.set(null);
        this.uploadPct.set(0);
        this.stagedRecords.set([]);
        this.stagedCounts.set({});
        this.branches.set([]);
        this.pendingBranchCount.set(0);
        this.fileSlots.set([
          { key: 'branchSales',   label: 'مبيعات الفروع',    icon: '📈', file: null },
          { key: 'employeeSales', label: 'مبيعات الموظفين',   icon: '👤', file: null },
          { key: 'purchases',     label: 'المشتريات',        icon: '🛒', file: null },
          { key: 'mothan',        label: 'موطن الذهب',       icon: '⚖️', file: null },
        ]);
      },
      error: (err) => {
        alert(this.toFriendlyHttpError(err));
      }
    });
  }

  // ── Tab 2: Review ──────────────────────────────────────────

  switchToReview(): void {
    this.activeTab.set('review');
    this.loadStagedRecords();
    this.loadStagedCounts();
  }

  loadStagedCounts(): void {
    this.http.get<any>(`${this.base}/staged/counts`).subscribe({
      next: (res) => this.stagedCounts.set(res.data || res || {}),
      error: () => {}
    });
  }

  loadStagedRecords(): void {
    this.reviewLoading.set(true);
    const status = this.reviewStatusFilter() || 'pending';
    this.http.get<any>(`${this.base}/staged`, { params: { status } }).subscribe({
      next: (res) => {
        this.stagedRecords.set(res.data || res || []);
        this.reviewLoading.set(false);
      },
      error: (err) => {
        this.reviewLoading.set(false);
        alert(this.toFriendlyHttpError(err));
      }
    });
  }

  setReviewFilter(status: string): void {
    this.reviewStatusFilter.set(status);
    this.loadStagedRecords();
  }

  bulkAccept(): void {
    this.bulkLoading.set(true);
    const body: any = { minConfidence: 0.8 };
    if (this.bulkFileType) body.fileType = this.bulkFileType;

    this.http.post<any>(`${this.base}/staged/bulk-accept`, body).subscribe({
      next: () => {
        this.bulkLoading.set(false);
        this.loadStagedRecords();
        this.loadStagedCounts();
      },
      error: (err) => {
        this.bulkLoading.set(false);
        alert(this.toFriendlyHttpError(err));
      }
    });
  }

  acceptRecord(rec: V3StagedRecord): void {
    this.http.post<any>(`${this.base}/staged/${rec.id}/accept`, {}).subscribe({
      next: () => {
        this.updateRecordStatus(rec.id, 'saved');
        this.loadStagedCounts();
      },
      error: (err) => alert(this.toFriendlyHttpError(err))
    });
  }

  saveRecord(rec: V3StagedRecord): void {
    const modifications: Record<string, any> = {};
    for (const issue of rec.issues) {
      const key = rec.id + '_' + issue.field;
      if (this.editValues[key] !== undefined) {
        modifications[issue.field] = this.editValues[key];
      } else {
        modifications[issue.field] = issue.suggestedValue;
      }
    }
    this.http.post<any>(`${this.base}/staged/${rec.id}/save`, { modifications }).subscribe({
      next: () => {
        this.updateRecordStatus(rec.id, 'saved');
        this.loadStagedCounts();
      },
      error: (err) => alert(this.toFriendlyHttpError(err))
    });
  }

  omitRecord(rec: V3StagedRecord): void {
    this.http.post<any>(`${this.base}/staged/${rec.id}/omit`, {}).subscribe({
      next: () => {
        this.updateRecordStatus(rec.id, 'omitted');
        this.loadStagedCounts();
      },
      error: (err) => alert(this.toFriendlyHttpError(err))
    });
  }

  private updateRecordStatus(id: string, status: string): void {
    const records = this.stagedRecords().map(r =>
      r.id === id ? { ...r, status } : r
    );
    this.stagedRecords.set(records);
  }

  setEditValue(recId: string, field: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.editValues[recId + '_' + field] = input.value;
  }

  setEditValueSelect(recId: string, field: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.editValues[recId + '_' + field] = select.value;
  }

  setEditValueDirect(recId: string, field: string, value: any): void {
    this.editValues[recId + '_' + field] = value;
  }

  // ── Tab 3: Branches ───────────────────────────────────────

  switchToBranches(): void {
    this.activeTab.set('branches');
    this.loadBranches();
  }

  loadBranches(): void {
    this.branchLoading.set(true);
    this.http.get<any>(`${this.base}/branches`).subscribe({
      next: (res) => {
        this.branches.set((res.data || res || []).map((b: any) => ({ ...b, editing: false })));
        this.branchLoading.set(false);
      },
      error: (err) => {
        this.branchLoading.set(false);
        alert(this.toFriendlyHttpError(err));
      }
    });
  }

  loadPendingBranchCount(): void {
    this.http.get<any>(`${this.base}/branches/pending-count`).subscribe({
      next: (res) => this.pendingBranchCount.set(res.data?.count || 0),
      error: () => {}
    });
  }

  seedBranches(): void {
    this.seedLoading.set(true);
    this.http.post<any>(`${this.base}/branches/seed`, {}).subscribe({
      next: () => {
        this.seedLoading.set(false);
        this.loadBranches();
        this.loadPendingBranchCount();
      },
      error: (err) => {
        this.seedLoading.set(false);
        alert(this.toFriendlyHttpError(err));
      }
    });
  }

  onCsvSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.csvFile.set(input.files[0]);
      this.csvResult.set(null);
    }
  }

  importBranchesCsv(): void {
    const file = this.csvFile();
    if (!file) return;

    this.csvUploading.set(true);
    this.csvResult.set(null);

    const formData = new FormData();
    formData.append('file', file);

    this.http.post<any>(`${this.base}/branches/csv`, formData).subscribe({
      next: (res) => {
        this.csvUploading.set(false);
        const data = res.data || res;
        this.csvResult.set({
          created: data.created || 0,
          updated: data.updated || 0,
          skipped: data.skipped || 0,
          errors: data.errors || []
        });
        this.loadBranches();
        this.loadPendingBranchCount();
        // Reset file input
        const input = document.getElementById('csv-branch-input') as HTMLInputElement;
        if (input) input.value = '';
        this.csvFile.set(null);
      },
      error: (err) => {
        this.csvUploading.set(false);
        alert(this.toFriendlyHttpError(err));
      }
    });
  }

  startEditBranch(branch: BranchRecord): void {
    branch.editing = true;
    branch.editName = branch.branchName;
    branch.editRegion = branch.regionId;
    branch.editCity = branch.city;
  }

  saveBranch(branch: BranchRecord): void {
    const code = branch.branchCode || branch.code;
    this.http.put<any>(`${this.base}/branches/${code}`, {
      branchName: branch.editName,
      regionId: branch.editRegion,
      city: branch.editCity
    }).subscribe({
      next: () => {
        branch.branchName = branch.editName || '';
        branch.regionId = branch.editRegion || 0;
        branch.city = branch.editCity || '';
        branch.editing = false;
        this.loadPendingBranchCount();
      },
      error: (err) => alert(this.toFriendlyHttpError(err))
    });
  }

  addBranch(): void {
    this.http.post<any>(`${this.base}/branches`, {
      branchCode: this.newBranch.code,
      branchName: this.newBranch.name,
      regionId: this.newBranch.regionId
    }).subscribe({
      next: () => {
        this.newBranch = { code: '', name: '', regionId: 0, city: '' };
        this.loadBranches();
      },
      error: (err) => alert(this.toFriendlyHttpError(err))
    });
  }
}
