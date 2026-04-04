import {
  Component, OnInit, signal, computed,
  ChangeDetectionStrategy, inject
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { V3AIService } from '../services/v3-ai.service';

const FEATURE_LABELS: Record<string, string> = {
  'executive':            'الملخص التنفيذي',
  'branches':             'الفروع',
  'employees':            'الموظفون',
  'karat':                'العيار',
  'daily-trend':          'الاتجاه اليومي',
  'employee-advisor':     'مستشار الموظفين',
  'transfer-optimizer':   'محسّن النقل',
  'branch-strategy':      'استراتيجية الفروع',
  'anomaly-detection':    'كشف الشذوذات',
  'purchase-intelligence':'ذكاء المشتريات',
  'risk-assessment':      'تقييم المخاطر',
  'executive-briefing':   'الإحاطة التنفيذية',
  'smart-actions':        'الإجراءات الذكية',
  'chat':                 'ميزان AI محادثة',
};

@Component({
  selector: 'app-v3-ai-usage',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="usage-wrap" dir="rtl">

  <!-- Header -->
  <div class="usage-header">
    <div class="usage-title-row">
      <div>
        <h1 class="usage-title">📊 لوحة استخدام الذكاء الاصطناعي</h1>
        <p class="usage-sub">تتبع طلبات AI اليومية، التكاليف المقدّرة، وأداء ميزات الذكاء الاصطناعي</p>
      </div>
      <button class="refresh-btn" (click)="load()" [disabled]="loading()">
        @if (loading()) { <span class="spin">↻</span> } @else { ↻ تحديث }
      </button>
    </div>
  </div>

  @if (loading()) {
    <div class="skeleton-grid">
      @for (_ of [1,2,3,4]; track $index) {
        <div class="skeleton-card"></div>
      }
    </div>
  }

  @if (!loading() && today()) {
    <!-- Today KPI cards -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-icon">🔢</div>
        <div class="kpi-value">{{ today().totalRequests }}</div>
        <div class="kpi-label">إجمالي الطلبات اليوم</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">⚡</div>
        <div class="kpi-value">{{ today().apiCalls }}</div>
        <div class="kpi-label">طلبات Gemini الفعلية</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">💨</div>
        <div class="kpi-value">{{ today().cacheHits }}</div>
        <div class="kpi-label">ردود من الكاش</div>
      </div>
      <div class="kpi-card" [class.kpi-card--warn]="costPct() > 80" [class.kpi-card--danger]="costPct() >= 100">
        <div class="kpi-icon">💰</div>
        <div class="kpi-value">{{ formatCost(today().totalCostUsd) }}</div>
        <div class="kpi-label">التكلفة اليوم (USD)</div>
      </div>
    </div>

    <!-- Budget progress -->
    <div class="budget-section">
      <div class="budget-header">
        <span class="budget-label">استخدام الميزانية اليومية</span>
        <span class="budget-nums">
          {{ formatCost(today().totalCostUsd) }} / {{ formatCost(dailyBudget()) }} USD
          <span class="budget-pct" [class.pct-warn]="costPct() > 80" [class.pct-danger]="costPct() >= 100">
            ({{ costPct() }}%)
          </span>
        </span>
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill"
          [style.width.%]="min100(costPct())"
          [class.bar-warn]="costPct() > 80"
          [class.bar-danger]="costPct() >= 100">
        </div>
      </div>
      @if (costPct() >= 100) {
        <div class="budget-exceeded-msg">
          ⚠️ تم استنفاد الميزانية اليومية — لن تُقبل طلبات AI إضافية حتى إعادة التعيين.
          <span class="reset-note">إعادة التعيين: منتصف الليل UTC</span>
        </div>
      }
      <div class="budget-reset-note">تُعاد الميزانية يومياً عند منتصف الليل (UTC)</div>
    </div>

    <!-- Per-feature breakdown -->
    @if (featureBreakdown().length > 0) {
      <div class="section-card">
        <h3 class="section-title">توزيع الاستخدام حسب الميزة</h3>
        <div class="feature-grid">
          @for (f of featureBreakdown(); track f.key) {
            <div class="feature-chip">
              <span class="feature-name">{{ f.label }}</span>
              <span class="feature-count">{{ f.count }} طلب</span>
              <span class="feature-cost">{{ formatCost(f.cost) }} $</span>
            </div>
          }
        </div>
      </div>
    }

    <!-- Token stats -->
    <div class="section-card">
      <h3 class="section-title">إحصاءات الرموز اللغوية (Tokens)</h3>
      <div class="token-grid">
        <div class="token-stat">
          <span class="token-val">{{ (today().inputTokens ?? 0).toLocaleString('ar') }}</span>
          <span class="token-lbl">رموز الإدخال</span>
        </div>
        <div class="token-stat">
          <span class="token-val">{{ (today().outputTokens ?? 0).toLocaleString('ar') }}</span>
          <span class="token-lbl">رموز الإخراج</span>
        </div>
        <div class="token-stat">
          <span class="token-val">{{ today().avgLatencyMs ?? 0 }} ms</span>
          <span class="token-lbl">متوسط وقت الاستجابة</span>
        </div>
        <div class="token-stat">
          <span class="token-val">{{ today().errors ?? 0 }}</span>
          <span class="token-lbl">طلبات فاشلة</span>
        </div>
      </div>
    </div>
  }

  <!-- Recent logs -->
  <div class="section-card">
    <div class="logs-header">
      <h3 class="section-title">سجل الطلبات (آخر 30 يوم)</h3>
      <div class="date-range-row">
        <input type="date" class="date-in" [value]="fromDate()" (change)="fromDate.set(getVal($event))">
        <span class="date-sep">←</span>
        <input type="date" class="date-in" [value]="toDate()" (change)="toDate.set(getVal($event))">
        <button class="small-btn" (click)="loadLogs()">تطبيق</button>
      </div>
    </div>

    @if (logs().length === 0 && !loading()) {
      <div class="empty-logs">لا توجد بيانات للفترة المحددة</div>
    } @else {
      <div class="table-wrap">
        <table class="usage-table">
          <thead>
            <tr>
              <th>الميزة</th>
              <th>المستخدم</th>
              <th>كاش</th>
              <th>رموز الإدخال</th>
              <th>رموز الإخراج</th>
              <th>التكلفة (USD)</th>
              <th>الوقت (ms)</th>
              <th>نجح</th>
              <th>الوقت</th>
            </tr>
          </thead>
          <tbody>
            @for (log of logs(); track log.id) {
              <tr [class.row-error]="!log.success" [class.row-cached]="log.cached">
                <td>{{ featureLabel(log.feature) }}</td>
                <td class="email-cell">{{ log.userEmail }}</td>
                <td>
                  @if (log.cached) { <span class="badge badge-cache">كاش</span> }
                  @else { <span class="badge badge-api">API</span> }
                </td>
                <td>{{ log.inputTokens?.toLocaleString('ar') ?? '—' }}</td>
                <td>{{ log.outputTokens?.toLocaleString('ar') ?? '—' }}</td>
                <td>{{ formatCost(log.costUsd) }}</td>
                <td>{{ log.latencyMs }}</td>
                <td>
                  @if (log.success) { <span class="status-ok">✓</span> }
                  @else { <span class="status-err">✗</span> }
                </td>
                <td class="time-cell">{{ log.createdAt | date:'dd/MM HH:mm' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </div>

</div>
  `,
  styles: [`
    .usage-wrap { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }

    .usage-header { background: linear-gradient(135deg, rgba(15,45,31,.9) 0%, rgba(10,30,20,.95) 100%);
      border: 1px solid rgba(201,168,76,.15); border-radius: 16px; padding: 1.5rem 2rem; }
    .usage-title-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .usage-title { font-size: 1.4rem; font-weight: 700; color: #c9a84c; margin: 0; }
    .usage-sub { color: rgba(232,228,220,.55); font-size: .85rem; margin: .3rem 0 0; }

    .refresh-btn { background: rgba(201,168,76,.12); border: 1px solid rgba(201,168,76,.25); color: #c9a84c;
      padding: .5rem 1.2rem; border-radius: 8px; cursor: pointer; font-size: .85rem; transition: all 200ms; }
    .refresh-btn:hover:not(:disabled) { background: rgba(201,168,76,.2); }
    .spin { display: inline-block; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    .kpi-card { background: rgba(15,45,31,.6); border: 1px solid rgba(201,168,76,.12); border-radius: 14px;
      padding: 1.25rem; text-align: center; transition: border-color 200ms; }
    .kpi-card:hover { border-color: rgba(201,168,76,.3); }
    .kpi-card--warn { border-color: rgba(251,191,36,.3); }
    .kpi-card--danger { border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.06); }
    .kpi-icon { font-size: 1.5rem; margin-bottom: .4rem; }
    .kpi-value { font-size: 1.8rem; font-weight: 700; color: #c9a84c; }
    .kpi-label { font-size: .78rem; color: rgba(232,228,220,.5); margin-top: .25rem; }

    .budget-section { background: rgba(15,45,31,.5); border: 1px solid rgba(201,168,76,.12);
      border-radius: 14px; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: .75rem; }
    .budget-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .budget-label { font-weight: 600; color: rgba(232,228,220,.8); font-size: .9rem; }
    .budget-nums { font-size: .85rem; color: rgba(232,228,220,.55); }
    .budget-pct { font-weight: 700; }
    .pct-warn { color: #fbbf24; } .pct-danger { color: #ef4444; }
    .budget-bar-track { height: 10px; background: rgba(255,255,255,.06); border-radius: 99px; overflow: hidden; }
    .budget-bar-fill { height: 100%; background: linear-gradient(90deg, #c9a84c, #e3c76a);
      border-radius: 99px; transition: width 600ms ease; }
    .bar-warn { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
    .bar-danger { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .budget-exceeded-msg { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3);
      border-radius: 8px; padding: .65rem 1rem; color: #fca5a5; font-size: .84rem; }
    .reset-note { float: left; color: rgba(232,228,220,.4); font-size: .78rem; }
    .budget-reset-note { color: rgba(232,228,220,.35); font-size: .77rem; }

    .section-card { background: rgba(15,45,31,.5); border: 1px solid rgba(201,168,76,.12);
      border-radius: 14px; padding: 1.25rem 1.5rem; }
    .section-title { font-size: 1rem; font-weight: 600; color: #c9a84c; margin: 0 0 1rem; }

    .feature-grid { display: flex; flex-wrap: wrap; gap: .6rem; }
    .feature-chip { display: flex; align-items: center; gap: .5rem; background: rgba(201,168,76,.07);
      border: 1px solid rgba(201,168,76,.15); border-radius: 8px; padding: .45rem .85rem; }
    .feature-name { font-size: .82rem; color: rgba(232,228,220,.75); }
    .feature-count { font-size: .78rem; font-weight: 700; color: #c9a84c; }
    .feature-cost { font-size: .75rem; color: rgba(232,228,220,.4); }

    .token-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; }
    .token-stat { text-align: center; }
    .token-val { display: block; font-size: 1.3rem; font-weight: 700; color: #e3c76a; }
    .token-lbl { font-size: .77rem; color: rgba(232,228,220,.45); margin-top: .2rem; }

    .logs-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .date-range-row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .date-in { background: rgba(255,255,255,.05); border: 1px solid rgba(201,168,76,.2);
      color: rgba(232,228,220,.8); border-radius: 6px; padding: .35rem .65rem; font-size: .8rem; }
    .date-sep { color: rgba(232,228,220,.3); }
    .small-btn { background: rgba(201,168,76,.12); border: 1px solid rgba(201,168,76,.25);
      color: #c9a84c; padding: .35rem .9rem; border-radius: 6px; cursor: pointer; font-size: .8rem; }
    .empty-logs { text-align: center; color: rgba(232,228,220,.35); padding: 2rem; font-size: .9rem; }

    .table-wrap { overflow-x: auto; }
    .usage-table { width: 100%; border-collapse: collapse; font-size: .8rem; }
    .usage-table th { background: rgba(201,168,76,.08); color: rgba(232,228,220,.6);
      font-weight: 600; padding: .6rem .75rem; text-align: right; white-space: nowrap;
      border-bottom: 1px solid rgba(201,168,76,.12); }
    .usage-table td { padding: .55rem .75rem; border-bottom: 1px solid rgba(255,255,255,.04);
      color: rgba(232,228,220,.75); vertical-align: middle; }
    .row-error td { background: rgba(239,68,68,.04); }
    .row-cached td { opacity: .7; }
    .email-cell { font-size: .74rem; color: rgba(232,228,220,.45); max-width: 160px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .time-cell { font-size: .74rem; color: rgba(232,228,220,.4); white-space: nowrap; }
    .badge { display: inline-block; padding: .15rem .5rem; border-radius: 99px; font-size: .7rem; font-weight: 700; }
    .badge-cache { background: rgba(147,51,234,.15); color: #c084fc; }
    .badge-api { background: rgba(59,130,246,.15); color: #93c5fd; }
    .status-ok { color: #4ade80; font-weight: 700; }
    .status-err { color: #f87171; font-weight: 700; }

    .skeleton-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    .skeleton-card { height: 120px; background: rgba(201,168,76,.04); border-radius: 14px;
      animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity:.4; } 50% { opacity:.8; } }
  `]
})
export class V3AIUsageComponent implements OnInit {
  private aiService = inject(V3AIService);

  loading   = signal(false);
  today     = signal<any>(null);
  logs      = signal<any[]>([]);
  fromDate  = signal(new Date(Date.now() - 29*864e5).toISOString().slice(0,10));
  toDate    = signal(new Date().toISOString().slice(0,10));

  dailyBudget = signal(1.0); // default; updated if tenant exposes budget in stats
  costPct = computed(() => {
    const t = this.today();
    if (!t || !this.dailyBudget()) return 0;
    return Math.round((t.totalCostUsd / this.dailyBudget()) * 10000) / 100;
  });

  featureBreakdown = computed(() => {
    const t = this.today();
    if (!t?.byFeature) return [];
    const cost = t.costByFeature ?? {};
    return Object.entries(t.byFeature as Record<string,number>)
      .map(([key, count]) => ({ key, label: FEATURE_LABELS[key] ?? key, count, cost: cost[key] ?? 0 }))
      .sort((a,b) => b.count - a.count);
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.aiService.getUsageToday().subscribe({
      next: d => { this.today.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.loadLogs();
  }

  loadLogs() {
    this.aiService.getUsageLogs(this.fromDate(), this.toDate()).subscribe({
      next: d => this.logs.set(d),
      error: () => {}
    });
  }

  formatCost(v: number) { return v != null ? `$${v.toFixed(4)}` : '$0.0000'; }
  featureLabel(key: string) { return FEATURE_LABELS[key] ?? key; }
  min100(v: number) { return Math.min(v, 100); }
  getVal(e: Event) { return (e.target as HTMLInputElement).value; }
}
