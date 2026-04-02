package com.mizan.controller;

import com.mizan.model.*;
import com.mizan.repository.*;
import com.mizan.security.TenantContext;
import com.mizan.service.DashboardService;
import com.mizan.service.DashboardService.BranchData;
import com.mizan.service.NormalizedExportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/export")
public class ExportController {

    private final BranchSaleRepository     saleRepo;
    private final EmployeeSaleRepository   empRepo;
    private final BranchPurchaseRepository purchRepo;
    private final MothanTransactionRepository mothanRepo;
    private final DashboardService         dashSvc;
    private final NormalizedExportService  normalizedSvc;

    public ExportController(BranchSaleRepository saleRepo,
                             EmployeeSaleRepository empRepo,
                             BranchPurchaseRepository purchRepo,
                             MothanTransactionRepository mothanRepo,
                             DashboardService dashSvc,
                             NormalizedExportService normalizedSvc) {
        this.saleRepo      = saleRepo;
        this.empRepo       = empRepo;
        this.purchRepo     = purchRepo;
        this.mothanRepo    = mothanRepo;
        this.dashSvc       = dashSvc;
        this.normalizedSvc = normalizedSvc;
    }

    // ─── Branch Sales ────────────────────────────────────────────────────────

    @GetMapping("/branch-sales")
    public ResponseEntity<byte[]> exportBranchSales(
            @RequestParam String from, @RequestParam String to) {
        String tenantId = TenantContext.getTenantId();
        LocalDate f = LocalDate.parse(from), t = LocalDate.parse(to);
        List<BranchSale> rows = saleRepo.findByTenantAndRange(tenantId, f, t);

        StringBuilder sb = new StringBuilder("\uFEFF");
        sb.append("التاريخ,رمز الفرع,اسم الفرع,المنطقة,المبيعات (ر.س),الوزن النقي (جم),الوزن الإجمالي (جم),عدد الفواتير,معدل البيع,مرتجع\n");
        for (BranchSale r : rows) {
            sb.append(csv(r.getSaleDate()))
              .append(',').append(csv(r.getBranchCode()))
              .append(',').append(csv(r.getBranchName()))
              .append(',').append(csv(r.getRegion()))
              .append(',').append(r.getTotalSarAmount())
              .append(',').append(r.getNetWeight())
              .append(',').append(r.getGrossWeight())
              .append(',').append(r.getInvoiceCount())
              .append(',').append(r.getSaleRate())
              .append(',').append(r.isReturn() ? "نعم" : "لا")
              .append('\n');
        }
        return csvResponse(sb, "branch-sales-" + from + "-" + to + ".csv");
    }

    // ─── Employee Sales ──────────────────────────────────────────────────────

    @GetMapping("/employee-sales")
    public ResponseEntity<byte[]> exportEmployeeSales(
            @RequestParam String from, @RequestParam String to) {
        String tenantId = TenantContext.getTenantId();
        LocalDate f = LocalDate.parse(from), t = LocalDate.parse(to);
        List<EmployeeSale> rows = empRepo.findByTenantAndRange(tenantId, f, t);

        StringBuilder sb = new StringBuilder("\uFEFF");
        sb.append("التاريخ,رمز الفرع,اسم الفرع,المنطقة,معرف الموظف,اسم الموظف,المبيعات (ر.س),الوزن النقي (جم),عدد الفواتير,معدل البيع,متوسط الشراء,فرق المعدل,هامش الربح,حقق الهدف\n");
        for (EmployeeSale r : rows) {
            sb.append(csv(r.getSaleDate()))
              .append(',').append(csv(r.getBranchCode()))
              .append(',').append(csv(r.getBranchName()))
              .append(',').append(csv(r.getRegion()))
              .append(',').append(csv(r.getEmployeeId()))
              .append(',').append(csv(r.getEmployeeName()))
              .append(',').append(r.getTotalSarAmount())
              .append(',').append(r.getNetWeight())
              .append(',').append(r.getInvoiceCount())
              .append(',').append(r.getSaleRate())
              .append(',').append(r.getBranchPurchaseAvg())
              .append(',').append(r.getDiffAvg())
              .append(',').append(r.getProfitMargin())
              .append(',').append(r.isAchievedTarget() ? "نعم" : "لا")
              .append('\n');
        }
        return csvResponse(sb, "employee-sales-" + from + "-" + to + ".csv");
    }

    // ─── Purchases ───────────────────────────────────────────────────────────

    @GetMapping("/purchases")
    public ResponseEntity<byte[]> exportPurchases(
            @RequestParam String from, @RequestParam String to) {
        String tenantId = TenantContext.getTenantId();
        LocalDate f = LocalDate.parse(from), t = LocalDate.parse(to);
        List<BranchPurchase> rows = purchRepo.findByTenantAndRange(tenantId, f, t);

        StringBuilder sb = new StringBuilder("\uFEFF");
        sb.append("التاريخ,رمز الفرع,اسم الفرع,المنطقة,المشتريات (ر.س),الوزن النقي (جم),الوزن الإجمالي (جم),عدد الفواتير,معدل الشراء\n");
        for (BranchPurchase r : rows) {
            sb.append(csv(r.getPurchaseDate()))
              .append(',').append(csv(r.getBranchCode()))
              .append(',').append(csv(r.getBranchName()))
              .append(',').append(csv(r.getRegion()))
              .append(',').append(r.getTotalSarAmount())
              .append(',').append(r.getNetWeight())
              .append(',').append(r.getGrossWeight())
              .append(',').append(r.getInvoiceCount())
              .append(',').append(r.getPurchaseRate())
              .append('\n');
        }
        return csvResponse(sb, "purchases-" + from + "-" + to + ".csv");
    }

    // ─── Mothan ──────────────────────────────────────────────────────────────

    @GetMapping("/mothan")
    public ResponseEntity<byte[]> exportMothan(
            @RequestParam String from, @RequestParam String to) {
        String tenantId = TenantContext.getTenantId();
        LocalDate f = LocalDate.parse(from), t = LocalDate.parse(to);
        List<MothanTransaction> rows = mothanRepo.findByTenantAndRange(tenantId, f, t);

        StringBuilder sb = new StringBuilder("\uFEFF");
        sb.append("التاريخ,رمز الفرع,اسم الفرع,رقم المرجع,الوصف,المبلغ (ر.س),الوزن (جم),المعدل\n");
        for (MothanTransaction r : rows) {
            sb.append(csv(r.getTransactionDate()))
              .append(',').append(csv(r.getBranchCode()))
              .append(',').append(csv(r.getBranchName()))
              .append(',').append(csv(r.getDocReference()))
              .append(',').append(csv(r.getDescription()))
              .append(',').append(r.getCreditSar())
              .append(',').append(r.getGoldWeightGrams())
              .append(',').append(r.getRunningBalance())
              .append('\n');
        }
        return csvResponse(sb, "mothan-" + from + "-" + to + ".csv");
    }

    // ─── Summary ─────────────────────────────────────────────────────────────

    @GetMapping("/summary")
    public ResponseEntity<byte[]> exportSummary(
            @RequestParam String from, @RequestParam String to) {
        String tenantId = TenantContext.getTenantId();
        LocalDate f = LocalDate.parse(from), t = LocalDate.parse(to);
        List<BranchData> branches = dashSvc.getBranchSummaries(tenantId, f, t, null);

        StringBuilder sb = new StringBuilder("\uFEFF");
        sb.append("رمز الفرع,اسم الفرع,المنطقة,المبيعات (ر.س),الوزن النقي,عدد الفواتير,المشتريات (ر.س),الموطن (ر.س),صافي (ر.س),معدل البيع,معدل الشراء,فرق المعدل,المرتجعات (ر.س)\n");
        for (BranchData b : branches) {
            sb.append(csv(b.code()))
              .append(',').append(csv(b.name()))
              .append(',').append(csv(b.region()))
              .append(',').append(b.sar())
              .append(',').append(b.wn())
              .append(',').append(b.pcs())
              .append(',').append(b.purch())
              .append(',').append(b.mothan())
              .append(',').append(b.net())
              .append(',').append(b.saleRate())
              .append(',').append(b.purchRate())
              .append(',').append(b.diffRate())
              .append(',').append(b.returns())
              .append('\n');
        }
        return csvResponse(sb, "summary-" + from + "-" + to + ".csv");
    }

    // ─── BCNF Normalized DB Export ───────────────────────────────────────────

    @GetMapping("/normalized-db")
    public ResponseEntity<byte[]> exportNormalizedDb() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null)
            return ResponseEntity.badRequest().build();
        try {
            byte[] bytes = normalizedSvc.generate(tenantId);
            String filename = "mizan-normalized-db-" + LocalDate.now() + ".xlsx";
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType(
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(bytes);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** Quote-wrap a value that may contain commas or newlines. */
    private String csv(Object val) {
        if (val == null) return "";
        String s = val.toString();
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    private ResponseEntity<byte[]> csvResponse(StringBuilder sb, String filename) {
        byte[] bytes = sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
            .body(bytes);
    }
}
