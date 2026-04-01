import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ViewChild, ElementRef, inject, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { DashboardService } from '../../core/services/dashboard.service';
import { I18nService } from '../../core/services/i18n.service';
import { MizanPipe } from '../../shared/pipes/mizan.pipe';
import { StudioKpiCardComponent } from './components/studio-kpi-card/studio-kpi-card.component';
import { StudioChartCardComponent } from './components/studio-chart-card/studio-chart-card.component';
import { StudioAlertRowComponent } from './components/studio-alert-row/studio-alert-row.component';

Chart.register(...registerables);

@Component({
  selector: 'app-analytics-studio',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MizanPipe,
    StudioKpiCardComponent,
    StudioChartCardComponent,
    StudioAlertRowComponent,
  ],
  templateUrl: './analytics-studio.component.html',
  styleUrls: ['./analytics-studio.component.scss']
})
export class AnalyticsStudioComponent implements OnInit, AfterViewInit, OnDestroy {
  private dashSvc = inject(DashboardService);
  i18n = inject(I18nService);
  private cdr = inject(ChangeDetectorRef);

  // ── Canvas refs (12 charts) ────────────────────────────────────
  @ViewChild('cvMainBar')        cvMainBar!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvRegionDoughnut') cvRegionDoughnut!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvRateDiff')       cvRateDiff!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvRegionBar')      cvRegionBar!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvEmpTop')         cvEmpTop!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvEmpDiff')        cvEmpDiff!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvEmpProfit')      cvEmpProfit!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvKaratDoughnut')  cvKaratDoughnut!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvKaratBar')       cvKaratBar!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvHeatmap')        cvHeatmap!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvMothan')         cvMothan!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvExposure')       cvExposure!: ElementRef<HTMLCanvasElement>;

  // ── Data ───────────────────────────────────────────────────────
  branches: any[] = [];
  employees: any[] = [];
  mothanData: any = null;
  summary: any = null;
  regionsSorted: any[] = [];
  mothanSummary = { total: 0, weight: 0, count: 0, avgRate: 0 };
  studioAlerts: { icon: string; message: string; severity: 'red' | 'amber' | 'green' }[] = [];

  // Intermediate sorted arrays for tooltip callbacks
  top10Branches: any[] = [];
  branchesByDiff: any[] = [];
  empTop10: any[] = [];
  empByDiff: any[] = [];
  empByProfit: any[] = [];

  // UI state
  isLoading = true;
  dateFrom = '';
  dateTo = '';
  periodLabel = '';
  lastUpdateTime = '';
  private viewReady = false;

  // Charts store
  charts: Record<string, Chart> = {};

  // IntersectionObservers — tracked so ngOnDestroy can disconnect them
  private _observers: IntersectionObserver[] = [];

  readonly REGION_COLORS: Record<string, string> = {
    'الرياض':          '#3b82f6',
    'الغربية':         '#ec4899',
    'المدينة المنورة': '#8b5cf6',
    'حائل':            '#22c55e',
    'حفر الباطن':      '#06b6d4',
    'عسير/جيزان':      '#f59e0b',
  };

  // ── Lifecycle ──────────────────────────────────────────────────
  ngOnInit(): void {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.dateFrom = firstOfMonth.toISOString().split('T')[0];
    this.dateTo   = now.toISOString().split('T')[0];
    this.periodLabel = `${this.dateFrom} — ${this.dateTo}`;
    this.lastUpdateTime = new Date().toLocaleTimeString(
      this.i18n.isAr() ? 'ar-SA' : 'en-US');
    this.loadData();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
  }

  ngOnDestroy(): void {
    Object.keys(this.charts).forEach(k => this.charts[k]?.destroy());
    this._observers.forEach(o => o.disconnect());
    this._observers = [];
  }

  // ── Helpers ────────────────────────────────────────────────────
  private n(v: any): number { return +(v ?? 0); }

  get isAr(): boolean { return this.i18n.isAr(); }

  fmtSAR(v: number): string {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    const unit = this.i18n.isAr() ? 'ر.س' : 'SAR';
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}${this.i18n.isAr() ? 'م' : 'M'} ${unit}`;
    if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1)}${this.i18n.isAr() ? 'ك' : 'K'} ${unit}`;
    return `${sign}${abs.toFixed(0)} ${unit}`;
  }

  fmtSARShort(v: number): string {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}${this.i18n.isAr() ? 'م' : 'M'}`;
    if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}${this.i18n.isAr() ? 'ك' : 'K'}`;
    return `${sign}${abs.toFixed(0)}`;
  }

  classLabel(e: any): string {
    const map: Record<string, string> = {
      excellent: this.i18n.isAr() ? '⭐ ممتاز' : '⭐ Excellent',
      good:      this.i18n.isAr() ? '✅ جيد'   : '✅ Good',
      average:   this.i18n.isAr() ? '⚠️ متوسط' : '⚠️ Average',
      weak:      this.i18n.isAr() ? '❌ ضعيف'  : '❌ Weak',
    };
    return map[e.classification] ?? '';
  }

  // ── Data enrichment ────────────────────────────────────────────
  // The API returns: b.name, b.sar (totalSarAmount), b.wn (netWeight),
  // b.wp (grossWeight), b.pcs (invoiceCount), b.purch (branchPurchases),
  // b.purchWt (branchPurchWeight), b.mothan (mothanAmount),
  // b.mothanWt (mothanWeight), b.ret (returns), b.retDays (returnDays),
  // b.region, b.code, b.saleRate, b.purchRate, b.diffRate
  // k18/k21/k22/k24 fields for karat data
  private enrichBranch(raw: any): any {
    const n = this.n.bind(this);
    const sar         = n(raw.sar);
    const netWt       = n(raw.wn);
    const grossWt     = n(raw.wp ?? raw.gw); // backend sends 'wp' (grossWeight field in BranchData)
    const invoices    = n(raw.pcs);
    const branchPurch = n(raw.purch);
    const branchPurchWt = n(raw.purchWt);
    const mothanAmt   = n(raw.mothan);
    const mothanWt    = n(raw.mothanWt);
    // Backend sends "returns" (BranchData record field name)
    const returns     = Math.abs(n(raw.returns ?? raw.ret ?? 0));
    const returnDays  = n(raw.retDays ?? 0);

    const combinedPurchases = branchPurch + mothanAmt;
    const combinedPurchWt   = branchPurchWt + mothanWt;

    // Use pre-computed rates from backend if available, else compute
    const saleRate = n(raw.saleRate) > 0 ? n(raw.saleRate)
      : (netWt > 0 ? Math.round(sar / netWt * 10000) / 10000 : 0);
    const purchRate = n(raw.purchRate) > 0 ? n(raw.purchRate)
      : (combinedPurchWt > 0 ? Math.round(combinedPurchases / combinedPurchWt * 10000) / 10000 : 0);
    const diffRate = n(raw.diffRate) !== 0 ? n(raw.diffRate)
      : (purchRate > 0 ? Math.round((saleRate - purchRate) * 10000) / 10000 : 0);

    const net = sar - combinedPurchases;
    const sellWeight  = Math.abs(netWt);
    const purchWeight = combinedPurchWt;
    const exposure    = sellWeight - purchWeight;
    const coverage    = sellWeight > 0 ? Math.round(purchWeight / sellWeight * 100) : 0;

    return {
      ...raw,
      // normalized names for our computations
      branchName:    raw.name ?? raw.branchName ?? '',
      branchCode:    raw.code ?? raw.branchCode ?? '',
      totalSarAmount: sar,
      netWeight:      netWt,
      grossWeight:    grossWt,
      invoiceCount:   invoices,
      branchPurchases: branchPurch,
      branchPurchWeight: branchPurchWt,
      mothanAmount:   mothanAmt,
      mothanWeight:   mothanWt,
      returns,
      returnDays,
      // karat fields
      // Backend sends k18Wt, k21Wt, k22Wt, k24Wt (BranchData record)
      k18Sar:    n(raw.k18Sar),    k18Weight: n(raw.k18Wt ?? raw.k18Weight),
      k21Sar:    n(raw.k21Sar),    k21Weight: n(raw.k21Wt ?? raw.k21Weight),
      k22Sar:    n(raw.k22Sar),    k22Weight: n(raw.k22Wt ?? raw.k22Weight),
      k24Sar:    n(raw.k24Sar),    k24Weight: n(raw.k24Wt ?? raw.k24Weight),
      // computed
      combinedPurchases, combinedPurchWt,
      saleRate, purchRate, diffRate, net,
      avgInvoice: invoices > 0 ? Math.round(sar / invoices) : 0,
      returnsPct: sar > 0 ? Math.round(returns / sar * 1000) / 10 : 0,
      sellWeight, purchWeight, exposure, coverage,
      exposureStatus: exposure > 1 ? 'exposed' : exposure < -1 ? 'surplus' : 'balanced',
    };
  }

  private enrichEmployee(raw: any, branches: any[]): any {
    const n = this.n.bind(this);
    // Employee endpoint sends: totalSar, totalWt, invoiceCount, saleRate
    const sar      = n(raw.totalSar ?? raw.sar ?? raw.totalSarAmount ?? 0);
    const netWt    = n(raw.totalWt  ?? raw.wn  ?? raw.netWeight ?? 0);
    const invoices = n(raw.invoiceCount ?? raw.pcs ?? 0);
    const returns  = Math.abs(n(raw.returns ?? raw.ret ?? 0));
    const retDays  = n(raw.returnDays ?? raw.retDays ?? 0);

    const saleRate = n(raw.saleRate) > 0 ? n(raw.saleRate)
      : (netWt > 0 ? Math.round(sar / netWt * 10000) / 10000 : 0);

    const branchCode = raw.branchCode ?? raw.code ?? '';
    const branch = branches.find((b: any) => b.branchCode === branchCode || b.code === branchCode);
    const purchRate = branch?.purchRate ?? 0;
    const diffRate  = Math.round((saleRate - purchRate) * 10) / 10;
    const profitMargin = purchRate > 0
      ? Math.round(netWt * (saleRate - purchRate) * 100) / 100 : 0;
    const classification =
      saleRate >= 700 ? 'excellent' :
      saleRate >= 600 ? 'good' :
      saleRate >= 500 ? 'average' : 'weak';

    return {
      ...raw,
      employeeName: raw.name ?? raw.employeeName ?? '',
      branchCode,
      branchName: raw.branchName ?? branch?.branchName ?? '',
      totalSarAmount: sar,
      netWeight: netWt,
      invoiceCount: invoices,
      returns,
      returnDays: retDays,
      saleRate, purchRate, diffRate, profitMargin,
      avgInvoice: invoices > 0 ? Math.round(sar / invoices) : 0,
      returnsPct: sar > 0 ? Math.round(returns / sar * 1000) / 10 : 0,
      achievedTarget: saleRate > purchRate,
      classification,
    };
  }

  // ── Load ───────────────────────────────────────────────────────
  loadData(): void {
    this.isLoading = true;
    const from = this.dateFrom;
    const to   = this.dateTo;

    forkJoin({
      branches:  this.dashSvc.getBranches(from, to),
      employees: this.dashSvc.getEmployees(from, to),
      mothan:    this.dashSvc.getMothan(from, to),
    }).subscribe({
      next: ({ branches, employees, mothan }) => {
        const rawBranches  = (branches as any)?.data ?? [];
        const rawEmployees = (employees as any)?.data ?? [];

        this.branches  = rawBranches.map((b: any) => this.enrichBranch(b));
        this.employees = rawEmployees.map((e: any) => this.enrichEmployee(e, this.branches));
        this.mothanData = (mothan as any)?.data ?? null;

        this.buildRegions();
        this.buildMothanSummary();
        this.buildSummary();
        this.buildAlerts();
        this.isLoading = false;
        this.cdr.detectChanges();
        setTimeout(() => this.buildAllCharts(), 50);
      },
      error: (err) => {
        console.error('Analytics Studio load error:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onDateChange(): void {
    this.periodLabel = `${this.dateFrom} — ${this.dateTo}`;
    this.loadData();
  }

  // ── Region aggregation ─────────────────────────────────────────
  private buildRegions(): void {
    const map: Record<string, any> = {};
    for (const b of this.branches) {
      const r = b.region ?? 'غير محدد';
      if (!map[r]) {
        map[r] = {
          regionName: r,
          totalSar: 0, totalPurch: 0, totalWt: 0,
          totalInvoices: 0, branchCount: 0, branches: []
        };
      }
      map[r].totalSar     += b.totalSarAmount;
      map[r].totalPurch   += b.combinedPurchases;
      map[r].totalWt      += b.netWeight;
      map[r].totalInvoices += b.invoiceCount;
      map[r].branchCount  += 1;
      map[r].branches.push(b);
    }
    this.regionsSorted = Object.values(map)
      .map((r: any) => ({
        ...r,
        net:      r.totalSar - r.totalPurch,
        saleRate: r.totalWt > 0 ? Math.round(r.totalSar / r.totalWt * 100) / 100 : 0,
      }))
      .sort((a: any, b: any) => b.totalSar - a.totalSar);
  }

  private buildMothanSummary(): void {
    if (!this.mothanData) {
      this.mothanSummary = { total: 0, weight: 0, count: 0, avgRate: 0 };
      return;
    }
    const m = this.mothanData;
    // Mothan endpoint sends: totalWt, txnCount, totalSar, avgRate
    const weight = this.n(m.totalWt ?? m.totalGoldGrams ?? 0);
    const count  = this.n(m.txnCount ?? m.transactionCount ?? 0);
    // Compute total amount from branches aggregated on enriched branch data
    const total  = this.branches.reduce((s: number, b: any) => s + b.mothanAmount, 0);
    const avgRate = weight > 0 ? Math.round(total / weight * 100) / 100 : 0;
    this.mothanSummary = { total, weight, count, avgRate };
  }

  private buildSummary(): void {
    const b = this.branches;
    if (!b.length) { this.summary = null; return; }

    const totalSalesAmount     = b.reduce((s: number, x: any) => s + x.totalSarAmount, 0);
    const totalPurchasesAmount = b.reduce((s: number, x: any) => s + x.combinedPurchases, 0);
    const totalNetWeight       = b.reduce((s: number, x: any) => s + x.netWeight, 0);
    const totalPurchWeight     = b.reduce((s: number, x: any) => s + x.combinedPurchWt, 0);
    const totalInvoices        = b.reduce((s: number, x: any) => s + x.invoiceCount, 0);
    const totalReturns         = b.reduce((s: number, x: any) => s + x.returns, 0);
    const globalSaleRate       = totalNetWeight > 0 ? Math.round(totalSalesAmount / totalNetWeight * 100) / 100 : 0;
    const globalPurchRate      = totalPurchWeight > 0 ? Math.round(totalPurchasesAmount / totalPurchWeight * 100) / 100 : 0;
    const weightedDiffRate     = Math.round((globalSaleRate - globalPurchRate) * 100) / 100;
    const returnBranches       = b.filter((x: any) => x.returns > 0);
    const totalSellWeight      = b.reduce((s: number, x: any) => s + x.sellWeight, 0);
    const totalPurchWeightAll  = b.reduce((s: number, x: any) => s + x.purchWeight, 0);
    const sorted               = [...b].sort((a: any, c: any) => c.totalSarAmount - a.totalSarAmount);

    this.summary = {
      totalSalesAmount, totalPurchasesAmount, totalNetWeight, totalPurchWeight,
      totalInvoices, totalReturns,
      globalSaleRate, globalPurchRate, weightedDiffRate,
      net: totalSalesAmount - totalPurchasesAmount,
      avgInvoice: totalInvoices > 0 ? Math.round(totalSalesAmount / totalInvoices) : 0,
      returnsPct: totalSalesAmount > 0 ? Math.round(totalReturns / totalSalesAmount * 1000) / 10 : 0,
      negativeBranchCount: b.filter((x: any) => x.diffRate < 0).length,
      topBranch: sorted[0] ?? null,
      topReturnBranch: [...returnBranches].sort((a: any, c: any) => c.returns - a.returns)[0] ?? null,
      topFiveBranches: sorted.slice(0, 5),
      bottomFiveBranches: [...b].sort((a: any, c: any) => a.totalSarAmount - c.totalSarAmount).slice(0, 5),
      returnBranchCount: returnBranches.length,
      totalSellWeight, totalPurchWeightAll,
      totalExposure: totalSellWeight - totalPurchWeightAll,
      globalCoverage: totalSellWeight > 0 ? Math.round(totalPurchWeightAll / totalSellWeight * 100) : 0,
    };
  }

  private buildAlerts(): void {
    const alerts: any[] = [];
    const ar = this.isAr;
    for (const b of this.branches) {
      if (alerts.length >= 25) break;
      if (b.diffRate < 0) {
        alerts.push({ icon: '🔴', severity: 'red',
          message: ar
            ? `فرع ${b.branchName}: فرق معدل سالب (${b.diffRate.toFixed(1)} ر.س/جم)`
            : `Branch ${b.branchName}: Negative rate diff (${b.diffRate.toFixed(1)} SAR/g)` });
      }
      if (b.combinedPurchases === 0 && b.totalSarAmount > 0) {
        alerts.push({ icon: '⚠️', severity: 'amber',
          message: ar
            ? `فرع ${b.branchName}: لا توجد مشتريات مسجلة`
            : `Branch ${b.branchName}: No purchases recorded` });
      }
      if (b.returns > 0) {
        const retPct = b.totalSarAmount > 0 ? b.returns / b.totalSarAmount * 100 : 0;
        if (retPct >= 10) {
          alerts.push({ icon: '🔴', severity: 'red',
            message: ar
              ? `حرج: ${b.branchName} مرتجعات ${retPct.toFixed(1)}% من المبيعات`
              : `CRITICAL: ${b.branchName} returns ${retPct.toFixed(1)}% of sales` });
        } else if (retPct >= 5) {
          alerts.push({ icon: '⚠️', severity: 'amber',
            message: ar
              ? `تحذير: ${b.branchName} مرتجعات ${retPct.toFixed(1)}%`
              : `Warning: ${b.branchName} returns ${retPct.toFixed(1)}%` });
        } else {
          alerts.push({ icon: '🔴', severity: 'red',
            message: ar
              ? `${b.branchName}: مرتجعات ${this.fmtSAR(b.returns)}`
              : `${b.branchName}: Returns ${this.fmtSAR(b.returns)}` });
        }
      }
      if (b.returnDays >= 3) {
        alerts.push({ icon: '🔴', severity: 'red',
          message: ar
            ? `${b.branchName}: مرتجعات لمدة ${b.returnDays} أيام متتالية — يحتاج تحقيق`
            : `${b.branchName}: Returns for ${b.returnDays} consecutive days` });
      }
    }
    if (!alerts.length) {
      alerts.push({ icon: '✅', severity: 'green',
        message: ar ? 'لا توجد تنبيهات — كل شيء طبيعي ✅' : 'No alerts — all clear ✅' });
    }
    this.studioAlerts = alerts;
  }

  // ── Chart helpers ──────────────────────────────────────────────
  private destroyChart(key: string): void {
    if (this.charts[key]) {
      this.charts[key].destroy();
      delete this.charts[key];
    }
  }

  private getChartBase(): any {
    const ar = this.isAr;
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(4,13,8,0.97)',
          titleColor: '#c9a84c',
          bodyColor: '#f2ede4',
          borderColor: 'rgba(201,168,76,0.32)',
          borderWidth: 1,
          padding: 14,
          cornerRadius: 12,
          titleFont: { size: 13, weight: 'bold',
                       family: "'IBM Plex Sans Arabic', 'IBM Plex Sans', sans-serif" },
          bodyFont: { size: 12, weight: '600', family: "'IBM Plex Mono', monospace" },
          displayColors: true,
          boxWidth: 10, boxHeight: 10, boxPadding: 6,
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(201,168,76,0.06)' },
          border: { display: false } as any,
          ticks: {
            color: 'rgba(242,237,228,0.45)',
            font: { size: 11, family: "'IBM Plex Sans Arabic', sans-serif" },
            maxRotation: 30,
          }
        },
        y: {
          grid: { color: 'rgba(201,168,76,0.06)' },
          border: { display: false } as any,
          ticks: {
            color: 'rgba(242,237,228,0.45)',
            font: { size: 10, family: "'IBM Plex Mono', monospace" },
          }
        }
      }
    };
  }

  // ── Build all charts ───────────────────────────────────────────
  buildAllCharts(): void {
    // Disconnect any leftover observers from a previous load
    this._observers.forEach(o => o.disconnect());
    this._observers = [];

    // Charts 1–4: always visible above the fold — build immediately
    this.buildMainBar();
    this.buildRegionDoughnut();
    this.buildRateDiffChart();
    this.buildRegionBar();

    // Charts 5–12: below the fold — defer until scrolled into view
    this.observeChart(this.cvEmpTop,        () => this.buildEmpTop());
    this.observeChart(this.cvEmpDiff,       () => this.buildEmpDiff());
    this.observeChart(this.cvEmpProfit,     () => this.buildEmpProfit());
    this.observeChart(this.cvKaratDoughnut, () => this.buildKaratDoughnut());
    this.observeChart(this.cvKaratBar,      () => this.buildKaratBar());
    this.observeChart(this.cvHeatmap,       () => this.buildHeatmap());
    this.observeChart(this.cvMothan,        () => this.buildMothanChart());
    this.observeChart(this.cvExposure,      () => this.buildExposureChart());
  }

  /** Render `build` only when the canvas scrolls into the viewport. */
  private observeChart(ref: ElementRef<HTMLCanvasElement> | undefined, build: () => void): void {
    if (!ref?.nativeElement) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        build();
        obs.disconnect();
        this._observers = this._observers.filter(o => o !== obs);
      }
    }, { threshold: 0.1 });
    obs.observe(ref.nativeElement);
    this._observers.push(obs);
  }

  // Chart 1 — Main Overview Bar (top 10 by SAR)
  private buildMainBar(): void {
    if (!this.cvMainBar?.nativeElement) return;
    const top10 = [...this.branches]
      .sort((a, b) => b.totalSarAmount - a.totalSarAmount)
      .slice(0, 10);
    this.top10Branches = top10;
    const ar = this.isAr;
    const base = this.getChartBase();
    const cfg: any = {
      type: 'bar',
      data: {
        labels: top10.map(b => b.branchName),
        datasets: [
          {
            label: ar ? 'المبيعات' : 'Sales',
            data: top10.map(b => b.totalSarAmount),
            backgroundColor: 'rgba(201,168,76,0.55)',
            hoverBackgroundColor: 'rgba(201,168,76,0.92)',
            borderRadius: 6,
          },
          {
            label: ar ? 'المشتريات' : 'Purchases',
            data: top10.map(b => b.combinedPurchases),
            backgroundColor: 'rgba(52,211,153,0.28)',
            hoverBackgroundColor: 'rgba(52,211,153,0.55)',
            borderRadius: 6,
          }
        ]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          legend: {
            display: true, position: 'bottom',
            labels: { color: 'rgba(242,237,228,0.6)', font: { size: 11 },
                      usePointStyle: true, padding: 16 }
          },
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => top10[items[0].dataIndex]?.branchName ?? '',
              label: (item: any) => {
                const b = top10[item.dataIndex];
                if (!b) return '';
                if (item.datasetIndex === 0)
                  return `${ar ? 'المبيعات' : 'Sales'}: ${this.fmtSAR(b.totalSarAmount)}`;
                return [
                  `${ar ? 'المشتريات' : 'Purch'}: ${this.fmtSAR(b.combinedPurchases)}`,
                  `${ar ? 'الصافي' : 'Net'}: ${this.fmtSAR(b.net)}`
                ];
              }
            }
          }
        },
        scales: {
          ...base.scales,
          y: {
            ...base.scales.y,
            ticks: {
              ...base.scales.y.ticks,
              callback: (v: any) => (v / 1e6).toFixed(1) + (ar ? 'م' : 'M')
            }
          }
        }
      }
    };
    this.destroyChart('mainBar');
    this.charts['mainBar'] = new Chart(this.cvMainBar.nativeElement, cfg);
  }

  // Chart 2 — Region Doughnut
  private buildRegionDoughnut(): void {
    if (!this.cvRegionDoughnut?.nativeElement) return;
    const ar = this.isAr;
    const regions = this.regionsSorted;
    const total = this.summary?.totalSalesAmount ?? 1;
    const self = this;

    const centerPlugin = {
      id: 'studioCenter',
      afterDraw: (chart: any) => {
        const { ctx, chartArea: { width, height, left, top } } = chart;
        const cx = left + width / 2;
        const cy = top + height / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 14px IBM Plex Mono';
        ctx.fillStyle = '#c9a84c';
        ctx.fillText(self.fmtSARShort(total), cx, cy - 10);
        ctx.font = '600 10px IBM Plex Sans Arabic';
        ctx.fillStyle = 'rgba(242,237,228,0.45)';
        ctx.fillText(ar ? 'إجمالي المبيعات' : 'Total Sales', cx, cy + 8);
        ctx.restore();
      }
    };

    const cfg: any = {
      type: 'doughnut',
      plugins: [centerPlugin],
      data: {
        labels: regions.map((r: any) => r.regionName),
        datasets: [{
          data: regions.map((r: any) => r.totalSar),
          backgroundColor: regions.map((r: any) => this.REGION_COLORS[r.regionName] ?? '#c9a84c'),
          borderColor: '#040d08',
          borderWidth: 2,
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '72%',
        animation: { duration: 700, easing: 'easeInOutQuart' },
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: { color: 'rgba(242,237,228,0.6)', font: { size: 10 },
                      usePointStyle: true, padding: 12 }
          },
          tooltip: {
            ...this.getChartBase().plugins.tooltip,
            callbacks: {
              title: (items: any[]) => regions[items[0].dataIndex]?.regionName ?? '',
              label: (item: any) => {
                const r = regions[item.dataIndex];
                if (!r) return '';
                const pct = total > 0 ? (r.totalSar / total * 100).toFixed(1) : '0';
                return `${this.fmtSAR(r.totalSar)} (${pct}%)`;
              }
            }
          }
        }
      }
    };
    this.destroyChart('regionDoughnut');
    this.charts['regionDoughnut'] = new Chart(this.cvRegionDoughnut.nativeElement, cfg);
  }

  // Chart 3 — Rate Difference Bar (all branches)
  private buildRateDiffChart(): void {
    if (!this.cvRateDiff?.nativeElement) return;
    const sorted = [...this.branches].sort((a, b) => b.diffRate - a.diffRate);
    this.branchesByDiff = sorted;
    const ar = this.isAr;
    const base = this.getChartBase();

    const zeroLine = {
      id: 'zeroLine',
      afterDatasetsDraw: (chart: any) => {
        const { ctx, chartArea, scales } = chart;
        if (!scales.y) return;
        const y0 = scales.y.getPixelForValue(0);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y0);
        ctx.lineTo(chartArea.right, y0);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(201,168,76,0.5)';
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.restore();
      }
    };

    const cfg: any = {
      type: 'bar',
      plugins: [zeroLine],
      data: {
        labels: sorted.map(b => b.branchName),
        datasets: [{
          data: sorted.map(b => b.diffRate),
          backgroundColor: sorted.map(b =>
            b.diffRate >= 0 ? 'rgba(52,211,153,0.65)' : 'rgba(248,113,113,0.65)'),
          hoverBackgroundColor: sorted.map(b =>
            b.diffRate >= 0 ? 'rgba(52,211,153,1)' : 'rgba(248,113,113,1)'),
          borderRadius: 6,
        }]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => sorted[items[0].dataIndex]?.branchName ?? '',
              label: (item: any) => {
                const b = sorted[item.dataIndex];
                if (!b) return '';
                return [
                  `${ar ? 'فرق المعدل' : 'Rate Diff'}: ${b.diffRate.toFixed(2)} ${ar ? 'ر.س/جم' : 'SAR/g'}`,
                  `${ar ? 'معدل البيع' : 'Sale Rate'}: ${b.saleRate.toFixed(2)}`,
                  `${ar ? 'معدل الشراء' : 'Purch Rate'}: ${b.purchRate.toFixed(2)}`,
                  `${ar ? 'الصافي' : 'Net'}: ${this.fmtSAR(b.net)}`,
                ];
              }
            }
          }
        },
        scales: {
          ...base.scales,
          y: {
            ...base.scales.y,
            ticks: {
              ...base.scales.y.ticks,
              callback: (v: any) => v.toFixed(1) + (ar ? ' ر.س/جم' : ' SAR/g')
            }
          }
        }
      }
    };
    this.destroyChart('rateDiff');
    this.charts['rateDiff'] = new Chart(this.cvRateDiff.nativeElement, cfg);
  }

  // Chart 4 — Region grouped bar
  private buildRegionBar(): void {
    if (!this.cvRegionBar?.nativeElement) return;
    const regions = this.regionsSorted;
    const ar = this.isAr;
    const base = this.getChartBase();

    const cfg: any = {
      type: 'bar',
      data: {
        labels: regions.map((r: any) => r.regionName),
        datasets: [
          {
            label: ar ? 'المبيعات' : 'Sales',
            data: regions.map((r: any) => r.totalSar),
            backgroundColor: 'rgba(201,168,76,0.6)',
            borderRadius: 6,
          },
          {
            label: ar ? 'المشتريات' : 'Purchases',
            data: regions.map((r: any) => r.totalPurch),
            backgroundColor: 'rgba(52,211,153,0.35)',
            borderRadius: 6,
          }
        ]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          legend: {
            display: true, position: 'bottom',
            labels: { color: 'rgba(242,237,228,0.6)', font: { size: 11 }, usePointStyle: true, padding: 16 }
          },
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => regions[items[0].dataIndex]?.regionName ?? '',
              label: (item: any) => {
                const r = regions[item.dataIndex];
                if (!r) return '';
                if (item.datasetIndex === 0)
                  return `${ar ? 'المبيعات' : 'Sales'}: ${this.fmtSAR(r.totalSar)}`;
                return [
                  `${ar ? 'المشتريات' : 'Purch'}: ${this.fmtSAR(r.totalPurch)}`,
                  `${ar ? 'الصافي' : 'Net'}: ${this.fmtSAR(r.net)}`,
                  `${ar ? 'الفروع' : 'Branches'}: ${r.branchCount}`,
                ];
              }
            }
          }
        },
        scales: {
          ...base.scales,
          y: {
            ...base.scales.y,
            ticks: {
              ...base.scales.y.ticks,
              callback: (v: any) => (v / 1e6).toFixed(1) + (ar ? 'م' : 'M')
            }
          }
        }
      }
    };
    this.destroyChart('regionBar');
    this.charts['regionBar'] = new Chart(this.cvRegionBar.nativeElement, cfg);
  }

  // Chart 5 — Employee Top 10 by Sales
  private buildEmpTop(): void {
    if (!this.cvEmpTop?.nativeElement) return;
    const top10 = [...this.employees]
      .sort((a, b) => b.totalSarAmount - a.totalSarAmount)
      .slice(0, 10);
    this.empTop10 = top10;
    const ar = this.isAr;
    const base = this.getChartBase();

    const cfg: any = {
      type: 'bar',
      data: {
        labels: top10.map(e => e.employeeName),
        datasets: [{
          data: top10.map(e => e.totalSarAmount),
          backgroundColor: top10.map((_, i) => `rgba(201,168,76,${0.8 - i * 0.05})`),
          borderRadius: 6,
        }]
      },
      options: {
        ...base,
        indexAxis: 'y' as any,
        plugins: {
          ...base.plugins,
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => top10[items[0].dataIndex]?.employeeName ?? '',
              label: (item: any) => {
                const e = top10[item.dataIndex];
                if (!e) return '';
                return [
                  `${ar ? 'المبيعات' : 'Sales'}: ${this.fmtSAR(e.totalSarAmount)}`,
                  `${ar ? 'الفرع' : 'Branch'}: ${e.branchName}`,
                  `${ar ? 'الوزن' : 'Weight'}: ${e.netWeight.toFixed(2)}g`,
                ];
              }
            }
          }
        },
        scales: {
          ...base.scales,
          x: {
            ...base.scales.x,
            ticks: {
              ...base.scales.x.ticks,
              callback: (v: any) => (v / 1e3).toFixed(0) + (ar ? 'ك' : 'K')
            }
          }
        }
      }
    };
    this.destroyChart('empTop');
    this.charts['empTop'] = new Chart(this.cvEmpTop.nativeElement, cfg);
  }

  // Chart 6 — Employee Top 10 by Rate Diff
  private buildEmpDiff(): void {
    if (!this.cvEmpDiff?.nativeElement) return;
    const top10 = [...this.employees]
      .filter(e => e.saleRate > 0)
      .sort((a, b) => b.diffRate - a.diffRate)
      .slice(0, 10);
    this.empByDiff = top10;
    const ar = this.isAr;
    const base = this.getChartBase();

    const cfg: any = {
      type: 'bar',
      data: {
        labels: top10.map(e => e.employeeName),
        datasets: [{
          data: top10.map(e => e.diffRate),
          backgroundColor: top10.map(e =>
            e.diffRate >= 0 ? 'rgba(52,211,153,0.65)' : 'rgba(248,113,113,0.65)'),
          borderRadius: 6,
        }]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => top10[items[0].dataIndex]?.employeeName ?? '',
              label: (item: any) => {
                const e = top10[item.dataIndex];
                if (!e) return '';
                return [
                  `${ar ? 'فرق المعدل' : 'Rate Diff'}: ${e.diffRate.toFixed(2)}`,
                  `${ar ? 'الفرع' : 'Branch'}: ${e.branchName}`,
                  `${ar ? 'المبيعات' : 'Sales'}: ${this.fmtSAR(e.totalSarAmount)}`,
                ];
              }
            }
          }
        }
      }
    };
    this.destroyChart('empDiff');
    this.charts['empDiff'] = new Chart(this.cvEmpDiff.nativeElement, cfg);
  }

  // Chart 7 — Employee Top 10 by Profit Margin
  private buildEmpProfit(): void {
    if (!this.cvEmpProfit?.nativeElement) return;
    const top10 = [...this.employees]
      .filter(e => e.profitMargin > 0)
      .sort((a, b) => b.profitMargin - a.profitMargin)
      .slice(0, 10);
    this.empByProfit = top10;
    const ar = this.isAr;
    const base = this.getChartBase();

    const cfg: any = {
      type: 'bar',
      data: {
        labels: top10.map(e => e.employeeName),
        datasets: [{
          data: top10.map(e => e.profitMargin),
          backgroundColor: 'rgba(45,212,191,0.55)',
          hoverBackgroundColor: 'rgba(45,212,191,0.9)',
          borderRadius: 6,
        }]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => top10[items[0].dataIndex]?.employeeName ?? '',
              label: (item: any) => {
                const e = top10[item.dataIndex];
                if (!e) return '';
                return [
                  `${ar ? 'هامش الربح' : 'Profit Margin'}: ${this.fmtSAR(e.profitMargin)}`,
                  `${ar ? 'الفرع' : 'Branch'}: ${e.branchName}`,
                  `${ar ? 'التصنيف' : 'Class'}: ${this.classLabel(e)}`,
                ];
              }
            }
          }
        },
        scales: {
          ...base.scales,
          y: {
            ...base.scales.y,
            ticks: {
              ...base.scales.y.ticks,
              callback: (v: any) => (v / 1e3).toFixed(0) + (ar ? 'ك' : 'K')
            }
          }
        }
      }
    };
    this.destroyChart('empProfit');
    this.charts['empProfit'] = new Chart(this.cvEmpProfit.nativeElement, cfg);
  }

  // Chart 8 — Karat Doughnut
  private buildKaratDoughnut(): void {
    if (!this.cvKaratDoughnut?.nativeElement) return;
    const ar = this.isAr;
    // Aggregate karat from branches
    const k18 = this.branches.reduce((s: number, b: any) => s + b.k18Weight, 0);
    const k21 = this.branches.reduce((s: number, b: any) => s + b.k21Weight, 0);
    const k22 = this.branches.reduce((s: number, b: any) => s + b.k22Weight, 0);
    const k24 = this.branches.reduce((s: number, b: any) => s + b.k24Weight, 0);
    const totalKarat = k18 + k21 + k22 + k24 || 1;

    const cfg: any = {
      type: 'doughnut',
      data: {
        labels: ['18K', '21K', '22K', '24K'],
        datasets: [{
          data: [k18, k21, k22, k24],
          backgroundColor: ['#f59e0b', '#c9a84c', '#e3c76a', '#f5e199'],
          borderColor: '#040d08',
          borderWidth: 2,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        animation: { duration: 700, easing: 'easeInOutQuart' },
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: { color: 'rgba(242,237,228,0.6)', font: { size: 11 }, usePointStyle: true, padding: 14 }
          },
          tooltip: {
            ...this.getChartBase().plugins.tooltip,
            callbacks: {
              label: (item: any) => {
                const val = item.raw as number;
                const pct = (val / totalKarat * 100).toFixed(1);
                return `${val.toFixed(2)}g (${pct}%)`;
              }
            }
          }
        }
      }
    };
    this.destroyChart('karatDoughnut');
    this.charts['karatDoughnut'] = new Chart(this.cvKaratDoughnut.nativeElement, cfg);
  }

  // Chart 9 — Karat by Branch stacked bar
  private buildKaratBar(): void {
    if (!this.cvKaratBar?.nativeElement) return;
    const ar = this.isAr;
    const top8 = [...this.branches]
      .sort((a, b) => b.totalSarAmount - a.totalSarAmount)
      .slice(0, 8);
    const base = this.getChartBase();

    const cfg: any = {
      type: 'bar',
      data: {
        labels: top8.map(b => b.branchName),
        datasets: [
          { label: '18K', data: top8.map(b => b.k18Weight), backgroundColor: '#f59e0b', borderRadius: 4 },
          { label: '21K', data: top8.map(b => b.k21Weight), backgroundColor: '#c9a84c', borderRadius: 4 },
          { label: '22K', data: top8.map(b => b.k22Weight), backgroundColor: '#e3c76a', borderRadius: 4 },
          { label: '24K', data: top8.map(b => b.k24Weight), backgroundColor: '#f5e199', borderRadius: 4 },
        ]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          legend: {
            display: true, position: 'bottom',
            labels: { color: 'rgba(242,237,228,0.6)', font: { size: 11 }, usePointStyle: true, padding: 14 }
          },
          tooltip: { ...base.plugins.tooltip }
        },
        scales: {
          ...base.scales,
          x: { ...base.scales.x, stacked: true },
          y: {
            ...base.scales.y, stacked: true,
            ticks: { ...base.scales.y.ticks, callback: (v: any) => v.toFixed(0) + 'g' }
          }
        }
      }
    };
    this.destroyChart('karatBar');
    this.charts['karatBar'] = new Chart(this.cvKaratBar.nativeElement, cfg);
  }

  // Chart 10 — Heatmap (Rate Diff for ALL branches with value labels)
  private buildHeatmap(): void {
    if (!this.cvHeatmap?.nativeElement) return;
    const sorted = [...this.branches].sort((a, b) => b.diffRate - a.diffRate);
    const ar = this.isAr;
    const base = this.getChartBase();

    const labelPlugin = {
      id: 'barLabels',
      afterDatasetsDraw: (chart: any) => {
        const { ctx, data } = chart;
        const dataset = chart.getDatasetMeta(0);
        dataset.data.forEach((bar: any, i: number) => {
          const val = data.datasets[0].data[i] as number;
          const barH = Math.abs(bar.height ?? 0);
          if (barH < 24) return;
          ctx.save();
          ctx.fillStyle = 'rgba(242,237,228,0.8)';
          ctx.font = '600 9px IBM Plex Mono';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(val.toFixed(1), bar.x, bar.y + barH / 2 * (val < 0 ? 1 : -1) * 0.3);
          ctx.restore();
        });
      }
    };

    const cfg: any = {
      type: 'bar',
      plugins: [labelPlugin],
      data: {
        labels: sorted.map(b => b.branchName),
        datasets: [{
          data: sorted.map(b => b.diffRate),
          backgroundColor: sorted.map(b =>
            b.diffRate >= 0 ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.55)'),
          hoverBackgroundColor: sorted.map(b =>
            b.diffRate >= 0 ? 'rgba(52,211,153,0.9)' : 'rgba(248,113,113,0.9)'),
          borderRadius: 4,
        }]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => sorted[items[0].dataIndex]?.branchName ?? '',
              label: (item: any) => {
                const b = sorted[item.dataIndex];
                if (!b) return '';
                return [
                  `${ar ? 'فرق المعدل' : 'Rate Diff'}: ${b.diffRate.toFixed(2)} ${ar ? 'ر.س/جم' : 'SAR/g'}`,
                  `${ar ? 'معدل البيع' : 'Sale Rate'}: ${b.saleRate.toFixed(2)}`,
                  `${ar ? 'الصافي' : 'Net'}: ${this.fmtSAR(b.net)}`,
                ];
              }
            }
          }
        },
        scales: {
          ...base.scales,
          y: {
            ...base.scales.y,
            ticks: {
              ...base.scales.y.ticks,
              callback: (v: any) => v.toFixed(1)
            }
          }
        }
      }
    };
    this.destroyChart('heatmap');
    this.charts['heatmap'] = new Chart(this.cvHeatmap.nativeElement, cfg);
  }

  // Chart 11 — Mothan mixed (bar + line)
  private buildMothanChart(): void {
    if (!this.cvMothan?.nativeElement) return;
    if (!this.mothanData?.branches?.length) return;
    const ar = this.isAr;
    const base = this.getChartBase();
    const mothanBranches = [...(this.mothanData.branches as any[])]
      .sort((a, b) => b.goldGrams - a.goldGrams)
      .slice(0, 10);

    // Find SAR amounts from enriched branches
    const getAmt = (code: string) => {
      const b = this.branches.find(x => x.branchCode === code || x.code === code);
      return b?.mothanAmount ?? 0;
    };

    const cfg: any = {
      type: 'bar',
      data: {
        labels: mothanBranches.map((b: any) => b.branchName),
        datasets: [
          {
            type: 'bar',
            label: ar ? 'وزن الذهب (جم)' : 'Gold Weight (g)',
            data: mothanBranches.map((b: any) => b.goldGrams),
            backgroundColor: 'rgba(201,168,76,0.55)',
            borderRadius: 6,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: ar ? 'المبلغ (ر.س)' : 'Amount (SAR)',
            data: mothanBranches.map((b: any) => getAmt(b.branchCode)),
            borderColor: 'rgba(52,211,153,0.9)',
            backgroundColor: 'rgba(52,211,153,0.1)',
            borderWidth: 2,
            pointRadius: 4,
            tension: 0.4,
            fill: true,
            yAxisID: 'y2',
          }
        ]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          legend: {
            display: true, position: 'bottom',
            labels: { color: 'rgba(242,237,228,0.6)', font: { size: 11 }, usePointStyle: true, padding: 14 }
          },
          tooltip: { ...base.plugins.tooltip }
        },
        scales: {
          ...base.scales,
          y: {
            ...base.scales.y,
            position: 'left',
            ticks: { ...base.scales.y.ticks, callback: (v: any) => v.toFixed(0) + 'g' }
          },
          y2: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false, color: 'rgba(201,168,76,0.06)' },
            border: { display: false } as any,
            ticks: {
              color: 'rgba(242,237,228,0.45)',
              font: { size: 10, family: "'IBM Plex Mono', monospace" },
              callback: (v: any) => (v / 1e3).toFixed(0) + (ar ? 'ك' : 'K')
            }
          }
        }
      }
    };
    this.destroyChart('mothan');
    this.charts['mothan'] = new Chart(this.cvMothan.nativeElement, cfg);
  }

  // Chart 12 — Gold Exposure (sell vs purch weight per branch)
  private buildExposureChart(): void {
    if (!this.cvExposure?.nativeElement) return;
    const top10 = [...this.branches]
      .sort((a, b) => b.sellWeight - a.sellWeight)
      .slice(0, 10);
    const ar = this.isAr;
    const base = this.getChartBase();

    const cfg: any = {
      type: 'bar',
      data: {
        labels: top10.map(b => b.branchName),
        datasets: [
          {
            label: ar ? 'وزن البيع (جم)' : 'Sell Weight (g)',
            data: top10.map(b => b.sellWeight),
            backgroundColor: 'rgba(201,168,76,0.55)',
            borderRadius: 6,
          },
          {
            label: ar ? 'وزن الشراء (جم)' : 'Purchase Weight (g)',
            data: top10.map(b => b.purchWeight),
            backgroundColor: 'rgba(52,211,153,0.35)',
            borderRadius: 6,
          }
        ]
      },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          legend: {
            display: true, position: 'bottom',
            labels: { color: 'rgba(242,237,228,0.6)', font: { size: 11 }, usePointStyle: true, padding: 14 }
          },
          tooltip: {
            ...base.plugins.tooltip,
            callbacks: {
              title: (items: any[]) => top10[items[0].dataIndex]?.branchName ?? '',
              label: (item: any) => {
                const b = top10[item.dataIndex];
                if (!b) return '';
                if (item.datasetIndex === 0)
                  return `${ar ? 'وزن البيع' : 'Sell Wt'}: ${b.sellWeight.toFixed(2)}g`;
                return [
                  `${ar ? 'وزن الشراء' : 'Purch Wt'}: ${b.purchWeight.toFixed(2)}g`,
                  `${ar ? 'التغطية' : 'Coverage'}: ${b.coverage}%`,
                  `${ar ? 'الكشف' : 'Exposure'}: ${b.exposure.toFixed(2)}g`,
                ];
              }
            }
          }
        },
        scales: {
          ...base.scales,
          y: {
            ...base.scales.y,
            ticks: {
              ...base.scales.y.ticks,
              callback: (v: any) => v.toFixed(0) + 'g'
            }
          }
        }
      }
    };
    this.destroyChart('exposure');
    this.charts['exposure'] = new Chart(this.cvExposure.nativeElement, cfg);
  }

  // KPI computed getters
  get kpiTotalSales():    string { return this.fmtSAR(this.summary?.totalSalesAmount ?? 0); }
  get kpiTotalPurch():    string { return this.fmtSAR(this.summary?.totalPurchasesAmount ?? 0); }
  get kpiNet():           string { return this.fmtSAR(this.summary?.net ?? 0); }
  get kpiNetClass():      'pos' | 'neg' | '' {
    const v = this.summary?.net ?? 0;
    return v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  }
  get kpiSaleRate():      string { return (this.summary?.globalSaleRate ?? 0).toFixed(2); }
  get kpiPurchRate():     string { return (this.summary?.globalPurchRate ?? 0).toFixed(2); }
  get kpiDiffRate():      string { return (this.summary?.weightedDiffRate ?? 0).toFixed(2); }
  get kpiDiffClass():     'pos' | 'neg' | '' {
    const v = this.summary?.weightedDiffRate ?? 0;
    return v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  }
  get kpiInvoices():      string { return (this.summary?.totalInvoices ?? 0).toLocaleString(); }
  get kpiAvgInvoice():    string { return this.fmtSAR(this.summary?.avgInvoice ?? 0); }
  get kpiNegBranches():   string { return (this.summary?.negativeBranchCount ?? 0).toString(); }
  get kpiTopBranch():     string { return this.summary?.topBranch?.branchName ?? '—'; }
  get kpiReturnsPct():    string { return `${(this.summary?.returnsPct ?? 0).toFixed(1)}%`; }
  get kpiReturnsClass():  'amber' | '' {
    return (this.summary?.returnsPct ?? 0) >= 5 ? 'amber' : '';
  }
  get kpiMothanTotal():   string { return this.fmtSAR(this.mothanSummary.total); }
  get kpiMothanWeight():  string { return `${this.mothanSummary.weight.toFixed(2)}g`; }
  get kpiMothanAvgRate(): string { return this.mothanSummary.avgRate.toFixed(2); }

  empCountByClass(cls: string): number {
    return this.employees.filter((e: any) => e.classification === cls).length;
  }
}
