import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
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

interface ProgressFileResult {
  fileName: string;
  rowsParsed: number;
  errors: number;
}

interface ProgressCollectionSave {
  type: string;
  saved: number;
  total: number;
}

interface ProgressDiscovery {
  newBranches: number;
  knownBranches: number;
  newEmployees: number;
  knownEmployees: number;
}

interface ImportProgress {
  importId: string;
  step: number;
  totalSteps: number;
  stepName: string;
  overallPct: number;
  fileResults: ProgressFileResult[];
  collectionSaves: ProgressCollectionSave[];
  discovery: ProgressDiscovery;
  done: boolean;
  totalSaved: number;
  totalStaged: number;
  avgConfidence: number;
  error?: string;
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

        <!-- Progress Section -->
        <div class="progress-section" *ngIf="progress()">
          <h3 class="section-subtitle">تقدم الاستيراد</h3>

          <!-- Step info -->
          <div class="progress-step">
            <span class="step-label">الخطوة {{ progress()!.step }} / {{ progress()!.totalSteps }}</span>
            <span class="step-name">{{ progress()!.stepName }}</span>
          </div>

          <!-- Overall progress bar -->
          <div class="progress-bar-container">
            <div class="progress-bar" [style.width.%]="progress()!.overallPct">
              <span class="progress-pct">{{ progress()!.overallPct | number:'1.0-0' }}%</span>
            </div>
          </div>

          <!-- Error -->
          <div class="progress-error" *ngIf="progress()!.error">
            {{ progress()!.error }}
          </div>

          <!-- File results -->
          <div class="progress-detail" *ngIf="progress()!.fileResults?.length">
            <h4>نتائج القراءة</h4>
            <div class="detail-grid">
              <div class="detail-card" *ngFor="let fr of progress()!.fileResults">
                <div class="detail-label">{{ fr.fileName }}</div>
                <div class="detail-value">{{ fr.rowsParsed }} صف</div>
                <div class="detail-errors" *ngIf="fr.errors > 0">{{ fr.errors }} خطأ</div>
              </div>
            </div>
          </div>

          <!-- Collection saves -->
          <div class="progress-detail" *ngIf="progress()!.collectionSaves?.length">
            <h4>حفظ البيانات</h4>
            <div class="detail-grid">
              <div class="detail-card" *ngFor="let cs of progress()!.collectionSaves">
                <div class="detail-label">{{ fileTypeLabel(cs.type) }}</div>
                <div class="mini-bar-container">
                  <div class="mini-bar" [style.width.%]="cs.total ? (cs.saved / cs.total * 100) : 0"></div>
                </div>
                <div class="detail-value">{{ cs.saved }} / {{ cs.total }}</div>
              </div>
            </div>
          </div>

          <!-- Discovery stats -->
          <div class="progress-detail" *ngIf="progress()!.discovery">
            <h4>الاكتشافات</h4>
            <div class="detail-grid">
              <div class="detail-card">
                <div class="detail-label">فروع جديدة</div>
                <div class="detail-value accent">{{ progress()!.discovery.newBranches }}</div>
              </div>
              <div class="detail-card">
                <div class="detail-label">فروع معروفة</div>
                <div class="detail-value">{{ progress()!.discovery.knownBranches }}</div>
              </div>
              <div class="detail-card">
                <div class="detail-label">موظفين جدد</div>
                <div class="detail-value accent">{{ progress()!.discovery.newEmployees }}</div>
              </div>
              <div class="detail-card">
                <div class="detail-label">موظفين معروفين</div>
                <div class="detail-value">{{ progress()!.discovery.knownEmployees }}</div>
              </div>
            </div>
          </div>

          <!-- Completion summary -->
          <div class="progress-complete" *ngIf="progress()!.done && !progress()!.error">
            <div class="complete-icon">&#x2705;</div>
            <div class="complete-stats">
              <div class="stat-item">
                <span class="stat-label">إجمالي المحفوظ</span>
                <span class="stat-value">{{ progress()!.totalSaved }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">بحاجة مراجعة</span>
                <span class="stat-value accent">{{ progress()!.totalStaged }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">متوسط الثقة</span>
                <span class="stat-value">{{ progress()!.avgConfidence | number:'1.0-1' }}%</span>
              </div>
            </div>
            <button
              class="btn-secondary"
              *ngIf="progress()!.totalStaged > 0"
              (click)="switchToReview()">
              &#x1F50D; مراجعة {{ progress()!.totalStaged }} سجل
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
                <th>الصف</th>
                <th>الفرع</th>
                <th>التاريخ</th>
                <th>المبلغ</th>
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
                <td>{{ rec.branchCode }}</td>
                <td>{{ rec.parsedRecord?.['date'] || rec.parsedRecord?.['hijriDate'] || '-' }}</td>
                <td>{{ rec.parsedRecord?.['totalSar'] || rec.parsedRecord?.['amount'] || '-' }}</td>
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
                    </div>
                    <!-- Default: text -->
                    <div *ngIf="issue.issueType !== 'pieces_outlier' && issue.issueType !== 'pieces' && issue.issueType !== 'unknown_employee' && issue.issueType !== 'employee' && issue.issueType !== 'multiline_date' && issue.issueType !== 'date'" class="suggested-val">
                      {{ issue.suggestedValue }}
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
      margin: 20px 0 12px 0;
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

    /* ── Progress ─────────────────────────────────────────────── */
    .progress-section {
      background: #162118;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .progress-step {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .step-label {
      background: rgba(201, 168, 76, 0.15);
      color: #c9a84c;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
    }

    .step-name {
      color: #e8e8e8;
      font-size: 14px;
    }

    .progress-bar-container {
      background: #0f1a14;
      border-radius: 8px;
      height: 28px;
      overflow: hidden;
      margin-bottom: 20px;
    }

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #3a6b42, #c9a84c);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: width 0.5s ease;
      min-width: 40px;
    }

    .progress-pct {
      font-size: 12px;
      font-weight: 700;
      color: #0f1a14;
    }

    .progress-error {
      background: rgba(220, 60, 60, 0.1);
      border: 1px solid rgba(220, 60, 60, 0.3);
      color: #e05555;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
    }

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

    .detail-errors {
      font-size: 11px;
      color: #e05555;
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
      padding: 20px 0 8px;
    }

    .complete-icon {
      font-size: 40px;
      margin-bottom: 16px;
    }

    .complete-stats {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-bottom: 20px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .stat-label {
      font-size: 12px;
      color: #8a9b8e;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #e8e8e8;
    }

    .stat-value.accent {
      color: #c9a84c;
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

    .conf-high { background: #4ecb71; }
    .conf-mid  { background: #c9a84c; }
    .conf-low  { background: #e05555; }

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

  // ── Tab 2: Review ──────────────────────────────────────────
  stagedRecords = signal<V3StagedRecord[]>([]);
  stagedCounts = signal<StagedCounts>({});
  reviewStatusFilter = signal<string>('');
  reviewLoading = signal(false);
  bulkLoading = signal(false);
  bulkFileType = '';
  editValues: Record<string, any> = {};

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

  regionName(id: number): string {
    return this.regions.find(r => r.id === id)?.name || '-';
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
    for (const slot of this.fileSlots()) {
      if (slot.file) {
        formData.append(slot.key, slot.file);
      }
    }

    this.importing.set(true);
    this.progress.set(null);

    this.http.post<any>(`${this.base}/unified`, formData).subscribe({
      next: (res) => {
        const importId = res.importId || res.data?.importId;
        if (importId) {
          this.startPolling(importId);
        }
      },
      error: (err) => {
        console.error('Import failed', err);
        this.importing.set(false);
        this.progress.set({
          importId: '', step: 0, totalSteps: 8, stepName: 'خطأ',
          overallPct: 0, fileResults: [], collectionSaves: [],
          discovery: { newBranches: 0, knownBranches: 0, newEmployees: 0, knownEmployees: 0 },
          done: true, totalSaved: 0, totalStaged: 0, avgConfidence: 0,
          error: err.error?.message || 'فشل في بدء الاستيراد'
        });
      }
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

  private pollProgress(importId: string): void {
    this.http.get<any>(`${this.base}/progress/${importId}`).subscribe({
      next: (res) => {
        const p: ImportProgress = res.data || res;
        this.progress.set(p);
        if (p.done) {
          this.stopPolling();
          this.importing.set(false);
          this.loadStagedCounts();
          this.loadPendingBranchCount();
        }
      },
      error: () => {
        // keep polling on transient errors
      }
    });
  }

  wipeData(): void {
    if (!confirm('هل أنت متأكد من مسح جميع بيانات V3؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
    this.http.delete<any>(`${this.base}/wipe`).subscribe({
      next: () => {
        this.progress.set(null);
        this.stagedRecords.set([]);
        this.stagedCounts.set({});
        this.branches.set([]);
        this.pendingBranchCount.set(0);
        // Reset file slots
        this.fileSlots.set([
          { key: 'branchSales',   label: 'مبيعات الفروع',    icon: '📈', file: null },
          { key: 'employeeSales', label: 'مبيعات الموظفين',   icon: '👤', file: null },
          { key: 'purchases',     label: 'المشتريات',        icon: '🛒', file: null },
          { key: 'mothan',        label: 'موطن الذهب',       icon: '⚖️', file: null },
        ]);
      },
      error: (err) => console.error('Wipe failed', err)
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
      error: () => this.reviewLoading.set(false)
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
      error: () => this.bulkLoading.set(false)
    });
  }

  acceptRecord(rec: V3StagedRecord): void {
    this.http.post<any>(`${this.base}/staged/${rec.id}/accept`, {}).subscribe({
      next: () => {
        this.updateRecordStatus(rec.id, 'saved');
        this.loadStagedCounts();
      }
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
      }
    });
  }

  omitRecord(rec: V3StagedRecord): void {
    this.http.post<any>(`${this.base}/staged/${rec.id}/omit`, {}).subscribe({
      next: () => {
        this.updateRecordStatus(rec.id, 'omitted');
        this.loadStagedCounts();
      }
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
      error: () => this.branchLoading.set(false)
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
      error: () => this.seedLoading.set(false)
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
      error: (err) => console.error('Save branch failed', err)
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
      error: (err) => console.error('Add branch failed', err)
    });
  }
}
