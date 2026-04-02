package com.mizan.controller;

import com.mizan.model.V3MothanTransaction;
import com.mizan.model.V3SaleTransaction;
import com.mizan.repository.*;
import com.mizan.security.TenantContext;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/v3/debug")
public class V3DebugController {

    private final V3SaleTransactionRepository          saleRepo;
    private final V3EmployeeSaleTransactionRepository  empSaleRepo;
    private final V3PurchaseTransactionRepository      purchRepo;
    private final V3MothanTransactionRepository        mothanRepo;
    private final MongoTemplate                        mongo;

    public V3DebugController(V3SaleTransactionRepository saleRepo,
                              V3EmployeeSaleTransactionRepository empSaleRepo,
                              V3PurchaseTransactionRepository purchRepo,
                              V3MothanTransactionRepository mothanRepo,
                              MongoTemplate mongo) {
        this.saleRepo    = saleRepo;
        this.empSaleRepo = empSaleRepo;
        this.purchRepo   = purchRepo;
        this.mothanRepo  = mothanRepo;
        this.mongo       = mongo;
    }

    /** Quick counts + sample — uses findByTenantId (loads all docs, OK for debugging) */
    @GetMapping("/counts")
    public ResponseEntity<?> debugCounts() {
        String tid = TenantContext.getTenantId();
        Map<String, Object> counts = new LinkedHashMap<>();

        counts.put("v3_sale_transactions",         saleRepo.countByTenantId(tid));
        counts.put("v3_employee_sale_transactions", empSaleRepo.countByTenantId(tid));
        counts.put("v3_purchase_transactions",      purchRepo.countByTenantId(tid));
        counts.put("v3_mothan_transactions",        mothanRepo.countByTenantId(tid));

        List<V3SaleTransaction> allSales = saleRepo.findByTenantId(tid);
        if (!allSales.isEmpty()) {
            LocalDate minDate = allSales.stream().map(V3SaleTransaction::getSaleDate)
                    .filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
            LocalDate maxDate = allSales.stream().map(V3SaleTransaction::getSaleDate)
                    .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
            counts.put("sales_minDate",   minDate);
            counts.put("sales_maxDate",   maxDate);
            counts.put("sales_totalSar",  Math.round(allSales.stream().mapToDouble(V3SaleTransaction::getSarAmount).sum()));
            counts.put("unique_branches", allSales.stream().map(V3SaleTransaction::getBranchCode)
                    .filter(Objects::nonNull).distinct().count());

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

        List<V3MothanTransaction> allMothan = mothanRepo.findByTenantId(tid);
        if (!allMothan.isEmpty()) {
            counts.put("mothan_minDate", allMothan.stream().map(V3MothanTransaction::getTransactionDate)
                    .filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null));
            counts.put("mothan_maxDate", allMothan.stream().map(V3MothanTransaction::getTransactionDate)
                    .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null));
            counts.put("mothan_count", allMothan.size());
        }

        return ResponseEntity.ok(Map.of("success", true, "debug", counts));
    }

    /** Full diagnosis — uses MongoDB aggregations (fast, no full load) */
    @GetMapping("/full-diagnosis")
    public ResponseEntity<?> fullDiagnosis() {
        String tid = TenantContext.getTenantId();
        Map<String, Object> d = new LinkedHashMap<>();

        // ── Collection counts ──────────────────────────────────────────────────
        d.put("v3_sale_transactions",         saleRepo.countByTenantId(tid));
        d.put("v3_employee_sale_transactions", empSaleRepo.countByTenantId(tid));
        d.put("v3_purchase_transactions",      purchRepo.countByTenantId(tid));
        d.put("v3_mothan_transactions",        mothanRepo.countByTenantId(tid));

        // ── Sales aggregation ─────────────────────────────────────────────────
        var salesAgg = Aggregation.newAggregation(
            Aggregation.match(Criteria.where("tenantId").is(tid)),
            Aggregation.group()
                .min("saleDate").as("minDate")
                .max("saleDate").as("maxDate")
                .sum("sarAmount").as("totalSar")
                .sum("pureWeightG").as("totalWt")
                .count().as("count")
        );
        var salesRes = mongo.aggregate(salesAgg, "v3_sale_transactions", org.bson.Document.class).getMappedResults();
        if (!salesRes.isEmpty()) d.put("sales_agg", salesRes.get(0));

        // ── Mothan aggregation (debit rows only) ───────────────────────────────
        var mothanAgg = Aggregation.newAggregation(
            Aggregation.match(Criteria.where("tenantId").is(tid).and("weightDebitG").gt(0)),
            Aggregation.group()
                .min("transactionDate").as("minDate")
                .max("transactionDate").as("maxDate")
                .sum("amountSar").as("totalSar")
                .sum("weightDebitG").as("totalWt")
                .count().as("count")
        );
        var mothanRes = mongo.aggregate(mothanAgg, "v3_mothan_transactions", org.bson.Document.class).getMappedResults();
        if (!mothanRes.isEmpty()) d.put("mothan_agg", mothanRes.get(0));

        // ── Purchase aggregation ───────────────────────────────────────────────
        var purchAgg = Aggregation.newAggregation(
            Aggregation.match(Criteria.where("tenantId").is(tid)),
            Aggregation.group()
                .min("purchaseDate").as("minDate")
                .max("purchaseDate").as("maxDate")
                .sum("sarAmount").as("totalSar")
                .sum("pureWeightG").as("totalWt")
                .count().as("count")
        );
        var purchRes = mongo.aggregate(purchAgg, "v3_purchase_transactions", org.bson.Document.class).getMappedResults();
        if (!purchRes.isEmpty()) d.put("purchase_agg", purchRes.get(0));

        // ── Unique branches + source files ─────────────────────────────────────
        d.put("unique_sale_branches", mongo.findDistinct(
            Query.query(Criteria.where("tenantId").is(tid)),
            "branchCode", "v3_sale_transactions", String.class).size());

        d.put("sale_sourceFiles", mongo.findDistinct(
            Query.query(Criteria.where("tenantId").is(tid)),
            "sourceFile", "v3_sale_transactions", String.class));

        d.put("mothan_sourceFiles", mongo.findDistinct(
            Query.query(Criteria.where("tenantId").is(tid)),
            "sourceFile", "v3_mothan_transactions", String.class));

        // ── 3 sample sale records ──────────────────────────────────────────────
        d.put("sample_sales_3", mongo.find(
            Query.query(Criteria.where("tenantId").is(tid)).limit(3),
            org.bson.Document.class, "v3_sale_transactions"));

        // ── Expected reference (Jan 1 – Mar 31, 2026) ─────────────────────────
        Map<String, Object> expected = new LinkedHashMap<>();
        expected.put("v3_sale_transactions",     21896);
        expected.put("sales_totalSar",           267_200_000);
        expected.put("sales_totalWt_g",          394_440);
        expected.put("unique_branches",          29);
        expected.put("v3_purchase_transactions", 3868);
        expected.put("purchase_totalSar",        231_900_000);
        expected.put("v3_mothan_transactions",   383);
        expected.put("mothan_totalSar",          87_800_000);
        d.put("EXPECTED", expected);

        return ResponseEntity.ok(Map.of("success", true, "diagnosis", d));
    }
}
