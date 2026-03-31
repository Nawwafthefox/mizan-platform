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
        (dragover)="$event.preventDefault(); dragging.set(true)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()">
        <input #fileInput type="file" multiple accept=".xls,.xlsx" hidden (change)="onFileSelect($event)">
        <div class="drop-icon">📂</div>
        <p>اسحب الملفات هنا أو انقر للاختيار</p>
        <small>يدعم .xls و .xlsx — متعدد الملفات</small>
      </div>

      @if (selectedFiles().length) {
        <div class="selected-files mt-3">
          @for (f of selectedFiles(); track f.name) {
            <div class="file-chip">
              <span>📄 {{ f.name }}</span>
              <span class="size">{{ (f.size / 1024).toFixed(0) }} KB</span>
            </div>
          }
        </div>
        <button class="btn btn--primary mt-3" (click)="upload()" [disabled]="uploading()">
          @if (uploading()) { <span class="spinner"></span> }
          رفع الملفات
        </button>
      }
    </div>

    <!-- Progress -->
    @if (progresses().length) {
      <div class="card mb-4">
        <div class="card__header"><h3>تقدم الرفع</h3></div>
        @for (p of progresses(); track p.uploadId + p.fileName) {
          <div class="progress-item">
            <div class="progress-meta">
              <span>{{ p.fileName }}</span>
              <span [class]="statusClass(p.status)">{{ statusLabel(p.status) }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" [style.width]="p.percent + '%'"
                [style.background]="p.status === 'ERROR' ? 'var(--mizan-danger)' : 'var(--mizan-green)'">
              </div>
            </div>
            @if (p.message) { <small class="text-muted">{{ p.message }}</small> }
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
      @if (history().length) {
        <div class="table-wrap">
          <table>
            <thead><tr><th>الملف</th><th>النوع</th><th>الحالة</th><th>مُدرَج</th><th>مكرر</th><th>التاريخ</th></tr></thead>
            <tbody>
              @for (h of history(); track h.id) {
                <tr>
                  <td>{{ h.fileName }}</td>
                  <td><span class="badge badge--info">{{ h.fileType }}</span></td>
                  <td>
                    <span [class]="'badge badge--' + (h.status === 'DONE' ? 'success' : h.status === 'ERROR' ? 'danger' : 'warning')">
                      {{ h.status }}
                    </span>
                  </td>
                  <td>{{ h.recordsInserted }}</td>
                  <td>{{ h.duplicatesSkipped }}</td>
                  <td dir="ltr">{{ h.createdAt | date:'short' }}</td>
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
      &:hover, &.dragging { border-color: var(--mizan-green); background: rgba(45,106,79,.04); color: var(--mizan-green); }
    }
    .drop-icon { font-size: 2.5rem; margin-bottom: .5rem; }
    .drop-zone p { font-size: .95rem; font-weight: 500; margin: .3rem 0; }
    .drop-zone small { font-size: .78rem; }

    .selected-files { display: flex; flex-wrap: wrap; gap: .5rem; }
    .file-chip {
      display: flex; align-items: center; gap: .5rem;
      background: var(--mizan-bg); border: 1px solid var(--mizan-border);
      border-radius: 6px; padding: .3rem .7rem; font-size: .82rem;
    }
    .size { color: var(--mizan-text-muted); font-size: .75rem; }

    .progress-item { margin-bottom: 1rem; }
    .progress-meta { display: flex; justify-content: space-between; margin-bottom: .3rem; font-size: .85rem; }
    .progress-bar { height: 8px; background: var(--mizan-bg); border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; transition: width .4s ease; border-radius: 4px; }
  `]
})
export class UploadComponent implements OnDestroy {
  private svc = inject(UploadService);

  selectedFiles = signal<File[]>([]);
  dragging = signal(false);
  uploading = signal(false);
  progresses = signal<UploadProgress[]>([]);
  history = signal<UploadLog[]>([]);
  error = signal('');
  private eventSource?: EventSource;

  constructor() { this.loadHistory(); }

  ngOnDestroy() { this.eventSource?.close(); }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    this.selectedFiles.set(files.filter(f => f.name.match(/\.xlsx?$/i)));
  }

  onFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.selectedFiles.set(Array.from(input.files ?? []).filter(f => f.name.match(/\.xlsx?$/i)));
  }

  upload(): void {
    const files = this.selectedFiles();
    if (!files.length) return;
    this.uploading.set(true);
    this.error.set('');

    this.svc.requestToken().subscribe({
      next: tokenRes => {
        const { uploadId, token } = tokenRes.data!;
        const initProgress: UploadProgress[] = files.map(f => ({
          uploadId, fileName: f.name, status: 'PENDING', percent: 0
        }));
        this.progresses.set(initProgress);
        this.subscribeToProgress(uploadId, token);
        this.svc.uploadFiles(files, uploadId).subscribe({
          next: () => {
            this.uploading.set(false);
            this.selectedFiles.set([]);
            setTimeout(() => this.loadHistory(), 2000);
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
    this.eventSource.onmessage = evt => {
      const update: UploadProgress = JSON.parse(evt.data);
      this.progresses.update(list => {
        const idx = list.findIndex(p => p.fileName === update.fileName);
        if (idx >= 0) { const copy = [...list]; copy[idx] = { ...copy[idx], ...update }; return copy; }
        return [...list, update];
      });
    };
    this.eventSource.onerror = () => this.eventSource?.close();
  }

  loadHistory(): void {
    this.svc.getHistory().subscribe({ next: res => this.history.set(res.data ?? []) });
  }

  statusLabel(s: string): string {
    const m: Record<string,string> = { PENDING:'انتظار', PROCESSING:'معالجة', DONE:'تم', ERROR:'خطأ' };
    return m[s] ?? s;
  }

  statusClass(s: string): string {
    const m: Record<string,string> = { DONE:'text-success', ERROR:'text-danger', PROCESSING:'text-gold', PENDING:'text-muted' };
    return m[s] ?? '';
  }
}
