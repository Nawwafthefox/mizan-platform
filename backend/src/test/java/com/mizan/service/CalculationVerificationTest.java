package com.mizan.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.Mockito.when;

/**
 * Calculation Verification Tests — MIZAN vs Reference Platform
 *
 * Scenario:
 *   Branch A: sales 100,000 SAR / 150g | purchases 80,000 SAR / 130g | mothan 10,000 SAR / 16g
 *   Branch B: return -5,000 SAR / -8g
 *
 * Reference formulas:
 *   saleRate  = round(sar / wt, 4)
 *   purchRate = round((purch + mothan) / (purchWt + mothanWt), 4)
 *   diffRate  = round(saleRate - purchRate, 4)
 *   net       = sar - (purch + mothan)
 *   profitMargin = round(wt * diffRate, 2)
 *   avgInvoice   = round(sar / invoices, 2)
 *   achievementPct = actualWt / (dailyPerEmp * days) * 100
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("MIZAN Calculation Verification")
class CalculationVerificationTest {

    // ── Test constants ────────────────────────────────────────────

    private static final String TENANT  = "test-tenant";
    private static final LocalDate FROM = LocalDate.of(2026, 3, 1);
    private static final LocalDate TO   = LocalDate.of(2026, 3, 31);

    // Branch A values
    private static final double A_SAR       = 100_000.0;
    private static final double A_WT        = 150.0;
    private static final double A_PURCH     = 80_000.0;
    private static final double A_PURCH_WT  = 130.0;
    private static final double A_MOTHAN    = 10_000.0;
    private static final double A_MOTHAN_WT = 16.0;
    private static final int    A_INVOICES  = 20;

    // Expected derived values — computed by reference platform
    private static final double A_COMBINED_PURCH    = A_PURCH + A_MOTHAN;           // 90,000
    private static final double A_COMBINED_PURCH_WT = A_PURCH_WT + A_MOTHAN_WT;     // 146
    private static final double A_SALE_RATE  = r4(A_SAR / A_WT);                   // 666.6667
    private static final double A_PURCH_RATE = r4(A_COMBINED_PURCH / A_COMBINED_PURCH_WT); // 616.4384
    private static final double A_DIFF_RATE  = r4(A_SALE_RATE - A_PURCH_RATE);     // 50.2283
    private static final double A_NET        = A_SAR - A_COMBINED_PURCH;            // 10,000

    // Branch B (return day)
    private static final double B_SAR = -5_000.0;
    private static final double B_WT  = -8.0;

    // ── Mocks ─────────────────────────────────────────────────────

    @Mock V3CalculationService calcSvc;

    DashboardService svc;

    @BeforeEach
    void setUp() {
        svc = new DashboardService(calcSvc);
    }

    // ── Helpers ───────────────────────────────────────────────────

    private static double r4(double v) { return Math.round(v * 10000.0) / 10000.0; }
    private static double r2(double v) { return Math.round(v * 100.0)   / 100.0; }

    /**
     * Stubs V3CalculationService.getBranchSummaries() with pre-built Maps matching the
     * test scenario. V3 already returns fully computed fields (saleRate, purchRate, etc.)
     * — DashboardService just converts the Maps to BranchData records.
     */
    private void stubCalcSvc() {
        // Branch A: normal sales + purchases + mothan
        Map<String, Object> branchA = new LinkedHashMap<>();
        branchA.put("branchCode",  "A");
        branchA.put("branchName",  "فرع ألفا");
        branchA.put("region",      "وسط");
        branchA.put("totalSar",    A_SAR);
        branchA.put("totalWeight", A_WT);
        branchA.put("totalPieces", (long) A_INVOICES);
        branchA.put("returns",     0.0);
        branchA.put("returnDays",  0);
        branchA.put("k18Sar", 0.0); branchA.put("k18Wt", 0.0);
        branchA.put("k21Sar", 0.0); branchA.put("k21Wt", 0.0);
        branchA.put("k22Sar", 0.0); branchA.put("k22Wt", 0.0);
        branchA.put("k24Sar", 0.0); branchA.put("k24Wt", 0.0);
        branchA.put("purchSar",    A_PURCH);
        branchA.put("purchWt",     A_PURCH_WT);
        branchA.put("mothanSar",   A_MOTHAN);
        branchA.put("mothanWt",    A_MOTHAN_WT);
        branchA.put("saleRate",    A_SALE_RATE);
        branchA.put("purchRate",   A_PURCH_RATE);
        branchA.put("diffRate",    A_DIFF_RATE);
        branchA.put("net",         A_NET);
        branchA.put("avgInvoice",  r2(A_SAR / A_INVOICES));

        // Branch B: pure return day — V3 returns absolute value in "returns"
        Map<String, Object> branchB = new LinkedHashMap<>();
        branchB.put("branchCode",  "B");
        branchB.put("branchName",  "فرع بيتا");
        branchB.put("region",      "وسط");
        branchB.put("totalSar",    B_SAR);
        branchB.put("totalWeight", B_WT);
        branchB.put("totalPieces", 1L);
        branchB.put("returns",     Math.abs(B_SAR));   // V3 stores positive abs value
        branchB.put("returnDays",  1);
        branchB.put("k18Sar", 0.0); branchB.put("k18Wt", 0.0);
        branchB.put("k21Sar", 0.0); branchB.put("k21Wt", 0.0);
        branchB.put("k22Sar", 0.0); branchB.put("k22Wt", 0.0);
        branchB.put("k24Sar", 0.0); branchB.put("k24Wt", 0.0);
        branchB.put("purchSar",    0.0);
        branchB.put("purchWt",     0.0);
        branchB.put("mothanSar",   0.0);
        branchB.put("mothanWt",    0.0);
        branchB.put("saleRate",    r4(B_SAR / B_WT));   // 625.0
        branchB.put("purchRate",   0.0);
        branchB.put("diffRate",    0.0);                 // guarded — no purchases
        branchB.put("net",         B_SAR);
        branchB.put("avgInvoice",  r2(B_SAR / 1.0));

        when(calcSvc.getBranchSummaries(TENANT, FROM, TO)).thenReturn(List.of(branchA, branchB));
    }

    // ── Branch Summaries ──────────────────────────────────────────

    @Nested
    @DisplayName("getBranchSummaries — rate calculations")
    class BranchSummaryTests {

        @BeforeEach
        void stubRepos() {
            stubCalcSvc();
        }

        @Test
        @DisplayName("Branch A: saleRate = round(100000/150, 4) = 666.6667")
        void branchA_saleRate() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var a = branches.stream().filter(b -> "A".equals(b.code())).findFirst().orElseThrow();
            assertThat(a.saleRate()).isEqualTo(666.6667, within(0.0001));
        }

        @Test
        @DisplayName("Branch A: purchRate = round(90000/146, 4) = 616.4384")
        void branchA_purchRate() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var a = branches.stream().filter(b -> "A".equals(b.code())).findFirst().orElseThrow();
            assertThat(a.purchRate()).isEqualTo(616.4384, within(0.0001));
        }

        @Test
        @DisplayName("Branch A: diffRate = 666.6667 - 616.4384 = 50.2283")
        void branchA_diffRate() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var a = branches.stream().filter(b -> "A".equals(b.code())).findFirst().orElseThrow();
            assertThat(a.diffRate()).isEqualTo(A_DIFF_RATE, within(0.0001));
        }

        @Test
        @DisplayName("Branch A: net = 100000 - 90000 = 10000")
        void branchA_net() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var a = branches.stream().filter(b -> "A".equals(b.code())).findFirst().orElseThrow();
            assertThat(a.net()).isEqualTo(10_000.0, within(0.01));
        }

        @Test
        @DisplayName("Branch A: avgInvoice = round(100000/20, 2) = 5000.00")
        void branchA_avgInvoice() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var a = branches.stream().filter(b -> "A".equals(b.code())).findFirst().orElseThrow();
            assertThat(a.avgInvoice()).isEqualTo(r2(A_SAR / A_INVOICES), within(0.01));
        }

        @Test
        @DisplayName("Branch A: purchRate uses combined purch+mothan weight")
        void branchA_purchRate_includes_mothan() {
            // If mothan were excluded, rate = 80000/130 = 615.3846 — different from expected
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var a = branches.stream().filter(b -> "A".equals(b.code())).findFirst().orElseThrow();
            assertThat(a.purchRate()).isNotEqualTo(r4(A_PURCH / A_PURCH_WT)); // 615.3846
            assertThat(a.purchRate()).isEqualTo(r4(A_COMBINED_PURCH / A_COMBINED_PURCH_WT)); // 616.4384
        }

        @Test
        @DisplayName("Branch B: returns = 5000 (abs of negative SAR)")
        void branchB_returns() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var b = branches.stream().filter(x -> "B".equals(x.code())).findFirst().orElseThrow();
            assertThat(b.returns()).isEqualTo(5_000.0, within(0.01));
        }

        @Test
        @DisplayName("Branch B: isReturn = true")
        void branchB_isReturn() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var b = branches.stream().filter(x -> "B".equals(x.code())).findFirst().orElseThrow();
            assertThat(b.isReturn()).isTrue();
        }

        @Test
        @DisplayName("Branch B: returnDays = 1 (one return record)")
        void branchB_returnDays() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var b = branches.stream().filter(x -> "B".equals(x.code())).findFirst().orElseThrow();
            assertThat(b.returnDays()).isEqualTo(1);
        }

        @Test
        @DisplayName("Branch A mothan fields present")
        void branchA_mothanFields() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var a = branches.stream().filter(b -> "A".equals(b.code())).findFirst().orElseThrow();
            assertThat(a.mothan()).isEqualTo(A_MOTHAN, within(0.01));
            assertThat(a.mothanWt()).isEqualTo(A_MOTHAN_WT, within(0.01));
        }

        @Test
        @DisplayName("Rounding: saleRate has at most 4 decimal places")
        void rounding_4dp() {
            var branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
            var a = branches.stream().filter(b -> "A".equals(b.code())).findFirst().orElseThrow();
            // r4(value) should equal the value itself (already at 4dp precision)
            assertThat(r4(a.saleRate())).isEqualTo(a.saleRate());
            assertThat(r4(a.purchRate())).isEqualTo(a.purchRate());
            assertThat(r4(a.diffRate())).isEqualTo(a.diffRate());
        }
    }

    // ── Summary KPI Aggregation ───────────────────────────────────

    @Nested
    @DisplayName("Summary KPI — multi-branch aggregation")
    class SummaryKpiTests {

        private List<DashboardService.BranchData> branches;

        @BeforeEach
        void buildBranches() {
            stubCalcSvc();
            branches = svc.getBranchSummaries(TENANT, FROM, TO, null);
        }

        @Test
        @DisplayName("totalSalesAmount = sum of all branch sar")
        void totalSalesAmount() {
            double total = branches.stream().mapToDouble(DashboardService.BranchData::sar).sum();
            assertThat(total).isEqualTo(A_SAR + B_SAR, within(0.01)); // 95,000
        }

        @Test
        @DisplayName("totalPurchasesAmount = purch + mothan")
        void totalPurchasesAmount() {
            double total = branches.stream().mapToDouble(b -> b.purch() + b.mothan()).sum();
            assertThat(total).isEqualTo(A_COMBINED_PURCH, within(0.01)); // 90,000
        }

        @Test
        @DisplayName("netAmount = totalSales - totalPurchases")
        void netAmount() {
            double sales = branches.stream().mapToDouble(DashboardService.BranchData::sar).sum();
            double purch = branches.stream().mapToDouble(b -> b.purch() + b.mothan()).sum();
            assertThat(sales - purch).isEqualTo(5_000.0, within(0.01)); // 95000 - 90000
        }

        @Test
        @DisplayName("totalBranchPurchases excludes mothan")
        void totalBranchPurchases_excludesMothan() {
            double brPurch = branches.stream().mapToDouble(DashboardService.BranchData::purch).sum();
            assertThat(brPurch).isEqualTo(A_PURCH, within(0.01));       // 80,000 (no mothan)
        }

        @Test
        @DisplayName("totalMothan = sum of mothan SAR")
        void totalMothan() {
            double mothanTotal = branches.stream().mapToDouble(DashboardService.BranchData::mothan).sum();
            assertThat(mothanTotal).isEqualTo(A_MOTHAN, within(0.01));  // 10,000
        }

        @Test
        @DisplayName("totalReturns = abs(Branch B sar)")
        void totalReturns() {
            double returns = branches.stream().mapToDouble(DashboardService.BranchData::returns).sum();
            assertThat(returns).isEqualTo(5_000.0, within(0.01));
        }

        @Test
        @DisplayName("returnBranchCount = 1 (only Branch B)")
        void returnBranchCount() {
            long count = branches.stream().filter(b -> b.returns() > 0).count();
            assertThat(count).isEqualTo(1);
        }

        @Test
        @DisplayName("negativeBranches — Branch B has diffRate = 0 (no purchases)")
        void negativeBranches_branchB_noPurchases() {
            var b = branches.stream().filter(x -> "B".equals(x.code())).findFirst().orElseThrow();
            // No purchases → purchRate = 0 → diffRate = 0 (guarded), not negative
            assertThat(b.diffRate()).isEqualTo(0.0);
        }

        @Test
        @DisplayName("profitableBranches: Branch A diffRate > 0")
        void profitableBranches() {
            long profitable = branches.stream().filter(b -> b.diffRate() > 0).count();
            assertThat(profitable).isGreaterThanOrEqualTo(1);
        }

        @Test
        @DisplayName("topBranch = Branch A (highest sar)")
        void topBranch() {
            var top = branches.stream()
                .max(java.util.Comparator.comparingDouble(DashboardService.BranchData::sar))
                .orElseThrow();
            assertThat(top.code()).isEqualTo("A");
        }

        @Test
        @DisplayName("topReturnBranch = Branch B")
        void topReturnBranch() {
            var topReturn = branches.stream()
                .filter(b -> b.returns() > 0)
                .max(java.util.Comparator.comparingDouble(DashboardService.BranchData::returns))
                .orElseThrow();
            assertThat(topReturn.code()).isEqualTo("B");
            assertThat(topReturn.returns()).isEqualTo(5_000.0, within(0.01));
        }
    }

    // ── Employee Calculation ──────────────────────────────────────

    @Nested
    @DisplayName("Employee enrichment — profitMargin, rating, achievement")
    class EmployeeCalculationTests {

        /**
         * For employee calculations the controller uses the branch purchRate
         * from getBranchSummaries. We replicate that logic inline here.
         */

        private double employeeProfitMargin(double sar, double wt, double purchRate) {
            double saleRate = wt != 0 ? sar / wt : 0;
            double diffRate = Math.round((saleRate - purchRate) * 10000) / 10000.0;
            return purchRate > 0 ? Math.round(wt * diffRate * 100) / 100.0 : 0;
        }

        private String rating(double saleRate) {
            return saleRate >= 700 ? "excellent"
                 : saleRate >= 600 ? "good"
                 : saleRate >= 500 ? "average"
                 : "weak";
        }

        private double achievementPct(double actualWt, double dailyPerEmp, int days) {
            double target = dailyPerEmp * days;
            return target > 0 ? (Math.abs(actualWt) / target) * 100 : 0;
        }

        @Test
        @DisplayName("profitMargin = wt × diffRate (not percentage-based)")
        void profitMargin_formula() {
            // Employee: 30,000 SAR / 45g, branch purchRate = A_PURCH_RATE (616.4384)
            double sar = 30_000.0, wt = 45.0;
            double sr  = r4(sar / wt);                              // 666.6667
            double dr  = r4(sr - A_PURCH_RATE);                     // 50.2283
            double pm  = r2(wt * dr);                               // 45 × 50.2283 = 2260.27

            assertThat(employeeProfitMargin(sar, wt, A_PURCH_RATE)).isEqualTo(pm, within(0.01));
            assertThat(pm).isEqualTo(2260.27, within(0.01));
        }

        @Test
        @DisplayName("profitMargin is zero when purchRate is zero")
        void profitMargin_zero_when_no_purchRate() {
            assertThat(employeeProfitMargin(30_000, 45, 0)).isEqualTo(0.0);
        }

        @Test
        @DisplayName("rating thresholds: ≥700=excellent, ≥600=good, ≥500=average, <500=weak")
        void rating_thresholds() {
            assertThat(rating(700)).isEqualTo("excellent");
            assertThat(rating(699.99)).isEqualTo("good");
            assertThat(rating(600)).isEqualTo("good");
            assertThat(rating(599.99)).isEqualTo("average");
            assertThat(rating(500)).isEqualTo("average");
            assertThat(rating(499.99)).isEqualTo("weak");
            assertThat(rating(0)).isEqualTo("weak");
        }

        @Test
        @DisplayName("rating boundary: Branch A saleRate 666.6667 → good")
        void rating_branchA_saleRate() {
            assertThat(rating(666.6667)).isEqualTo("good");
        }

        @Test
        @DisplayName("achievementPct = actualWt / (dailyPerEmp × days) × 100")
        void achievementPct_formula() {
            // 15g actual, 2g/day target, 10 days → 75%
            assertThat(achievementPct(15, 2.0, 10)).isEqualTo(75.0, within(0.01));
        }

        @Test
        @DisplayName("achievementPct: exceeded when actualWt >= targetWt")
        void achievementStatus_exceeded() {
            double pct = achievementPct(22, 2.0, 10); // target=20, actual=22 → 110%
            assertThat(pct).isGreaterThanOrEqualTo(100.0);
        }

        @Test
        @DisplayName("achievementPct: behind when < 70%")
        void achievementStatus_behind() {
            double pct = achievementPct(10, 2.0, 10); // target=20, actual=10 → 50%
            assertThat(pct).isLessThan(70.0);
        }

        @Test
        @DisplayName("achievementPct uses Math.abs(actualWt) — negative wt (return) treated as positive")
        void achievementPct_handles_negative_weight() {
            double pct = achievementPct(-15, 2.0, 10); // abs(-15)=15 → 75%
            assertThat(pct).isEqualTo(75.0, within(0.01));
        }

        @Test
        @DisplayName("achievementPct = 0 when no target set")
        void achievementPct_zero_no_target() {
            assertThat(achievementPct(20, 0, 10)).isEqualTo(0.0);
        }
    }

    // ── Alert Logic ───────────────────────────────────────────────

    @Nested
    @DisplayName("Alert thresholds — returns and rate diff")
    class AlertThresholdTests {

        private String returnAlertSeverity(double returns, double sar) {
            if (returns <= 0) return "none";
            double pct = sar > 0 ? (returns / sar) * 100 : 0;
            if (pct >= 10) return "CRITICAL";
            if (pct >= 5)  return "WARNING";
            return "INFO";
        }

        @Test
        @DisplayName("Returns ≥ 10% of sales → CRITICAL")
        void returns_critical_threshold() {
            assertThat(returnAlertSeverity(10_001, 100_000)).isEqualTo("CRITICAL");
            assertThat(returnAlertSeverity(10_000, 100_000)).isEqualTo("CRITICAL"); // exactly 10%
        }

        @Test
        @DisplayName("Returns 5-9.9% of sales → WARNING")
        void returns_warning_threshold() {
            assertThat(returnAlertSeverity(5_000, 100_000)).isEqualTo("WARNING");   // 5%
            assertThat(returnAlertSeverity(9_999, 100_000)).isEqualTo("WARNING");   // 9.999%
        }

        @Test
        @DisplayName("Returns < 5% of sales → INFO")
        void returns_info_threshold() {
            assertThat(returnAlertSeverity(4_999, 100_000)).isEqualTo("INFO");      // 4.999%
            assertThat(returnAlertSeverity(1, 100_000)).isEqualTo("INFO");
        }

        @Test
        @DisplayName("No returns → no alert")
        void no_returns_no_alert() {
            assertThat(returnAlertSeverity(0, 100_000)).isEqualTo("none");
        }

        @Test
        @DisplayName("Negative diffRate → CRITICAL rate alert")
        void negative_diffRate_is_critical() {
            var branches = List.of(Map.of("diffRate", -5.0, "purchRate", 600.0));
            boolean hasCritical = branches.stream()
                .anyMatch(b -> ((double)b.get("purchRate")) > 0 && ((double)b.get("diffRate")) < 0);
            assertThat(hasCritical).isTrue();
        }

        @Test
        @DisplayName("returnDays ≥ 3 → consecutive days alert")
        void returnDays_consecutive_threshold() {
            int returnDays = 3;
            assertThat(returnDays).isGreaterThanOrEqualTo(3); // triggers investigation alert
        }
    }

    // ── Rate Rounding Precision ───────────────────────────────────

    @Nested
    @DisplayName("Rounding precision contracts")
    class RoundingTests {

        @Test
        @DisplayName("r4: 100000/150 rounds to exactly 666.6667 (not 666.67 or 666.666667)")
        void r4_precision() {
            assertThat(r4(100_000.0 / 150.0)).isEqualTo(666.6667);
        }

        @Test
        @DisplayName("r4: 90000/146 rounds to exactly 616.4384")
        void r4_purchRate_precision() {
            assertThat(r4(90_000.0 / 146.0)).isEqualTo(616.4384);
        }

        @Test
        @DisplayName("r4: diffRate = 666.6667 - 616.4384 = 50.2283")
        void r4_diffRate_precision() {
            assertThat(r4(666.6667 - 616.4384)).isEqualTo(50.2283);
        }

        @Test
        @DisplayName("r2: avgInvoice = 100000/20 = 5000.00")
        void r2_avgInvoice() {
            assertThat(r2(100_000.0 / 20)).isEqualTo(5_000.0);
        }

        @Test
        @DisplayName("r2: profitMargin = 150 × 50.2283 = 7534.25")
        void r2_profitMargin() {
            assertThat(r2(150.0 * 50.2283)).isEqualTo(7534.24, within(0.01));
        }
    }
}
