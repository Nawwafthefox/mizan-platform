import { Component, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpEventType, HttpRequest, HttpResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

type Stage = 'idle' | 'reading' | 'uploading' | 'parsing' | 'inserting' | 'rates' | 'done' | 'error';

interface LogEntry { relSec: string; msg: string; kind: 'info' | 'warn' | 'ok' | 'err'; }

interface ErrDetail {
  code: string;
  title: string;
  body: string;
  status?: number;
  hint: string;
}

interface CardState {
  type: string; label: string; icon: string;
  stage: Stage;
  pct: number;
  elapsedMs: number;
  startedAt: number;
  serverWaitStart: number;
  serverWaitMs: number;
  fileName: string;
  fileSizeKb: number;
  stageMsg: string;
  log: LogEntry[];
  logOpen: boolean;
  count: number;
  err: ErrDetail | null;
  stallMsg: string;
}

function blank(type: string, label: string, icon: string): CardState {
  return { type, label, icon, stage: 'idle', pct: 0, elapsedMs: 0,
    startedAt: 0, serverWaitStart: 0, serverWaitMs: 0,
    fileName: '', fileSizeKb: 0, stageMsg: '', log: [], logOpen: false,
    count: 0, err: null, stallMsg: '' };
}

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="cs-page">

  <!-- Hero -->
  <div class="cs-hero">
    <div class="cs-icon">🚀</div>
    <h1 class="cs-title">Dashboard 3.0</h1>
    <p class="cs-sub">Stay Tuned — Something Impressive is Coming</p>
    <p class="cs-ar">ترقبوا — شيء مذهل قادم</p>
    <div class="cs-features">
      <div class="feature">✅ BCNF Normalized Data</div>
      <div class="feature">✅ Server-Side Calculations</div>
      <div class="feature">✅ 100% Accuracy</div>
      <div class="feature">✅ No Client-Side Logic</div>
    </div>
  </div>

  @if (isAdmin()) {
    <div class="import-section">
      <div class="import-header" (click)="expanded.set(!expanded())">
        <div class="ih-left">
          <span class="ih-icon">📥</span>
          <h3>BCNF Data Import</h3>
          <span class="badge-admin">Admin Only</span>
        </div>
        <span class="chevron">{{ expanded() ? '▲' : '▼' }}</span>
      </div>

      @if (expanded()) {
        <div class="import-grid">
          @for (card of cards(); track card.type; let i = $index) {
            <div class="icard"
                 [class.icard--active]="card.stage !== 'idle' && card.stage !== 'done' && card.stage !== 'error'"
                 [class.icard--done]="card.stage === 'done'"
                 [class.icard--error]="card.stage === 'error'">

              <!-- Top row: icon + label + timer -->
              <div class="icard__head">
                <span class="icard__icon">{{ card.icon }}</span>
                <span class="icard__label">{{ card.label }}</span>
                @if (card.stage !== 'idle') {
                  <span class="icard__timer" [class.timer--done]="card.stage === 'done'" [class.timer--err]="card.stage === 'error'">
                    ⏱ {{ fmtTime(card.elapsedMs) }}
                  </span>
                }
              </div>

              <!-- File info -->
              @if (card.fileName) {
                <div class="file-info">
                  <span class="file-name" [title]="card.fileName">📄 {{ card.fileName }}</span>
                  <span class="file-size">{{ card.fileSizeKb | number }} KB</span>
                </div>
              }

              <!-- Progress bar -->
              @if (card.stage !== 'idle') {
                <div class="prog-row">
                  <div class="prog-track">
                    <div class="prog-fill"
                         [style.width.%]="card.pct"
                         [class.fill--done]="card.stage === 'done'"
                         [class.fill--err]="card.stage === 'error'"
                         [class.fill--pulse]="card.stage !== 'done' && card.stage !== 'error'">
                    </div>
                  </div>
                  <span class="prog-pct">{{ card.pct }}%</span>
                </div>
              }

              <!-- Stage badge + message -->
              @if (card.stage !== 'idle') {
                <div class="stage-row">
                  <span class="stage-badge"
                        [class.sb--done]="card.stage === 'done'"
                        [class.sb--err]="card.stage === 'error'"
                        [class.sb--active]="card.stage !== 'done' && card.stage !== 'error'">
                    {{ stageLabel(card.stage) }}
                  </span>
                  <span class="stage-msg">{{ card.stageMsg }}</span>
                </div>
              }

              <!-- Stall warning -->
              @if (card.stallMsg) {
                <div class="stall-warn">
                  <span>{{ card.stallMsg }}</span>
                </div>
              }

              <!-- Error panel -->
              @if (card.err) {
                <div class="err-panel">
                  <div class="err-top">
                    <span class="err-code">{{ card.err.code }}</span>
                    @if (card.err.status) {
                      <span class="err-status">HTTP {{ card.err.status }}</span>
                    }
                  </div>
                  <div class="err-title">{{ card.err.title }}</div>
                  <div class="err-body">{{ card.err.body }}</div>
                  <div class="err-hint">💡 {{ card.err.hint }}</div>
                </div>
              }

              <!-- Success count (only shown for sync 200 response with known count) -->
              @if (card.stage === 'done' && card.count > 0) {
                <div class="success-count">✅ {{ card.count | number }} سجل محفوظ</div>
              }
              @if (card.stage === 'done' && card.count === 0) {
                <div class="success-count async-note">⏳ جارٍ المعالجة في الخلفية — اضغط "تشخيص الآن" بعد 90 ثانية</div>
              }

              <!-- Log toggle -->
              @if (card.log.length > 0) {
                <button class="log-toggle" (click)="toggleLog(i)">
                  {{ card.logOpen ? '▲' : '▼' }} سجل الأحداث
                  <span class="log-count">{{ card.log.length }}</span>
                </button>
                @if (card.logOpen) {
                  <div class="log-panel">
                    @for (entry of card.log; track $index) {
                      <div class="log-entry log-{{ entry.kind }}">
                        <span class="log-time">{{ entry.relSec }}</span>
                        <span class="log-msg">{{ entry.msg }}</span>
                      </div>
                    }
                  </div>
                }
              }

              <!-- Actions -->
              <div class="icard__actions">
                @if (card.stage === 'idle' || card.stage === 'done' || card.stage === 'error') {
                  <label class="btn-upload" [class.btn-retry]="card.stage === 'error'">
                    <input type="file" accept=".xls,.xlsx" hidden (change)="upload(i, $event)">
                    @if (card.stage === 'error')  { 🔄 إعادة المحاولة }
                    @else if (card.stage === 'done') { 📂 استيراد مرة أخرى }
                    @else { 📂 اختيار ملف }
                  </label>
                } @else {
                  <span class="uploading-lbl">
                    <span class="spinner"></span> جارٍ الاستيراد...
                  </span>
                }
                @if (card.stage !== 'idle') {
                  <button class="btn-reset" (click)="reset(i)" title="مسح">✕</button>
                }
              </div>

            </div>
          }
        </div>
      }
    </div>
  }

  <!-- Diagnosis Panel -->
  @if (isAdmin()) {
    <div class="diag-section">
      <div class="diag-header">
        <div class="ih-left">
          <span class="ih-icon">🔍</span>
          <h3>تشخيص البيانات</h3>
          <span class="badge-admin">Admin Only</span>
        </div>
        <button class="btn-diag" (click)="runDiagnosis()" [disabled]="diagLoading()">
          @if (diagLoading()) { <span class="spinner"></span> جارٍ الفحص... }
          @else { 🔍 تشخيص الآن }
        </button>
      </div>

      @if (diag()) {
        @if (diag().error) {
          <div class="diag-error">❌ {{ diag().error }}</div>
        } @else {
          <div class="diag-grid">

            <!-- Counts table -->
            <table class="diag-table">
              <thead>
                <tr><th>المجموعة</th><th>الفعلي</th><th>المتوقع</th><th>النسبة</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>مبيعات الفروع</td>
                  <td>{{ diag().v3_sale_transactions | number }}</td>
                  <td class="exp">~21,896</td>
                  <td [style.color]="diagColor(diag().v3_sale_transactions, 21896)">
                    {{ diagPct(diag().v3_sale_transactions, 21896) }}%
                  </td>
                </tr>
                <tr>
                  <td>مبيعات الموظفين</td>
                  <td>{{ diag().v3_employee_sale_transactions | number }}</td>
                  <td class="exp">~21,896</td>
                  <td [style.color]="diagColor(diag().v3_employee_sale_transactions, 21896)">
                    {{ diagPct(diag().v3_employee_sale_transactions, 21896) }}%
                  </td>
                </tr>
                <tr>
                  <td>المشتريات</td>
                  <td>{{ diag().v3_purchase_transactions | number }}</td>
                  <td class="exp">~3,868</td>
                  <td [style.color]="diagColor(diag().v3_purchase_transactions, 3868)">
                    {{ diagPct(diag().v3_purchase_transactions, 3868) }}%
                  </td>
                </tr>
                <tr>
                  <td>موطن الذهب</td>
                  <td>{{ diag().v3_mothan_transactions | number }}</td>
                  <td class="exp">~383</td>
                  <td [style.color]="diagColor(diag().v3_mothan_transactions, 383)">
                    {{ diagPct(diag().v3_mothan_transactions, 383) }}%
                  </td>
                </tr>
                @if (diag().sales_agg) {
                  <tr>
                    <td>إجمالي المبيعات (SAR)</td>
                    <td>{{ diag().sales_agg.totalSar | number:'1.0-0' }}</td>
                    <td class="exp">~267,200,000</td>
                    <td [style.color]="diagColor(diag().sales_agg.totalSar, 267200000)">
                      {{ diagPct(diag().sales_agg.totalSar, 267200000) }}%
                    </td>
                  </tr>
                  <tr>
                    <td>نطاق التاريخ</td>
                    <td colspan="2">{{ diag().sales_agg.minDate }} → {{ diag().sales_agg.maxDate }}</td>
                    <td class="exp">2026-01-01 → 2026-03-31</td>
                  </tr>
                }
                <tr>
                  <td>عدد الفروع الفريدة</td>
                  <td>{{ diag().unique_sale_branches }}</td>
                  <td class="exp">29</td>
                  <td [style.color]="diagColor(diag().unique_sale_branches, 29)">
                    {{ diagPct(diag().unique_sale_branches, 29) }}%
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Source files -->
            <div class="diag-files">
              <div class="diag-files-label">الملفات المُستوردة للمبيعات:</div>
              @for (f of diag().sale_sourceFiles; track f) {
                <div class="diag-file-item">📄 {{ f }}</div>
              }
              @if (!diag().sale_sourceFiles?.length) {
                <div class="diag-file-none">لا توجد بيانات مستوردة</div>
              }
            </div>

          </div>
        }
      }
    </div>
  }

  <!-- Mothan Dry-Run Analyzer -->
  @if (isAdmin()) {
      <div class="diag-section" style="margin-top:1rem">
        <div class="diag-header">
          <div class="ih-left">
            <span class="ih-icon">⚖️</span>
            <h3>تحليل ملف موطن الذهب (بدون حفظ)</h3>
            <span class="badge-admin">Admin Only</span>
          </div>
        </div>
        <div style="padding:0.75rem 1.25rem 1rem; display:flex; flex-direction:column; gap:0.75rem;">
          <label style="font-size:0.82rem; color:var(--mizan-text-muted)">
            ارفع ملف موطن الذهب لمعرفة عدد السجلات التي سيقبلها النظام قبل الاستيراد الفعلي
          </label>
          <input #mothanAnalyzeInput type="file" accept=".xls" style="display:none"
            (change)="runMothanAnalyze($event)" />
          <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
            <button class="btn-diag" (click)="mothanAnalyzeInput.click()" [disabled]="mothanAnalyzeLoading()">
              @if (mothanAnalyzeLoading()) { <span class="spinner"></span> جارٍ التحليل... }
              @else { 📂 اختر الملف وحلّله }
            </button>
            @if (mothanAnalysis()) {
              <span style="font-size:0.82rem; color:var(--mizan-text-muted)">
                {{ mothanAnalysis().filename }}
              </span>
            }
          </div>
          @if (mothanAnalysis()) {
            <div class="diag-grid">
              <table class="diag-table">
                <thead><tr><th>النتيجة</th><th>العدد</th></tr></thead>
                <tbody>
                  <tr><td>إجمالي صفوف الملف</td><td>{{ mothanAnalysis().totalRowsInSheet | number }}</td></tr>
                  <tr style="color:#22c55e"><td>✅ سيُقبل ويُحفظ</td><td><strong>{{ mothanAnalysis().accepted | number }}</strong></td></tr>
                  <tr style="color:#ef4444"><td>❌ مرفوض (كود فرع غير صالح)</td><td>{{ mothanAnalysis().rejectedBranch | number }}</td></tr>
                  <tr style="color:#ef4444"><td>❌ مرفوض (تاريخ فارغ)</td><td>{{ mothanAnalysis().rejectedNullDate | number }}</td></tr>
                  <tr><td>فروع فريدة</td><td>{{ mothanAnalysis().uniqueBranches }}</td></tr>
                </tbody>
              </table>
              @if (mothanAnalysis().rejectedRows?.length) {
                <div>
                  <div style="font-size:0.8rem; font-weight:700; color:#ef4444; margin-bottom:0.4rem">
                    أول {{ mothanAnalysis().rejectedRows.length }} صف مرفوض:
                  </div>
                  @for (r of mothanAnalysis().rejectedRows; track r.rowIndex) {
                    <div style="font-size:0.75rem; font-family:monospace; color:var(--mizan-text-muted); margin-bottom:0.2rem">
                      row {{ r.rowIndex }} [{{ r.reason }}] {{ r.detail }}
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    }

</div>
  `,
  styles: [`
    .cs-page { padding: 2rem; max-width: 880px; margin: 0 auto; }

    /* ─── Hero ─────────────────────────────────────────── */
    .cs-hero { text-align: center; padding: 2.5rem 1rem 2rem; }
    .cs-icon { font-size: 3.5rem; margin-bottom: .75rem; }
    .cs-title { font-size: 2.4rem; font-weight: 800; color: var(--mizan-gold); margin: 0 0 .4rem; letter-spacing: .05em; }
    .cs-sub  { font-size: 1rem; color: var(--mizan-text); margin: 0 0 .2rem; }
    .cs-ar   { font-size: .9rem; color: var(--mizan-text-muted); margin: 0 0 1.5rem; }
    .cs-features { display: flex; flex-wrap: wrap; gap: .6rem; justify-content: center; }
    .feature { background: rgba(201,168,76,.1); border: 1px solid rgba(201,168,76,.2); color: var(--mizan-gold); padding: .35rem .9rem; border-radius: 20px; font-size: .82rem; font-weight: 600; }

    /* ─── Import section wrapper ────────────────────────── */
    .import-section { margin-top: 2rem; background: var(--mizan-surface); border: 1px solid var(--mizan-border); border-radius: 14px; overflow: hidden; }
    .import-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; cursor: pointer; user-select: none; }
    .import-header:hover { background: rgba(255,255,255,.03); }
    .ih-left { display: flex; align-items: center; gap: .5rem; }
    .ih-icon { font-size: 1.1rem; }
    .import-header h3 { margin: 0; font-size: .92rem; font-weight: 700; }
    .badge-admin { font-size: .62rem; font-weight: 700; background: rgba(220,38,38,.12); color: #ef4444; border: 1px solid rgba(220,38,38,.2); padding: .1rem .4rem; border-radius: 4px; }
    .chevron { color: var(--mizan-text-muted); font-size: .72rem; }

    /* ─── Import grid ───────────────────────────────────── */
    .import-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 1rem; padding: 1rem 1.25rem 1.25rem; }

    /* ─── Import card ───────────────────────────────────── */
    .icard {
      background: var(--mizan-bg);
      border: 1.5px solid var(--mizan-border);
      border-radius: 12px;
      padding: .9rem;
      display: flex;
      flex-direction: column;
      gap: .55rem;
      transition: border-color .25s, box-shadow .25s;
    }
    .icard--active { border-color: rgba(201,168,76,.5); box-shadow: 0 0 0 3px rgba(201,168,76,.06); }
    .icard--done   { border-color: rgba(34,197,94,.45); box-shadow: 0 0 0 3px rgba(34,197,94,.05); }
    .icard--error  { border-color: rgba(239,68,68,.45); box-shadow: 0 0 0 3px rgba(239,68,68,.05); }

    /* Card header */
    .icard__head { display: flex; align-items: center; gap: .4rem; }
    .icard__icon { font-size: 1.4rem; flex-shrink: 0; }
    .icard__label { font-size: .83rem; font-weight: 700; color: var(--mizan-text); flex: 1; }
    .icard__timer { font-size: .75rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--mizan-gold); background: rgba(201,168,76,.1); padding: .15rem .45rem; border-radius: 6px; white-space: nowrap; flex-shrink: 0; }
    .timer--done { color: #22c55e; background: rgba(34,197,94,.1); }
    .timer--err  { color: #ef4444; background: rgba(239,68,68,.1); }

    /* File info */
    .file-info { display: flex; align-items: center; gap: .4rem; padding: .3rem .5rem; background: rgba(255,255,255,.03); border-radius: 6px; }
    .file-name { font-size: .72rem; color: var(--mizan-text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-size { font-size: .68rem; color: var(--mizan-text-muted); white-space: nowrap; flex-shrink: 0; }

    /* Progress bar */
    .prog-row { display: flex; align-items: center; gap: .5rem; }
    .prog-track { flex: 1; height: 7px; background: rgba(255,255,255,.08); border-radius: 99px; overflow: hidden; }
    .prog-fill {
      height: 100%; border-radius: 99px;
      background: linear-gradient(90deg, #b8942a, #c9a84c, #e2c97e);
      transition: width .35s ease;
    }
    .fill--done  { background: linear-gradient(90deg, #16a34a, #22c55e); }
    .fill--err   { background: linear-gradient(90deg, #dc2626, #ef4444); }
    .fill--pulse { animation: prog-pulse 1.8s ease-in-out infinite; }
    @keyframes prog-pulse {
      0%, 100% { filter: brightness(1); }
      50%       { filter: brightness(1.25); }
    }
    .prog-pct { font-size: .72rem; font-weight: 700; color: var(--mizan-text-muted); font-variant-numeric: tabular-nums; width: 32px; text-align: right; flex-shrink: 0; }

    /* Stage row */
    .stage-row { display: flex; align-items: flex-start; gap: .4rem; flex-wrap: wrap; }
    .stage-badge {
      font-size: .62rem; font-weight: 800; padding: .15rem .45rem; border-radius: 4px;
      white-space: nowrap; flex-shrink: 0; letter-spacing: .03em; text-transform: uppercase;
    }
    .sb--active { background: rgba(201,168,76,.15); color: var(--mizan-gold); border: 1px solid rgba(201,168,76,.25); }
    .sb--done   { background: rgba(34,197,94,.12);  color: #22c55e;           border: 1px solid rgba(34,197,94,.2); }
    .sb--err    { background: rgba(239,68,68,.12);  color: #ef4444;           border: 1px solid rgba(239,68,68,.2); }
    .stage-msg  { font-size: .76rem; color: var(--mizan-text-muted); line-height: 1.4; }

    /* Stall warning */
    .stall-warn {
      display: flex; align-items: flex-start; gap: .4rem;
      background: rgba(234,179,8,.08); border: 1px solid rgba(234,179,8,.2);
      border-radius: 6px; padding: .5rem .6rem;
      font-size: .74rem; color: #eab308; line-height: 1.4;
      animation: fadeIn .3s ease;
    }

    /* Error panel */
    .err-panel {
      background: rgba(239,68,68,.05); border: 1px solid rgba(239,68,68,.18);
      border-radius: 8px; padding: .65rem .75rem;
      display: flex; flex-direction: column; gap: .3rem;
      animation: fadeIn .25s ease;
    }
    .err-top   { display: flex; align-items: center; gap: .4rem; }
    .err-code  { font-size: .65rem; font-weight: 800; letter-spacing: .06em; background: rgba(239,68,68,.15); color: #ef4444; padding: .1rem .4rem; border-radius: 3px; }
    .err-status{ font-size: .65rem; color: #f87171; }
    .err-title { font-size: .78rem; font-weight: 700; color: #f87171; }
    .err-body  { font-size: .74rem; color: var(--mizan-text-muted); line-height: 1.4; }
    .err-hint  { font-size: .72rem; color: #fbbf24; background: rgba(251,191,36,.07); border-radius: 4px; padding: .3rem .45rem; line-height: 1.4; }

    /* Success count */
    .success-count { font-size: .82rem; font-weight: 700; color: #22c55e; text-align: center; padding: .3rem 0; }
    .async-note { color: #f59e0b; font-weight: 500; font-size: .76rem; }

    /* Log */
    .log-toggle {
      display: flex; align-items: center; gap: .3rem;
      background: none; border: 1px solid var(--mizan-border);
      color: var(--mizan-text-muted); font-size: .72rem;
      padding: .25rem .55rem; border-radius: 5px; cursor: pointer; width: 100%;
      transition: background .15s;
    }
    .log-toggle:hover { background: rgba(255,255,255,.04); }
    .log-count { margin-inline-start: auto; background: var(--mizan-border); border-radius: 99px; padding: .05rem .4rem; font-size: .65rem; }
    .log-panel {
      background: rgba(0,0,0,.25); border-radius: 6px; padding: .5rem;
      max-height: 140px; overflow-y: auto;
      display: flex; flex-direction: column; gap: .2rem;
    }
    .log-entry { display: flex; gap: .45rem; font-size: .69rem; line-height: 1.5; }
    .log-time  { color: rgba(201,168,76,.5); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
    .log-msg   { color: var(--mizan-text-muted); }
    .log-ok   .log-msg { color: #4ade80; }
    .log-err  .log-msg { color: #f87171; }
    .log-warn .log-msg { color: #fbbf24; }
    .log-info .log-msg { color: var(--mizan-text-muted); }

    /* Actions */
    .icard__actions { display: flex; align-items: center; gap: .5rem; margin-top: .1rem; }
    .btn-upload {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: .3rem;
      background: rgba(201,168,76,.1); border: 1px solid rgba(201,168,76,.25);
      color: var(--mizan-gold); padding: .38rem .7rem; border-radius: 7px;
      font-size: .76rem; font-weight: 600; cursor: pointer; transition: background .15s;
      white-space: nowrap;
    }
    .btn-upload:hover  { background: rgba(201,168,76,.2); }
    .btn-retry { background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.25); color: #f87171; }
    .btn-retry:hover   { background: rgba(239,68,68,.2); }
    .uploading-lbl { flex: 1; display: flex; align-items: center; justify-content: center; gap: .4rem; font-size: .76rem; color: var(--mizan-text-muted); }
    .btn-reset {
      background: none; border: 1px solid var(--mizan-border);
      color: var(--mizan-text-muted); width: 28px; height: 28px;
      border-radius: 6px; cursor: pointer; font-size: .8rem;
      display: flex; align-items: center; justify-content: center;
      transition: all .15s; flex-shrink: 0;
    }
    .btn-reset:hover { background: rgba(239,68,68,.1); color: #ef4444; border-color: rgba(239,68,68,.3); }

    /* Spinner */
    .spinner {
      display: inline-block; width: 12px; height: 12px;
      border: 2px solid rgba(201,168,76,.25);
      border-top-color: var(--mizan-gold);
      border-radius: 50%;
      animation: spin .7s linear infinite;
    }

    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes fadeIn  { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

    /* Responsive */
    @media (max-width: 600px) {
      .cs-page { padding: 1rem; }
      .import-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 400px) {
      .import-grid { grid-template-columns: 1fr; }
    }

    /* ─── Diagnosis section ─────────────────────────────────── */
    .diag-section {
      margin-top: 1.5rem;
      background: var(--mizan-surface);
      border: 1px solid var(--mizan-border);
      border-radius: 14px;
      overflow: hidden;
    }
    .diag-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 1rem 1.25rem;
    }
    .btn-diag {
      display: inline-flex; align-items: center; gap: .4rem;
      background: rgba(201,168,76,.1); border: 1px solid rgba(201,168,76,.28);
      color: var(--mizan-gold); padding: .4rem .9rem; border-radius: 7px;
      font-size: .8rem; font-weight: 600; cursor: pointer;
      transition: background .15s; font-family: inherit;
    }
    .btn-diag:hover:not(:disabled) { background: rgba(201,168,76,.2); }
    .btn-diag:disabled { opacity: .55; cursor: default; }
    .diag-error {
      margin: .75rem 1.25rem 1rem;
      background: rgba(239,68,68,.07); border: 1px solid rgba(239,68,68,.2);
      border-radius: 8px; padding: .65rem .9rem;
      color: #f87171; font-size: .82rem;
    }
    .diag-grid {
      padding: .75rem 1.25rem 1.25rem;
      display: grid; grid-template-columns: 1fr 280px; gap: 1rem;
    }
    .diag-table {
      width: 100%; border-collapse: collapse; font-size: .8rem;
    }
    .diag-table th {
      background: rgba(255,255,255,.04);
      color: var(--mizan-text-muted);
      padding: .45rem .65rem;
      text-align: right; font-weight: 600;
      border-bottom: 1px solid var(--mizan-border);
    }
    .diag-table td {
      padding: .4rem .65rem;
      border-bottom: 1px solid rgba(255,255,255,.04);
      color: var(--mizan-text);
    }
    .diag-table .exp { color: var(--mizan-text-muted); font-size: .75rem; }
    .diag-files {
      background: var(--mizan-bg); border-radius: 8px; padding: .75rem;
    }
    .diag-files-label {
      font-size: .75rem; font-weight: 600; color: var(--mizan-text-muted);
      margin-bottom: .5rem;
    }
    .diag-file-item {
      font-size: .72rem; color: var(--mizan-text); padding: .25rem 0;
      border-bottom: 1px solid rgba(255,255,255,.04);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .diag-file-none {
      font-size: .75rem; color: #ef4444; font-style: italic;
    }
    @media (max-width: 700px) {
      .diag-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class ComingSoonComponent implements OnDestroy {
  private auth = inject(AuthService);
  private http  = inject(HttpClient);

  expanded = signal(true);

  isAdmin = () => ['COMPANY_ADMIN', 'CEO', 'SUPER_ADMIN', 'HEAD_OF_SALES']
    .includes(this.auth.currentUserSignal()?.role ?? '');

  cards = signal<CardState[]>([
    blank('branch-sales',   'مبيعات الفروع',   '📈'),
    blank('employee-sales', 'مبيعات الموظفين', '👤'),
    blank('purchases',      'المشتريات',        '🛒'),
    blank('mothan',         'موطن الذهب',       '⚖️'),
  ]);

  private timerH  = new Map<string, ReturnType<typeof setInterval>>();
  private simH    = new Map<string, ReturnType<typeof setInterval>>();
  private pollH   = new Map<string, ReturnType<typeof setInterval>>();

  diagLoading = signal(false);
  diag        = signal<any>(null);

  mothanAnalyzeLoading = signal(false);
  mothanAnalysis       = signal<any>(null);

  ngOnDestroy() {
    this.timerH.forEach(h => clearInterval(h));
    this.simH.forEach(h => clearInterval(h));
    this.pollH.forEach(h => clearInterval(h));
  }

  toggleLog(idx: number) {
    this.cards.update(a => { const c = [...a]; c[idx] = { ...c[idx], logOpen: !c[idx].logOpen }; return c; });
  }

  reset(idx: number) {
    const type = this.cards()[idx].type;
    clearInterval(this.timerH.get(type));
    clearInterval(this.simH.get(type));
    clearInterval(this.pollH.get(type));
    this.cards.update(a => {
      const c = [...a];
      c[idx] = blank(c[idx].type, c[idx].label, c[idx].icon);
      return c;
    });
  }

  upload(idx: number, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;

    const cur = this.cards()[idx];
    if (cur.stage !== 'idle' && cur.stage !== 'done' && cur.stage !== 'error') return;

    clearInterval(this.timerH.get(cur.type));
    clearInterval(this.simH.get(cur.type));
    clearInterval(this.pollH.get(cur.type));

    const startedAt = Date.now();

    // Reset card → reading
    this.patch(idx, {
      ...blank(cur.type, cur.label, cur.icon),
      stage: 'reading', pct: 2,
      stageMsg: 'جارٍ قراءة الملف...',
      startedAt, fileName: file.name,
      fileSizeKb: Math.round(file.size / 1024),
    });
    this.log(idx, startedAt, `ملف: ${file.name} (${Math.round(file.size / 1024)} KB)`, 'info');

    // ── Elapsed timer (200 ms tick) ────────────────────────────────────────
    this.timerH.set(cur.type, setInterval(() => {
      const now  = Date.now();
      const s    = this.cards()[idx];
      if (s.stage === 'done' || s.stage === 'error') return;
      const svMs = s.serverWaitStart > 0 ? now - s.serverWaitStart : 0;
      this.patch(idx, { elapsedMs: now - startedAt, serverWaitMs: svMs });
    }, 200));

    setTimeout(() => {
      this.patch(idx, { stage: 'uploading', pct: 5, stageMsg: 'جارٍ رفع الملف إلى الخادم...' });
      this.log(idx, startedAt, 'بدأ رفع الملف', 'info');

      const fd  = new FormData();
      fd.append('files', file, file.name);
      const req = new HttpRequest('POST', `${environment.apiUrl}/v3/import/${cur.type}`, fd, {
        reportProgress: true,
      });

      // ── Status polling — used for all v3 import types ──────────────────
      const startPoll = (importId: string) => {
        this.patch(idx, {
          stage: 'parsing', pct: 30,
          stageMsg: 'جارٍ التحليل...',
          serverWaitStart: Date.now(),
        });
        this.log(idx, startedAt, `اكتمل رفع الملف — بدأ المعالجة (${importId.slice(0, 8)}...)`, 'info');

        const statusMsgs: Record<string, { stage: Stage; msg: string; pct: number }> = {
          parsing:          { stage: 'parsing',   msg: 'جاري التحليل...',                pct: 35 },
          deleting:         { stage: 'parsing',   msg: 'جاري حذف البيانات القديمة...',   pct: 50 },
          saving:           { stage: 'inserting', msg: '',                               pct: 65 },
          computing_rates:  { stage: 'rates',     msg: 'جاري حساب معدلات الشراء...',     pct: 90 },
          complete:         { stage: 'done',      msg: '',                               pct: 100 },
          error:            { stage: 'error',     msg: '',                               pct: 0 },
        };

        this.pollH.set(cur.type, setInterval(() => {
          this.http.get<any>(`${environment.apiUrl}/v3/import/status/${importId}`).subscribe({
            next: res => {
              const s = res?.data;
              if (!s) return;
              const elapsed = Date.now() - startedAt;
              this.patch(idx, { elapsedMs: elapsed });

              if (s.status === 'saving') {
                const saved = s.saved ?? 0;
                const total = s.total ?? 0;
                const pct   = total > 0 ? Math.round(65 + (saved / total) * 20) : 70;
                this.patch(idx, {
                  stage: 'inserting', pct,
                  stageMsg: `جاري الحفظ... ${saved.toLocaleString('ar')} / ${total.toLocaleString('ar')}`,
                });
                return;
              }

              const mapped = statusMsgs[s.status];
              if (!mapped) return;

              if (s.status === 'complete') {
                clearInterval(this.pollH.get(cur.type));
                clearInterval(this.timerH.get(cur.type));
                const saved = s.saved ?? 0;
                this.patch(idx, {
                  stage: 'done', pct: 100, elapsedMs: elapsed,
                  stageMsg: `✅ تم — ${saved.toLocaleString('ar')} سجل`, count: saved, stallMsg: '',
                });
                this.log(idx, startedAt, `✅ ${saved.toLocaleString('ar')} سجل — ${this.fmtTime(elapsed)}`, 'ok');
              } else if (s.status === 'error') {
                clearInterval(this.pollH.get(cur.type));
                clearInterval(this.timerH.get(cur.type));
                this.patch(idx, {
                  stage: 'error', elapsedMs: elapsed,
                  stageMsg: `❌ ${s.error ?? 'خطأ غير معروف'}`, stallMsg: '',
                  err: { code: 'SERVER', title: 'فشل الاستيراد', body: s.error ?? '', hint: 'تحقق من سجلات الخادم', status: 500 },
                });
                this.log(idx, startedAt, `❌ ${s.error}`, 'err');
              } else {
                this.patch(idx, { stage: mapped.stage, pct: mapped.pct, stageMsg: mapped.msg });
              }
            },
            error: () => { /* ignore transient poll errors */ }
          });
        }, 3000));
      };

      this.http.request(req).subscribe({
        next: httpEv => {
          if (httpEv.type === HttpEventType.UploadProgress) {
            const { loaded, total } = httpEv;
            if (total) this.patch(idx, { pct: Math.round(5 + (loaded / total) * 25) });
          }

          if (httpEv.type === HttpEventType.Response) {
            clearInterval(this.simH.get(cur.type));
            const resp    = httpEv as HttpResponse<any>;
            const elapsed = Date.now() - startedAt;

            if (resp.status === 202) {
              const importId = resp.body?.data?.importId;
              if (importId) {
                startPoll(importId);
              } else {
                // No importId in response — mark done immediately
                clearInterval(this.timerH.get(cur.type));
                this.patch(idx, { stage: 'done', pct: 100, elapsedMs: elapsed,
                  stageMsg: 'رُفع الملف — الخادم يعالج البيانات في الخلفية', stallMsg: '' });
                this.log(idx, startedAt, '✅ مقبول — انتظر 90 ثانية ثم اضغط "تشخيص البيانات"', 'ok');
              }
            } else {
              clearInterval(this.timerH.get(cur.type));
              const count = resp.body?.data?.count ?? resp.body?.count ?? 0;
              this.patch(idx, { stage: 'done', pct: 100, elapsedMs: elapsed,
                stageMsg: 'تم الاستيراد بنجاح', count, stallMsg: '' });
              this.log(idx, startedAt, `✅ ${count.toLocaleString('ar')} سجل — ${this.fmtTime(elapsed)}`, 'ok');
            }
          }
        },
        error: err => {
          clearInterval(this.simH.get(cur.type));
          clearInterval(this.timerH.get(cur.type));
          clearInterval(this.pollH.get(cur.type));
          const e = this.classify(err);
          const elapsed = Date.now() - startedAt;
          this.patch(idx, { stage: 'error', elapsedMs: elapsed, stageMsg: e.title, err: e, stallMsg: '' });
          this.log(idx, startedAt, `❌ ${e.code}${e.status ? ' ' + e.status : ''} — ${e.body}`, 'err');
        },
      });
    }, 280);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private patch(idx: number, p: Partial<CardState>) {
    this.cards.update(a => { const c = [...a]; c[idx] = { ...c[idx], ...p }; return c; });
  }

  private log(idx: number, startedAt: number, msg: string, kind: LogEntry['kind']) {
    const relSec = `+${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    this.cards.update(a => {
      const c = [...a];
      c[idx] = { ...c[idx], log: [...c[idx].log, { relSec, msg, kind }] };
      return c;
    });
  }

  private classify(err: any): ErrDetail {
    const st  = err?.status as number;
    const srv = err?.error?.message || err?.error?.error || err?.error?.detail || '';
    if (st === 0)   return { code: 'NETWORK',     title: 'خطأ في الاتصال',                  body: 'تعذر الوصول إلى الخادم. تحقق من اتصالك بالإنترنت.', status: st, hint: 'تحقق من الاتصال ثم أعد المحاولة.' };
    if (st === 401) return { code: 'AUTH',         title: 'انتهت صلاحية الجلسة',             body: 'يرجى إعادة تسجيل الدخول.', status: st, hint: 'سجّل الخروج ثم الدخول مرة أخرى.' };
    if (st === 403) return { code: 'PERMISSION',   title: 'غير مصرح لك بهذه العملية',        body: 'ليس لحسابك صلاحية هذا الاستيراد.', status: st, hint: 'تواصل مع مدير النظام.' };
    if (st === 400) return { code: 'VALIDATION',   title: 'بيانات الملف غير صالحة',          body: srv || 'الملف لا يطابق الصيغة المتوقعة.', status: st, hint: 'تأكد أن الملف .xls وأنه من النوع الصحيح لهذه الخانة.' };
    if (st === 413) return { code: 'FILE_TOO_LARGE', title: 'حجم الملف أكبر مما يسمح به', body: 'تجاوز الملف الحد الأقصى للخادم.', status: st, hint: 'قسّم الملف لأجزاء أصغر وأعد الرفع.' };
    if (st === 415) return { code: 'FORMAT',        title: 'صيغة الملف غير مدعومة',          body: 'يُقبل فقط .xls (Excel 97-2003).', status: st, hint: 'احفظ الملف بصيغة .xls من Excel ثم أعد الرفع.' };
    if (st >= 500)  return { code: 'SERVER',        title: 'خطأ داخلي في الخادم',             body: srv || `رمز الخطأ ${st} — فشلت المعالجة.`, status: st, hint: 'أعد المحاولة. إذا تكرر تحقق من سجلات الخادم.' };
    return           { code: 'UNKNOWN',             title: 'خطأ غير معروف',                   body: srv || `رمز: ${st ?? 'N/A'}`, status: st, hint: 'أعد المحاولة أو تواصل مع الدعم الفني.' };
  }

  runDiagnosis(): void {
    this.diagLoading.set(true);
    this.diag.set(null);
    this.http.get<any>(`${environment.apiUrl}/v3/debug/full-diagnosis`).subscribe({
      next: res => { this.diag.set(res.diagnosis); this.diagLoading.set(false); },
      error: err => { this.diag.set({ error: err?.error?.message ?? 'فشل الاتصال' }); this.diagLoading.set(false); },
    });
  }

  runMothanAnalyze(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.mothanAnalyzeLoading.set(true);
    this.mothanAnalysis.set(null);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<any>(`${environment.apiUrl}/v3/debug/analyze-mothan`, fd).subscribe({
      next: res => {
        this.mothanAnalysis.set({ ...res.analysis, filename: file.name });
        this.mothanAnalyzeLoading.set(false);
      },
      error: err => {
        this.mothanAnalysis.set({ filename: file.name, error: err?.error?.message ?? 'فشل التحليل' });
        this.mothanAnalyzeLoading.set(false);
      },
    });
    input.value = '';
  }

  diagPct(actual: number, expected: number): number {
    return expected > 0 ? Math.round((actual / expected) * 100) : 0;
  }

  diagColor(actual: number, expected: number): string {
    const pct = this.diagPct(actual, expected);
    if (pct >= 95) return '#22c55e';
    if (pct >= 50) return '#f59e0b';
    return '#ef4444';
  }

  fmtTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  stageLabel(stage: Stage): string {
    return ({ idle: '', reading: 'قراءة', uploading: 'رفع', parsing: 'تحليل', inserting: 'حفظ', rates: 'أسعار', done: 'اكتمل', error: 'خطأ' } as Record<Stage, string>)[stage] ?? stage;
  }
}
