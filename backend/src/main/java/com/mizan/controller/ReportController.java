package com.mizan.controller;

import com.mizan.model.BranchPurchaseRate;
import com.mizan.model.BranchTarget;
import com.mizan.model.EmployeeSale;
import com.mizan.repository.BranchPurchaseRateRepository;
import com.mizan.repository.BranchTargetRepository;
import com.mizan.repository.EmployeeSaleRepository;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import com.mizan.service.DashboardService;
import com.mizan.service.DashboardService.BranchData;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final DashboardService dashSvc;
    private final EmployeeSaleRepository empRepo;
    private final BranchPurchaseRateRepository rateRepo;
    private final BranchTargetRepository targetRepo;

    public ReportController(DashboardService dashSvc,
            EmployeeSaleRepository empRepo,
            BranchPurchaseRateRepository rateRepo,
            BranchTargetRepository targetRepo) {
        this.dashSvc = dashSvc;
        this.empRepo = empRepo;
        this.rateRepo = rateRepo;
        this.targetRepo = targetRepo;
    }

    @GetMapping("/employee-performance")
    public ResponseEntity<?> employeePerformance(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));

        List<String> scoped = dashSvc.resolveScopedBranches(principal);

        // Branch purchase rates: period-actual first, saved fallback
        List<BranchData> branchSummaries = dashSvc.getBranchSummaries(tenantId, from, to, scoped);
        Map<String,Double> branchPurchRates = branchSummaries.stream()
            .collect(Collectors.toMap(BranchData::code, BranchData::purchRate, (a,b_)->a));
        Map<String,Double> savedRates = rateRepo.findByTenantId(tenantId).stream()
            .collect(Collectors.toMap(BranchPurchaseRate::getBranchCode,
                BranchPurchaseRate::getPurchaseRate, (a,b_)->a));

        // Targets for the month of `from`
        Map<String,BranchTarget> targetByBranch =
            targetRepo.findByTenantIdAndTargetDateBetween(tenantId,
                from.withDayOfMonth(1), from.withDayOfMonth(from.lengthOfMonth()))
            .stream().collect(Collectors.toMap(BranchTarget::getBranchCode, t->t, (a,b_)->a));

        // Employee sales
        List<EmployeeSale> sales = scoped == null
            ? empRepo.findByTenantAndRange(tenantId, from, to)
            : empRepo.findByTenantAndRangeAndBranches(tenantId, from, to, scoped);

        // Aggregate per employee
        Map<String, List<EmployeeSale>> byEmp = sales.stream()
            .collect(Collectors.groupingBy(EmployeeSale::getEmployeeId));

        List<Map<String,Object>> employees = new ArrayList<>();
        for (Map.Entry<String, List<EmployeeSale>> entry : byEmp.entrySet()) {
            List<EmployeeSale> empSales = entry.getValue();
            EmployeeSale first = empSales.get(0);

            double totalSar    = empSales.stream().mapToDouble(EmployeeSale::getTotalSarAmount).sum();
            double totalWt     = empSales.stream().mapToDouble(EmployeeSale::getNetWeight).sum();
            int invoiceCount   = empSales.stream().mapToInt(EmployeeSale::getInvoiceCount).sum();
            double saleRate    = totalWt != 0 ? totalSar / totalWt : 0;
            double returns     = empSales.stream()
                .filter(s -> s.isReturn() || s.getTotalSarAmount() < 0)
                .mapToDouble(s -> Math.abs(s.getTotalSarAmount())).sum();
            long returnDays    = empSales.stream()
                .filter(s -> s.isReturn() || s.getTotalSarAmount() < 0).count();

            String bCode       = first.getBranchCode();
            double purchRate   = branchPurchRates.getOrDefault(bCode, savedRates.getOrDefault(bCode, 0.0));
            double diffRate    = Math.round((saleRate - purchRate) * 10) / 10.0;
            double profitMargin = purchRate > 0 ? Math.round(totalWt * diffRate * 100) / 100.0 : 0;
            double avgInvoice  = invoiceCount > 0 ? Math.round(totalSar / invoiceCount * 100) / 100.0 : 0;
            String rating      = saleRate >= 700 ? "excellent" : saleRate >= 600 ? "good"
                               : saleRate >= 500 ? "average" : "weak";

            BranchTarget target    = targetByBranch.get(bCode);
            double targetWeight    = target != null ? target.getTargetNetWeightDaily() * empSales.size() : 0;
            double actualWeight    = Math.abs(totalWt);
            double achievementPct  = targetWeight > 0 ? (actualWeight / targetWeight) * 100 : 0;
            String achievementStatus = achievementPct >= 100 ? "exceeded"
                                     : achievementPct >= 70  ? "onTrack" : "behind";

            Map<String,Object> row = new LinkedHashMap<>();
            row.put("employeeId",        entry.getKey());
            row.put("employeeName",      first.getEmployeeName());
            row.put("branchCode",        bCode);
            row.put("branchName",        first.getBranchName());
            row.put("region",            first.getRegion());
            row.put("totalSar",          totalSar);
            row.put("totalWt",           totalWt);
            row.put("invoiceCount",      invoiceCount);
            row.put("saleRate",          saleRate);
            row.put("purchRate",         purchRate);
            row.put("diffRate",          diffRate);
            row.put("profitMargin",      profitMargin);
            row.put("avgInvoice",        avgInvoice);
            row.put("achieved",          saleRate > purchRate);
            row.put("rating",            rating);
            row.put("days",              empSales.size());
            row.put("returns",           returns);
            row.put("returnDays",        returnDays);
            row.put("targetWeight",      targetWeight);
            row.put("actualWeight",      actualWeight);
            row.put("achievementPct",    achievementPct);
            row.put("achievementStatus", achievementStatus);
            employees.add(row);
        }

        employees.sort((a,b_) -> Double.compare((double)b_.get("totalSar"), (double)a.get("totalSar")));

        // Group employees by branch
        Map<String, List<Map<String,Object>>> byBranch = employees.stream()
            .collect(Collectors.groupingBy(e -> (String) e.get("branchCode"), LinkedHashMap::new, Collectors.toList()));

        List<Map<String,Object>> branches = new ArrayList<>();
        for (Map.Entry<String, List<Map<String,Object>>> entry : byBranch.entrySet()) {
            List<Map<String,Object>> empList = entry.getValue();
            Map<String,Object> anyEmp = empList.get(0);

            double branchTotalSar = empList.stream().mapToDouble(e -> (double)e.get("totalSar")).sum();
            double branchTotalWt  = empList.stream().mapToDouble(e -> (double)e.get("totalWt")).sum();
            double avgSaleRate    = empList.stream().mapToDouble(e -> (double)e.get("saleRate")).average().orElse(0);

            Map<String,Object> best  = empList.stream()
                .max(Comparator.comparingDouble(e -> (double)e.get("profitMargin"))).orElse(null);
            Map<String,Object> worst = empList.stream()
                .min(Comparator.comparingDouble(e -> (double)e.get("profitMargin"))).orElse(null);

            Map<String,Object> branch = new LinkedHashMap<>();
            branch.put("branchCode",          entry.getKey());
            branch.put("branchName",          anyEmp.get("branchName"));
            branch.put("region",              anyEmp.get("region"));
            branch.put("employeeCount",       empList.size());
            branch.put("totalSar",            branchTotalSar);
            branch.put("totalWt",             branchTotalWt);
            branch.put("avgSaleRate",         Math.round(avgSaleRate * 100) / 100.0);
            branch.put("bestEmployeeId",      best  != null ? best.get("employeeId")   : null);
            branch.put("bestEmployeeName",    best  != null ? best.get("employeeName") : null);
            branch.put("bestProfitMargin",    best  != null ? best.get("profitMargin") : 0);
            branch.put("worstEmployeeId",     worst != null ? worst.get("employeeId")  : null);
            branch.put("worstEmployeeName",   worst != null ? worst.get("employeeName"): null);
            branch.put("worstProfitMargin",   worst != null ? worst.get("profitMargin"): 0);
            branch.put("employees",           empList);
            branches.add(branch);
        }

        branches.sort((a,b_) -> Double.compare((double)b_.get("totalSar"), (double)a.get("totalSar")));

        Map<String,Object> data = new LinkedHashMap<>();
        data.put("from",         from.toString());
        data.put("to",           to.toString());
        data.put("branchCount",  branches.size());
        data.put("employeeCount",employees.size());
        data.put("branches",     branches);

        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }

    @GetMapping("/gold-exposure")
    public ResponseEntity<?> goldExposure(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",Map.of()));

        List<String> scoped = dashSvc.resolveScopedBranches(principal);
        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, from, to, scoped);

        List<Map<String,Object>> branchRows = new ArrayList<>();
        for (BranchData b : branches) {
            double salesSar  = b.sar();
            double purchSar  = b.purch();
            double mothanSar = b.mothan();
            double net       = b.net();          // already: sar - (purch + mothan)
            double exposure  = net;

            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode",  b.code());
            row.put("branchName",  b.name());
            row.put("region",      b.region());
            row.put("salesSar",    salesSar);
            row.put("purchSar",    purchSar);
            row.put("mothanSar",   mothanSar);
            row.put("totalPurchSar", purchSar + mothanSar);
            row.put("net",         net);
            row.put("exposure",    exposure);
            row.put("saleRate",    b.saleRate());
            row.put("purchRate",   b.purchRate());
            row.put("diffRate",    b.diffRate());
            row.put("netWeight",   b.wn());
            row.put("purchWeight", b.purchWt() + b.mothanWt());
            row.put("exposed",     net < 0);     // net negative = over-purchased vs sales
            branchRows.add(row);
        }

        branchRows.sort((a,b_) -> Double.compare(
            Math.abs((double)b_.get("exposure")), Math.abs((double)a.get("exposure"))));

        double totalSalesSar   = branches.stream().mapToDouble(BranchData::sar).sum();
        double totalPurchSar   = branches.stream().mapToDouble(BranchData::purch).sum();
        double totalMothanSar  = branches.stream().mapToDouble(BranchData::mothan).sum();
        double totalNet        = totalSalesSar - (totalPurchSar + totalMothanSar);
        double totalNetWeight  = branches.stream().mapToDouble(BranchData::wn).sum();
        double totalPurchWeight= branches.stream().mapToDouble(b->b.purchWt()+b.mothanWt()).sum();
        long   exposedBranches = branchRows.stream().filter(r -> (boolean)r.get("exposed")).count();
        long   safeBranches    = branchRows.size() - exposedBranches;
        double avgDiffRate     = branches.stream()
            .filter(b -> b.purchRate() > 0)
            .mapToDouble(BranchData::diffRate).average().orElse(0);

        Map<String,Object> totals = new LinkedHashMap<>();
        totals.put("totalSalesSar",    totalSalesSar);
        totals.put("totalPurchSar",    totalPurchSar);
        totals.put("totalMothanSar",   totalMothanSar);
        totals.put("totalCombinedPurchSar", totalPurchSar + totalMothanSar);
        totals.put("totalNet",         totalNet);
        totals.put("totalExposure",    totalNet);
        totals.put("totalNetWeight",   totalNetWeight);
        totals.put("totalPurchWeight", totalPurchWeight);
        totals.put("branchCount",      branchRows.size());
        totals.put("exposedBranches",  exposedBranches);
        totals.put("safeBranches",     safeBranches);
        totals.put("avgDiffRate",      Math.round(avgDiffRate * 10) / 10.0);

        Map<String,Object> data = new LinkedHashMap<>();
        data.put("from",      from.toString());
        data.put("to",        to.toString());
        data.put("totals",    totals);
        data.put("branches",  branchRows);
        data.put("generated", LocalDateTime.now().toString());

        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }
}
