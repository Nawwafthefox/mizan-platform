package com.mizan.controller;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import com.mizan.service.DashboardService;
import com.mizan.service.DashboardService.BranchData;
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
    public DashboardController(DashboardService dashSvc) { this.dashSvc=dashSvc; }

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
        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, from, to, scoped);

        double totalSar = branches.stream().mapToDouble(BranchData::sar).sum();
        double totalPurch = branches.stream().mapToDouble(b->b.purch()+b.mothan()).sum();
        double totalWn = branches.stream().mapToDouble(BranchData::wn).sum();
        int totalPcs = branches.stream().mapToInt(BranchData::pcs).sum();
        long profitable = branches.stream().filter(b->b.diffRate()>0).count();
        long loss = branches.stream().filter(b->b.diffRate()<0 && b.purchRate()>0).count();
        double overallSaleRate = totalWn > 0 ? totalSar / totalWn : 0;
        double totalPurchWt = branches.stream().mapToDouble(b->b.purchWt()+b.mothanWt()).sum();
        double overallPurchRate = totalPurchWt > 0 ? totalPurch / totalPurchWt : 0;
        BranchData top = branches.stream().max(Comparator.comparingDouble(BranchData::sar)).orElse(null);

        Map<String,Object> kpi = new LinkedHashMap<>();
        kpi.put("totalSalesAmount", totalSar);
        kpi.put("totalPurchasesAmount", totalPurch);
        kpi.put("netAmount", totalSar - totalPurch);
        kpi.put("totalNetWeight", totalWn);
        kpi.put("totalInvoices", totalPcs);
        kpi.put("avgInvoice", totalPcs > 0 ? totalSar / totalPcs : 0);
        kpi.put("saleRate", overallSaleRate);
        kpi.put("purchaseRate", overallPurchRate);
        kpi.put("rateDifference", overallPurchRate > 0 ? overallSaleRate - overallPurchRate : 0);
        kpi.put("branchCount", branches.size());
        kpi.put("profitableBranches", profitable);
        kpi.put("lossBranches", loss);
        kpi.put("topBranchName", top != null ? top.name() : "");
        kpi.put("topBranchSar", top != null ? top.sar() : 0);
        kpi.put("dateRange", Map.of("from", from.toString(), "to", to.toString()));

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
        List<BranchData> data = dashSvc.getBranchSummaries(tenantId, from, to, scoped);
        if (region != null && !region.isBlank())
            data = data.stream().filter(b->region.equals(b.region())).collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("success",true,"data",data));
    }

    @GetMapping("/employees")
    public ResponseEntity<?> employees(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
    }

    @GetMapping("/karat")
    public ResponseEntity<?> karat(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",Map.of()));
        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, from, to, dashSvc.resolveScopedBranches(principal));
        Map<String,Object> karat = new LinkedHashMap<>();
        karat.put("k18", Map.of("sar", branches.stream().mapToDouble(BranchData::k18Sar).sum(), "wt", branches.stream().mapToDouble(BranchData::k18Wt).sum()));
        karat.put("k21", Map.of("sar", branches.stream().mapToDouble(BranchData::k21Sar).sum(), "wt", branches.stream().mapToDouble(BranchData::k21Wt).sum()));
        karat.put("k22", Map.of("sar", branches.stream().mapToDouble(BranchData::k22Sar).sum(), "wt", branches.stream().mapToDouble(BranchData::k22Wt).sum()));
        karat.put("k24", Map.of("sar", branches.stream().mapToDouble(BranchData::k24Sar).sum(), "wt", branches.stream().mapToDouble(BranchData::k24Wt).sum()));
        return ResponseEntity.ok(Map.of("success",true,"data",karat));
    }

    @GetMapping("/mothan")
    public ResponseEntity<?> mothan(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
    }

    @GetMapping("/alerts")
    public ResponseEntity<?> alerts(
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, from, to, dashSvc.resolveScopedBranches(principal));
        List<Map<String,Object>> alerts = new ArrayList<>();
        for (BranchData b : branches) {
            if (b.purchRate() > 0) {
                if (b.diffRate() < 0) alerts.add(alert(b,"CRITICAL","فرق معدل سلبي","Negative rate difference"));
                else if (b.diffRate() < 5) alerts.add(alert(b,"WARNING","فرق معدل منخفض","Low rate difference"));
            }
            if (b.purch() == 0 && b.mothan() == 0) alerts.add(alert(b,"INFO","لا توجد مشتريات","No purchases recorded"));
        }
        return ResponseEntity.ok(Map.of("success",true,"data",alerts));
    }

    @GetMapping("/purchase-rates")
    public ResponseEntity<?> purchaseRates() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
    }

    private Map<String,Object> alert(BranchData b, String severity, String msgAr, String msgEn) {
        return Map.of("branchCode",b.code(),"branchName",b.name(),"severity",severity,
            "messageAr",msgAr,"messageEn",msgEn,"diffRate",b.diffRate());
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
}
