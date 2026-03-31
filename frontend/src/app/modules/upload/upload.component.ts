import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadService } from '../../core/services/upload.service';
import { UploadLog, UploadProgress } from '../../shared/models/models';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div><h2>رفع الملفات</h2><p>رفع ملفات Excel لتحليل بيانات المبيعات</p></div>
    </div>

    <!-- Drop Zone -->
    <div class="card mb-4">
      <div class="drop-zone"
        [class.dragging]="dragging()"
        [class.has-files]="selectedFiles().length > 0"
        (dragover)="$event.preventDefault(); dragging.set(true)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
        (click)="!uploading() && fileInput.click()">
        <input #fileInput type="file" multiple accept=".xls,.xlsx" hidden (change)="onFileSelect($event)">
        <div class="drop-icon">{{ selectedFiles().length ? '📁' : '📂' }}</div>
        @if (selectedFiles().length) {
          <p><strong>{{ selectedFiles().length }}</strong> ملف محدد</p>
          <small>{{ totalSize() }}</small>
        } @else {
          <p>اسحب الملفات هنا أو انقر للاختيار</p>
          <small>يدعم .xls و .xlsx — متعدد الملفات</small>
        }
      </div>

      @if (selectedFiles().length) {
        <div class="selected-files mt-3">
          @for (f of selectedFiles(); track f.name) {
            <div class="file-chip">
              <span class="file-icon">📄</span>
              <span class="file-name">{{ f.name }}</span>
              <span class="file-size">{{ (f.size / 1024).toFixed(0) }} KB</span>
            </div>
          }
        </div>
        <div class="mt-3" style="display:flex;gap:.5rem;align-items:center">
          <button class="btn btn--primary" (click)="upload()" [disabled]="uploading()">
            @if (uploading()) { <span class="spinner"></span> } رفع الملفات
          </button>
          @if (!uploading()) {
            <button class="btn btn--ghost btn--sm" (click)="clearFiles()">مسح</button>
          }
        </div>
      }
    </div>

    <!-- Active Progress -->
    @if (progresses().length) {
      <div class="card mb-4">
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
                <div style="display:flex;gap:.5rem;align-items:center">
                  @if (p.fileType) { <span class="badge badge--info" style="font-size:.7rem">{{ fileTypeLabel(p.fileType) }}</span> }
                  <span [class]="statusClass(p.status)">{{ p.phaseAr || statusLabel(p.status) }}</span>
                </div>
              </div>
              <div class="progress-track">
                <div class="progress-fill"
                  [style.width]="p.percent + '%'"
                  [class.fill-error]="p.status === 'error'"
                  [class.fill-done]="p.status === 'success'">
                </div>
              </div>
              <div class="progress-footer">
                <span class="progress-pct">{{ p.percent }}%</span>
                @if (p.savedRecords && p.savedRecords > 0) {
                  <span class="text-success" style="font-size:.78rem">✓ {{ p.savedRecords }} سجل محفوظ</span>
                }
                @if (p.message) {
                  <span [class]="p.status === 'error' ? 'text-danger' : 'text-muted'" style="font-size:.78rem">{{ p.message }}</span>
                }
              </div>
            </div>
          }
        </div>

        @if (allDone()) {
          <div class="upload-summary">
            <span class="summary-icon">✅</span>
            <span>تم رفع ومعالجة جميع الملفات بنجاح</span>
          </div>
        }
      </div>
    }

    @if (error()) { <div class="alert alert--error mb-3">{{ error() }}</div> }

    <!-- History -->
    <div class="card">
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
    .drop-zone {
      border: 2px dashed var(--mizan-border); border-radius: var(--radius);
      padding: 2.5rem; text-align: center; cursor: pointer;
      transition: all .2s; color: var(--mizan-text-muted);
      user-select: none;
    }
    .drop-zone:hover, .drop-zone.dragging {
      border-color: var(--mizan-green); background: rgba(45,106,79,.04); color: var(--mizan-green);
    }
    .drop-zone.has-files { border-color: var(--mizan-green); background: rgba(45,106,79,.03); }
    .drop-icon { font-size: 2.5rem; margin-bottom: .5rem; }
    .drop-zone p { font-size: .95rem; font-weight: 500; margin: .3rem 0; }
    .drop-zone small { font-size: .78rem; }

    .selected-files { display: flex; flex-direction: column; gap: .4rem; }
    .file-chip {
      display: flex; align-items: center; gap: .6rem;
      background: var(--mizan-bg); border: 1px solid var(--mizan-border);
      border-radius: 6px; padding: .4rem .8rem; font-size: .83rem;
    }
    .file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-size { color: var(--mizan-text-muted); font-size: .75rem; white-space: nowrap; }

    .progress-list { display: flex; flex-direction: column; gap: 1rem; margin-top: .5rem; }
    .progress-item { padding: .75rem; background: var(--mizan-bg); border-radius: var(--radius); border: 1px solid var(--mizan-border); transition: border-color .3s; }
    .progress-item.done { border-color: var(--mizan-green); }
    .progress-item.errored { border-color: var(--mizan-danger); }
    .progress-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; font-size: .85rem; gap: .5rem; }
    .progress-filename { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; }

    .progress-track { height: 10px; background: var(--mizan-border); border-radius: 5px; overflow: hidden; }
    .progress-fill {
      height: 100%; border-radius: 5px;
      background: linear-gradient(90deg, var(--mizan-green) 0%, #4ade80 100%);
      transition: width .5s cubic-bezier(.4,0,.2,1);
    }
    .progress-fill.fill-error { background: var(--mizan-danger); }
    .progress-fill.fill-done { background: var(--mizan-green); }

    .progress-footer { display: flex; justify-content: space-between; align-items: center; margin-top: .35rem; }
    .progress-pct { font-size: .78rem; color: var(--mizan-text-muted); font-weight: 600; }

    .upload-summary {
      display: flex; align-items: center; gap: .6rem;
      margin-top: 1rem; padding: .75rem 1rem;
      background: rgba(45,106,79,.08); border-radius: var(--radius);
      color: var(--mizan-green); font-weight: 500; font-size: .9rem;
    }
    .summary-icon { font-size: 1.2rem; }
  `]
})
export class UploadComponent implements OnDestroy {
  private svc = inject(UploadService);

  selectedFiles = signal<File[]>([]);
  dragging = signal(false);
  uploading = signal(false);
  progresses = signal<UploadProgress[]>([]);
  history = signal<UploadLog[]>([]);
  historyLoading = signal(false);
  error = signal('');
  allDone = signal(false);
  private eventSource?: EventSource;

  constructor() { this.loadHistory(); }

  ngOnDestroy() { this.eventSource?.close(); }

  totalSize(): string {
    const bytes = this.selectedFiles().reduce((s, f) => s + f.size, 0);
    return bytes > 1024 * 1024
      ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
      : (bytes / 1024).toFixed(0) + ' KB';
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    this.selectedFiles.set(Array.from(e.dataTransfer?.files ?? []).filter(f => /\.xlsx?$/i.test(f.name)));
  }

  onFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.selectedFiles.set(Array.from(input.files ?? []).filter(f => /\.xlsx?$/i.test(f.name)));
  }

  clearFiles(): void { this.selectedFiles.set([]); }

  upload(): void {
    const files = this.selectedFiles();
    if (!files.length) return;
    this.uploading.set(true);
    this.error.set('');
    this.allDone.set(false);

    this.svc.requestToken().subscribe({
      next: tokenRes => {
        const { uploadId, token } = tokenRes.data!;
        this.progresses.set(files.map(f => ({
          uploadId, fileName: f.name, status: 'pending', percent: 0, phaseAr: 'في الانتظار'
        })));
        this.subscribeToProgress(uploadId, token);
        this.svc.uploadFiles(files, uploadId).subscribe({
          next: () => {
            this.uploading.set(false);
            this.selectedFiles.set([]);
            setTimeout(() => this.loadHistory(), 1500);
          },
          error: err => {
            this.uploading.set(false);
            this.error.set(err?.error?.message || 'فشل الرفع');
          }
        });
      },
      error: err => {
        this.uploading.set(false);
        this.error.set(err?.error?.message || 'فشل الحصول على رمز الرفع');
      }
    });
  }

  private subscribeToProgress(uploadId: string, token: string): void {
    this.eventSource?.close();
    const url = this.svc.getProgressUrl(uploadId, token);
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('progress', (evt: MessageEvent) => {
      const raw = JSON.parse(evt.data);
      const update: UploadProgress = {
        uploadId: raw.uploadId,
        fileName: raw.currentFileName ?? raw.fileName ?? '',
        fileType: raw.fileType,
        status: raw.status ?? 'processing',
        percent: raw.percentage ?? raw.percent ?? 0,
        savedRecords: raw.savedRecords,
        phaseAr: raw.phaseAr,
        message: raw.errorMessage
      };
      this.progresses.update(list => {
        const idx = list.findIndex(p => p.fileName === update.fileName);
        const copy = [...list];
        if (idx >= 0) { copy[idx] = { ...copy[idx], ...update }; }
        else { copy.push(update); }
        return copy;
      });
    });

    this.eventSource.addEventListener('complete', (evt: MessageEvent) => {
      this.allDone.set(true);
      this.eventSource?.close();
      this.progresses.update(list => list.map(p =>
        p.status !== 'error' ? { ...p, percent: 100, status: 'success' } : p
      ));
    });

    this.eventSource.onerror = () => this.eventSource?.close();
  }

  loadHistory(): void {
    this.historyLoading.set(true);
    this.svc.getHistory().subscribe({
      next: res => { this.historyLoading.set(false); this.history.set(res.data ?? []); },
      error: () => this.historyLoading.set(false)
    });
  }

  fileTypeLabel(t: string): string {
    const m: Record<string,string> = {
      BRANCH_SALES:'مبيعات الفروع', PURCHASES:'المشتريات',
      EMPLOYEE_SALES:'مبيعات الموظفين', MOTHAN:'المثان', UNKNOWN:'غير معروف'
    };
    return m[t] ?? t;
  }

  statusLabel(s: string): string {
    const m: Record<string,string> = {
      pending:'انتظار', processing:'معالجة', saving:'حفظ', success:'تم', error:'خطأ', complete:'اكتمل'
    };
    return m[s] ?? s;
  }

  statusClass(s: string): string {
    const m: Record<string,string> = {
      success:'text-success', error:'text-danger', complete:'text-success',
      processing:'text-gold', saving:'text-gold', pending:'text-muted'
    };
    return m[s] ?? 'text-muted';
  }
}
