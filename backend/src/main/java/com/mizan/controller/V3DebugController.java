package com.mizan.controller;

import com.mizan.model.V3MothanTransaction;
import com.mizan.model.V3SaleTransaction;
import com.mizan.repository.*;
import com.mizan.security.TenantContext;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
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

    /**
     * POST /api/v3/debug/analyze-branch-sales
     * Upload the branch sales XLS → returns detected format, all found/missed
     * branch headers, and sample rows so we can diagnose the parser.
     */
    @PostMapping("/analyze-branch-sales")
    public ResponseEntity<?> analyzeBranchSales(@RequestParam("file") MultipartFile file) throws Exception {
        byte[] bytes = file.getBytes();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("filename",  file.getOriginalFilename());
        result.put("sizeKb",    bytes.length / 1024);

        try (org.apache.poi.hssf.usermodel.HSSFWorkbook wb =
                 new org.apache.poi.hssf.usermodel.HSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);

            // Detect format same way the service does
            String detectedFmt = "A";
            for (Row row : sheet) {
                if (row == null) continue;
                Cell c0 = row.getCell(0);
                if (c0 != null && c0.getCellType() == CellType.NUMERIC && c0.getNumericCellValue() >= 1) {
                    Cell c1cell = row.getCell(1);
                    String c1 = c1cell != null && c1cell.getCellType() == CellType.NUMERIC
                        ? String.valueOf((long) c1cell.getNumericCellValue())
                        : (c1cell != null ? c1cell.getStringCellValue().trim() : "");
                    if (c1.matches("\\d{4}")) { detectedFmt = "B"; break; }
                }
                Cell c15 = row.getCell(15);
                if (c15 != null && c15.getCellType() == CellType.NUMERIC && c15.getNumericCellValue() >= 1) {
                    detectedFmt = "A"; break;
                }
            }
            result.put("detectedFormat", detectedFmt);

            // Scan all col12 values (Format A branch headers)
            java.util.regex.Pattern currentRegex  = java.util.regex.Pattern.compile("^(\\d{3,6})\\s*[-–—/: ]\\s*(.+)");
            java.util.regex.Pattern strictRegex   = java.util.regex.Pattern.compile("^(\\d{4})\\s*[-–]\\s*(.+)");
            List<String> matchedHeaders   = new ArrayList<>();
            List<String> unmatchedDigitC12 = new ArrayList<>();
            List<Map<String,String>> sampleDataRows = new ArrayList<>();
            int dataRowCount = 0;

            for (Row row : sheet) {
                if (row == null) continue;
                // col12 scan
                Cell c12 = row.getCell(12);
                String col12 = "";
                if (c12 != null) {
                    col12 = c12.getCellType() == CellType.STRING ? c12.getStringCellValue().trim()
                          : c12.getCellType() == CellType.NUMERIC ? String.valueOf((long) c12.getNumericCellValue()) : "";
                }
                if (!col12.isBlank() && Character.isDigit(col12.charAt(0))) {
                    if (currentRegex.matcher(col12).matches()) {
                        if (matchedHeaders.size() < 40) matchedHeaders.add(col12);
                    } else {
                        if (unmatchedDigitC12.size() < 20) unmatchedDigitC12.add(col12);
                    }
                }
                // col15 data rows
                Cell c15 = row.getCell(15);
                if (c15 != null && c15.getCellType() == CellType.NUMERIC && c15.getNumericCellValue() >= 1) {
                    dataRowCount++;
                    if (sampleDataRows.size() < 5) {
                        Map<String,String> r = new LinkedHashMap<>();
                        for (int ci = 0; ci <= 15; ci++) {
                            Cell c = row.getCell(ci);
                            String v = "";
                            if (c != null) v = c.getCellType() == CellType.NUMERIC
                                ? String.valueOf(c.getNumericCellValue())
                                : c.getCellType() == CellType.STRING ? c.getStringCellValue() : "";
                            r.put("c" + ci, v);
                        }
                        sampleDataRows.add(r);
                    }
                }
            }

            result.put("col12_matchedBranchHeaders",  matchedHeaders);
            result.put("col12_unmatchedDigitValues",   unmatchedDigitC12);
            result.put("col15_dataRowCount",           dataRowCount);
            result.put("sampleDataRows",               sampleDataRows);

            // First 10 rows raw
            List<Map<String,String>> first10 = new ArrayList<>();
            for (int ri = 0; ri <= Math.min(9, sheet.getLastRowNum()); ri++) {
                Row row = sheet.getRow(ri);
                Map<String,String> r = new LinkedHashMap<>();
                if (row != null) for (int ci = 0; ci <= 15; ci++) {
                    Cell c = row.getCell(ci);
                    String v = c == null ? "" : c.getCellType() == CellType.NUMERIC
                        ? String.valueOf(c.getNumericCellValue())
                        : c.getCellType() == CellType.STRING ? c.getStringCellValue() : "";
                    if (!v.isBlank()) r.put("c" + ci, v);
                }
                first10.add(r);
            }
            result.put("first10Rows", first10);
        }

        return ResponseEntity.ok(Map.of("success", true, "analysis", result));
    }

    /**
     * POST /api/v3/debug/sheet-preview
     * Upload any XLS file → returns first 30 rows with all cell values per column.
     * Used to understand the actual file structure when parsers produce wrong counts.
     */
    @PostMapping("/sheet-preview")
    public ResponseEntity<?> sheetPreview(@RequestParam("file") MultipartFile file) throws Exception {
        byte[] bytes = file.getBytes();
        List<Map<String, Object>> rows = new ArrayList<>();

        try (Workbook wb = new HSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);
            int maxRows = Math.min(30, sheet.getLastRowNum() + 1);

            for (int ri = 0; ri < maxRows; ri++) {
                Row row = sheet.getRow(ri);
                Map<String, Object> rowMap = new LinkedHashMap<>();
                rowMap.put("rowIndex", ri);
                if (row == null) { rowMap.put("empty", true); rows.add(rowMap); continue; }

                Map<String, String> cells = new LinkedHashMap<>();
                int maxCol = Math.min(row.getLastCellNum(), 18);
                for (int ci = 0; ci < maxCol; ci++) {
                    Cell c = row.getCell(ci);
                    String val = "";
                    if (c != null) {
                        val = switch (c.getCellType()) {
                            case NUMERIC -> String.valueOf(c.getNumericCellValue());
                            case STRING  -> c.getStringCellValue();
                            case BOOLEAN -> String.valueOf(c.getBooleanCellValue());
                            case FORMULA -> {
                                try { yield String.valueOf(c.getNumericCellValue()); }
                                catch (Exception e) { yield c.getCellFormula(); }
                            }
                            default -> "";
                        };
                    }
                    cells.put("c" + ci, val);
                }
                rowMap.put("cells", cells);
                rows.add(rowMap);
            }
        }

        return ResponseEntity.ok(Map.of(
            "success", true,
            "filename", file.getOriginalFilename(),
            "rows", rows
        ));
    }
}
