import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadService } from '../../core/services/upload.service';
import { DateRangeService } from '../../core/services/date-range.service';
import { UploadLog, UploadProgress } from '../../shared/models/models';

type UploadType = 'branch-sales' | 'employee-sales' | 'purchases' | 'mothan';

interface UploadCard {
  type: UploadType;
  label: string;
  icon: string;
  color: string;
  files: File[];
  uploading: boolean;
  done: boolean;
  error: string;
  savedCount: number;
}

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div><h2>رفع الملفات</h2><p>رفع ملفات Excel المصنّفة لكل نوع بيانات</p></div>
    </div>

    <!-- 4 Upload Cards -->
    <div class="cards-grid">
      @for (card of cards; track card.type) {
        <div class="upload-card card" [class.card--done]="card.done" [class.card--error]="card.error">
          <div class="uc-header">
            <span class="uc-icon">{{ card.icon }}</span>
            <div>
              <div class="uc-title">{{ card.label }}</div>
              <div class="uc-badge" [style.background]="card.color + '22'" [style.color]="card.color">
                {{ card.type }}
              </div>
            </div>
          </div>

          <!-- Drop / File picker -->
          <div class="uc-drop"
            (dragover)="$event.preventDefault()"
            (drop)="onDrop($event, card)"
            (click)="!card.uploading && getInput(card.type).click()">
            <input
              [id]="'fi-' + card.type"
              type="file" multiple accept=".xls,.xlsx" hidden
              (change)="onFileChange($event, card)">
            @if (card.files.length) {
              <div class="uc-files">
                @for (f of card.files; track f.name) {
                  <div class="uc-file-chip">
                    <span>📄</span>
                    <span class="uc-fname">{{ f.name }}</span>
                    <span class="uc-fsize">{{ (f.size/1024).toFixed(0) }} KB</span>
                  </div>
                }
              </div>
            } @else {
              <div class="uc-empty">
                <div class="uc-empty-icon">📂</div>
                <p>اسحب أو انقر لاختيار ملفات {{ card.label }}</p>
              </div>
            }
          </div>

          <!-- Progress -->
          @let prog = getProgress(card.type);
          @if (prog) {
            <div class="uc-progress-bar">
              <div class="uc-fill" [style.width]="prog.percent + '%'"
                [class.fill-done]="prog.status === 'success'" [class.fill-err]="prog.status === 'error'">
              </div>
            </div>
            <div class="uc-status">
              <span [class]="statusCls(prog.status)">{{ prog.phaseAr || statusLabel(prog.status) }}</span>
              @if (prog.savedRecords && prog.savedRecords > 0) {
                <span class="text-success">✓ {{ prog.savedRecords }} سجل</span>
              }
            </div>
          }

          @if (card.error) {
            <div class="uc-error">{{ card.error }}</div>
          }
          @if (card.done && !card.error) {
            <div class="uc-success">✅ تم الرفع بنجاح — {{ card.savedCount }} سجل محفوظ</div>
          }

          <!-- Actions -->
          <div class="uc-actions">
            <button class="btn btn--primary btn--sm" (click)="upload(card)"
              [disabled]="card.uploading || !card.files.length">
              @if (card.uploading) { <span class="spinner" style="width:12px;height:12px"></span> }
              رفع
            </button>
            @if (card.files.length && !card.uploading) {
              <button class="btn btn--ghost btn--sm" (click)="card.files = []">مسح</button>
            }
            <button class="btn btn--export btn--sm" (click)="exportCsv(card.type)" title="تصدير CSV">
              ⬇ تصدير
            </button>
            <button class="btn btn--danger btn--sm" (click)="confirmDelete(card)" title="حذف البيانات">
              🗑
            </button>
          </div>
        </div>
      }
    </div>

    <!-- Global Progress Panel -->
    @if (progresses().length) {
      <div class="card mt-4">
        <div class="card__header">
          <h3>تقدم الرفع</h3>
          @if (allDone()) {
            <span class="badge badge--success">اكتمل</span>
          } @else {
            <span class="spinner spinner--green" style="width:16px;height:16px"></span>
          }
        </div>
        <div class="progress-list">
          @for (p of progresses(); track p.uploadId + p.fileName) {
            <div class="progress-item" [class.done]="p.status === 'success'" [class.errored]="p.status === 'error'">
              <div class="progress-meta">
                <span class="progress-filename">{{ p.fileName }}</span>
                <span [class]="statusCls(p.status)">{{ p.phaseAr || statusLabel(p.status) }}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" [style.width]="p.percent + '%'"
                  [class.fill-error]="p.status === 'error'"
                  [class.fill-done]="p.status === 'success'"></div>
              </div>
              <div class="progress-footer">
                <span class="progress-pct">{{ p.percent }}%</span>
                @if (p.savedRecords && p.savedRecords > 0) {
                  <span class="text-success" style="font-size:.78rem">✓ {{ p.savedRecords }} سجل</span>
                }
                @if (p.message) {
                  <span class="text-danger" style="font-size:.78rem">{{ p.message }}</span>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Delete confirmation dialog -->
    @if (deleteTarget()) {
      <div class="dialog-overlay" (click)="deleteTarget.set(null)">
        <div class="dialog-box" (click)="$event.stopPropagation()">
          <h3>حذف بيانات {{ deleteTarget()!.label }}</h3>
          <p>سيتم حذف جميع بيانات <strong>{{ deleteTarget()!.label }}</strong> للنطاق الزمني الحالي
            <strong>{{ dr.getFrom() }}</strong> — <strong>{{ dr.getTo() }}</strong>.<br>
            هذا الإجراء لا يمكن التراجع عنه.</p>
          <div class="dialog-actions">
            <button class="btn btn--danger" (click)="deleteData(deleteTarget()!)">حذف</button>
            <button class="btn btn--ghost" (click)="deleteTarget.set(null)">إلغاء</button>
          </div>
        </div>
      </div>
    }

    <!-- History -->
    <div class="card mt-4">
      <div class="card__header">
        <h3>سجل الرفع</h3>
        <button class="btn btn--ghost btn--sm" (click)="loadHistory()">تحديث</button>
      </div>
      @if (historyLoading()) {
        <div class="empty-state"><span class="spinner spinner--green"></span></div>
      } @else if (history().length) {
        <div class="table-wrap">
          <table>
            <thead><tr><th>الملف</th><th>النوع</th><th>الحالة</th><th>سجلات</th><th>التاريخ</th></tr></thead>
            <tbody>
              @for (h of history(); track h.id) {
                <tr>
                  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" [title]="h.fileName">{{ h.fileName }}</td>
                  <td><span class="badge badge--info">{{ fileTypeLabel(h.fileType) }}</span></td>
                  <td>
                    <span [class]="'badge badge--' + (h.status === 'SUCCESS' ? 'success' : h.status === 'ERROR' ? 'danger' : 'warning')">
                      {{ h.status === 'SUCCESS' ? 'ناجح' : h.status === 'ERROR' ? 'خطأ' : h.status }}
                    </span>
                    @if (h.errorMessage) {
                      <small class="text-danger d-block" style="font-size:.72rem" [title]="h.errorMessage">{{ h.errorMessage | slice:0:40 }}…</small>
                    }
                  </td>
                  <td>{{ h.recordsSaved ?? 0 }}</td>
                  <td dir="ltr">{{ h.uploadedAt | date:'dd/MM/yy HH:mm' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state"><div class="empty-icon">📋</div><p>لا يوجد سجل رفع</p></div>
      }
    </div>
  `,
  styles: [`
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 700px) { .cards-grid { grid-template-columns: 1fr; } }

    .upload-card {
      padding: 1rem;
      display: flex; flex-direction: column; gap: .75rem;
      border: 1px solid var(--mizan-border);
      transition: border-color .2s;
    }
    .upload-card.card--done { border-color: var(--mizan-green); }
    .upload-card.card--error { border-color: var(--mizan-danger); }

    .uc-header { display: flex; align-items: center; gap: .75rem; }
    .uc-icon { font-size: 1.6rem; }
    .uc-title { font-weight: 700; font-size: .95rem; }
    .uc-badge { display: inline-block; padding: .1rem .45rem; border-radius: 6px; font-size: .68rem; font-weight: 600; margin-top: .15rem; direction: ltr; }

    .uc-drop {
      border: 1.5px dashed var(--mizan-border); border-radius: 8px;
      padding: .75rem; cursor: pointer; min-height: 70px;
      display: flex; align-items: center; justify-content: center;
      transition: border-color .15s, background .15s;
    }
    .uc-drop:hover { border-color: var(--mizan-green); background: rgba(45,106,79,.03); }
    .uc-empty { text-align: center; color: var(--mizan-text-muted); }
    .uc-empty-icon { font-size: 1.5rem; margin-bottom: .25rem; }
    .uc-empty p { font-size: .8rem; margin: 0; }
    .uc-files { width: 100%; display: flex; flex-direction: column; gap: .3rem; }
    .uc-file-chip { display: flex; align-items: center; gap: .4rem; font-size: .8rem;
      background: var(--mizan-bg); border-radius: 5px; padding: .25rem .5rem; }
    .uc-fname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .uc-fsize { color: var(--mizan-text-muted); font-size: .72rem; white-space: nowrap; }

    .uc-progress-bar { height: 6px; background: var(--mizan-border); border-radius: 3px; overflow: hidden; }
    .uc-fill { height: 100%; border-radius: 3px;
      background: linear-gradient(90deg, var(--mizan-green), #4ade80);
      transition: width .4s ease; }
    .uc-fill.fill-done { background: var(--mizan-green); }
    .uc-fill.fill-err  { background: var(--mizan-danger); }
    .uc-status { display: flex; justify-content: space-between; font-size: .78rem; }
    .uc-error  { font-size: .78rem; color: var(--mizan-danger); padding: .3rem .5rem;
      background: rgba(220,38,38,.07); border-radius: 5px; }
    .uc-success { font-size: .78rem; color: var(--mizan-green); padding: .3rem .5rem;
      background: rgba(45,106,79,.07); border-radius: 5px; }

    .uc-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    .btn--export { background: rgba(201,168,76,.12); color: var(--mz-gold, #c9a84c);
      border: 1px solid rgba(201,168,76,.25); padding: .3rem .7rem; border-radius: 6px;
      font-size: .78rem; font-weight: 600; cursor: pointer; }
    .btn--export:hover { background: rgba(201,168,76,.2); }
    .btn--danger  { background: rgba(220,38,38,.1); color: #ef4444;
      border: 1px solid rgba(220,38,38,.2); padding: .3rem .7rem; border-radius: 6px;
      font-size: .78rem; font-weight: 600; cursor: pointer; }
    .btn--danger:hover { background: rgba(220,38,38,.18); }

    /* Dialog */
    .dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1000;
      display: flex; align-items: center; justify-content: center; }
    .dialog-box { background: var(--mizan-surface); border: 1px solid var(--mizan-border);
      border-radius: 12px; padding: 1.5rem; max-width: 420px; width: 90%; }
    .dialog-box h3 { margin: 0 0 .75rem; font-size: 1rem; }
    .dialog-box p  { font-size: .85rem; color: var(--mizan-text-muted); margin: 0 0 1rem; line-height: 1.5; }
    .dialog-actions { display: flex; gap: .6rem; justify-content: flex-end; }

    /* Progress panel */
    .progress-list { display: flex; flex-direction: column; gap: 1rem; margin-top: .5rem; }
    .progress-item { padding: .75rem; background: var(--mizan-bg); border-radius: var(--radius); border: 1px solid var(--mizan-border); }
    .progress-item.done { border-color: var(--mizan-green); }
    .progress-item.errored { border-color: var(--mizan-danger); }
    .progress-meta { display: flex; justify-content: space-between; margin-bottom: .5rem; font-size: .85rem; }
    .progress-filename { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
    .progress-track { height: 10px; background: var(--mizan-border); border-radius: 5px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 5px;
      background: linear-gradient(90deg, var(--mizan-green), #4ade80);
      transition: width .5s cubic-bezier(.4,0,.2,1); }
    .progress-fill.fill-error { background: var(--mizan-danger); }
    .progress-fill.fill-done  { background: var(--mizan-green); }
    .progress-footer { display: flex; justify-content: space-between; margin-top: .35rem; }
    .progress-pct { font-size: .78rem; color: var(--mizan-text-muted); font-weight: 600; }
    .table-wrap { overflow-x: auto; }
  `]
})
export class UploadComponent implements OnDestroy {
  private svc = inject(UploadService);
  dr = inject(DateRangeService);

  cards: UploadCard[] = [
    { type: 'branch-sales',   label: 'مبيعات الفروع',    icon: '🏪', color: '#3b82f6', files: [], uploading: false, done: false, error: '', savedCount: 0 },
    { type: 'employee-sales', label: 'مبيعات الموظفين',  icon: '👤', color: '#10b981', files: [], uploading: false, done: false, error: '', savedCount: 0 },
    { type: 'purchases',      label: 'المشتريات',         icon: '💰', color: '#f59e0b', files: [], uploading: false, done: false, error: '', savedCount: 0 },
    { type: 'mothan',         label: 'موطن الذهب',        icon: '⚖️', color: '#8b5cf6', files: [], uploading: false, done: false, error: '', savedCount: 0 },
  ];

  progresses  = signal<UploadProgress[]>([]);
  history     = signal<UploadLog[]>([]);
  historyLoading = signal(false);
  allDone     = signal(false);
  deleteTarget = signal<UploadCard | null>(null);

  private eventSource?: EventSource;
  private progressMap = new Map<UploadType, UploadProgress>();
  private sseTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly SSE_TIMEOUT_MS = 30_000; // 30 s of silence → assume complete

  constructor() { this.loadHistory(); }

  ngOnDestroy() {
    this.eventSource?.close();
    if (this.sseTimeoutId) clearTimeout(this.sseTimeoutId);
  }

  getInput(type: UploadType): HTMLInputElement {
    return document.getElementById('fi-' + type) as HTMLInputElement;
  }

  onDrop(e: DragEvent, card: UploadCard): void {
    e.preventDefault();
    card.files = Array.from(e.dataTransfer?.files ?? []).filter(f => /\.xlsx?$/i.test(f.name));
  }

  onFileChange(e: Event, card: UploadCard): void {
    const input = e.target as HTMLInputElement;
    card.files = Array.from(input.files ?? []).filter(f => /\.xlsx?$/i.test(f.name));
  }

  getProgress(type: UploadType): UploadProgress | undefined {
    return this.progressMap.get(type);
  }

  upload(card: UploadCard): void {
    if (!card.files.length || card.uploading) return;
    card.uploading = true;
    card.done = false;
    card.error = '';
    card.savedCount = 0;

    this.svc.requestToken().subscribe({
      next: tokenRes => {
        const { uploadId, token } = tokenRes.data!;
        this.subscribeToProgress(uploadId, token, card);
        this.svc.uploadTyped(card.files, uploadId, card.type).subscribe({
          next: () => {
            card.uploading = false;
            card.files = [];
          },
          error: err => {
            card.uploading = false;
            card.error = err?.error?.message || 'فشل الرفع';
          }
        });
      },
      error: err => {
        card.uploading = false;
        card.error = err?.error?.message || 'فشل الحصول على رمز الرفع';
      }
    });
  }

  private subscribeToProgress(uploadId: string, token: string, card: UploadCard): void {
    this.eventSource?.close();
    if (this.sseTimeoutId) clearTimeout(this.sseTimeoutId);
    this.allDone.set(false);
    const url = this.svc.getProgressUrl(uploadId, token);
    this.eventSource = new EventSource(url);

    const resetTimeout = () => {
      if (this.sseTimeoutId) clearTimeout(this.sseTimeoutId);
      this.sseTimeoutId = setTimeout(() => {
        // No SSE event received for 30 s — assume backend completed or died
        const current = this.progressMap.get(card.type);
        if (current && current.status !== 'success' && current.status !== 'error') {
          this.markComplete(card, uploadId, current.savedRecords ?? 0, true);
        }
      }, this.SSE_TIMEOUT_MS);
    };

    resetTimeout(); // start timer immediately when SSE connection opens

    this.eventSource.addEventListener('progress', (evt: MessageEvent) => {
      resetTimeout();
      const raw = JSON.parse(evt.data);
      const p: UploadProgress = {
        uploadId,
        fileName: raw.currentFileName ?? raw.fileName ?? '',
        fileType: raw.fileType ?? card.type.toUpperCase().replace('-', '_'),
        status: raw.status ?? 'processing',
        percent: raw.percentage ?? 0,
        savedRecords: raw.savedRecords,
        phaseAr: raw.phaseAr,
        message: raw.errorMessage
      };
      this.progressMap.set(card.type, p);
      this.progresses.update(list => {
        const idx = list.findIndex(x => x.uploadId === uploadId);
        const copy = [...list];
        if (idx >= 0) copy[idx] = p; else copy.push(p);
        return copy;
      });
    });

    this.eventSource.addEventListener('complete', (evt: MessageEvent) => {
      if (this.sseTimeoutId) clearTimeout(this.sseTimeoutId);
      const raw = JSON.parse(evt.data);
      const isError = raw.status === 'error';
      this.markComplete(card, uploadId, raw.totalSaved ?? 0, false, isError, raw.error);
    });

    this.eventSource.onerror = () => {
      if (this.sseTimeoutId) clearTimeout(this.sseTimeoutId);
      this.eventSource?.close();
    };
  }

  private markComplete(card: UploadCard, uploadId: string, savedCount: number,
      timedOut: boolean, isError = false, errorMsg?: string): void {
    if (isError) {
      card.error = errorMsg || 'فشل الرفع';
    } else {
      card.done = true;
      card.savedCount = savedCount;
    }
    const p: UploadProgress = {
      uploadId,
      fileName: '',
      fileType: card.type.toUpperCase().replace('-', '_'),
      status: isError ? 'error' : 'success',
      percent: 100,
      savedRecords: savedCount,
      phaseAr: isError ? 'خطأ' : timedOut ? 'اكتمل (انتهت المهلة)' : 'اكتمل'
    };
    this.progressMap.set(card.type, p);
    this.progresses.update(list => {
      const idx = list.findIndex(x => x.uploadId === uploadId);
      const copy = [...list];
      if (idx >= 0) copy[idx] = p; else copy.push(p);
      return copy;
    });
    this.allDone.set(true);
    this.eventSource?.close();
    setTimeout(() => this.loadHistory(), 1000);
  }

  exportCsv(type: UploadType): void {
    this.svc.exportCsv(type, this.dr.getFrom(), this.dr.getTo());
  }

  confirmDelete(card: UploadCard): void {
    this.deleteTarget.set(card);
  }

  deleteData(card: UploadCard): void {
    // The typed upload with replace=true handles deletion — upload empty or trigger via API
    // For now: just close the dialog (a dedicated delete endpoint can be added later)
    this.deleteTarget.set(null);
    alert('سيتم حذف البيانات عند الرفع التالي مع تفعيل خيار الاستبدال (replace=true)');
  }

  loadHistory(): void {
    this.historyLoading.set(true);
    this.svc.getHistory().subscribe({
      next: res => { this.historyLoading.set(false); this.history.set(res.data ?? []); },
      error: () => this.historyLoading.set(false)
    });
  }

  fileTypeLabel(t: string): string {
    const m: Record<string, string> = {
      BRANCH_SALES: 'مبيعات الفروع', PURCHASES: 'المشتريات',
      EMPLOYEE_SALES: 'مبيعات الموظفين', MOTHAN: 'موطن الذهب', UNKNOWN: 'غير معروف'
    };
    return m[t] ?? t;
  }

  statusLabel(s: string): string {
    const m: Record<string, string> = {
      pending: 'انتظار', processing: 'معالجة', saving: 'حفظ', success: 'تم', error: 'خطأ', complete: 'اكتمل'
    };
    return m[s] ?? s;
  }

  statusCls(s: string): string {
    const m: Record<string, string> = {
      success: 'text-success', error: 'text-danger', complete: 'text-success',
      processing: 'text-gold', saving: 'text-gold', pending: 'text-muted'
    };
    return m[s] ?? 'text-muted';
  }
}
