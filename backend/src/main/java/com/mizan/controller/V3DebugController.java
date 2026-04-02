package com.mizan.controller;

import com.mizan.model.V3MothanTransaction;
import com.mizan.model.V3SaleTransaction;
import com.mizan.repository.*;
import com.mizan.security.TenantContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/v3/debug")
public class V3DebugController {

    private final V3SaleTransactionRepository saleRepo;
    private final V3EmployeeSaleTransactionRepository empSaleRepo;
    private final V3PurchaseTransactionRepository purchRepo;
    private final V3MothanTransactionRepository mothanRepo;

    public V3DebugController(V3SaleTransactionRepository saleRepo,
                              V3EmployeeSaleTransactionRepository empSaleRepo,
                              V3PurchaseTransactionRepository purchRepo,
                              V3MothanTransactionRepository mothanRepo) {
        this.saleRepo    = saleRepo;
        this.empSaleRepo = empSaleRepo;
        this.purchRepo   = purchRepo;
        this.mothanRepo  = mothanRepo;
    }

    @GetMapping("/counts")
    public ResponseEntity<?> debugCounts() {
        String tid = TenantContext.getTenantId();
        Map<String, Object> counts = new LinkedHashMap<>();

        // Raw collection counts
        counts.put("v3_sale_transactions",          saleRepo.countByTenantId(tid));
        counts.put("v3_employee_sale_transactions",  empSaleRepo.countByTenantId(tid));
        counts.put("v3_purchase_transactions",       purchRepo.countByTenantId(tid));
        counts.put("v3_mothan_transactions",         mothanRepo.countByTenantId(tid));

        // Sales date-range + total
        List<V3SaleTransaction> allSales = saleRepo.findByTenantId(tid);
        if (!allSales.isEmpty()) {
            LocalDate minDate = allSales.stream()
                    .map(V3SaleTransaction::getSaleDate)
                    .filter(Objects::nonNull)
                    .min(LocalDate::compareTo).orElse(null);
            LocalDate maxDate = allSales.stream()
                    .map(V3SaleTransaction::getSaleDate)
                    .filter(Objects::nonNull)
                    .max(LocalDate::compareTo).orElse(null);
            double totalSar = allSales.stream()
                    .mapToDouble(V3SaleTransaction::getSarAmount).sum();
            long uniqueBranches = allSales.stream()
                    .map(V3SaleTransaction::getBranchCode)
                    .filter(Objects::nonNull)
                    .distinct().count();

            counts.put("sales_minDate",      minDate);
            counts.put("sales_maxDate",      maxDate);
            counts.put("sales_totalSar",     Math.round(totalSar));
            counts.put("unique_branches",    uniqueBranches);

            // Sample 5 rows to check date parsing
            List<Map<String, Object>> sample = new ArrayList<>();
            allSales.stream().limit(5).forEach(s -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("date",       s.getSaleDate());
                row.put("branch",     s.getBranchCode());
                row.put("sar",        s.getSarAmount());
                row.put("sourceFile", s.getSourceFile());
                sample.add(row);
            });
            counts.put("sales_sample_5_rows", sample);
        }

        // Mothan date-range
        List<V3MothanTransaction> allMothan = mothanRepo.findByTenantId(tid);
        if (!allMothan.isEmpty()) {
            LocalDate minDate = allMothan.stream()
                    .map(V3MothanTransaction::getTransactionDate)
                    .filter(Objects::nonNull)
                    .min(LocalDate::compareTo).orElse(null);
            LocalDate maxDate = allMothan.stream()
                    .map(V3MothanTransaction::getTransactionDate)
                    .filter(Objects::nonNull)
                    .max(LocalDate::compareTo).orElse(null);
            counts.put("mothan_minDate", minDate);
            counts.put("mothan_maxDate", maxDate);
            counts.put("mothan_count",   allMothan.size());
        }

        return ResponseEntity.ok(Map.of("success", true, "debug", counts));
    }
}
