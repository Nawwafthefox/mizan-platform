package com.mizan.controller;
import com.mizan.model.BranchPurchase;
import com.mizan.model.BranchSale;
import com.mizan.model.EmployeeSale;
import com.mizan.model.MothanTransaction;
import com.mizan.model.BranchPurchaseRate;
import com.mizan.repository.BranchPurchaseRateRepository;
import com.mizan.repository.BranchSaleRepository;
import com.mizan.repository.BranchTargetRepository;
import com.mizan.repository.DailySaleRepository;
import com.mizan.repository.EmployeeSaleRepository;
import com.mizan.repository.EmployeeTransferRepository;
import com.mizan.repository.MonthlySummaryRepository;
import com.mizan.repository.MothanTransactionRepository;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import com.mizan.repository.BranchPurchaseRepository;
import com.mizan.service.DashboardService;
import com.mizan.service.DashboardService.BranchData;
import com.mizan.service.UploadService;
import com.mizan.service.V3CacheService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final DashboardService dashSvc;
    private final EmployeeSaleRepository empRepo;
    private final MothanTransactionRepository mothanRepo;
    private final BranchSaleRepository saleRepo;
    private final BranchTargetRepository targetRepo;
    private final BranchPurchaseRateRepository rateRepo;
    private final BranchPurchaseRepository purchRepo;
    private final UploadService uploadSvc;
    private final DailySaleRepository dailySaleRepo;
    private final MonthlySummaryRepository monthlySummaryRepo;
    private final EmployeeTransferRepository empTransferRepo;
    private final V3CacheService cache;

    public DashboardController(DashboardService dashSvc,
            EmployeeSaleRepository empRepo,
            MothanTransactionRepository mothanRepo,
            BranchSaleRepository saleRepo,
            BranchTargetRepository targetRepo,
            BranchPurchaseRateRepository rateRepo,
            BranchPurchaseRepository purchRepo,
            UploadService uploadSvc,
            DailySaleRepository dailySaleRepo,
            MonthlySummaryRepository monthlySummaryRepo,
            EmployeeTransferRepository empTransferRepo,
            V3CacheService cache) {
        this.dashSvc = dashSvc;
        this.empRepo = empRepo;
        this.mothanRepo = mothanRepo;
        this.saleRepo = saleRepo;
        this.targetRepo = targetRepo;
        this.rateRepo = rateRepo;
        this.purchRepo = purchRepo;
        this.uploadSvc = uploadSvc;
        this.dailySaleRepo = dailySaleRepo;
        this.monthlySummaryRepo = monthlySummaryRepo;
        this.empTransferRepo = empTransferRepo;
        this.cache = cache;
    }

    // ── Cache helpers ─────────────────────────────────────────────────────────

    private String scopeKey(List<String> scoped) {
        if (scoped == null) return "all";
        return scoped.stream().sorted().collect(Collectors.joining(","));
    }

    @GetMapping("/summary")
    public ResponseEntity<?> summary(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null && !TenantContext.isSuperAdmin())
            return ResponseEntity.status(403).body(Map.of("success",false));
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",emptyKpi(from,to)));

        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        String cKey = tenantId + ":dash:summary:" + from + ":" + to + ":" + scopeKey(scoped);
        Object hit = cache.get(cKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));

        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, from, to, scoped);

        double totalSar = branches.stream().mapToDouble(BranchData::sar).sum();
        double totalPurch = branches.stream().mapToDouble(b->b.purch()+b.mothan()).sum();
        double totalWn = branches.stream().mapToDouble(BranchData::wn).sum();
        long totalPcs = branches.stream().mapToLong(b -> Math.abs(b.pcs())).sum();
        long profitable = branches.stream().filter(b->b.diffRate()>0).count();
        long loss = branches.stream().filter(b->b.diffRate()<0 && b.purchRate()>0).count();
        double overallSaleRate = r4(totalWn > 0 ? totalSar / totalWn : 0);
        double totalPurchWt = branches.stream().mapToDouble(b->b.purchWt()+b.mothanWt()).sum();
        double overallPurchRate = r4(totalPurchWt > 0 ? totalPurch / totalPurchWt : 0);
        BranchData top = branches.stream().max(Comparator.comparingDouble(BranchData::sar)).orElse(null);

        double totalBranchPurch   = branches.stream().mapToDouble(BranchData::purch).sum();
        double totalBranchPurchWt = branches.stream().mapToDouble(BranchData::purchWt).sum();
        double totalMothanSar     = branches.stream().mapToDouble(BranchData::mothan).sum();
        double totalMothanWt      = branches.stream().mapToDouble(BranchData::mothanWt).sum();
        long   mothanTxnCount     = mothanRepo.countByTenantAndRange(tenantId, from, to);
        double totalReturns       = branches.stream().mapToDouble(BranchData::returns).sum();
        long   returnBranchCount  = branches.stream().filter(b -> b.returns() > 0).count();
        long   negativeBranches   = branches.stream().filter(b -> b.diffRate() < 0).count();
        BranchData topReturn = branches.stream().filter(b -> b.returns() > 0)
            .max(Comparator.comparingDouble(BranchData::returns)).orElse(null);

        Map<String,Object> kpi = new LinkedHashMap<>();
        kpi.put("totalSalesAmount", totalSar);
        kpi.put("totalPurchasesAmount", totalPurch);
        kpi.put("netAmount", totalSar - totalPurch);
        kpi.put("totalNetWeight", totalWn);
        kpi.put("totalInvoices", totalPcs);
        kpi.put("avgInvoice", totalPcs > 0 ? totalSar / totalPcs : 0);
        kpi.put("saleRate", overallSaleRate);
        kpi.put("purchaseRate", overallPurchRate);
        kpi.put("rateDifference", overallPurchRate > 0 ? r4(overallSaleRate - overallPurchRate) : 0);
        kpi.put("branchCount", branches.size());
        kpi.put("profitableBranches", profitable);
        kpi.put("lossBranches", loss);
        kpi.put("topBranchName", top != null ? top.name() : "");
        kpi.put("topBranchSar", top != null ? top.sar() : 0);
        kpi.put("totalBranchPurchases", totalBranchPurch);
        kpi.put("totalBranchPurchaseWeight", totalBranchPurchWt);
        kpi.put("totalMothan", totalMothanSar);
        kpi.put("totalMothanWeight", totalMothanWt);
        kpi.put("mothanTxnCount", mothanTxnCount);
        kpi.put("totalReturns", totalReturns);
        kpi.put("returnBranchCount", returnBranchCount);
        kpi.put("topReturnBranchName", topReturn != null ? topReturn.name() : "");
        kpi.put("topReturnBranchSar", topReturn != null ? topReturn.returns() : 0);
        kpi.put("topReturnBranchDays", topReturn != null ? topReturn.returnDays() : 0);
        kpi.put("negativeBranches", negativeBranches);
        kpi.put("dateRange", Map.of("from", from.toString(), "to", to.toString()));

        cache.put(cKey, kpi);
        return ResponseEntity.ok(Map.of("success",true,"data",kpi));
    }

    @GetMapping("/branches")
    public ResponseEntity<?> branches(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required=false) String region,
            @RequestParam(required=false) String sort,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        String cKey = tenantId + ":dash:branches:" + from + ":" + to + ":" + scopeKey(scoped) + ":" + (region != null ? region : "");
        Object hit = cache.get(cKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));
        List<BranchData> data = dashSvc.getBranchSummaries(tenantId, from, to, scoped);
        if (region != null && !region.isBlank())
            data = data.stream().filter(b->region.equals(b.region())).collect(Collectors.toList());
        cache.put(cKey, data);
        return ResponseEntity.ok(Map.of("success",true,"data",data));
    }

    @GetMapping("/employees")
    public ResponseEntity<?> employees(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required=false) String branchCode,
            @RequestParam(required=false) String region,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));

        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        String cKey = tenantId + ":dash:employees:" + from + ":" + to + ":" + scopeKey(scoped)
            + ":" + (branchCode != null ? branchCode : "") + ":" + (region != null ? region : "");
        Object hit = cache.get(cKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));

        // Load targets for the month of `from`
        Map<String, com.mizan.model.BranchTarget> targetByBranch =
            targetRepo.findByTenantIdAndTargetDateBetween(tenantId,
                from.withDayOfMonth(1), from.withDayOfMonth(from.lengthOfMonth()))
            .stream().collect(Collectors.toMap(
                com.mizan.model.BranchTarget::getBranchCode,
                t -> t, (a, b_) -> a));

        // Build branch purchase rate map: period-actual rate first, fallback to saved rate
        List<BranchData> branchSummaries = dashSvc.getBranchSummaries(tenantId, from, to, scoped);
        Map<String,Double> branchPurchRates = branchSummaries.stream()
            .collect(Collectors.toMap(BranchData::code, BranchData::purchRate, (a,b_)->a));
        Map<String,Double> savedRates = rateRepo.findByTenantId(tenantId).stream()
            .collect(Collectors.toMap(BranchPurchaseRate::getBranchCode, BranchPurchaseRate::getPurchaseRate, (a,b_)->a));

        List<EmployeeSale> sales = scoped == null
            ? empRepo.findByTenantAndRange(tenantId, from, to)
            : empRepo.findByTenantAndRangeAndBranches(tenantId, from, to, scoped);

        // Filter by branchCode/region if requested
        if (branchCode != null && !branchCode.isBlank())
            sales = sales.stream().filter(s -> branchCode.equals(s.getBranchCode())).collect(Collectors.toList());
        if (region != null && !region.isBlank())
            sales = sales.stream().filter(s -> region.equals(s.getRegion())).collect(Collectors.toList());

        // Group by employeeId
        Map<String, List<EmployeeSale>> byEmp = sales.stream()
            .collect(Collectors.groupingBy(EmployeeSale::getEmployeeId));

        List<Map<String,Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<EmployeeSale>> entry : byEmp.entrySet()) {
            List<EmployeeSale> empSales = entry.getValue();
            EmployeeSale first = empSales.get(0);

            double totalSar = empSales.stream().mapToDouble(EmployeeSale::getTotalSarAmount).sum();
            double totalWt = empSales.stream().mapToDouble(EmployeeSale::getNetWeight).sum();
            long invoiceCount = empSales.stream().mapToLong(e -> Math.abs(e.getInvoiceCount())).sum();
            double saleRate = totalWt > 0 ? totalSar / totalWt : 0;
            double returns = empSales.stream()
                .filter(s -> s.isReturn() || s.getTotalSarAmount() < 0)
                .mapToDouble(s -> Math.abs(s.getTotalSarAmount())).sum();
            long returnDays = empSales.stream()
                .filter(s -> s.isReturn() || s.getTotalSarAmount() < 0).count();
            com.mizan.model.BranchTarget target = targetByBranch.get(first.getBranchCode());
            double targetWeight = target != null ? target.getTargetNetWeightDaily() * empSales.size() : 0;
            double actualWeight = Math.abs(totalWt);
            double achievementPct = targetWeight > 0 ? (actualWeight / targetWeight) * 100 : 0;
            String achievementStatus = achievementPct >= 100 ? "exceeded" : achievementPct >= 70 ? "onTrack" : "behind";

            String bCode = first.getBranchCode();
            double purchRate = branchPurchRates.getOrDefault(bCode,
                savedRates.getOrDefault(bCode, 0.0));
            double diffRate = Math.round((saleRate - purchRate) * 10) / 10.0;
            double profitMargin = purchRate > 0 ? Math.round(totalWt * diffRate * 100) / 100.0 : 0;
            double avgInvoice = invoiceCount > 0 ? Math.round(totalSar / invoiceCount * 100) / 100.0 : 0;

            Map<String,Object> row = new LinkedHashMap<>();
            row.put("employeeId", entry.getKey());
            row.put("employeeName", first.getEmployeeName());
            row.put("branchCode", bCode);
            row.put("branchName", first.getBranchName());
            row.put("region", first.getRegion());
            row.put("totalSar", totalSar);
            row.put("totalWt", totalWt);
            row.put("invoiceCount", invoiceCount);
            row.put("saleRate", saleRate);
            row.put("purchRate", purchRate);
            row.put("diffRate", diffRate);
            row.put("profitMargin", profitMargin);
            row.put("avgInvoice", avgInvoice);
            String rating = saleRate >= 700 ? "excellent" : saleRate >= 600 ? "good" : saleRate >= 500 ? "average" : "weak";
            row.put("achieved", saleRate > purchRate);
            row.put("rating", rating);
            row.put("days", empSales.size());
            row.put("returns", returns);
            row.put("returnDays", returnDays);
            row.put("targetWeight", targetWeight);
            row.put("actualWeight", actualWeight);
            row.put("achievementPct", achievementPct);
            row.put("achievementStatus", achievementStatus);
            result.add(row);
        }

        // Sort by totalSar desc
        result.sort((a,b) -> Double.compare((double)b.get("totalSar"), (double)a.get("totalSar")));

        cache.put(cKey, result);
        return ResponseEntity.ok(Map.of("success",true,"data",result));
    }

    @GetMapping("/karat")
    public ResponseEntity<?> karat(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",Map.of()));
        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        String cKey = tenantId + ":dash:karat:" + from + ":" + to + ":" + scopeKey(scoped);
        Object hit = cache.get(cKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));
        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, from, to, scoped);

        double k18Sar = branches.stream().mapToDouble(BranchData::k18Sar).sum();
        double k18Wt = branches.stream().mapToDouble(BranchData::k18Wt).sum();
        double k21Sar = branches.stream().mapToDouble(BranchData::k21Sar).sum();
        double k21Wt = branches.stream().mapToDouble(BranchData::k21Wt).sum();
        double k22Sar = branches.stream().mapToDouble(BranchData::k22Sar).sum();
        double k22Wt = branches.stream().mapToDouble(BranchData::k22Wt).sum();
        double k24Sar = branches.stream().mapToDouble(BranchData::k24Sar).sum();
        double k24Wt = branches.stream().mapToDouble(BranchData::k24Wt).sum();

        Map<String,Object> karat = new LinkedHashMap<>();

        // Totals with rate
        Map<String,Object> totals = new LinkedHashMap<>();
        totals.put("k18", Map.of("sar", k18Sar, "wt", k18Wt, "rate", k18Wt > 0 ? k18Sar/k18Wt : 0));
        totals.put("k21", Map.of("sar", k21Sar, "wt", k21Wt, "rate", k21Wt > 0 ? k21Sar/k21Wt : 0));
        totals.put("k22", Map.of("sar", k22Sar, "wt", k22Wt, "rate", k22Wt > 0 ? k22Sar/k22Wt : 0));
        totals.put("k24", Map.of("sar", k24Sar, "wt", k24Wt, "rate", k24Wt > 0 ? k24Sar/k24Wt : 0));
        karat.put("totals", totals);

        // Legacy flat keys for backward compat
        karat.put("k18", Map.of("sar", k18Sar, "wt", k18Wt, "rate", k18Wt > 0 ? k18Sar/k18Wt : 0));
        karat.put("k21", Map.of("sar", k21Sar, "wt", k21Wt, "rate", k21Wt > 0 ? k21Sar/k21Wt : 0));
        karat.put("k22", Map.of("sar", k22Sar, "wt", k22Wt, "rate", k22Wt > 0 ? k22Sar/k22Wt : 0));
        karat.put("k24", Map.of("sar", k24Sar, "wt", k24Wt, "rate", k24Wt > 0 ? k24Sar/k24Wt : 0));

        // byBranch
        List<Map<String,Object>> byBranch = new ArrayList<>();
        for (BranchData b : branches) {
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode", b.code());
            row.put("branchName", b.name());
            row.put("region", b.region());
            row.put("k18Sar", b.k18Sar()); row.put("k18Wt", b.k18Wt());
            row.put("k21Sar", b.k21Sar()); row.put("k21Wt", b.k21Wt());
            row.put("k22Sar", b.k22Sar()); row.put("k22Wt", b.k22Wt());
            row.put("k24Sar", b.k24Sar()); row.put("k24Wt", b.k24Wt());
            byBranch.add(row);
        }
        karat.put("byBranch", byBranch);

        cache.put(cKey, karat);
        return ResponseEntity.ok(Map.of("success",true,"data",karat));
    }

    @GetMapping("/mothan")
    public ResponseEntity<?> mothan(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",Map.of()));

        String cKey = tenantId + ":dash:mothan:" + from + ":" + to;
        Object hit = cache.get(cKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));

        List<MothanTransaction> transactions = mothanRepo.findByTenantAndRange(tenantId, from, to);

        double totalSar = transactions.stream().mapToDouble(MothanTransaction::getCreditSar).sum();
        double totalWt = transactions.stream().mapToDouble(MothanTransaction::getGoldWeightGrams).sum();
        double avgRate = totalWt > 0 ? totalSar / totalWt : 0;

        // Group by branch
        Map<String, List<MothanTransaction>> byBranch = transactions.stream()
            .collect(Collectors.groupingBy(MothanTransaction::getBranchCode));

        List<Map<String,Object>> branchSummary = new ArrayList<>();
        for (Map.Entry<String, List<MothanTransaction>> entry : byBranch.entrySet()) {
            List<MothanTransaction> bTxns = entry.getValue();
            MothanTransaction first = bTxns.get(0);
            double bSar = bTxns.stream().mapToDouble(MothanTransaction::getCreditSar).sum();
            double bWt = bTxns.stream().mapToDouble(MothanTransaction::getGoldWeightGrams).sum();
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode", entry.getKey());
            row.put("branchName", first.getBranchName());
            row.put("totalSar", bSar);
            row.put("totalWt", bWt);
            row.put("txnCount", bTxns.size());
            row.put("avgRate", bWt > 0 ? bSar / bWt : 0);
            branchSummary.add(row);
        }
        branchSummary.sort((a,b) -> Double.compare((double)b.get("totalSar"), (double)a.get("totalSar")));

        Map<String,Object> result = new LinkedHashMap<>();
        result.put("transactions", transactions);
        result.put("totalSar", totalSar);
        result.put("totalWt", totalWt);
        result.put("avgRate", avgRate);
        result.put("txnCount", transactions.size());
        result.put("byBranch", branchSummary);

        cache.put(cKey, result);
        return ResponseEntity.ok(Map.of("success",true,"data",result));
    }

    @GetMapping("/regions")
    public ResponseEntity<?> regions(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));

        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        String cKey = tenantId + ":dash:regions:" + from + ":" + to + ":" + scopeKey(scoped);
        Object hit = cache.get(cKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));
        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, from, to, scoped);

        // Group by region
        Map<String, List<BranchData>> byRegion = branches.stream()
            .collect(Collectors.groupingBy(BranchData::region));

        List<Map<String,Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<BranchData>> entry : byRegion.entrySet()) {
            List<BranchData> rBranches = entry.getValue();
            double totalSar = rBranches.stream().mapToDouble(BranchData::sar).sum();
            double totalPurch = rBranches.stream().mapToDouble(b->b.purch()+b.mothan()).sum();
            double totalMothan = rBranches.stream().mapToDouble(BranchData::mothan).sum();
            double totalWt = rBranches.stream().mapToDouble(BranchData::wn).sum();
            double totalPurchWt = rBranches.stream().mapToDouble(b->b.purchWt()+b.mothanWt()).sum();
            double net = totalSar - totalPurch;
            double saleRate = totalWt > 0 ? totalSar / totalWt : 0;
            double purchRate = totalPurchWt > 0 ? totalPurch / totalPurchWt : 0;
            double diffRate = purchRate > 0 ? saleRate - purchRate : 0;

            Map<String,Object> row = new LinkedHashMap<>();
            row.put("region", entry.getKey());
            row.put("branchCount", rBranches.size());
            row.put("totalSar", totalSar);
            row.put("totalPurch", totalPurch);
            row.put("totalMothan", totalMothan);
            row.put("totalWt", totalWt);
            row.put("net", net);
            row.put("saleRate", saleRate);
            row.put("purchRate", purchRate);
            row.put("diffRate", diffRate);
            row.put("branches", rBranches);
            result.add(row);
        }

        result.sort((a,b) -> Double.compare((double)b.get("totalSar"), (double)a.get("totalSar")));
        cache.put(cKey, result);
        return ResponseEntity.ok(Map.of("success",true,"data",result));
    }

    @GetMapping("/comparison")
    public ResponseEntity<?> comparison(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate d1,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate d2,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",Map.of()));

        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        List<BranchData> branches1 = dashSvc.getBranchSummaries(tenantId, d1, d1, scoped);
        List<BranchData> branches2 = dashSvc.getBranchSummaries(tenantId, d2, d2, scoped);

        Map<String,Object> day1 = buildDaySummary(branches1, d1.toString());
        Map<String,Object> day2 = buildDaySummary(branches2, d2.toString());

        double sar1 = (double) day1.get("totalSar");
        double sar2 = (double) day2.get("totalSar");
        double purch1 = (double) day1.get("totalPurch");
        double purch2 = (double) day2.get("totalPurch");
        double net1 = (double) day1.get("net");
        double net2 = (double) day2.get("net");

        Map<String,Object> delta = new LinkedHashMap<>();
        delta.put("totalSar", sar2 - sar1);
        delta.put("totalPurch", purch2 - purch1);
        delta.put("net", net2 - net1);
        delta.put("totalSarPct", sar1 != 0 ? (sar2-sar1)/sar1*100 : 0);
        delta.put("totalPurchPct", purch1 != 0 ? (purch2-purch1)/purch1*100 : 0);
        delta.put("netPct", net1 != 0 ? (net2-net1)/net1*100 : 0);

        // Merge branch data
        Map<String, Map<String,Object>> mergedByBranch = new LinkedHashMap<>();
        for (BranchData b : branches1) {
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("branchCode", b.code()); m.put("branchName", b.name()); m.put("region", b.region());
            m.put("sar1", b.sar()); m.put("purch1", b.purch()+b.mothan()); m.put("net1", b.net());
            m.put("sar2", 0.0); m.put("purch2", 0.0); m.put("net2", 0.0);
            mergedByBranch.put(b.code(), m);
        }
        for (BranchData b : branches2) {
            Map<String,Object> m = mergedByBranch.computeIfAbsent(b.code(), k -> {
                Map<String,Object> nm = new LinkedHashMap<>();
                nm.put("branchCode", b.code()); nm.put("branchName", b.name()); nm.put("region", b.region());
                nm.put("sar1", 0.0); nm.put("purch1", 0.0); nm.put("net1", 0.0);
                return nm;
            });
            m.put("sar2", b.sar()); m.put("purch2", b.purch()+b.mothan()); m.put("net2", b.net());
        }
        for (Map<String,Object> m : mergedByBranch.values()) {
            double s1 = (double) m.get("sar1"), s2 = (double) m.get("sar2");
            double p1 = (double) m.get("purch1"), p2 = (double) m.get("purch2");
            double n1 = (double) m.get("net1"), n2 = (double) m.get("net2");
            m.put("sarDelta", s2 - s1);
            m.put("sarDeltaPct", s1 != 0 ? (s2-s1)/s1*100 : 0);
            m.put("purchDelta", p2 - p1);
            m.put("purchDeltaPct", p1 != 0 ? (p2-p1)/p1*100 : 0);
            m.put("netDelta", n2 - n1);
            m.put("netDeltaPct", n1 != 0 ? (n2-n1)/n1*100 : 0);
        }

        Map<String,Object> result = new LinkedHashMap<>();
        result.put("day1", day1);
        result.put("day2", day2);
        result.put("delta", delta);
        result.put("byBranch", new ArrayList<>(mergedByBranch.values()));

        return ResponseEntity.ok(Map.of("success",true,"data",result));
    }

    private Map<String,Object> buildDaySummary(List<BranchData> branches, String date) {
        double totalSar = branches.stream().mapToDouble(BranchData::sar).sum();
        double totalPurch = branches.stream().mapToDouble(b->b.purch()+b.mothan()).sum();
        double totalWt = branches.stream().mapToDouble(BranchData::wn).sum();
        long totalPcs = branches.stream().mapToLong(BranchData::pcs).sum();
        double saleRate = totalWt > 0 ? totalSar / totalWt : 0;
        double totalPurchWt = branches.stream().mapToDouble(b->b.purchWt()+b.mothanWt()).sum();
        double purchRate = totalPurchWt > 0 ? totalPurch / totalPurchWt : 0;
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("date", date);
        m.put("totalSar", totalSar);
        m.put("totalPurch", totalPurch);
        m.put("net", totalSar - totalPurch);
        m.put("totalWt", totalWt);
        m.put("totalPcs", totalPcs);
        m.put("saleRate", saleRate);
        m.put("purchRate", purchRate);
        m.put("branchCount", branches.size());
        return m;
    }

    @GetMapping("/alerts")
    public ResponseEntity<?> alerts(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        List<String> scopedA = dashSvc.resolveScopedBranches(principal);
        String cKeyA = tenantId + ":dash:alerts:" + from + ":" + to + ":" + scopeKey(scopedA);
        Object hitA = cache.get(cKeyA);
        if (hitA != null) return ResponseEntity.ok(Map.of("success", true, "data", hitA, "cached", true));
        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, from, to, scopedA);
        List<Map<String,Object>> alerts = new ArrayList<>();
        for (BranchData b : branches) {
            if (b.purchRate() > 0 && b.diffRate() < 0)
                alerts.add(alert(b,"CRITICAL","فرق معدل سلبي","Negative rate difference"));
            if (b.purch() == 0 && b.mothan() == 0)
                alerts.add(alert(b,"INFO","لا توجد مشتريات","No purchases recorded"));
            if (b.returns() > 0) {
                double returnPct = b.sar() > 0 ? (b.returns() / b.sar()) * 100 : 0;
                long pctRounded = Math.round(returnPct);
                long returnsRounded = Math.round(b.returns());
                if (returnPct >= 10) {
                    alerts.add(alertWithReturns(b,"CRITICAL",
                        "حرج: مرتجعات " + pctRounded + "% من المبيعات (" + returnsRounded + " ر.س)",
                        "Critical: returns " + pctRounded + "% of sales",
                        returnPct));
                } else if (returnPct >= 5) {
                    alerts.add(alertWithReturns(b,"WARNING",
                        "تحذير: مرتجعات " + pctRounded + "% من المبيعات",
                        "Warning: returns " + pctRounded + "% of sales",
                        returnPct));
                } else {
                    alerts.add(alertWithReturns(b,"INFO",
                        "مرتجعات " + returnsRounded + " ر.س (" + b.returnDays() + " يوم)",
                        "Returns " + returnsRounded + " SAR (" + b.returnDays() + " days)",
                        returnPct));
                }
            }
            if (b.returnDays() >= 3)
                alerts.add(alertWithReturns(b,"CRITICAL",
                    "مرتجعات لمدة " + b.returnDays() + " أيام متتالية — يحتاج تحقيق",
                    "Returns for " + b.returnDays() + " days — requires investigation",
                    b.sar() > 0 ? (b.returns() / b.sar()) * 100 : 0));
        }
        cache.put(cKeyA, alerts);
        return ResponseEntity.ok(Map.of("success",true,"data",alerts));
    }

    @GetMapping("/purchase-rates")
    public ResponseEntity<?> purchaseRates() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
    }

    @PostMapping("/merge-rates")
    public ResponseEntity<?> mergeRates(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue="false") boolean save,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.status(403).body(Map.of("success",false));

        List<BranchPurchase> purchases = purchRepo.findByTenantAndRange(tenantId, from, to);
        List<MothanTransaction> mothans = mothanRepo.findByTenantAndRange(tenantId, from, to);

        // Accumulate per branch
        Map<String, double[]> bmap = new LinkedHashMap<>();
        // slot: [0]=purchSar [1]=purchWt [2]=mothanSar [3]=mothanWt
        Map<String, String[]> bmeta = new LinkedHashMap<>(); // [0]=branchName [1]=region

        for (BranchPurchase p : purchases) {
            bmap.computeIfAbsent(p.getBranchCode(), k -> new double[4]);
            bmeta.putIfAbsent(p.getBranchCode(), new String[]{p.getBranchName(), p.getRegion()});
            bmap.get(p.getBranchCode())[0] += p.getTotalSarAmount();
            bmap.get(p.getBranchCode())[1] += p.getNetWeight();
        }
        for (MothanTransaction m : mothans) {
            if (m.getGoldWeightGrams() <= 0) continue;
            bmap.computeIfAbsent(m.getBranchCode(), k -> new double[4]);
            bmeta.putIfAbsent(m.getBranchCode(), new String[]{m.getBranchName(), "غير محدد"});
            bmap.get(m.getBranchCode())[2] += m.getCreditSar();
            bmap.get(m.getBranchCode())[3] += m.getGoldWeightGrams();
        }

        List<Map<String,Object>> result = new ArrayList<>();
        for (Map.Entry<String, double[]> entry : bmap.entrySet()) {
            String code = entry.getKey();
            double[] v = entry.getValue();
            String[] meta = bmeta.get(code);
            double totalSar = v[0] + v[2];
            double totalWt  = v[1] + v[3];
            double rate = totalWt > 0 ? Math.round(totalSar / totalWt * 10000) / 10000.0 : 0;

            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode", code);
            row.put("branchName", meta[0]);
            row.put("region", meta[1]);
            row.put("purchSar", v[0]);
            row.put("purchWt", v[1]);
            row.put("mothanSar", v[2]);
            row.put("mothanWt", v[3]);
            row.put("totalSar", totalSar);
            row.put("totalWt", totalWt);
            row.put("purchaseRate", rate);
            result.add(row);

            if (save && rate > 0) {
                BranchPurchaseRate bpr = rateRepo
                    .findByTenantIdAndBranchCode(tenantId, code)
                    .orElseGet(() -> { BranchPurchaseRate n = new BranchPurchaseRate();
                        n.setTenantId(tenantId); n.setBranchCode(code); return n; });
                bpr.setBranchName(meta[0]);
                bpr.setPurchaseRate(rate);
                bpr.setTotalSar(totalSar);
                bpr.setTotalWeight(totalWt);
                bpr.setSourceDate(from);
                bpr.setUpdatedAt(java.time.LocalDateTime.now());
                bpr.setUpdatedBy(principal.getUserId());
                rateRepo.save(bpr);
            }
        }

        if (save) uploadSvc.syncEmployeePurchaseRates(tenantId);

        result.sort((a,b_) -> Double.compare((double)b_.get("totalSar"), (double)a.get("totalSar")));
        return ResponseEntity.ok(Map.of("success",true,"data",result,
            "saved", save, "branchCount", result.size()));
    }

    private static double r4(double v) { return Math.round(v * 10000.0) / 10000.0; }

    private Map<String,Object> alert(BranchData b, String severity, String msgAr, String msgEn) {
        return Map.of("branchCode",b.code(),"branchName",b.name(),"severity",severity,
            "messageAr",msgAr,"messageEn",msgEn,"diffRate",b.diffRate());
    }

    private Map<String,Object> alertWithReturns(BranchData b, String severity, String msgAr, String msgEn, double returnPct) {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("branchCode", b.code()); m.put("branchName", b.name());
        m.put("severity", severity);
        m.put("messageAr", msgAr); m.put("messageEn", msgEn);
        m.put("diffRate", b.diffRate());
        m.put("returns", b.returns());
        m.put("returnPct", Math.round(returnPct * 10) / 10.0);
        m.put("returnDays", b.returnDays());
        return m;
    }

    private Map<String,Object> emptyKpi(LocalDate from, LocalDate to) {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("totalSalesAmount",0); m.put("totalPurchasesAmount",0); m.put("netAmount",0);
        m.put("totalNetWeight",0); m.put("totalInvoices",0); m.put("saleRate",0);
        m.put("purchaseRate",0); m.put("rateDifference",0); m.put("branchCount",0);
        m.put("profitableBranches",0); m.put("lossBranches",0);
        m.put("dateRange",Map.of("from",from.toString(),"to",to.toString()));
        return m;
    }

    @GetMapping("/daily-sales")
    public ResponseEntity<?> dailySales(
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success", true, "data", List.of()));
        List<com.mizan.model.DailySale> sales = dailySaleRepo.findByTenantAndRange(tenantId, from, to);
        return ResponseEntity.ok(Map.of("success", true, "data", sales));
    }

    @GetMapping("/monthly-summaries")
    public ResponseEntity<?> monthlySummaries(@RequestParam(required = false) Integer year) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success", true, "data", List.of()));
        List<com.mizan.model.MonthlySummary> summaries = year != null
            ? monthlySummaryRepo.findByTenantIdAndYear(tenantId, year)
            : monthlySummaryRepo.findByTenantIdOrderByYearDescMonthDesc(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", summaries));
    }

    @GetMapping("/employee-transfers")
    public ResponseEntity<?> employeeTransfers(
            @RequestParam(required = false) Integer empId,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success", true, "data", List.of()));
        List<com.mizan.model.EmployeeTransfer> transfers;
        if (empId != null) {
            transfers = empTransferRepo.findByTenantIdAndEmpId(tenantId, empId);
        } else if (from != null && to != null) {
            transfers = empTransferRepo.findByTenantIdAndTransferDateBetween(tenantId, from, to);
        } else {
            transfers = empTransferRepo.findByTenantId(tenantId);
        }
        return ResponseEntity.ok(Map.of("success", true, "data", transfers));
    }

    @GetMapping("/employee-targets-achievement")
    public ResponseEntity<?> employeeTargetsAchievement(
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso=org.springframework.format.annotation.DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success", true, "data", List.of()));

        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        List<EmployeeSale> empSalesList = scoped == null
            ? empRepo.findByTenantAndRange(tenantId, from, to)
            : empRepo.findByTenantAndRangeAndBranch(tenantId, from, to, scoped);

        // Group employee sales by employeeId
        Map<String, List<EmployeeSale>> byEmp = empSalesList.stream()
            .collect(Collectors.groupingBy(EmployeeSale::getEmployeeId));

        // Load all targets for all months in the range
        LocalDate cursor = from.withDayOfMonth(1);
        LocalDate lastMonth = to.withDayOfMonth(1);
        List<LocalDate> months = new ArrayList<>();
        while (!cursor.isAfter(lastMonth)) { months.add(cursor); cursor = cursor.plusMonths(1); }
        int monthsCount = Math.max(1, months.size());

        // Load branch targets for the range
        Map<String, com.mizan.model.BranchTarget> latestTargetByBranch = new LinkedHashMap<>();
        for (LocalDate m : months) {
            LocalDate endOfMonth = m.withDayOfMonth(m.lengthOfMonth());
            List<com.mizan.model.BranchTarget> targets = targetRepo.findByTenantIdAndTargetDateBetween(tenantId, m, endOfMonth);
            for (com.mizan.model.BranchTarget t : targets) {
                latestTargetByBranch.put(t.getBranchCode(), t);
            }
        }

        // Load branch purchase rates for diff
        Map<String, Double> purchRates = rateRepo.findByTenantId(tenantId).stream()
            .collect(Collectors.toMap(BranchPurchaseRate::getBranchCode, BranchPurchaseRate::getPurchaseRate, (a, b_) -> a));

        long actualDays = java.time.temporal.ChronoUnit.DAYS.between(from, to) + 1;
        long targetDays = (long) monthsCount * 30;
        long useDays = actualDays >= 28 ? targetDays : actualDays;

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<EmployeeSale>> entry : byEmp.entrySet()) {
            List<EmployeeSale> empSales = entry.getValue();
            EmployeeSale first = empSales.get(0);
            String branchCode = first.getBranchCode();

            double totalSar = empSales.stream().mapToDouble(EmployeeSale::getTotalSarAmount).sum();
            double totalWt  = Math.abs(empSales.stream().mapToDouble(EmployeeSale::getNetWeight).sum());
            long invoiceCount = empSales.stream().mapToLong(e -> Math.abs(e.getInvoiceCount())).sum();
            double saleRate = r4(totalWt > 0 ? totalSar / totalWt : 0);

            double purchRate = purchRates.getOrDefault(branchCode, 0.0);
            double diffRate  = Math.round((saleRate - purchRate) * 10) / 10.0;
            double profitMargin = purchRate > 0 ? Math.round(totalWt * diffRate * 100) / 100.0 : 0;

            com.mizan.model.BranchTarget target = latestTargetByBranch.get(branchCode);
            double targetRateDiff = target != null && target.getTargetRateDifference() > 0
                ? target.getTargetRateDifference() : 110;
            int empCount = target != null ? Math.max(1, target.getEmpCount() - 1) : 1;
            double monthlyTotal = target != null ? target.getMonthlyTarget() * monthsCount : 0;

            double avgDailyPerEmp = empCount > 0 && monthsCount > 0
                ? (monthlyTotal / empCount) / (monthsCount * 30.0) : 0;
            double targetWt = avgDailyPerEmp * useDays;
            double actualWt = totalWt;
            double wtPct = targetWt > 0
                ? Math.round((actualWt - targetWt) / targetWt * 1000) / 10.0 : 0;
            double actualProfit  = actualWt * Math.abs(diffRate);
            double targetProfit  = targetWt * targetRateDiff;
            double profitPct = targetProfit > 0
                ? Math.round((actualProfit - targetProfit) / targetProfit * 1000) / 10.0 : 0;

            String rating = saleRate >= 700 ? "excellent" : saleRate >= 600 ? "good"
                : saleRate >= 500 ? "average" : "weak";

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("employeeId", entry.getKey());
            row.put("employeeName", first.getEmployeeName());
            row.put("branchCode", branchCode);
            row.put("branchName", first.getBranchName());
            row.put("region", first.getRegion());
            row.put("totalSar", totalSar);
            row.put("totalWt", totalWt);
            row.put("invoiceCount", invoiceCount);
            row.put("saleRate", saleRate);
            row.put("purchRate", purchRate);
            row.put("diffRate", diffRate);
            row.put("profitMargin", profitMargin);
            row.put("targetRateDiff", targetRateDiff);
            row.put("empCount", empCount);
            row.put("targetWt", Math.round(targetWt * 100.0) / 100.0);
            row.put("actualWt", Math.round(actualWt * 100.0) / 100.0);
            row.put("wtPct", wtPct);
            row.put("actualProfit", Math.round(actualProfit));
            row.put("targetProfit", Math.round(targetProfit));
            row.put("profitPct", profitPct);
            row.put("useDays", useDays);
            row.put("monthsCount", monthsCount);
            row.put("rating", rating);
            row.put("achieved", saleRate > purchRate);
            result.add(row);
        }

        result.sort((a, b_) -> Double.compare((double) b_.get("totalSar"), (double) a.get("totalSar")));
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @GetMapping("/daily-trend")
    public ResponseEntity<?> dailyTrend(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        String cKey = tenantId + ":dash:daily-trend:" + from + ":" + to + ":" + scopeKey(scoped);
        Object hit = cache.get(cKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));
        List<BranchSale> rawSales = scoped == null
            ? saleRepo.findByTenantAndRange(tenantId, from, to)
            : saleRepo.findByTenantAndRangeAndBranches(tenantId, from, to, scoped);
        Map<String, double[]> byDate = new java.util.TreeMap<>();
        for (BranchSale s : rawSales) {
            String d = s.getSaleDate().toString();
            byDate.computeIfAbsent(d, k -> new double[2]);
            byDate.get(d)[0] += s.getTotalSarAmount();
            byDate.get(d)[1] += s.getNetWeight();
        }
        List<Map<String,Object>> trend = new ArrayList<>();
        for (Map.Entry<String,double[]> e : byDate.entrySet()) {
            trend.add(Map.of("date", e.getKey(), "sar", e.getValue()[0], "wt", e.getValue()[1]));
        }
        cache.put(cKey, trend);
        return ResponseEntity.ok(Map.of("success",true,"data",trend));
    }

    @GetMapping("/latest-date")
    public ResponseEntity<?> latestDate(@AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success", true, "data", Map.of()));

        var latest = saleRepo.findFirstByTenantIdOrderBySaleDateDesc(tenantId);
        var earliest = saleRepo.findFirstByTenantIdOrderBySaleDateAsc(tenantId);

        if (latest.isEmpty()) return ResponseEntity.ok(Map.of("success", true, "data", Map.of()));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("latestDate", latest.get().getSaleDate().toString());
        data.put("earliestDate", earliest.map(s -> s.getSaleDate().toString()).orElse(latest.get().getSaleDate().toString()));
        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }

    @GetMapping("/targets")
    public ResponseEntity<?> targets(
            @RequestParam(required=false) String month,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        List<com.mizan.model.BranchTarget> targets;
        if (month != null && month.matches("\\d{4}-\\d{2}")) {
            int year = Integer.parseInt(month.substring(0, 4));
            int mon = Integer.parseInt(month.substring(5, 7));
            LocalDate startOfMonth = LocalDate.of(year, mon, 1);
            LocalDate endOfMonth = startOfMonth.withDayOfMonth(startOfMonth.lengthOfMonth());
            targets = targetRepo.findByTenantIdAndTargetDateBetween(tenantId, startOfMonth, endOfMonth);
        } else {
            targets = targetRepo.findByTenantId(tenantId);
        }
        // Map targets to a response with computed fields
        List<Map<String,Object>> result = new ArrayList<>();
        for (com.mizan.model.BranchTarget t : targets) {
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode", t.getBranchCode());
            row.put("branchName", t.getBranchName());
            row.put("targetDate", t.getTargetDate() != null ? t.getTargetDate().toString() : null);
            // Use stored monthlyTarget if set, otherwise derive from daily × 30
            double monthly = t.getMonthlyTarget() > 0 ? t.getMonthlyTarget()
                : t.getTargetNetWeightDaily() * 30;
            row.put("monthlyTarget", monthly);
            row.put("dailyTarget", t.getTargetNetWeightDaily());
            row.put("dailyPerEmp", t.getTargetNetWeightDaily());
            row.put("targetRateDiff", t.getTargetRateDifference());
            row.put("empCount", t.getEmpCount());
            result.add(row);
        }
        return ResponseEntity.ok(Map.of("success",true,"data",result));
    }
}
