import {
  Component, OnDestroy,
  inject, signal, effect,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { V3AIService } from '../services/v3-ai.service';
import { V3DateRangeService } from '../services/v3-date-range.service';

interface AIFeature {
  key: string;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-v3-ai',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; direction: rtl; }

    /* ── Page header ── */
    .ai-header {
      display: flex; align-items: center; gap: 1rem; margin-bottom: 1.75rem;
    }
    .ai-orb-icon {
      font-size: 2.2rem; line-height: 1;
      filter: drop-shadow(0 0 12px rgba(99,179,255,0.55));
      animation: orbFloat 3s ease-in-out infinite;
    }
    @keyframes orbFloat {
      0%,100% { transform: translateY(0); }
      50%      { transform: translateY(-4px); }
    }
    .ai-title-group { flex: 1; }
    .ai-title {
      font-size: 1.35rem; font-weight: 800; margin: 0;
      background: linear-gradient(135deg, #63b3ff 0%, #c9a84c 60%, #f0e68c 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .ai-subtitle {
      font-size: 0.78rem; color: var(--mizan-text-muted); margin-top: 0.2rem;
    }
    .ai-badge {
      font-size: 0.65rem; font-weight: 800; letter-spacing: 0.1em;
      padding: 0.22rem 0.7rem; border-radius: 20px;
      background: linear-gradient(135deg, #1e3a5f, #2a4a7f);
      border: 1px solid rgba(99,179,255,0.35);
      color: #93c5fd;
      animation: badgePulse 2.5s ease-in-out infinite;
    }
    @keyframes badgePulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(99,179,255,0.25); }
      50%      { box-shadow: 0 0 0 4px rgba(99,179,255,0); }
    }

    /* ── Feature selector ── */
    .feature-tabs {
      display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;
    }
    .feature-tab {
      display: flex; align-items: center; gap: 0.45rem;
      padding: 0.5rem 1rem; border-radius: 24px;
      background: rgba(255,255,255,0.04); border: 1px solid var(--mizan-border);
      color: var(--mizan-text-muted); font-size: 0.82rem; font-weight: 600;
      cursor: pointer; font-family: inherit; white-space: nowrap;
      transition: all 0.2s;
    }
    .feature-tab:hover {
      background: rgba(99,179,255,0.08); border-color: rgba(99,179,255,0.3);
      color: #93c5fd;
    }
    .feature-tab.active {
      background: linear-gradient(135deg, rgba(30,58,95,0.7), rgba(42,74,127,0.5));
      border-color: rgba(99,179,255,0.5); color: #93c5fd;
      box-shadow: 0 0 0 3px rgba(99,179,255,0.1), inset 0 0 12px rgba(99,179,255,0.06);
    }
    .feature-icon { font-size: 1rem; }

    /* ── Loading state ── */
    .ai-loading {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 1rem; padding: 4rem 2rem;
    }
    .ai-loading-orb {
      width: 72px; height: 72px; border-radius: 50%;
      background: linear-gradient(135deg, #1e3a5f, #2a4a7f);
      border: 2px solid rgba(99,179,255,0.35);
      display: flex; align-items: center; justify-content: center;
      font-size: 2rem;
      animation: loadPulse 1.5s ease-in-out infinite;
      box-shadow: 0 0 24px rgba(99,179,255,0.2);
    }
    @keyframes loadPulse {
      0%,100% { transform: scale(1); box-shadow: 0 0 24px rgba(99,179,255,0.2); }
      50%      { transform: scale(1.06); box-shadow: 0 0 36px rgba(99,179,255,0.4); }
    }
    .ai-loading-label {
      font-size: 0.9rem; color: var(--mizan-text-muted); font-weight: 600;
    }
    .ai-dots { display: flex; gap: 0.35rem; }
    .ai-dots span {
      width: 7px; height: 7px; border-radius: 50%;
      background: rgba(99,179,255,0.5);
      animation: dotBounce 1.4s ease-in-out infinite;
    }
    .ai-dots span:nth-child(2) { animation-delay: 0.2s; }
    .ai-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dotBounce {
      0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
      40%          { transform: scale(1); opacity: 1; }
    }

    /* ── Error state ── */
    .ai-error {
      background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
      border-radius: 12px; padding: 1.5rem; text-align: center; color: #ef4444;
    }
    .ai-error-icon { font-size: 2rem; margin-bottom: 0.5rem; }
    .ai-error-retry {
      margin-top: 1rem; padding: 0.45rem 1.25rem;
      background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3);
      color: #ef4444; border-radius: 20px; cursor: pointer; font-family: inherit;
      font-size: 0.82rem; font-weight: 600;
    }
    .ai-error-retry:hover { background: rgba(239,68,68,0.2); }

    /* ── Response card base ── */
    .ai-card {
      background: var(--mizan-surface);
      border: 1px solid rgba(99,179,255,0.15);
      border-radius: 14px; overflow: hidden; margin-bottom: 1.25rem;
      position: relative;
    }
    .ai-card::before {
      content: ''; position: absolute; inset: 0; border-radius: 14px; padding: 1px;
      background: linear-gradient(135deg, rgba(99,179,255,0.3), rgba(201,168,76,0.15), rgba(99,179,255,0.1));
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
    }
    .ai-card-inner { padding: 1.25rem 1.5rem; }
    .ai-card-header {
      display: flex; align-items: center; gap: 0.6rem;
      margin-bottom: 1rem; padding-bottom: 0.75rem;
      border-bottom: 1px solid rgba(99,179,255,0.1);
    }
    .ai-card-icon { font-size: 1.2rem; }
    .ai-card-title {
      font-size: 0.9rem; font-weight: 700;
      background: linear-gradient(135deg, #93c5fd, #c9a84c);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }

    /* ── Overview text ── */
    .ai-overview {
      font-size: 0.92rem; line-height: 1.85; color: var(--mizan-text);
      padding: 0.85rem 1.1rem;
      background: linear-gradient(135deg, rgba(99,179,255,0.05), rgba(201,168,76,0.04));
      border-right: 3px solid rgba(99,179,255,0.4); border-radius: 0 10px 10px 0;
      margin-bottom: 1.25rem;
    }

    /* ── Headline / score row ── */
    .headline-row {
      display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;
    }
    .ai-headline {
      flex: 1; font-size: 1.05rem; font-weight: 700; color: var(--mizan-gold);
      line-height: 1.45;
    }
    .score-badge {
      flex-shrink: 0; display: flex; flex-direction: column; align-items: center;
      background: rgba(255,255,255,0.04); border: 1px solid var(--mizan-border);
      border-radius: 12px; padding: 0.6rem 1rem;
    }
    .score-num {
      font-size: 1.8rem; font-weight: 900; line-height: 1;
      background: linear-gradient(135deg, #93c5fd, #c9a84c);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .score-label { font-size: 0.65rem; color: var(--mizan-text-muted); margin-top: 0.15rem; }

    /* ── Sentiment ── */
    .sentiment-bar {
      display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem;
      font-size: 0.8rem; color: var(--mizan-text-muted);
    }
    .sentiment-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      box-shadow: 0 0 8px currentColor;
    }
    .sent-positive { background: var(--mizan-green); color: var(--mizan-green); }
    .sent-neutral  { background: #f59e0b; color: #f59e0b; }
    .sent-negative { background: var(--mizan-danger); color: var(--mizan-danger); }

    /* ── Bullet lists ── */
    .bullet-section { margin-bottom: 1.1rem; }
    .bullet-title {
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em;
      text-transform: uppercase; color: var(--mizan-text-muted);
      margin-bottom: 0.55rem;
    }
    .bullet-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .bullet-item {
      display: flex; align-items: flex-start; gap: 0.5rem;
      font-size: 0.85rem; line-height: 1.55; color: var(--mizan-text);
    }
    .bullet-dot { flex-shrink: 0; margin-top: 0.45rem; width: 6px; height: 6px; border-radius: 50%; }
    .dot-green  { background: var(--mizan-green); }
    .dot-red    { background: var(--mizan-danger); }
    .dot-gold   { background: var(--mizan-gold); }
    .dot-blue   { background: #93c5fd; }

    /* ── People cards (employees / branches) ── */
    .people-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 0.75rem; margin-bottom: 1rem;
    }
    .people-card {
      background: rgba(255,255,255,0.03); border: 1px solid var(--mizan-border);
      border-radius: 10px; padding: 0.85rem 1rem;
    }
    .people-card.star-card  { border-color: rgba(201,168,76,0.3); background: rgba(201,168,76,0.05); }
    .people-card.warn-card  { border-color: rgba(239,68,68,0.25); background: rgba(239,68,68,0.04); }
    .people-card.green-card { border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.04); }
    .people-name { font-size: 0.88rem; font-weight: 700; color: var(--mizan-text); margin-bottom: 0.25rem; }
    .people-sub  { font-size: 0.75rem; color: var(--mizan-text-muted); margin-bottom: 0.4rem; }
    .people-note { font-size: 0.8rem; line-height: 1.5; color: var(--mizan-text); }
    .action-badge {
      display: inline-block; font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.55rem;
      border-radius: 12px; margin-bottom: 0.35rem;
    }
    .action-push     { background: rgba(34,197,94,0.15); color: var(--mizan-green); }
    .action-reduce   { background: rgba(239,68,68,0.12); color: var(--mizan-danger); }
    .action-maintain { background: rgba(245,158,11,0.12); color: #f59e0b; }

    /* ── Karat card ── */
    .karat-best-row {
      display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1.1rem;
      background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.25);
      border-radius: 10px; margin-bottom: 1rem;
    }
    .karat-best-label { font-size: 2rem; font-weight: 900; color: var(--mizan-gold); }
    .karat-best-reason { font-size: 0.83rem; line-height: 1.55; color: var(--mizan-text); }

    /* ── Trend direction ── */
    .trend-pills { display: flex; gap: 0.65rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .trend-pill {
      display: flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem;
      border-radius: 20px; font-size: 0.82rem; font-weight: 600;
      background: rgba(255,255,255,0.04); border: 1px solid var(--mizan-border);
    }
    .trend-pill-label { font-size: 0.68rem; color: var(--mizan-text-muted); display: block; }
    .trend-pill-value { font-size: 0.85rem; font-weight: 700; color: var(--mizan-text); }
    .trend-up   { border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.06); }
    .trend-down { border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.06); }
    .trend-stable { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.06); }
    .dir-icon { font-size: 1.1rem; }

    /* ── Regional insight box ── */
    .insight-box {
      font-size: 0.85rem; line-height: 1.75; color: var(--mizan-text);
      padding: 0.75rem 1rem;
      background: rgba(99,179,255,0.04); border-right: 3px solid rgba(99,179,255,0.3);
      border-radius: 0 8px 8px 0; margin-bottom: 1rem;
    }

    /* ── Powered by footer ── */
    .ai-powered {
      display: flex; align-items: center; justify-content: center; gap: 0.4rem;
      font-size: 0.7rem; color: rgba(255,255,255,0.2); padding: 0.5rem 0;
    }
  `],
  template: `
    <!-- Header -->
    <div class="ai-header">
      <div class="ai-orb-icon">🤖</div>
      <div class="ai-title-group">
        <h2 class="ai-title">الذكاء الاصطناعي — MIZAN AI</h2>
        <div class="ai-subtitle">تحليل بيانات الذهب باستخدام Gemini 2.0 Flash</div>
      </div>
      <span class="ai-badge">GEMINI 2.0</span>
    </div>

    <!-- Feature tabs -->
    <div class="feature-tabs">
      @for (f of features; track f.key) {
        <button
          class="feature-tab"
          [class.active]="activeFeature() === f.key"
          (click)="selectFeature(f.key)"
        >
          <span class="feature-icon">{{ f.icon }}</span>
          <span>{{ f.label }}</span>
        </button>
      }
    </div>

    <!-- Loading -->
    @if (loading()) {
      <div class="ai-loading">
        <div class="ai-loading-orb">🤖</div>
        <div class="ai-loading-label">الذكاء الاصطناعي يحلل البيانات…</div>
        <div class="ai-dots"><span></span><span></span><span></span></div>
      </div>
    }

    <!-- Error -->
    @if (error() && !loading()) {
      <div class="ai-error">
        <div class="ai-error-icon">⚠️</div>
        <div>{{ error() }}</div>
        <button class="ai-error-retry" (click)="retry()">إعادة المحاولة</button>
      </div>
    }

    <!-- Results -->
    @if (result() && !loading() && !error()) {

      <!-- ── EXECUTIVE ── -->
      @if (activeFeature() === 'executive') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🎯</span>
              <span class="ai-card-title">الملخص التنفيذي</span>
            </div>
            <!-- Headline + Score -->
            <div class="headline-row">
              <div class="ai-headline">{{ result()?.headline }}</div>
              @if (result()?.performanceScore != null) {
                <div class="score-badge">
                  <div class="score-num">{{ result()?.performanceScore }}</div>
                  <div class="score-label">/ 10</div>
                </div>
              }
            </div>
            <!-- Sentiment -->
            @if (result()?.sentiment) {
              <div class="sentiment-bar">
                <span class="sentiment-dot"
                  [class.sent-positive]="result()?.sentiment === 'positive'"
                  [class.sent-neutral]="result()?.sentiment === 'neutral'"
                  [class.sent-negative]="result()?.sentiment === 'negative'">
                </span>
                {{ sentimentLabel(result()?.sentiment) }}
              </div>
            }
            <!-- Overview -->
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Strengths -->
            @if (result()?.strengths?.length) {
              <div class="bullet-section">
                <div class="bullet-title">✅ نقاط القوة</div>
                <ul class="bullet-list">
                  @for (s of result()?.strengths; track $index) {
                    <li class="bullet-item">
                      <span class="bullet-dot dot-green"></span>{{ s }}
                    </li>
                  }
                </ul>
              </div>
            }
            <!-- Risks -->
            @if (result()?.risks?.length) {
              <div class="bullet-section">
                <div class="bullet-title">⚠️ المخاطر</div>
                <ul class="bullet-list">
                  @for (r of result()?.risks; track $index) {
                    <li class="bullet-item">
                      <span class="bullet-dot dot-red"></span>{{ r }}
                    </li>
                  }
                </ul>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item">
                      <span class="bullet-dot dot-gold"></span>{{ r }}
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── BRANCHES ── -->
      @if (activeFeature() === 'branches') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🏪</span>
              <span class="ai-card-title">تحليل أداء الفروع</span>
            </div>
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Top Performers -->
            @if (result()?.topPerformers?.length) {
              <div class="bullet-section">
                <div class="bullet-title">🏆 الفروع الرائدة</div>
                <div class="people-grid">
                  @for (p of result()?.topPerformers; track $index) {
                    <div class="people-card green-card">
                      <div class="people-name">{{ p.name }}</div>
                      <div class="people-sub">{{ p.region }}</div>
                      <div class="people-note">{{ p.reason }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Underperformers -->
            @if (result()?.underperformers?.length) {
              <div class="bullet-section">
                <div class="bullet-title">📉 الفروع التي تحتاج دعماً</div>
                <div class="people-grid">
                  @for (u of result()?.underperformers; track $index) {
                    <div class="people-card warn-card">
                      <div class="people-name">{{ u.name }}</div>
                      <div class="people-sub">{{ u.region }}</div>
                      <div class="people-note"><strong>المشكلة:</strong> {{ u.issue }}</div>
                      <div class="people-note" style="margin-top:0.3rem"><strong>الإجراء:</strong> {{ u.action }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Regional -->
            @if (result()?.regionalInsights) {
              <div class="bullet-section">
                <div class="bullet-title">🗺️ رؤى إقليمية</div>
                <div class="insight-box">{{ result()?.regionalInsights }}</div>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item"><span class="bullet-dot dot-gold"></span>{{ r }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── EMPLOYEES ── -->
      @if (activeFeature() === 'employees') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">👥</span>
              <span class="ai-card-title">تحليل أداء الموظفين</span>
            </div>
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Stars -->
            @if (result()?.stars?.length) {
              <div class="bullet-section">
                <div class="bullet-title">⭐ نجوم الفريق</div>
                <div class="people-grid">
                  @for (s of result()?.stars; track $index) {
                    <div class="people-card star-card">
                      <div class="people-name">{{ s.name }}</div>
                      <div class="people-sub">{{ s.branch }}</div>
                      <div class="people-note">{{ s.highlight }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Needs Support -->
            @if (result()?.needsSupport?.length) {
              <div class="bullet-section">
                <div class="bullet-title">🤝 يحتاجون دعماً</div>
                <div class="people-grid">
                  @for (n of result()?.needsSupport; track $index) {
                    <div class="people-card warn-card">
                      <div class="people-name">{{ n.name }}</div>
                      <div class="people-sub">{{ n.branch }}</div>
                      <div class="people-note">{{ n.suggestion }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Team Health -->
            @if (result()?.teamHealth) {
              <div class="bullet-section">
                <div class="bullet-title">💪 صحة الفريق</div>
                <div class="insight-box">{{ result()?.teamHealth }}</div>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item"><span class="bullet-dot dot-gold"></span>{{ r }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── KARAT ── -->
      @if (activeFeature() === 'karat') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">⚖️</span>
              <span class="ai-card-title">تحليل ربحية الأعيار</span>
            </div>
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Best karat -->
            @if (result()?.bestKarat) {
              <div class="karat-best-row">
                <div class="karat-best-label">{{ result()?.bestKarat }}</div>
                <div class="karat-best-reason">{{ result()?.bestKaratReason }}</div>
              </div>
            }
            <!-- Karat insights -->
            @if (result()?.karatInsights?.length) {
              <div class="bullet-section">
                <div class="bullet-title">📊 رؤى تفصيلية لكل عيار</div>
                <div class="people-grid">
                  @for (k of result()?.karatInsights; track $index) {
                    <div class="people-card"
                      [class.green-card]="k.action === 'push'"
                      [class.warn-card]="k.action === 'reduce'"
                      [class.star-card]="k.action === 'maintain'">
                      <div class="people-name">{{ k.karat }}</div>
                      <span class="action-badge"
                        [class.action-push]="k.action === 'push'"
                        [class.action-reduce]="k.action === 'reduce'"
                        [class.action-maintain]="k.action === 'maintain'">
                        {{ actionLabel(k.action) }}
                      </span>
                      <div class="people-note">{{ k.insight }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item"><span class="bullet-dot dot-gold"></span>{{ r }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── DAILY TREND ── -->
      @if (activeFeature() === 'daily-trend') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">📈</span>
              <span class="ai-card-title">تحليل الاتجاه اليومي</span>
            </div>
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Trend pills -->
            <div class="trend-pills">
              @if (result()?.trendDirection) {
                <div class="trend-pill"
                  [class.trend-up]="result()?.trendDirection === 'up'"
                  [class.trend-down]="result()?.trendDirection === 'down'"
                  [class.trend-stable]="result()?.trendDirection === 'stable'">
                  <span class="dir-icon">{{ trendIcon(result()?.trendDirection) }}</span>
                  <div>
                    <span class="trend-pill-label">الاتجاه العام</span>
                    <span class="trend-pill-value">{{ trendLabel(result()?.trendDirection) }}</span>
                  </div>
                </div>
              }
              @if (result()?.peakPeriod) {
                <div class="trend-pill">
                  <span class="dir-icon">🔥</span>
                  <div>
                    <span class="trend-pill-label">فترة الذروة</span>
                    <span class="trend-pill-value">{{ result()?.peakPeriod }}</span>
                  </div>
                </div>
              }
              @if (result()?.slowPeriod) {
                <div class="trend-pill">
                  <span class="dir-icon">🌙</span>
                  <div>
                    <span class="trend-pill-label">الفترة الهادئة</span>
                    <span class="trend-pill-value">{{ result()?.slowPeriod }}</span>
                  </div>
                </div>
              }
            </div>
            <!-- Pattern -->
            @if (result()?.pattern) {
              <div class="bullet-section">
                <div class="bullet-title">🔍 النمط العام</div>
                <div class="insight-box">{{ result()?.pattern }}</div>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item"><span class="bullet-dot dot-gold"></span>{{ r }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <div class="ai-powered">
        <span>⚡</span>
        <span>Powered by Google Gemini 2.0 Flash · MIZAN AI Engine</span>
      </div>
    }
  `
})
export class V3AIComponent implements OnDestroy {
  private aiSvc     = inject(V3AIService);
  private dateRange = inject(V3DateRangeService);
  private cdr       = inject(ChangeDetectorRef);

  activeFeature = signal('executive');
  loading       = signal(false);
  error         = signal<string | null>(null);
  result        = signal<any>(null);

  private sub: Subscription | null = null;

  features: AIFeature[] = [
    { key: 'executive',   label: 'الملخص التنفيذي', icon: '🎯', description: 'نظرة شاملة على الأداء الكلي' },
    { key: 'branches',    label: 'الفروع',           icon: '🏪', description: 'تحليل أداء جميع الفروع' },
    { key: 'employees',   label: 'الموظفون',         icon: '👥', description: 'رؤى حول أداء الفريق' },
    { key: 'karat',       label: 'العيار',            icon: '⚖️', description: 'ربحية الأعيار وتوصيات المخزون' },
    { key: 'daily-trend', label: 'الاتجاه اليومي',  icon: '📈', description: 'أنماط المبيعات اليومية' },
  ];

  constructor() {
    effect(() => {
      const from    = this.dateRange.from();
      const to      = this.dateRange.to();
      const feature = this.activeFeature();
      if (from && to) this.load(feature, from, to);
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  selectFeature(key: string): void {
    if (this.activeFeature() === key) return;
    this.activeFeature.set(key);
    // effect will fire automatically
  }

  retry(): void {
    this.error.set(null);
    this.load(this.activeFeature(), this.dateRange.from(), this.dateRange.to());
  }

  private load(feature: string, from: string, to: string): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    this.cdr.markForCheck();

    this.sub = this.aiSvc.getInsights(feature, from, to).subscribe({
      next: (data) => {
        if (data?.error) {
          this.error.set(data.overview ?? 'حدث خطأ في الذكاء الاصطناعي');
          this.result.set(null);
        } else {
          this.result.set(data);
          this.error.set(null);
        }
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error.set('تعذّر الاتصال بخدمة الذكاء الاصطناعي: ' + (err?.message ?? ''));
        this.loading.set(false);
        this.cdr.markForCheck();
      }
    });
  }

  // ── Template helpers ─────────────────────────────────────────────────────────

  sentimentLabel(s: string): string {
    return s === 'positive' ? 'أداء إيجابي' : s === 'negative' ? 'أداء سلبي' : 'أداء محايد';
  }

  actionLabel(a: string): string {
    return a === 'push' ? '↑ زيادة' : a === 'reduce' ? '↓ تقليل' : '= استمرار';
  }

  trendIcon(d: string): string {
    return d === 'up' ? '↗️' : d === 'down' ? '↘️' : '➡️';
  }

  trendLabel(d: string): string {
    return d === 'up' ? 'تصاعدي' : d === 'down' ? 'تنازلي' : 'مستقر';
  }
}
