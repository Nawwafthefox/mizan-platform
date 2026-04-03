import {
  Component, OnDestroy,
  inject, signal, effect, ViewChild, ElementRef,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Chart, ChartConfiguration,
  LineController, LineElement, PointElement,
  BarController, BarElement,
  ScatterController,
  CategoryScale, LinearScale, Tooltip, Legend, Filler
} from 'chart.js';
import { V3DashboardService } from '../services/v3-dashboard.service';
import { V3DateRangeService } from '../services/v3-date-range.service';
import { fmtCompact, barDataLabels } from '../../../core/chart-config';

Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  ScatterController,
  CategoryScale, LinearScale, Tooltip, Legend, Filler
);

const REGION_COLORS: Record<string, string> = {
  'الرياض':     '#c9a84c',
  'جدة':        '#3b82f6',
  'مكة المكرمة':'#8b5cf6',
  'المدينة':    '#10b981',
  'الدمام':     '#f59e0b',
  'الشرقية':    '#ef4444',
  'أبها':       '#06b6d4',
  'تبوك':       '#ec4899',
};
function regionColor(region: string): string {
  return REGION_COLORS[region] ?? '#9ca3af';
}

@Component({
  selector: 'app-v3-premium',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; }

    .page-header { margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
    .page-title { font-size: 1.4rem; font-weight: 700; color: var(--mizan-gold); margin: 0; }
    .premium-label {
      font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em;
      padding: 0.2rem 0.65rem; border-radius: 20px;
      background: linear-gradient(135deg, #c9a84c, #f0e68c);
      color: #1a1208;
    }

    /* 2-col grid */
    .premium-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }
    @media (max-width: 900px) {
      .premium-grid { grid-template-columns: 1fr; }
    }
    .card-full { grid-column: 1 / -1; }

    /* Premium card */
    .p-card {
      background: var(--mizan-surface);
      border-radius: 14px;
      overflow: hidden;
      position: relative;
      border: 1px solid transparent;
      background-clip: padding-box;
    }
    .p-card::before {
      content: '';
      position: absolute; inset: 0;
      border-radius: 14px;
      padding: 1px;
      background: linear-gradient(135deg, rgba(201,168,76,0.45), rgba(240,230,140,0.15), rgba(201,168,76,0.2));
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude;
      pointer-events: none;
    }
    .p-card-inner { padding: 1.25rem 1.5rem; }

    .p-card-header {
      display: flex; align-items: center; gap: 0.6rem;
      margin-bottom: 1.1rem; border-bottom: 1px solid var(--mizan-border); padding-bottom: 0.85rem;
    }
    .p-card-icon { font-size: 1.25rem; }
    .p-card-title {
      font-size: 0.95rem; font-weight: 700;
      background: linear-gradient(135deg, #c9a84c, #f0e68c);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Chart container */
    .chart-wrap { position: relative; }
    .chart-wrap-sm  { height: 180px; }
    .chart-wrap-md  { height: 250px; }
    .chart-wrap-lg  { height: 300px; }
    .chart-wrap canvas { width: 100% !important; }

    /* Big KPI number */
    .big-kpi { font-size: 2.5rem; font-weight: 800; color: var(--mizan-gold); line-height: 1; }
    .big-kpi-unit { font-size: 0.85rem; color: var(--mizan-text-muted); margin-right: 0.25rem; }
    .kpi-row { display: flex; align-items: flex-end; gap: 0.75rem; margin-bottom: 0.75rem; }
    .change-badge {
      font-size: 0.8rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 12px;
      display: inline-flex; align-items: center; gap: 0.2rem;
    }
    .badge-up   { background: rgba(34,197,94,0.12); color: var(--mizan-green); }
    .badge-down { background: rgba(239,68,68,0.1);  color: var(--mizan-danger); }
    .prev-text { font-size: 0.78rem; color: var(--mizan-text-muted); }

    /* Mini KPI grid (executive summary) */
    .mini-kpi-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem;
    }
    .mini-kpi { padding: 0.75rem; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid var(--mizan-border); }
    .mini-kpi-label { font-size: 0.7rem; color: var(--mizan-text-muted); margin-bottom: 0.2rem; }
    .mini-kpi-val { font-size: 1.1rem; font-weight: 700; color: var(--mizan-text); }
    .mini-kpi-val.gold { color: var(--mizan-gold); }

    /* Summary text box */
    .summary-text-box {
      background: linear-gradient(135deg, rgba(201,168,76,0.08), rgba(240,230,140,0.04));
      border: 1px solid rgba(201,168,76,0.25);
      border-radius: 10px; padding: 1rem 1.25rem;
      color: var(--mizan-text); font-size: 0.88rem; line-height: 1.8;
    }

    /* Generic table */
    .p-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .p-table th {
      padding: 0.6rem 0.8rem; text-align: right;
      color: var(--mizan-text-muted); font-weight: 600; font-size: 0.73rem;
      background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--mizan-border);
    }
    .p-table td {
      padding: 0.6rem 0.8rem; text-align: right;
      border-bottom: 1px solid rgba(255,255,255,0.03); color: var(--mizan-text);
    }
    .p-table tbody tr:hover { background: rgba(255,255,255,0.02); }
    .p-table tbody tr:last-child td { border-bottom: none; }

    /* Risk/status badges */
    .risk-badge { font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.55rem; border-radius: 12px; }
    .risk-critical { background: rgba(239,68,68,0.12); color: var(--mizan-danger); }
    .risk-warning  { background: rgba(245,158,11,0.12); color: #f59e0b; }
    .risk-low      { background: rgba(59,130,246,0.12); color: #3b82f6; }
    .risk-none     { background: rgba(34,197,94,0.1);   color: var(--mizan-green); }

    /* Break-even progress */
    .be-row { margin-bottom: 0.65rem; }
    .be-meta { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--mizan-text-muted); margin-bottom: 0.3rem; }
    .be-track { height: 6px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; }
    .be-fill { height: 100%; border-radius: 3px; }
    .be-ok   { background: linear-gradient(90deg, var(--mizan-green), #4ade80); }
    .be-bad  { background: linear-gradient(90deg, var(--mizan-danger), #f87171); }
    .be-surplus { font-size: 0.7rem; font-weight: 700; }
    .surplus-pos { color: var(--mizan-green); }
    .surplus-neg { color: var(--mizan-danger); }

    /* Quadrant labels */
    .quad-labels {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;
      font-size: 0.72rem; color: var(--mizan-text-muted); margin-bottom: 0.5rem;
      text-align: center;
    }
    .quad-label { padding: 0.3rem; background: rgba(255,255,255,0.04); border-radius: 6px; }

    /* Spread annotation */
    .spread-annotation {
      font-size: 0.78rem; color: var(--mizan-text-muted);
      background: rgba(201,168,76,0.07); border-right: 3px solid var(--mizan-gold);
      padding: 0.5rem 0.75rem; border-radius: 0 8px 8px 0; margin-top: 0.75rem;
    }
    .spread-big { font-size: 1.6rem; font-weight: 800; color: var(--mizan-gold); }

    /* Karat table below chart */
    .karat-best {
      box-shadow: 0 0 12px rgba(201,168,76,0.35);
      background: rgba(201,168,76,0.06) !important;
    }

    /* Gold exposure net KPI */
    .net-exposure-row {
      display: flex; align-items: center; gap: 1rem;
      padding: 0.75rem 1rem;
      background: rgba(201,168,76,0.06);
      border: 1px solid rgba(201,168,76,0.2);
      border-radius: 10px; margin-bottom: 1rem;
    }
    .net-exposure-label { font-size: 0.8rem; color: var(--mizan-text-muted); }
    .net-exposure-val { font-size: 1.5rem; font-weight: 800; color: var(--mizan-gold); }

    /* Period selector */
    .period-btns { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .period-btn {
      background: rgba(255,255,255,0.04); border: 1px solid var(--mizan-border);
      border-radius: 16px; color: var(--mizan-text-muted);
      padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 500;
      cursor: pointer; white-space: nowrap; font-family: inherit;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    }
    .period-btn:hover { background: rgba(201,168,76,0.1); color: var(--mizan-gold); border-color: rgba(201,168,76,0.3); }
    .period-btn.active { background: rgba(201,168,76,0.15); color: var(--mizan-gold); border-color: rgba(201,168,76,0.5); }

    /* Season best/worst */
    .season-summary { display: flex; gap: 1rem; margin-top: 0.75rem; }
    .season-box { flex: 1; padding: 0.65rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--mizan-border); }
    .season-box-label { font-size: 0.7rem; color: var(--mizan-text-muted); margin-bottom: 0.25rem; }
    .season-box-val { font-size: 0.95rem; font-weight: 700; }
    .season-box-val.best { color: var(--mizan-gold); }
    .season-box-val.worst { color: var(--mizan-danger); }

    /* Chart insight text */
    .chart-insight {
      margin-top: 0.85rem;
      font-size: 0.9rem;
      color: rgba(232,228,220,0.65);
      line-height: 1.75;
      padding: 0.7rem 1rem;
      background: rgba(201,168,76,0.05);
      border-right: 3px solid rgba(201,168,76,0.35);
      border-radius: 0 8px 8px 0;
    }

    /* State */
    .state-box { padding: 3rem; text-align: center; color: var(--mizan-text-muted); }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid rgba(201,168,76,0.2); border-top-color: var(--mizan-gold);
      border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-box {
      background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
      color: #ef4444; border-radius: 10px; padding: 1rem 1.5rem; margin-bottom: 1rem; font-size: 0.9rem;
    }
    .td-mono { font-variant-numeric: tabular-nums; }
    .td-gold { color: var(--mizan-gold); font-weight: 600; }
  `],
  template: `
    <div class="page-header">
      <h2 class="page-title">التحليلات المتقدمة</h2>
      <span class="premium-label">PREMIUM</span>
    </div>

    @if (error()) {
      <div class="error-box">{{ error() }}</div>
    }

    @if (loading()) {
      <div class="state-box"><div class="spinner"></div><div>جاري تحميل البيانات المتقدمة...</div></div>
    } @else if (data()) {
      <div class="premium-grid">

        <!-- Card 1: Revenue Efficiency -->
        <div class="p-card">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">💎</span>
              <span class="p-card-title">كفاءة الإيرادات</span>
            </div>
            <div class="kpi-row">
              <div class="big-kpi">
                {{ fmtRate(data()?.revenueEfficiency?.current) }}
                <span class="big-kpi-unit">ر/ج</span>
              </div>
              @if ((data()?.revenueEfficiency?.changePct ?? 0) >= 0) {
                <span class="change-badge badge-up">↑ {{ fmtRate(data()?.revenueEfficiency?.changePct) }}%</span>
              } @else {
                <span class="change-badge badge-down">↓ {{ fmtRate(data()?.revenueEfficiency?.changePct) }}%</span>
              }
            </div>
            <div class="prev-text">الفترة السابقة: {{ fmtRate(data()?.revenueEfficiency?.previous) }} ر/ج</div>
            <div class="chart-wrap chart-wrap-sm" style="margin-top:0.75rem">
              <canvas #revEffChart></canvas>
            </div>
            <div class="chart-insight">
              يوضح هذا المنحنى كم ريال تحققه الشركة لكل جرام مباع يومياً. ارتفاع المنحنى يعني تحسّناً في كفاءة التسعير، وانخفاضه يشير إلى ضغط على الهوامش. ابحث عن الأيام التي يرتفع فيها المعدل لمعرفة متى تكون ظروف السوق أكثر ملاءمة.
            </div>
          </div>
        </div>

        <!-- Card 2: Branch Matrix (scatter) -->
        <div class="p-card">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">📊</span>
              <span class="p-card-title">مصفوفة الفروع</span>
            </div>
            <div class="quad-labels">
              <div class="quad-label">❓ علامة استفهام</div>
              <div class="quad-label">⭐ نجمة</div>
              <div class="quad-label">🐕 ضعيف</div>
              <div class="quad-label">🐄 بقرة نقدية</div>
            </div>
            <div class="chart-wrap chart-wrap-md">
              <canvas #matrixChart></canvas>
            </div>
            <div class="chart-insight">
              كل نقطة تمثل فرعاً — المحور الأفقي يعكس حجم المبيعات بالريال والمحور الرأسي يعكس هامش المعدل. الفروع في الزاوية اليمنى العليا (نجوم ⭐) تجمع بين مبيعات عالية وهامش ممتاز وهي الأفضل أداءً. الزاوية اليسرى السفلية (ضعيف 🐕) تحتاج دعماً أو إعادة توجيه.
            </div>
          </div>
        </div>

        <!-- Card 3: Karat Profitability -->
        <div class="p-card">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">⚖️</span>
              <span class="p-card-title">ربحية العيار</span>
            </div>
            <div class="chart-wrap chart-wrap-md">
              <canvas #karatChart></canvas>
            </div>
            <div class="chart-insight">
              يقارن سعر البيع بسعر الشراء لكل عيار — العيار الذي تكون فيه الفجوة بين العمودين أوسع يحقق أعلى هامش ربح بالجرام وهو الأجدر بالتركيز عليه. العيار ذو الفجوة الضيقة يستوجب مراجعة التسعير أو الشراء.
            </div>
            <div style="overflow-x:auto;margin-top:0.75rem">
              <table class="p-table">
                <thead>
                  <tr>
                    <th>العيار</th>
                    <th>هامش/جرام</th>
                    <th>% من المبيعات</th>
                  </tr>
                </thead>
                <tbody>
                  @for (k of data()?.karatProfitability ?? []; track k.karat) {
                    <tr [class.karat-best]="isBestKarat(k)">
                      <td class="td-gold">{{ k.karat }}K</td>
                      <td class="td-mono">{{ fmtRate(k.marginPerGram) }} ر/ج</td>
                      <td class="td-mono">{{ fmtRate(k.pctOfSales) }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Card 4: Purchase Intelligence -->
        <div class="p-card">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">📈</span>
              <span class="p-card-title">ذكاء الشراء</span>
            </div>
            <div class="kpi-row">
              <div class="big-kpi">
                {{ fmtRate(data()?.purchaseTiming?.spread) }}
                <span class="big-kpi-unit">ر/ج</span>
              </div>
              <span style="font-size:0.8rem;color:var(--mizan-text-muted)">السبريد الحالي</span>
            </div>
            <div class="chart-wrap chart-wrap-md">
              <canvas #purchChart></canvas>
            </div>
            <div class="chart-insight">
              الخط الذهبي هو سعر البيع اليومي والخط الأخضر هو متوسط سعر الشراء — المساحة المظللة بينهما هي هامشك الفعلي (السبريد). كلما اتسعت هذه المساحة، كانت قراراتك الشرائية أكثر ربحاً. انخفاض سعر البيع إلى ما دون سعر الشراء يعني خسارة محققة.
            </div>
            <div class="spread-annotation">
              spread أوسع = ربحية أعلى — السبريد الحالي:
              <strong>{{ fmtRate(data()?.purchaseTiming?.spread) }}</strong> ر/ج
            </div>
          </div>
        </div>

        <!-- Card 5: Return Risk -->
        <div class="p-card">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">🚨</span>
              <span class="p-card-title">مخاطر المرتجعات</span>
            </div>
            <div style="overflow-x:auto">
              <table class="p-table">
                <thead>
                  <tr>
                    <th>الفرع</th>
                    <th>المرتجعات</th>
                    <th>%</th>
                    <th>مستوى الخطر</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of data()?.returnRisk ?? []; track r.branchCode) {
                    <tr>
                      <td>{{ r.branchName }}</td>
                      <td class="td-mono">{{ fmt(r.totalReturns) }}</td>
                      <td class="td-mono">{{ fmtRate(r.returnPct) }}%</td>
                      <td>
                        <span class="risk-badge" [ngClass]="'risk-' + r.riskLevel">
                          {{ riskLabel(r.riskLevel) }}
                        </span>
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--mizan-text-muted)">لا توجد مرتجعات</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Card 6: Gold Exposure -->
        <div class="p-card">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">💰</span>
              <span class="p-card-title">الانكشاف الذهبي</span>
            </div>
            <div class="net-exposure-row">
              <div>
                <div class="net-exposure-label">صافي الانكشاف الإجمالي</div>
                <div class="net-exposure-val">{{ fmtWt(data()?.goldExposure?.netExposureWt) }} جرام</div>
              </div>
              <div style="margin-right:auto;text-align:left;font-size:0.75rem;color:var(--mizan-text-muted)">
                <div>مبيعات: {{ fmtWt(data()?.goldExposure?.totalSalesWt) }} ج</div>
                <div>مشتريات: {{ fmtWt(data()?.goldExposure?.totalPurchWt) }} ج</div>
              </div>
            </div>
            <div class="chart-wrap chart-wrap-md">
              <canvas #exposureChart></canvas>
            </div>
            <div class="chart-insight">
              يعرض وزن الذهب المباع مقابل المشترى لكل فرع بالجرام — الشريط الذهبي للمبيعات والشريط الأخضر للمشتريات. الفرع الذي يبيع أكثر مما يشتري يحقق صافي انكشاف إيجابي ويُعدّ مُصفِّياً للمخزون. انعكاس النسبة قد يشير إلى تراكم مخزون يستوجب التحرك.
            </div>
          </div>
        </div>

        <!-- Card 7: Seasonal Patterns -->
        <div class="p-card card-full">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">📅</span>
              <span class="p-card-title">الأنماط الموسمية</span>
            </div>
            <div class="period-btns">
              @for (p of periodOptions; track p.value) {
                <button class="period-btn" [class.active]="seasonPeriod() === p.value" (click)="changePeriod(p.value)">
                  {{ p.label }}
                </button>
              }
            </div>
            <div class="chart-wrap chart-wrap-lg">
              <canvas #seasonChart></canvas>
            </div>
            <div class="chart-insight">
              يوضح اتجاه المبيعات عبر الزمن وفق الفترة المختارة — الذرى تكشف مواسم الازدهار والقيعان تكشف فترات الركود. استخدم أزرار الفترة أعلاه لتغيير المنظور الزمني: "هذا الأسبوع" للتفاصيل اليومية، و"آخر 5 سنوات" لرؤية الصورة الكاملة وتحديد الأنماط الموسمية الدورية.
            </div>
            <div class="season-summary">
              <div class="season-box">
                <div class="season-box-label">أفضل يوم</div>
                <div class="season-box-val best">{{ bestDay() }}</div>
              </div>
              <div class="season-box">
                <div class="season-box-label">أقل يوم</div>
                <div class="season-box-val worst">{{ worstDay() }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Card 8: Break-Even -->
        <div class="p-card">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">⚡</span>
              <span class="p-card-title">نقطة التعادل</span>
            </div>
            @for (be of data()?.breakEven ?? []; track be.branchCode) {
              <div class="be-row">
                <div class="be-meta">
                  <span>{{ be.branchName }}</span>
                  <span class="be-surplus" [ngClass]="be.surplusWeightG >= 0 ? 'surplus-pos' : 'surplus-neg'">
                    {{ be.surplusWeightG >= 0 ? '+' : '' }}{{ fmtRate(be.surplusWeightG) }}ج
                  </span>
                </div>
                <div class="be-track">
                  <div class="be-fill" [ngClass]="be.actualWeightG >= be.breakEvenWeightG ? 'be-ok' : 'be-bad'"
                       [style.width.%]="beProgress(be)">
                  </div>
                </div>
              </div>
            } @empty {
              <div style="text-align:center;padding:2rem;color:var(--mizan-text-muted)">لا توجد بيانات</div>
            }
          </div>
        </div>

        <!-- Card 9: Top Performers -->
        <div class="p-card card-full">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">🏆</span>
              <span class="p-card-title">نجوم الأداء</span>
            </div>
            @if ((data()?.topPerformers?.length ?? 0) > 0) {
              <div class="chart-wrap chart-wrap-lg">
                <canvas #perfChart></canvas>
              </div>
              <div class="chart-insight">
                يرتب أفضل 10 موظفين تنازلياً حسب هامش الربح أو إجمالي المبيعات — الشريط الأطول في الأعلى يمثل الموظف الأكثر إسهاماً في الفترة المختارة. يساعدك هذا الرسم على تحديد النجوم ومكافأتهم، واكتشاف الفجوة بين أفضل موظف وبقية الفريق.
              </div>
            } @else {
              <div style="text-align:center;padding:2rem;color:var(--mizan-text-muted)">لا توجد بيانات موظفين للفترة المحددة</div>
            }
          </div>
        </div>

        <!-- Card 10: Executive Summary -->
        <div class="p-card card-full">
          <div class="p-card-inner">
            <div class="p-card-header">
              <span class="p-card-icon">🎯</span>
              <span class="p-card-title">الملخص التنفيذي</span>
            </div>
            <div class="mini-kpi-grid">
              <div class="mini-kpi">
                <div class="mini-kpi-label">إجمالي الإيرادات</div>
                <div class="mini-kpi-val gold">{{ fmt(data()?.executiveSummary?.totalRevenue) }} ر.س</div>
              </div>
              <div class="mini-kpi">
                <div class="mini-kpi-label">إجمالي الأرباح</div>
                <div class="mini-kpi-val gold">{{ fmt(data()?.executiveSummary?.totalProfit) }} ر.س</div>
              </div>
              <div class="mini-kpi">
                <div class="mini-kpi-label">هامش الربح</div>
                <div class="mini-kpi-val">{{ fmtRate(data()?.executiveSummary?.profitMarginPct) }}%</div>
              </div>
              <div class="mini-kpi">
                <div class="mini-kpi-label">متوسط سعر البيع</div>
                <div class="mini-kpi-val">{{ fmtRate(data()?.executiveSummary?.avgSaleRate) }} ر/ج</div>
              </div>
              <div class="mini-kpi">
                <div class="mini-kpi-label">أفضل فرع</div>
                <div class="mini-kpi-val gold">{{ data()?.executiveSummary?.bestBranch ?? '-' }}</div>
              </div>
              <div class="mini-kpi">
                <div class="mini-kpi-label">أفضل موظف</div>
                <div class="mini-kpi-val gold">{{ data()?.executiveSummary?.bestEmployee ?? '-' }}</div>
              </div>
            </div>
            @if (data()?.executiveSummary?.summaryText) {
              <div class="summary-text-box">{{ data()?.executiveSummary?.summaryText }}</div>
            }
          </div>
        </div>

      </div>
    }
  `
})
export class V3PremiumComponent implements OnDestroy {
  @ViewChild('revEffChart')   revEffRef?:   ElementRef<HTMLCanvasElement>;
  @ViewChild('matrixChart')   matrixRef?:   ElementRef<HTMLCanvasElement>;
  @ViewChild('karatChart')    karatRef?:    ElementRef<HTMLCanvasElement>;
  @ViewChild('purchChart')    purchRef?:    ElementRef<HTMLCanvasElement>;
  @ViewChild('exposureChart') exposureRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('seasonChart')   seasonRef?:   ElementRef<HTMLCanvasElement>;
  @ViewChild('perfChart')     perfRef?:     ElementRef<HTMLCanvasElement>;

  private svc       = inject(V3DashboardService);
  private dateRange = inject(V3DateRangeService);
  private cdr       = inject(ChangeDetectorRef);

  loading = signal(true);
  error   = signal<string | null>(null);
  data    = signal<any>(null);
  seasonPeriod = signal<string>('full');

  periodOptions = [
    { label: 'هذا الأسبوع',   value: 'week'    },
    { label: 'هذا الشهر',     value: 'month'   },
    { label: 'كامل الفترة',   value: 'full'    },
    { label: 'هذا العام',     value: 'year'    },
    { label: 'آخر 5 سنوات',  value: '5years'  },
  ];

  private charts: Map<string, Chart> = new Map();

  constructor() {
    effect(() => {
      const from = this.dateRange.from();
      const to   = this.dateRange.to();
      if (from && to) this.load(from, to);
    });
  }

  ngOnDestroy(): void {
    this.destroyAllCharts();
  }

  private destroyAllCharts(): void {
    this.charts.forEach(c => c.destroy());
    this.charts.clear();
  }

  private load(from: string, to: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getPremium(from, to).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        this.cdr.detectChanges(); // render @if blocks so canvases exist in DOM
        this.destroyAllCharts();
        // 80ms: enough for Angular to finalize all @ViewChild updates after detectChanges
        setTimeout(() => this.buildAllCharts(d), 80);
      },
      error: (e) => {
        this.error.set('تعذّر تحميل التحليلات المتقدمة: ' + (e?.message ?? ''));
        this.loading.set(false);
      }
    });
  }

  private ref(r?: ElementRef<HTMLCanvasElement>): HTMLCanvasElement | null {
    return r?.nativeElement ?? null;
  }

  private buildAllCharts(d: any): void {
    this.buildRevEffChart(d?.revenueEfficiency);
    this.buildMatrixChart(d?.branchQuadrant, d?.medianSar, d?.medianDiff);
    this.buildKaratChart(d?.karatProfitability);
    this.buildPurchChart(d?.purchaseTiming);
    this.buildExposureChart(d?.goldExposure?.byBranch);
    this.buildSeasonChart(d?.seasonalPatterns);
    this.buildPerfChart(d?.topPerformers);
  }

  // ─── Chart 1: Revenue Efficiency Line ─────────────────────────────────────
  private buildRevEffChart(eff: any): void {
    const canvas = this.ref(this.revEffRef);
    if (!canvas || !eff?.trend) return;
    const labels = eff.trend.map((t: any) => t.date?.slice(5));
    const values = eff.trend.map((t: any) => t.value);
    const c = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: '#c9a84c',
          backgroundColor: 'rgba(201,168,76,0.12)',
          borderWidth: 2,
          pointRadius: 2,
          fill: true,
          tension: 0.4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${(ctx.parsed.y as number).toFixed(1)} ر/ج` } }, datalabels: { display: false } },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 9 }, maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { ticks: { color: '#6b7280', font: { size: 9 }, callback: (v: any) => fmtCompact(+v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    } as ChartConfiguration);
    this.charts.set('revEff', c);
  }

  // ─── Chart 2: Branch Matrix Scatter ────────────────────────────────────────
  private buildMatrixChart(quadrant: any[], medianSar: number, medianDiff: number): void {
    const canvas = this.ref(this.matrixRef);
    if (!canvas || !quadrant) return;
    const regionMap = new Map<string, { x: number; y: number; label: string }[]>();
    for (const b of quadrant) {
      if (!regionMap.has(b.region)) regionMap.set(b.region, []);
      regionMap.get(b.region)!.push({ x: b.totalSar, y: b.diffRate, label: b.branchName });
    }
    const datasets = Array.from(regionMap.entries()).map(([region, pts]) => ({
      label: region,
      data: pts,
      backgroundColor: regionColor(region) + 'cc',
      borderColor: regionColor(region),
      pointRadius: 6,
      pointHoverRadius: 8,
    }));
    const c = new Chart(canvas, {
      type: 'scatter',
      data: { datasets } as any,
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 10 } },
          tooltip: { callbacks: { label: (ctx: any) => ` ${(ctx.raw as any).label ?? ''}: ${(ctx.parsed.y as number).toFixed(1)} ر/ج` } }
        },
        scales: {
          x: { ticks: { color: '#6b7280', callback: (v: any) => `${(v / 1000).toFixed(0)}K` }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    } as ChartConfiguration);
    this.charts.set('matrix', c);
  }

  // ─── Chart 3: Karat Profitability Grouped Bar ──────────────────────────────
  private buildKaratChart(karats: any[]): void {
    const canvas = this.ref(this.karatRef);
    if (!canvas || !karats) return;
    const labels = karats.map((k: any) => `${k.karat}K`);
    const c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'سعر البيع',
            data: karats.map((k: any) => k.avgSaleRate),
            backgroundColor: 'rgba(201,168,76,0.75)',
            borderColor: '#c9a84c',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'سعر الشراء',
            data: karats.map((k: any) => k.avgPurchRate),
            backgroundColor: 'rgba(20,184,166,0.65)',
            borderColor: '#14b8a6',
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 10 } }, datalabels: barDataLabels() },
        scales: {
          x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { ticks: { color: '#6b7280', callback: (v: any) => fmtCompact(+v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    } as ChartConfiguration);
    this.charts.set('karat', c);
  }

  // ─── Chart 4: Purchase Intelligence Dual Line ─────────────────────────────
  private buildPurchChart(timing: any): void {
    const canvas = this.ref(this.purchRef);
    if (!canvas || !timing?.trend) return;
    const labels = timing.trend.map((t: any) => t.date?.slice(5));
    const c = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'سعر البيع',
            data: timing.trend.map((t: any) => t.saleRate),
            borderColor: '#c9a84c',
            backgroundColor: 'rgba(201,168,76,0.15)',
            borderWidth: 2,
            pointRadius: 2,
            fill: '+1',
            tension: 0.3,
          },
          {
            label: 'سعر الشراء',
            data: timing.trend.map((t: any) => t.purchRate),
            borderColor: '#14b8a6',
            backgroundColor: 'rgba(20,184,166,0.05)',
            borderWidth: 2,
            pointRadius: 2,
            fill: false,
            tension: 0.3,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 10 } }, datalabels: { display: false } },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 9 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { ticks: { color: '#6b7280', callback: (v: any) => fmtCompact(+v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    } as ChartConfiguration);
    this.charts.set('purch', c);
  }

  // ─── Chart 5: Gold Exposure Horizontal Bar (grams) ───────────────────────
  private buildExposureChart(byBranch: any[]): void {
    const canvas = this.ref(this.exposureRef);
    if (!canvas || !byBranch) return;
    const sorted = [...byBranch].sort((a, b) => (b.salesWt ?? b.salesSar) - (a.salesWt ?? a.salesSar)).slice(0, 15);
    const labels = sorted.map((b: any) => b.branchName);
    const useWt  = sorted.some((b: any) => (b.salesWt ?? 0) > 0);
    const c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'مبيعات (جرام)',
            data: sorted.map((b: any) => useWt ? (b.salesWt ?? 0) : b.salesSar),
            backgroundColor: 'rgba(201,168,76,0.75)',
            borderRadius: 4,
          },
          {
            label: 'مشتريات (جرام)',
            data: sorted.map((b: any) => useWt ? (b.purchWt ?? 0) : b.purchSar),
            backgroundColor: 'rgba(20,184,166,0.65)',
            borderRadius: 4,
          }
        ]
      },
      options: {
        indexAxis: 'y' as any,
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 10 } },
          tooltip: { callbacks: { label: ctx => ` ${(ctx.parsed.x as number).toFixed(1)} جرام` } },
          datalabels: barDataLabels({ anchor: 'center', align: 'center' }),
        },
        scales: {
          x: { ticks: { color: '#6b7280', callback: (v: any) => fmtCompact(+v) }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { display: false } }
        }
      }
    } as ChartConfiguration);
    this.charts.set('exposure', c);
  }

  // ─── Chart 6: Seasonal Patterns Line (period-aware) ──────────────────────
  private buildSeasonChart(seasonal: any): void {
    const canvas = this.ref(this.seasonRef);
    if (!canvas || !seasonal) return;
    const { labels, values } = this.getSeasonData(seasonal, this.seasonPeriod());
    const c = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات',
          data: values,
          borderColor: '#c9a84c',
          backgroundColor: 'rgba(201,168,76,0.10)',
          borderWidth: 2,
          pointRadius: values.length > 60 ? 0 : 3,
          fill: true,
          tension: 0.4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${this.fmt(ctx.parsed.y)} ر.س` } },
          datalabels: { display: false },
        },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 20 }, grid: { color: 'rgba(255,255,255,0.03)' } },
          y: { ticks: { color: '#6b7280', callback: (v: any) => fmtCompact(+v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    } as ChartConfiguration);
    this.charts.set('season', c);
  }

  private getSeasonData(seasonal: any, period: string): { labels: string[]; values: number[] } {
    const daily: any[] = seasonal?.dailyTrend ?? [];
    const byDow: any[] = seasonal?.byDayOfWeek ?? [];
    const today = new Date();

    if (period === 'week') {
      const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 7);
      const f = daily.filter(d => d.date && new Date(d.date) >= cutoff);
      if (f.length > 0) return { labels: f.map(d => d.date?.slice(5) ?? ''), values: f.map(d => d.totalSar ?? 0) };
    }
    if (period === 'month') {
      const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 30);
      const f = daily.filter(d => d.date && new Date(d.date) >= cutoff);
      if (f.length > 0) return { labels: f.map(d => d.date?.slice(5) ?? ''), values: f.map(d => d.totalSar ?? 0) };
    }
    if (period === 'year') {
      const yr = today.getFullYear();
      const map = new Map<string, number>();
      for (const d of daily) {
        if (!d.date) continue;
        const [y, m] = d.date.split('-');
        if (parseInt(y) === yr) { const k = `${y}-${m}`; map.set(k, (map.get(k) ?? 0) + (d.totalSar ?? 0)); }
      }
      const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
      return { labels: sorted.map(([k]) => k.slice(5)), values: sorted.map(([, v]) => v) };
    }
    if (period === '5years') {
      const map = new Map<string, number>();
      for (const d of daily) {
        if (!d.date) continue;
        const y = d.date.slice(0, 4);
        map.set(y, (map.get(y) ?? 0) + (d.totalSar ?? 0));
      }
      const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
      return { labels: sorted.map(([k]) => k), values: sorted.map(([, v]) => v) };
    }
    // 'full' — all daily data; fall back to day-of-week if dailyTrend not yet available
    if (daily.length > 0) {
      return { labels: daily.map(d => d.date?.slice(5) ?? ''), values: daily.map(d => d.totalSar ?? 0) };
    }
    // fallback: day-of-week averages (always present)
    if (byDow.length > 0) {
      return { labels: byDow.map((d: any) => d.day), values: byDow.map((d: any) => d.avgSar ?? 0) };
    }
    return { labels: [], values: [] };
  }

  changePeriod(p: string): void {
    this.seasonPeriod.set(p);
    const old = this.charts.get('season');
    if (old) { old.destroy(); this.charts.delete('season'); }
    setTimeout(() => this.buildSeasonChart(this.data()?.seasonalPatterns), 50);
  }

  // ─── Chart 7: Top Performers Horizontal Bar ──────────────────────────────
  private buildPerfChart(performers: any[]): void {
    const canvas = this.ref(this.perfRef);
    if (!canvas || !performers?.length) return;
    // Use profitMargin when purchase rates are available; fall back to totalSar otherwise
    const hasMarginData = performers.some((p: any) => (p.profitMargin ?? 0) > 0);
    const metricKey   = hasMarginData ? 'profitMargin' : 'totalSar';
    const metricLabel = hasMarginData ? 'هامش الربح (ر.س)' : 'المبيعات (ر.س)';
    const top10 = [...performers].sort((a, b) => (b[metricKey] ?? 0) - (a[metricKey] ?? 0)).slice(0, 10);
    const c = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: top10.map((p: any) => `${p.empName} (${p.branchName})`),
        datasets: [{
          label: metricLabel,
          data: top10.map((p: any) => p[metricKey] ?? 0),
          backgroundColor: top10.map((_, i) =>
            i === 0 ? 'rgba(201,168,76,0.9)' : `rgba(201,168,76,${0.5 - i * 0.04})`
          ),
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y' as any,
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, datalabels: barDataLabels({ anchor: 'center', align: 'center' }) },
        scales: {
          x: { ticks: { color: '#6b7280', callback: (v: any) => fmtCompact(+v) }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { display: false } }
        }
      }
    } as ChartConfiguration);
    this.charts.set('perf', c);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  isBestKarat(k: any): boolean {
    const karats: any[] = this.data()?.karatProfitability ?? [];
    if (!karats.length) return false;
    const best = karats.reduce((a, b) => (b.marginPerGram > a.marginPerGram ? b : a));
    return k.karat === best.karat;
  }

  beProgress(be: any): number {
    if (!be.breakEvenWeightG) return 0;
    return Math.min((be.actualWeightG / be.breakEvenWeightG) * 100, 100);
  }

  bestDay(): string {
    const dow: any[] = this.data()?.seasonalPatterns?.byDayOfWeek ?? [];
    if (!dow.length) return '-';
    return dow.reduce((a, b) => (b.avgSar > a.avgSar ? b : a)).day;
  }

  worstDay(): string {
    const dow: any[] = this.data()?.seasonalPatterns?.byDayOfWeek ?? [];
    if (!dow.length) return '-';
    return dow.reduce((a, b) => (b.avgSar < a.avgSar ? b : a)).day;
  }

  riskLabel(r: string): string {
    const map: Record<string, string> = { critical: 'حرج', warning: 'تحذير', low: 'منخفض', none: 'آمن' };
    return map[r] ?? r;
  }

  fmt(n: number | null | undefined): string {
    return n?.toLocaleString('ar', { maximumFractionDigits: 0 }) ?? '0';
  }
  fmtRate(n: number | null | undefined): string {
    return (n ?? 0).toFixed(1);
  }
  fmtWt(n: number | null | undefined): string {
    return (n ?? 0).toLocaleString('ar', { maximumFractionDigits: 1 });
  }
}
