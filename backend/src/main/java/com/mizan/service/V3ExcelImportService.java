package com.mizan.service;

import com.mizan.config.BranchMaps;
import com.mizan.model.*;
import com.mizan.repository.*;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * V3 Excel Import — two-phase pipeline.
 *
 * Phase 1: Parse all rows into ParsedRow objects (raw values, no sign convention, no caps).
 * Phase 2: Classify each row as CLEAN or DIRTY.
 *   CLEAN → direct insert to the live v3 collection.
 *   DIRTY → insert to v3_staged_records for human review.
 *
 * Supports two Excel formats (auto-detected):
 *   Format A: Sl.# in col15, total SAR in col3, branch carry-forward from col12 header rows.
 *   Format B: Sl.# in col0,  total SAR in col15, branchCode in col1, date in col6 (Excel serial).
 *
 * Sign convention (sales): rawTotal < 0 in file = sale → sarAmount = -rawTotal (positive stored).
 *                           rawTotal > 0 in file = return → sarAmount = -rawTotal (negative stored).
 * Sign convention (purchases): sarAmount = Math.abs(rawTotal) always.
 * Sign convention (mothan): amountSar = Math.abs(col4) already.
 */
@Slf4j
@Service
public class V3ExcelImportService {

    private final MongoTemplate                    mongo;
    private final V3BranchPurchaseRateRepository   rateRepo;
    private final V3BranchRepository               branchRepo;
    private final V3EmployeeRepository             empRepo;
    private final V3CacheService                   cache;
    private final V3ImportStatusService            statusSvc;
    private final V3StagedRecordRepository         stagedRepo;

    private static final DateTimeFormatter DD_MM_YYYY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final int PIECE_CAP = 500;

    // ─── Result type ──────────────────────────────────────────────────────────

    public record ImportResult(int autoSaved, int stagedForReview, int totalParsed) {}

    // ─── Inner types ──────────────────────────────────────────────────────────

    /** All raw Excel values for a single data row. No sign convention applied, no caps. */
    private static class ParsedRow {
        int excelRow;
        // Common fields
        String rawBranchCode;
        String branchCode;     // validated 4-digit code or null
        LocalDate date;
        String rawDate;        // original string (for multiline detection in mothan)
        double totalSar;       // raw from Excel (negative = sale for sales files)
        double pureWeight;     // raw
        double grossWeight;
        double metalValue;
        double makingCharge;
        double rawPieces;      // raw, before abs and cap
        double purity;
        // Employee sales only
        String empId;
        String empName;
        // Mothan only
        double creditSar;      // Math.abs(col4)
        double debitGold;
        double weightCredit;
        double balanceGold;
        double balanceSar;
        String docRef;
        String description;
    }

    /** Per-branch statistics derived from clean rows, used for anomaly suggestions. */
    private static class BranchStats {
        double medianSarPerPiece;
        int cleanRowCount;
    }

    // ─── Format detection ─────────────────────────────────────────────────────

    private enum Format { A, B }

    /**
     * Format B: col0 contains the row serial number (Sl.#).
     * Format A: col15 contains the row serial number.
     */
    private Format detectFormat(Sheet sheet) {
        for (Row row : sheet) {
            if (row == null) continue;
            Cell c0 = row.getCell(0);
            if (c0 != null && c0.getCellType() == CellType.NUMERIC && c0.getNumericCellValue() >= 1) {
                String c1 = getStr(row, 1);
                if (c1.matches("\\d{4}")) return Format.B;
            }
            Cell c15 = row.getCell(15);
            if (c15 != null && c15.getCellType() == CellType.NUMERIC && c15.getNumericCellValue() >= 1) {
                return Format.A;
            }
        }
        return Format.A;
    }

    // ─── Branch/date header patterns (Format A) ───────────────────────────────

    private static final java.util.regex.Pattern BRANCH_HEADER_A =
        java.util.regex.Pattern.compile("^(\\d{3,6})\\s*[-–—/: ]\\s*(.+)");
    private static final java.util.regex.Pattern BRANCH_HEADER_PLAIN =
        java.util.regex.Pattern.compile("^(\\d{4})\\s+(.+)");
    private static final java.util.regex.Pattern DATE_HEADER_A =
        java.util.regex.Pattern.compile("(\\d{1,2})/(\\d{1,2})/(\\d{4})|(\\d{4})-(\\d{2})-(\\d{2})");

    private static final java.time.format.DateTimeFormatter[] MOTHAN_DATE_FMTS = {
        DD_MM_YYYY,
        java.time.format.DateTimeFormatter.ofPattern("d/M/yyyy"),
        java.time.format.DateTimeFormatter.ofPattern("dd-MM-yyyy"),
        java.time.format.DateTimeFormatter.ofPattern("d-M-yyyy"),
        java.time.format.DateTimeFormatter.ofPattern("yyyy/MM/dd"),
        java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"),
        java.time.format.DateTimeFormatter.ofPattern("MM/dd/yyyy"),
    };

    // ─── Constructor ──────────────────────────────────────────────────────────

    public V3ExcelImportService(MongoTemplate mongo,
                                V3BranchPurchaseRateRepository rateRepo,
                                V3BranchRepository branchRepo,
                                V3EmployeeRepository empRepo,
                                V3CacheService cache,
                                V3ImportStatusService statusSvc,
                                V3StagedRecordRepository stagedRepo) {
        this.mongo       = mongo;
        this.rateRepo    = rateRepo;
        this.branchRepo  = branchRepo;
        this.empRepo     = empRepo;
        this.cache       = cache;
        this.statusSvc   = statusSvc;
        this.stagedRepo  = stagedRepo;
    }

    // ─── Public entry points ──────────────────────────────────────────────────

    public ImportResult importByType(String type, byte[] bytes, String filename,
                                     String tenantId, String importId) throws Exception {
        return switch (type) {
            case "branch-sales"   -> importBranchSales(bytes, filename, tenantId, importId);
            case "employee-sales" -> importEmployeeSales(bytes, filename, tenantId, importId);
            case "purchases"      -> importPurchases(bytes, filename, tenantId, importId);
            case "mothan"         -> importMothan(bytes, filename, tenantId, importId);
            default -> throw new IllegalArgumentException("Unknown import type: " + type);
        };
    }

    // ─── Branch Sales ─────────────────────────────────────────────────────────

    public ImportResult importBranchSales(byte[] bytes, String filename,
                                          String tenantId, String importId) throws Exception {
        log.info("V3 branch-sales START: '{}' {} bytes, tenant={}", filename, bytes.length, tenantId);
        long t0 = System.currentTimeMillis();

        try (Workbook wb = new HSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);
            Format fmt = detectFormat(sheet);
            log.info("V3 branch-sales format detected: {}", fmt);

            // Phase 1: Parse
            List<ParsedRow> rows = parseAllRowsForSales(sheet);
            log.info("V3 branch-sales PARSED: {} raw rows from '{}'", rows.size(), filename);
            if (rows.isEmpty()) {
                log.warn("V3 branch-sales: 0 rows parsed — existing data NOT touched");
                return new ImportResult(0, 0, 0);
            }

            // Phase 2: Classify
            Map<String, BranchStats> stats = buildBranchStats(rows);
            List<V3SaleTransaction> cleanList = new ArrayList<>();
            List<V3StagedRecord> stagedList = new ArrayList<>();

            for (ParsedRow row : rows) {
                List<V3StagedRecord.FieldIssue> issues = validateSalesRow(row, stats);
                if (issues.isEmpty()) {
                    cleanList.add(toSaleTransaction(row, tenantId, filename));
                } else {
                    Map<String, Object> parsedMap = buildSalesParsedMap(row, tenantId, filename);
                    stagedList.add(buildStagedRecord(row, "branch-sales", issues,
                        stats.get(row.branchCode), parsedMap, tenantId, importId, null));
                }
            }

            log.info("V3 branch-sales classified: {} clean, {} staged", cleanList.size(), stagedList.size());

            if (cleanList.isEmpty() && stagedList.isEmpty()) {
                return new ImportResult(0, 0, rows.size());
            }

            int total = cleanList.size();
            statusSvc.update(importId, "deleting", total, 0, total);

            // Overlap guard + delete existing date range
            if (!cleanList.isEmpty()) {
                LocalDate minDate = cleanList.stream()
                    .map(V3SaleTransaction::getSaleDate).filter(Objects::nonNull)
                    .min(LocalDate::compareTo).orElseThrow();
                LocalDate maxDate = cleanList.stream()
                    .map(V3SaleTransaction::getSaleDate).filter(Objects::nonNull)
                    .max(LocalDate::compareTo).orElseThrow();
                double parsedSar = cleanList.stream().mapToDouble(V3SaleTransaction::getSarAmount).sum();

                long existing = mongo.count(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("saleDate").gte(minDate).lte(maxDate)), V3SaleTransaction.class);
                if (existing > 0) {
                    double overlapPct = Math.abs((double)(cleanList.size() - existing) / existing * 100);
                    if (overlapPct > 10)
                        log.warn("OVERLAP GUARD [branch-sales]: existing={} new={} ({}% diff) range {} – {}",
                            existing, cleanList.size(), Math.round(overlapPct), minDate, maxDate);
                }
                long deleted = mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("saleDate").gte(minDate).lte(maxDate)), V3SaleTransaction.class).getDeletedCount();
                log.info("V3 branch-sales deleted {} existing for range {} – {}", deleted, minDate, maxDate);

                statusSvc.update(importId, "saving", total, 0, total);
                int saved = bulkInsertSafe(cleanList, V3SaleTransaction.class, importId);
                upsertBranches(cleanList.stream().map(V3SaleTransaction::getBranchCode).distinct().toList(), tenantId);
                verifyImport(tenantId, "saleDate", "sarAmount", "v3_sale_transactions",
                    minDate, maxDate, cleanList.size(), parsedSar);

                // Clear old pending staged for this file type then insert new
                mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("fileType").is("branch-sales")
                    .and("status").is("pending")), "v3_staged_records");
                if (!stagedList.isEmpty()) mongo.insertAll(stagedList);

                cache.invalidate(tenantId);
                log.info("V3 branch-sales DONE: {} saved, {} staged in {}ms",
                    saved, stagedList.size(), System.currentTimeMillis() - t0);
                return new ImportResult(saved, stagedList.size(), rows.size());
            } else {
                // All rows are dirty — still clear + re-insert staged
                mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("fileType").is("branch-sales")
                    .and("status").is("pending")), "v3_staged_records");
                mongo.insertAll(stagedList);
                log.info("V3 branch-sales DONE: 0 saved, {} staged in {}ms",
                    stagedList.size(), System.currentTimeMillis() - t0);
                return new ImportResult(0, stagedList.size(), rows.size());
            }
        }
    }

    // ─── Employee Sales ───────────────────────────────────────────────────────

    public ImportResult importEmployeeSales(byte[] bytes, String filename,
                                            String tenantId, String importId) throws Exception {
        log.info("V3 employee-sales START: '{}' {} bytes", filename, bytes.length);
        long t0 = System.currentTimeMillis();

        try (Workbook wb = new HSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);

            // Phase 1: Parse
            List<ParsedRow> rows = parseAllRowsForEmpSales(sheet, tenantId);
            log.info("V3 employee-sales PARSED: {} raw rows", rows.size());
            if (rows.isEmpty()) {
                log.warn("V3 employee-sales: 0 rows parsed — existing data NOT touched");
                return new ImportResult(0, 0, 0);
            }

            // Build available-employees map per branch for staged records
            Map<String, List<Map<String, Object>>> empsByBranch = buildEmployeesByBranch(tenantId);

            // Phase 2: Classify
            Map<String, BranchStats> stats = buildBranchStats(rows);
            List<V3EmployeeSaleTransaction> cleanList = new ArrayList<>();
            List<V3StagedRecord> stagedList = new ArrayList<>();

            for (ParsedRow row : rows) {
                List<V3StagedRecord.FieldIssue> issues = validateEmpRow(row, stats);
                if (issues.isEmpty()) {
                    cleanList.add(toEmpSaleTransaction(row, tenantId, filename));
                } else {
                    Map<String, Object> parsedMap = buildEmpParsedMap(row, tenantId, filename);
                    List<Map<String, Object>> availEmps = empsByBranch.getOrDefault(
                        row.branchCode != null ? row.branchCode : "", Collections.emptyList());
                    stagedList.add(buildStagedRecord(row, "employee-sales", issues,
                        stats.get(row.branchCode), parsedMap, tenantId, importId, availEmps));
                }
            }

            log.info("V3 employee-sales classified: {} clean, {} staged", cleanList.size(), stagedList.size());

            if (cleanList.isEmpty() && stagedList.isEmpty()) {
                return new ImportResult(0, 0, rows.size());
            }

            int total = cleanList.size();
            statusSvc.update(importId, "deleting", total, 0, total);

            if (!cleanList.isEmpty()) {
                LocalDate minDate = cleanList.stream()
                    .map(V3EmployeeSaleTransaction::getSaleDate).filter(Objects::nonNull)
                    .min(LocalDate::compareTo).orElseThrow();
                LocalDate maxDate = cleanList.stream()
                    .map(V3EmployeeSaleTransaction::getSaleDate).filter(Objects::nonNull)
                    .max(LocalDate::compareTo).orElseThrow();
                double parsedSar = cleanList.stream().mapToDouble(V3EmployeeSaleTransaction::getSarAmount).sum();

                long existing = mongo.count(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("saleDate").gte(minDate).lte(maxDate)), V3EmployeeSaleTransaction.class);
                if (existing > 0) {
                    double overlapPct = Math.abs((double)(cleanList.size() - existing) / existing * 100);
                    if (overlapPct > 10)
                        log.warn("OVERLAP GUARD [employee-sales]: existing={} new={} ({}% diff) range {} – {}",
                            existing, cleanList.size(), Math.round(overlapPct), minDate, maxDate);
                }
                long deleted = mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("saleDate").gte(minDate).lte(maxDate)),
                    V3EmployeeSaleTransaction.class).getDeletedCount();
                log.info("V3 employee-sales deleted {} existing, range {} – {}", deleted, minDate, maxDate);

                statusSvc.update(importId, "saving", total, 0, total);
                int saved = bulkInsertSafe(cleanList, V3EmployeeSaleTransaction.class, importId);
                upsertEmployees(cleanList, tenantId);
                verifyImport(tenantId, "saleDate", "sarAmount", "v3_employee_sale_transactions",
                    minDate, maxDate, cleanList.size(), parsedSar);

                mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("fileType").is("employee-sales")
                    .and("status").is("pending")), "v3_staged_records");
                if (!stagedList.isEmpty()) mongo.insertAll(stagedList);

                cache.invalidate(tenantId);
                log.info("V3 employee-sales DONE: {} saved, {} staged in {}ms",
                    saved, stagedList.size(), System.currentTimeMillis() - t0);
                return new ImportResult(saved, stagedList.size(), rows.size());
            } else {
                mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("fileType").is("employee-sales")
                    .and("status").is("pending")), "v3_staged_records");
                mongo.insertAll(stagedList);
                log.info("V3 employee-sales DONE: 0 saved, {} staged in {}ms",
                    stagedList.size(), System.currentTimeMillis() - t0);
                return new ImportResult(0, stagedList.size(), rows.size());
            }
        }
    }

    // ─── Purchases ────────────────────────────────────────────────────────────

    public ImportResult importPurchases(byte[] bytes, String filename,
                                        String tenantId, String importId) throws Exception {
        log.info("V3 purchases START: '{}' {} bytes", filename, bytes.length);
        long t0 = System.currentTimeMillis();

        try (Workbook wb = new HSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);

            // Phase 1: Parse
            List<ParsedRow> rows = parseAllRowsForPurchases(sheet);
            log.info("V3 purchases PARSED: {} raw rows", rows.size());
            if (rows.isEmpty()) {
                log.warn("V3 purchases: 0 rows parsed — existing data NOT touched");
                return new ImportResult(0, 0, 0);
            }

            // Phase 2: Classify
            List<V3PurchaseTransaction> cleanList = new ArrayList<>();
            List<V3StagedRecord> stagedList = new ArrayList<>();

            for (ParsedRow row : rows) {
                List<V3StagedRecord.FieldIssue> issues = validatePurchaseRow(row);
                if (issues.isEmpty()) {
                    cleanList.add(toPurchaseTransaction(row, tenantId, filename));
                } else {
                    Map<String, Object> parsedMap = buildPurchaseParsedMap(row, tenantId, filename);
                    stagedList.add(buildStagedRecord(row, "purchases", issues,
                        null, parsedMap, tenantId, importId, null));
                }
            }

            log.info("V3 purchases classified: {} clean, {} staged", cleanList.size(), stagedList.size());

            if (cleanList.isEmpty() && stagedList.isEmpty()) {
                return new ImportResult(0, 0, rows.size());
            }

            int total = cleanList.size();
            statusSvc.update(importId, "deleting", total, 0, total);

            if (!cleanList.isEmpty()) {
                LocalDate minDate = cleanList.stream()
                    .map(V3PurchaseTransaction::getPurchaseDate).filter(Objects::nonNull)
                    .min(LocalDate::compareTo).orElseThrow();
                LocalDate maxDate = cleanList.stream()
                    .map(V3PurchaseTransaction::getPurchaseDate).filter(Objects::nonNull)
                    .max(LocalDate::compareTo).orElseThrow();
                double parsedSar = cleanList.stream().mapToDouble(V3PurchaseTransaction::getSarAmount).sum();

                long existing = mongo.count(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("purchaseDate").gte(minDate).lte(maxDate)), V3PurchaseTransaction.class);
                if (existing > 0) {
                    double overlapPct = Math.abs((double)(cleanList.size() - existing) / existing * 100);
                    if (overlapPct > 10)
                        log.warn("OVERLAP GUARD [purchases]: existing={} new={} ({}% diff) range {} – {}",
                            existing, cleanList.size(), Math.round(overlapPct), minDate, maxDate);
                }
                long deleted = mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("purchaseDate").gte(minDate).lte(maxDate)),
                    V3PurchaseTransaction.class).getDeletedCount();
                log.info("V3 purchases deleted {} existing, range {} – {}", deleted, minDate, maxDate);

                statusSvc.update(importId, "saving", total, 0, total);
                int saved = bulkInsertSafe(cleanList, V3PurchaseTransaction.class, importId);
                statusSvc.update(importId, "computing_rates", saved, saved, saved);
                recomputePurchaseRates(tenantId);
                verifyImport(tenantId, "purchaseDate", "sarAmount", "v3_purchase_transactions",
                    minDate, maxDate, cleanList.size(), parsedSar);

                mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("fileType").is("purchases")
                    .and("status").is("pending")), "v3_staged_records");
                if (!stagedList.isEmpty()) mongo.insertAll(stagedList);

                cache.invalidate(tenantId);
                log.info("V3 purchases DONE: {} saved, {} staged in {}ms",
                    saved, stagedList.size(), System.currentTimeMillis() - t0);
                return new ImportResult(saved, stagedList.size(), rows.size());
            } else {
                mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("fileType").is("purchases")
                    .and("status").is("pending")), "v3_staged_records");
                mongo.insertAll(stagedList);
                log.info("V3 purchases DONE: 0 saved, {} staged in {}ms",
                    stagedList.size(), System.currentTimeMillis() - t0);
                return new ImportResult(0, stagedList.size(), rows.size());
            }
        }
    }

    // ─── Mothan ───────────────────────────────────────────────────────────────

    public ImportResult importMothan(byte[] bytes, String filename,
                                     String tenantId, String importId) throws Exception {
        log.info("V3 mothan START: '{}' {} bytes", filename, bytes.length);
        long t0 = System.currentTimeMillis();

        try (Workbook wb = new HSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);

            // Phase 1: Parse
            List<ParsedRow> rows = parseAllRowsForMothan(sheet);
            log.info("V3 mothan PARSED: {} raw rows", rows.size());
            if (rows.isEmpty()) {
                log.warn("V3 mothan: 0 rows parsed — existing data NOT touched");
                return new ImportResult(0, 0, 0);
            }

            // Phase 2: Classify
            List<V3MothanTransaction> cleanList = new ArrayList<>();
            List<V3StagedRecord> stagedList = new ArrayList<>();

            for (ParsedRow row : rows) {
                List<V3StagedRecord.FieldIssue> issues = validateMothanRow(row);
                if (issues.isEmpty()) {
                    cleanList.add(toMothanTransaction(row, tenantId, filename));
                } else {
                    Map<String, Object> parsedMap = buildMothanParsedMap(row, tenantId, filename);
                    stagedList.add(buildStagedRecord(row, "mothan", issues,
                        null, parsedMap, tenantId, importId, null));
                }
            }

            log.info("V3 mothan classified: {} clean, {} staged", cleanList.size(), stagedList.size());

            if (cleanList.isEmpty() && stagedList.isEmpty()) {
                return new ImportResult(0, 0, rows.size());
            }

            int total = cleanList.size();
            statusSvc.update(importId, "deleting", total, 0, total);

            if (!cleanList.isEmpty()) {
                LocalDate minDate = cleanList.stream()
                    .map(V3MothanTransaction::getTransactionDate).filter(Objects::nonNull)
                    .min(LocalDate::compareTo).orElse(null);
                LocalDate maxDate = cleanList.stream()
                    .map(V3MothanTransaction::getTransactionDate).filter(Objects::nonNull)
                    .max(LocalDate::compareTo).orElse(null);
                double parsedSar = cleanList.stream().mapToDouble(V3MothanTransaction::getAmountSar).sum();

                if (minDate != null && maxDate != null) {
                    long existing = mongo.count(Query.query(Criteria.where("tenantId").is(tenantId)
                        .and("transactionDate").gte(minDate).lte(maxDate)), V3MothanTransaction.class);
                    if (existing > 0) {
                        double overlapPct = Math.abs((double)(cleanList.size() - existing) / existing * 100);
                        if (overlapPct > 10)
                            log.warn("OVERLAP GUARD [mothan]: existing={} new={} ({}% diff) range {} – {}",
                                existing, cleanList.size(), Math.round(overlapPct), minDate, maxDate);
                    }
                    long deleted = mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                        .and("transactionDate").gte(minDate).lte(maxDate)),
                        V3MothanTransaction.class).getDeletedCount();
                    log.info("V3 mothan deleted {} existing for range {} to {}", deleted, minDate, maxDate);
                }

                statusSvc.update(importId, "saving", total, 0, total);
                int saved = bulkInsertSafe(cleanList, V3MothanTransaction.class, importId);

                statusSvc.update(importId, "computing_rates", saved, saved, saved);
                recomputePurchaseRates(tenantId);

                if (minDate != null && maxDate != null) {
                    verifyImport(tenantId, "transactionDate", "amountSar", "v3_mothan_transactions",
                        minDate, maxDate, cleanList.size(), parsedSar);
                }

                mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("fileType").is("mothan")
                    .and("status").is("pending")), "v3_staged_records");
                if (!stagedList.isEmpty()) mongo.insertAll(stagedList);

                cache.invalidate(tenantId);
                log.info("V3 mothan DONE: {} saved, {} staged in {}ms",
                    saved, stagedList.size(), System.currentTimeMillis() - t0);
                return new ImportResult(saved, stagedList.size(), rows.size());
            } else {
                mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("fileType").is("mothan")
                    .and("status").is("pending")), "v3_staged_records");
                mongo.insertAll(stagedList);
                log.info("V3 mothan DONE: 0 saved, {} staged in {}ms",
                    stagedList.size(), System.currentTimeMillis() - t0);
                return new ImportResult(0, stagedList.size(), rows.size());
            }
        }
    }

    // ─── Phase 1: Parse methods ───────────────────────────────────────────────

    /**
     * Parse all data rows from a sales sheet (Format A or B) into raw ParsedRow objects.
     * No sign convention applied. No piece cap. Branch code stored as-is.
     */
    List<ParsedRow> parseAllRowsForSales(Sheet sheet) {
        Format fmt = detectFormat(sheet);
        List<ParsedRow> result = new ArrayList<>();

        if (fmt == Format.B) {
            for (Row row : sheet) {
                if (!isDataRowB(row)) continue;
                String rawBranch = getStr(row, 1);
                ParsedRow pr = new ParsedRow();
                pr.excelRow      = row.getRowNum();
                pr.rawBranchCode = rawBranch;
                pr.branchCode    = rawBranch.matches("\\d{4}") ? rawBranch : null;
                pr.totalSar      = getNumRaw(row, 15);
                pr.date          = parseSerialDate(getNumRaw(row, 6));
                pr.pureWeight    = getNumRaw(row, 12);
                pr.grossWeight   = getNumRaw(row, 8);
                pr.purity        = getNumRaw(row, 11);
                pr.rawPieces     = getNumRaw(row, 7);
                pr.metalValue    = getNumRaw(row, 13);
                pr.makingCharge  = getNumRaw(row, 14);
                result.add(pr);
            }
        } else {
            // Format A: branch carry-forward from col12 header rows
            String currentBranch = null;
            LocalDate currentDate = extractDateFromHeader(sheet);
            if (currentDate == null)
                log.warn("parseAllRowsForSales: no date in header rows");
            Set<String> loggedMisses = new LinkedHashSet<>();
            int droppedNoBranch = 0;
            int droppedNoDate = 0;

            for (Row row : sheet) {
                if (row == null) continue;
                String col12 = getStr(row, 12);
                java.util.regex.Matcher bm = BRANCH_HEADER_A.matcher(col12);
                if (!bm.matches()) bm = BRANCH_HEADER_PLAIN.matcher(col12);
                if (bm.matches()) { currentBranch = bm.group(1); continue; }

                if (!col12.isBlank() && col12.length() > 2 && Character.isDigit(col12.charAt(0))
                        && loggedMisses.size() < 20) {
                    loggedMisses.add(col12);
                }

                LocalDate rowDate = extractDateFromRow(row, currentDate);
                if (rowDate != null) currentDate = rowDate;

                if (!isDataRowA(row)) continue;
                if (col12.contains("Sub Total") || col12.contains("Grand Total") || col12.contains("إجمالي")) continue;

                if (currentBranch == null) { droppedNoBranch++; continue; }
                if (currentDate == null)   { droppedNoDate++;   continue; }

                ParsedRow pr = new ParsedRow();
                pr.excelRow      = row.getRowNum();
                pr.rawBranchCode = currentBranch;
                pr.branchCode    = currentBranch.matches("\\d{4}") ? currentBranch : null;
                pr.date          = currentDate;
                pr.totalSar      = getNumRaw(row, 3);
                pr.pureWeight    = getNumRaw(row, 6);
                pr.grossWeight   = getNumRaw(row, 10);
                pr.purity        = getNumRaw(row, 7);
                pr.rawPieces     = getNumRaw(row, 11);
                pr.metalValue    = getNumRaw(row, 5);
                pr.makingCharge  = getNumRaw(row, 4);
                result.add(pr);
            }
            log.info("parseAllRowsForSales(A): {} rows, droppedNoBranch={}, droppedNoDate={}",
                result.size(), droppedNoBranch, droppedNoDate);
            if (!loggedMisses.isEmpty())
                log.warn("parseAllRowsForSales: col12 digit-starting values that didn't match branch header regex: {}", loggedMisses);
        }
        return result;
    }

    /**
     * Parse all data rows from an employee-sales sheet (Format A or B) into raw ParsedRow objects.
     * tenantId is used only for employee lookup (not stored in ParsedRow).
     */
    List<ParsedRow> parseAllRowsForEmpSales(Sheet sheet, String tenantId) {
        Format fmt = detectFormat(sheet);
        List<ParsedRow> result = new ArrayList<>();

        if (fmt == Format.B) {
            for (Row row : sheet) {
                if (!isDataRowB(row)) continue;
                String rawBranch = getStr(row, 1);
                ParsedRow pr = new ParsedRow();
                pr.excelRow      = row.getRowNum();
                pr.rawBranchCode = rawBranch;
                pr.branchCode    = rawBranch.matches("\\d{4}") ? rawBranch : null;
                pr.totalSar      = getNumRaw(row, 15);
                pr.date          = parseSerialDate(getNumRaw(row, 6));
                pr.pureWeight    = getNumRaw(row, 12);
                pr.grossWeight   = getNumRaw(row, 8);
                pr.purity        = getNumRaw(row, 11);
                pr.rawPieces     = getNumRaw(row, 7);
                pr.metalValue    = getNumRaw(row, 13);
                pr.makingCharge  = getNumRaw(row, 14);

                // Employee ID: prefer col3 (integer) else col2
                String empId = "";
                double c3v = getNumRaw(row, 3);
                if (c3v >= 1 && c3v == Math.floor(c3v)) empId = String.valueOf((long) c3v);
                if (empId.isBlank()) {
                    String c2 = getStr(row, 2);
                    if (c2.matches("\\d+")) empId = c2;
                }
                pr.empId   = empId.isBlank() ? "" : empId;
                pr.empName = getStr(row, 5);
                result.add(pr);
            }
        } else {
            // Format A: branch carry-forward from col12; empId from col13; empName from col12 data row
            String currentBranch = null;
            LocalDate currentDate = extractDateFromHeader(sheet);
            if (currentDate == null)
                log.warn("parseAllRowsForEmpSales: no date in header rows");
            int droppedNoBranch = 0;
            int droppedNoDate = 0;

            for (Row row : sheet) {
                if (row == null) continue;
                String col12 = getStr(row, 12);
                java.util.regex.Matcher bm = BRANCH_HEADER_A.matcher(col12);
                if (!bm.matches()) bm = BRANCH_HEADER_PLAIN.matcher(col12);
                if (bm.matches()) { currentBranch = bm.group(1); continue; }

                LocalDate rowDate = extractDateFromRow(row, currentDate);
                if (rowDate != null) currentDate = rowDate;

                if (!isDataRowA(row)) continue;
                if (col12.contains("Sub Total") || col12.contains("Grand Total") || col12.contains("إجمالي")) continue;

                if (currentBranch == null) { droppedNoBranch++; continue; }
                if (currentDate == null)   { droppedNoDate++;   continue; }

                ParsedRow pr = new ParsedRow();
                pr.excelRow      = row.getRowNum();
                pr.rawBranchCode = currentBranch;
                pr.branchCode    = currentBranch.matches("\\d{4}") ? currentBranch : null;
                pr.date          = currentDate;
                pr.totalSar      = getNumRaw(row, 3);
                pr.pureWeight    = getNumRaw(row, 6);
                pr.grossWeight   = getNumRaw(row, 10);
                pr.purity        = getNumRaw(row, 7);
                pr.rawPieces     = getNumRaw(row, 11);
                pr.metalValue    = getNumRaw(row, 5);
                pr.makingCharge  = getNumRaw(row, 4);
                pr.empId         = getStr(row, 13).trim();
                pr.empName       = col12.trim();
                result.add(pr);
            }
            log.info("parseAllRowsForEmpSales(A): {} rows, droppedNoBranch={}, droppedNoDate={}",
                result.size(), droppedNoBranch, droppedNoDate);
        }
        return result;
    }

    /**
     * Parse all data rows from a purchases sheet (Format A or B) into raw ParsedRow objects.
     */
    List<ParsedRow> parseAllRowsForPurchases(Sheet sheet) {
        Format fmt = detectFormat(sheet);
        List<ParsedRow> result = new ArrayList<>();

        if (fmt == Format.B) {
            for (Row row : sheet) {
                if (!isDataRowB(row)) continue;
                String rawBranch = getStr(row, 1);
                ParsedRow pr = new ParsedRow();
                pr.excelRow      = row.getRowNum();
                pr.rawBranchCode = rawBranch;
                pr.branchCode    = rawBranch.matches("\\d{4}") ? rawBranch : null;
                pr.totalSar      = getNumRaw(row, 15);
                pr.date          = parseSerialDate(getNumRaw(row, 6));
                pr.pureWeight    = getNumRaw(row, 12);
                pr.grossWeight   = getNumRaw(row, 8);
                pr.purity        = getNumRaw(row, 11);
                pr.rawPieces     = getNumRaw(row, 7);
                result.add(pr);
            }
        } else {
            String currentBranch = null;
            LocalDate currentDate = extractDateFromHeader(sheet);
            if (currentDate == null)
                log.warn("parseAllRowsForPurchases: no date in header rows");
            int droppedNoBranch = 0;
            int droppedNoDate = 0;

            for (Row row : sheet) {
                if (row == null) continue;
                String col12 = getStr(row, 12);
                java.util.regex.Matcher bm = BRANCH_HEADER_A.matcher(col12);
                if (!bm.matches()) bm = BRANCH_HEADER_PLAIN.matcher(col12);
                if (bm.matches()) { currentBranch = bm.group(1); continue; }

                LocalDate rowDate = extractDateFromRow(row, currentDate);
                if (rowDate != null) currentDate = rowDate;

                if (!isDataRowA(row)) continue;
                if (col12.contains("Sub Total") || col12.contains("Grand Total") || col12.contains("إجمالي")) continue;

                if (currentBranch == null) { droppedNoBranch++; continue; }
                if (currentDate == null)   { droppedNoDate++;   continue; }

                ParsedRow pr = new ParsedRow();
                pr.excelRow      = row.getRowNum();
                pr.rawBranchCode = currentBranch;
                pr.branchCode    = currentBranch.matches("\\d{4}") ? currentBranch : null;
                pr.date          = currentDate;
                pr.totalSar      = getNumRaw(row, 3);
                pr.pureWeight    = getNumRaw(row, 6);
                pr.grossWeight   = getNumRaw(row, 10);
                pr.purity        = getNumRaw(row, 7);
                pr.rawPieces     = getNumRaw(row, 11);
                result.add(pr);
            }
            log.info("parseAllRowsForPurchases(A): {} rows, droppedNoBranch={}, droppedNoDate={}",
                result.size(), droppedNoBranch, droppedNoDate);
        }
        return result;
    }

    /**
     * Parse all data rows from a mothan sheet into raw ParsedRow objects.
     * Mothan col layout:
     *   Col0=balanceGoldG, Col1=weightCreditG, Col2=weightDebitG,
     *   Col3=balanceSar, Col4=creditSar, Col5=debitSar,
     *   Col6=description, Col7=branchCode, Col8=docRef, Col9=date
     */
    List<ParsedRow> parseAllRowsForMothan(Sheet sheet) {
        List<ParsedRow> result = new ArrayList<>();
        int rejected = 0;

        for (Row row : sheet) {
            if (row == null) continue;

            String rawBranch = getStr(row, 7).trim();
            double creditSarRaw = Math.abs(getNumRaw(row, 4));

            if (!rawBranch.matches("\\d{4}")) {
                if (rejected++ < 10)
                    log.info("Mothan rejected row {}: invalid branchCode='{}' creditSar={}",
                        row.getRowNum(), rawBranch, creditSarRaw);
                continue;
            }

            // Capture raw date string for multiline detection before parsing
            String rawDateStr = null;
            Cell dateCell = row.getCell(9);
            if (dateCell != null && dateCell.getCellType() == CellType.STRING) {
                rawDateStr = dateCell.getStringCellValue();
            }

            LocalDate date = parseMothanDate(row, 9);
            if (date == null) {
                if (rejected++ < 10)
                    log.info("Mothan rejected row {}: null date, branchCode={}", row.getRowNum(), rawBranch);
                continue;
            }

            ParsedRow pr = new ParsedRow();
            pr.excelRow      = row.getRowNum();
            pr.rawBranchCode = rawBranch;
            pr.branchCode    = rawBranch;
            pr.date          = date;
            pr.rawDate       = rawDateStr;
            pr.creditSar     = creditSarRaw;
            pr.debitGold     = getNumRaw(row, 2);
            pr.weightCredit  = getNumRaw(row, 1);
            pr.balanceGold   = getNumRaw(row, 0);
            pr.balanceSar    = getNumRaw(row, 3);
            pr.description   = getStr(row, 6);
            pr.docRef        = getStr(row, 8);
            result.add(pr);
        }
        log.info("parseAllRowsForMothan: {} accepted, {} rejected", result.size(), rejected);
        return result;
    }

    // ─── Phase 2: Validation methods ─────────────────────────────────────────

    /**
     * Validate a sales row. Returns a list of issues; empty list means CLEAN.
     */
    List<V3StagedRecord.FieldIssue> validateSalesRow(ParsedRow row, Map<String, BranchStats> stats) {
        List<V3StagedRecord.FieldIssue> issues = new ArrayList<>();

        if (row.branchCode == null || !row.branchCode.matches("\\d{4}")) {
            issues.add(issue("branchCode", "invalid", null, 0.0, null));
        }

        if (row.date == null) {
            issues.add(issue("date", "missing", null, 0.0, null));
        }

        if (row.totalSar == 0) {
            issues.add(issue("sarAmount", "zero_value", null, 0.0, null));
        }

        if (Math.abs(row.rawPieces) > PIECE_CAP) {
            BranchStats bs = row.branchCode != null ? stats.get(row.branchCode) : null;
            double medianRatio = bs != null ? bs.medianSarPerPiece : 0;
            String suggested = null;
            double confidence = 0;
            if (medianRatio > 0 && Math.abs(row.totalSar) > 0) {
                long imp = Math.round(Math.abs(row.totalSar) / medianRatio);
                imp = Math.max(1, Math.min(imp, PIECE_CAP));
                suggested = String.valueOf(imp);
                confidence = (bs != null && bs.cleanRowCount > 10) ? 0.85 : 0.5;
            }
            issues.add(issue("pieces", "corrupt_value", suggested, confidence,
                suggested != null ? "branch_median_sar_per_piece" : null));
        }

        return issues;
    }

    /**
     * Validate an employee-sales row. Returns a list of issues; empty list means CLEAN.
     */
    List<V3StagedRecord.FieldIssue> validateEmpRow(ParsedRow row, Map<String, BranchStats> stats) {
        List<V3StagedRecord.FieldIssue> issues = new ArrayList<>();

        if (row.branchCode == null || !row.branchCode.matches("\\d{4}")) {
            issues.add(issue("branchCode", "invalid", null, 0.0, null));
        }

        if (row.date == null) {
            issues.add(issue("date", "missing", null, 0.0, null));
        }

        if (row.totalSar == 0) {
            issues.add(issue("sarAmount", "zero_value", null, 0.0, null));
        }

        if (Math.abs(row.rawPieces) > PIECE_CAP) {
            BranchStats bs = row.branchCode != null ? stats.get(row.branchCode) : null;
            double medianRatio = bs != null ? bs.medianSarPerPiece : 0;
            String suggested = null;
            double confidence = 0;
            if (medianRatio > 0 && Math.abs(row.totalSar) > 0) {
                long imp = Math.round(Math.abs(row.totalSar) / medianRatio);
                imp = Math.max(1, Math.min(imp, PIECE_CAP));
                suggested = String.valueOf(imp);
                confidence = (bs != null && bs.cleanRowCount > 10) ? 0.85 : 0.5;
            }
            issues.add(issue("pieces", "corrupt_value", suggested, confidence,
                suggested != null ? "branch_median_sar_per_piece" : null));
        }

        if (row.empId == null || row.empId.isBlank() || !row.empId.matches("\\d+")) {
            issues.add(issue("empId", "invalid", null, 0.0, "needs_manual"));
        }

        return issues;
    }

    /**
     * Validate a purchase row. Returns a list of issues; empty list means CLEAN.
     */
    List<V3StagedRecord.FieldIssue> validatePurchaseRow(ParsedRow row) {
        List<V3StagedRecord.FieldIssue> issues = new ArrayList<>();

        if (row.branchCode == null || !row.branchCode.matches("\\d{4}")) {
            issues.add(issue("branchCode", "invalid", null, 0.0, null));
        }

        if (row.date == null) {
            issues.add(issue("date", "missing", null, 0.0, null));
        }

        if (row.totalSar == 0) {
            issues.add(issue("sarAmount", "zero_value", null, 0.0, null));
        }

        return issues;
    }

    /**
     * Validate a mothan row. Returns a list of issues; empty list means CLEAN.
     */
    List<V3StagedRecord.FieldIssue> validateMothanRow(ParsedRow row) {
        List<V3StagedRecord.FieldIssue> issues = new ArrayList<>();

        if (row.branchCode == null || !row.branchCode.matches("\\d{4}")) {
            issues.add(issue("branchCode", "invalid", null, 0.0, null));
        }

        if (row.date == null) {
            issues.add(issue("date", "missing", null, 0.0, null));
        }

        if (row.creditSar == 0) {
            issues.add(issue("sarAmount", "zero_value", null, 0.0, null));
        }

        if (row.rawDate != null && row.rawDate.contains("\n")) {
            String firstLine = row.rawDate.split("\n")[0].trim();
            issues.add(issue("transactionDate", "multiline", firstLine, 0.9, "first_line_extraction"));
        }

        return issues;
    }

    /** Build a FieldIssue value object. */
    private V3StagedRecord.FieldIssue issue(String field, String type,
                                             String suggestedValue, double confidence, String method) {
        V3StagedRecord.FieldIssue fi = new V3StagedRecord.FieldIssue();
        fi.setField(field);
        fi.setType(type);
        fi.setSuggestedValue(suggestedValue);
        fi.setConfidence(confidence);
        fi.setMethod(method);
        return fi;
    }

    // ─── buildBranchStats ────────────────────────────────────────────────────

    /**
     * Compute per-branch median SAR-per-piece from rows that are clean enough to be
     * representative: rawPieces <= 500, abs(totalSar) > 0, abs(rawPieces) > 0.
     * For mothan rows the totalSar field is zero; those are excluded naturally.
     */
    Map<String, BranchStats> buildBranchStats(List<ParsedRow> rows) {
        Map<String, List<Double>> ratiosByBranch = new HashMap<>();
        Map<String, Integer> countsByBranch = new HashMap<>();

        for (ParsedRow row : rows) {
            if (row.branchCode == null) continue;
            double absSar    = Math.abs(row.totalSar);
            double absPieces = Math.abs(row.rawPieces);
            if (absPieces <= 0 || absPieces > PIECE_CAP || absSar <= 0) continue;
            ratiosByBranch.computeIfAbsent(row.branchCode, k -> new ArrayList<>())
                          .add(absSar / absPieces);
            countsByBranch.merge(row.branchCode, 1, Integer::sum);
        }

        Map<String, BranchStats> result = new HashMap<>();
        for (Map.Entry<String, List<Double>> entry : ratiosByBranch.entrySet()) {
            BranchStats bs = new BranchStats();
            bs.medianSarPerPiece = computeMedian(entry.getValue());
            bs.cleanRowCount     = countsByBranch.getOrDefault(entry.getKey(), 0);
            result.put(entry.getKey(), bs);
        }
        return result;
    }

    private double computeMedian(List<Double> vals) {
        if (vals.isEmpty()) return 0;
        List<Double> sorted = new ArrayList<>(vals);
        Collections.sort(sorted);
        int mid = sorted.size() / 2;
        return sorted.size() % 2 == 1
            ? sorted.get(mid)
            : (sorted.get(mid - 1) + sorted.get(mid)) / 2.0;
    }

    // ─── Transform methods ────────────────────────────────────────────────────

    /** Convert a clean sales ParsedRow to a V3SaleTransaction with sign convention applied. */
    private V3SaleTransaction toSaleTransaction(ParsedRow row, String tenantId, String src) {
        double sar  = -row.totalSar;
        double sign = sar >= 0 ? 1.0 : -1.0;

        V3SaleTransaction t = new V3SaleTransaction();
        t.setTenantId(tenantId);
        t.setSourceFile(src);
        t.setSaleDate(row.date);
        t.setBranchCode(row.branchCode);
        t.setSarAmount(sar);
        t.setPureWeightG(sign * Math.abs(row.pureWeight));
        t.setGrossWeightG(sign * Math.abs(row.grossWeight));
        t.setPieces((int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        t.setPurity(Math.abs(row.purity));
        t.setKarat(mapKarat(Math.abs(row.purity)));
        t.setMetalValue(sign * Math.abs(row.metalValue));
        t.setMakingCharge(sign * Math.abs(row.makingCharge));
        t.setReturn(sar < 0);
        return t;
    }

    /** Convert a clean employee-sales ParsedRow to a V3EmployeeSaleTransaction. */
    private V3EmployeeSaleTransaction toEmpSaleTransaction(ParsedRow row, String tenantId, String src) {
        double sar  = -row.totalSar;
        double sign = sar >= 0 ? 1.0 : -1.0;

        V3EmployeeSaleTransaction t = new V3EmployeeSaleTransaction();
        t.setTenantId(tenantId);
        t.setSourceFile(src);
        t.setSaleDate(row.date);
        t.setBranchCode(row.branchCode);
        t.setEmpId(row.empId != null && !row.empId.isBlank() ? row.empId : "BR_" + row.branchCode);
        t.setEmpName(row.empName != null && !row.empName.isBlank()
            ? row.empName : (row.empId != null ? row.empId : "BR_" + row.branchCode));
        t.setSarAmount(sar);
        t.setPureWeightG(sign * Math.abs(row.pureWeight));
        t.setGrossWeightG(sign * Math.abs(row.grossWeight));
        t.setPieces((int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        t.setPurity(Math.abs(row.purity));
        t.setKarat(mapKarat(Math.abs(row.purity)));
        t.setMetalValue(sign * Math.abs(row.metalValue));
        t.setMakingCharge(sign * Math.abs(row.makingCharge));
        t.setReturn(sar < 0);
        return t;
    }

    /** Convert a clean purchases ParsedRow to a V3PurchaseTransaction (always positive). */
    private V3PurchaseTransaction toPurchaseTransaction(ParsedRow row, String tenantId, String src) {
        V3PurchaseTransaction t = new V3PurchaseTransaction();
        t.setTenantId(tenantId);
        t.setSourceFile(src);
        t.setPurchaseDate(row.date);
        t.setBranchCode(row.branchCode);
        t.setSarAmount(Math.abs(row.totalSar));
        t.setPureWeightG(Math.abs(row.pureWeight));
        t.setGrossWeightG(Math.abs(row.grossWeight));
        t.setPieces((int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        t.setPurity(Math.abs(row.purity));
        t.setKarat(mapKarat(Math.abs(row.purity)));
        return t;
    }

    /** Convert a clean mothan ParsedRow to a V3MothanTransaction. */
    private V3MothanTransaction toMothanTransaction(ParsedRow row, String tenantId, String src) {
        V3MothanTransaction t = new V3MothanTransaction();
        t.setTenantId(tenantId);
        t.setSourceFile(src);
        t.setTransactionDate(row.date);
        t.setBranchCode(row.branchCode);
        t.setDocReference(row.docRef);
        t.setDescription(row.description);
        t.setAmountSar(row.creditSar);
        t.setWeightDebitG(row.debitGold);
        t.setWeightCreditG(row.weightCredit);
        t.setBalanceGoldG(row.balanceGold);
        t.setBalanceSar(row.balanceSar);
        return t;
    }

    // ─── parsedRecord map builders ────────────────────────────────────────────

    private Map<String, Object> buildSalesParsedMap(ParsedRow row, String tenantId, String src) {
        double sar  = -row.totalSar;
        double sign = Math.signum(sar);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tenantId",     tenantId);
        map.put("sourceFile",   src);
        map.put("saleDate",     row.date);
        map.put("branchCode",   row.branchCode);
        map.put("sarAmount",    sar);
        map.put("pureWeightG",  sign * Math.abs(row.pureWeight));
        map.put("grossWeightG", sign * Math.abs(row.grossWeight));
        map.put("pieces",       (int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        map.put("purity",       Math.abs(row.purity));
        map.put("karat",        mapKarat(Math.abs(row.purity)));
        map.put("metalValue",   sign * Math.abs(row.metalValue));
        map.put("makingCharge", sign * Math.abs(row.makingCharge));
        map.put("isReturn",     sar < 0);
        return map;
    }

    private Map<String, Object> buildEmpParsedMap(ParsedRow row, String tenantId, String src) {
        double sar  = -row.totalSar;
        double sign = Math.signum(sar);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tenantId",     tenantId);
        map.put("sourceFile",   src);
        map.put("saleDate",     row.date);
        map.put("branchCode",   row.branchCode);
        map.put("empId",        row.empId);
        map.put("empName",      row.empName);
        map.put("sarAmount",    sar);
        map.put("pureWeightG",  sign * Math.abs(row.pureWeight));
        map.put("grossWeightG", sign * Math.abs(row.grossWeight));
        map.put("pieces",       (int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        map.put("purity",       Math.abs(row.purity));
        map.put("karat",        mapKarat(Math.abs(row.purity)));
        map.put("metalValue",   sign * Math.abs(row.metalValue));
        map.put("makingCharge", sign * Math.abs(row.makingCharge));
        map.put("isReturn",     sar < 0);
        return map;
    }

    private Map<String, Object> buildPurchaseParsedMap(ParsedRow row, String tenantId, String src) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tenantId",     tenantId);
        map.put("sourceFile",   src);
        map.put("purchaseDate", row.date);
        map.put("branchCode",   row.branchCode);
        map.put("sarAmount",    Math.abs(row.totalSar));
        map.put("pureWeightG",  Math.abs(row.pureWeight));
        map.put("grossWeightG", Math.abs(row.grossWeight));
        map.put("pieces",       (int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        map.put("purity",       Math.abs(row.purity));
        map.put("karat",        mapKarat(Math.abs(row.purity)));
        return map;
    }

    private Map<String, Object> buildMothanParsedMap(ParsedRow row, String tenantId, String src) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tenantId",         tenantId);
        map.put("sourceFile",       src);
        map.put("transactionDate",  row.date);
        map.put("branchCode",       row.branchCode);
        map.put("amountSar",        row.creditSar);
        map.put("weightDebitG",     row.debitGold);
        map.put("weightCreditG",    row.weightCredit);
        map.put("balanceGoldG",     row.balanceGold);
        map.put("balanceSar",       row.balanceSar);
        map.put("docReference",     row.docRef);
        map.put("description",      row.description);
        return map;
    }

    // ─── buildStagedRecord ────────────────────────────────────────────────────

    private V3StagedRecord buildStagedRecord(
            ParsedRow row,
            String fileType,
            List<V3StagedRecord.FieldIssue> issues,
            BranchStats stats,
            Map<String, Object> parsedMap,
            String tenantId,
            String importId,
            List<Map<String, Object>> availableEmployees) {

        Map<String, Object> branchStatsMap = null;
        if (stats != null) {
            branchStatsMap = new LinkedHashMap<>();
            branchStatsMap.put("medianSarPerPiece", round4(stats.medianSarPerPiece));
            branchStatsMap.put("cleanRowCount",     stats.cleanRowCount);
        }

        V3StagedRecord sr = new V3StagedRecord();
        sr.setTenantId(tenantId);
        sr.setImportId(importId);
        sr.setFileType(fileType);
        sr.setSourceRow(row.excelRow);
        sr.setBranchCode(row.branchCode);
        sr.setStatus("pending");
        sr.setParsedRecord(parsedMap);
        sr.setIssues(issues);
        sr.setBranchStats(branchStatsMap);
        sr.setAvailableEmployees(availableEmployees);
        sr.setCreatedAt(LocalDateTime.now());
        return sr;
    }

    // ─── Employees-by-branch helper ───────────────────────────────────────────

    private Map<String, List<Map<String, Object>>> buildEmployeesByBranch(String tenantId) {
        List<V3Employee> employees = empRepo.findByTenantId(tenantId);
        Map<String, List<Map<String, Object>>> result = new HashMap<>();
        for (V3Employee emp : employees) {
            String branch = emp.getCurrentBranchCode();
            if (branch == null) continue;
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("empId",   emp.getEmpId());
            e.put("empName", emp.getEmpName());
            result.computeIfAbsent(branch, k -> new ArrayList<>()).add(e);
        }
        return result;
    }

    // ─── Post-import: compute purchase rates ──────────────────────────────────

    public void recomputePurchaseRates(String tenantId) {
        Aggregation purchAgg = Aggregation.newAggregation(
            Aggregation.match(Criteria.where("tenantId").is(tenantId)),
            Aggregation.group("branchCode")
                .sum("sarAmount").as("totalSar")
                .sum("pureWeightG").as("totalWt")
        );
        List<Document> purchByBranch = mongo.aggregate(
            purchAgg, "v3_purchase_transactions", Document.class).getMappedResults();

        Aggregation mothanAgg = Aggregation.newAggregation(
            Aggregation.match(Criteria.where("tenantId").is(tenantId)
                .and("weightDebitG").gt(0)),
            Aggregation.group("branchCode")
                .sum("amountSar").as("totalSar")
                .sum("weightDebitG").as("totalWt")
        );
        List<Document> mothanByBranch = mongo.aggregate(
            mothanAgg, "v3_mothan_transactions", Document.class).getMappedResults();

        Map<String, double[]> purch     = new LinkedHashMap<>();
        Map<String, double[]> mothanMap = new LinkedHashMap<>();

        for (Document d : purchByBranch) {
            String code = d.getString("_id");
            if (code == null) continue;
            purch.put(code, new double[]{ toDouble(d, "totalSar"), toDouble(d, "totalWt") });
        }
        for (Document d : mothanByBranch) {
            String code = d.getString("_id");
            if (code == null) continue;
            mothanMap.put(code, new double[]{ toDouble(d, "totalSar"), toDouble(d, "totalWt") });
        }

        Set<String> allBranches = new LinkedHashSet<>();
        allBranches.addAll(purch.keySet());
        allBranches.addAll(mothanMap.keySet());

        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3BranchPurchaseRate.class);

        List<V3BranchPurchaseRate> rates = new ArrayList<>();
        for (String code : allBranches) {
            double[] p = purch.getOrDefault(code, new double[2]);
            double[] m = mothanMap.getOrDefault(code, new double[2]);
            double combSar = p[0] + m[0];
            double combWt  = p[1] + m[1];
            V3BranchPurchaseRate r = new V3BranchPurchaseRate();
            r.setTenantId(tenantId);
            r.setBranchCode(code);
            r.setTotalPurchSar(p[0]);       r.setTotalPurchWeightG(p[1]);
            r.setTotalMothanSar(m[0]);      r.setTotalMothanWeightG(m[1]);
            r.setCombinedSar(combSar);      r.setCombinedWeightG(combWt);
            r.setPurchaseRate(combWt > 0 ? round4(combSar / combWt) : 0);
            r.setComputedAt(LocalDateTime.now());
            rates.add(r);
        }
        if (!rates.isEmpty()) bulkInsertSafe(rates, V3BranchPurchaseRate.class, null);
        log.info("V3 purchase rates recomputed for {} branches (agg: {} purch, {} mothan)",
            rates.size(), purchByBranch.size(), mothanByBranch.size());
    }

    // ─── Dimension upserts ────────────────────────────────────────────────────

    private void upsertBranches(List<String> codes, String tenantId) {
        for (String code : codes) {
            Query q = Query.query(Criteria.where("tenantId").is(tenantId).and("branchCode").is(code));
            if (mongo.exists(q, V3Branch.class)) continue;
            V3Branch b = new V3Branch();
            b.setTenantId(tenantId);
            b.setBranchCode(code);
            b.setBranchName(BranchMaps.getName(code));
            b.setRegionId(regionIdFromName(BranchMaps.getRegion(code)));
            mongo.insert(b);
        }
    }

    private void upsertEmployees(List<V3EmployeeSaleTransaction> txns, String tenantId) {
        Map<String, V3EmployeeSaleTransaction> latest = new LinkedHashMap<>();
        for (V3EmployeeSaleTransaction t : txns) {
            latest.merge(t.getEmpId(), t, (a, b) ->
                b.getSaleDate() != null && a.getSaleDate() != null && b.getSaleDate().isAfter(a.getSaleDate())
                    ? b : a);
        }
        for (Map.Entry<String, V3EmployeeSaleTransaction> e : latest.entrySet()) {
            V3EmployeeSaleTransaction t = e.getValue();
            Query q = Query.query(Criteria.where("tenantId").is(tenantId).and("empId").is(e.getKey()));
            mongo.remove(q, V3Employee.class);
            V3Employee emp = new V3Employee();
            emp.setTenantId(tenantId);
            emp.setEmpId(t.getEmpId());
            emp.setEmpName(t.getEmpName());
            emp.setCurrentBranchCode(t.getBranchCode());
            mongo.insert(emp);
        }
        upsertBranches(txns.stream().map(V3EmployeeSaleTransaction::getBranchCode).distinct().toList(), tenantId);
    }

    private static int regionIdFromName(String region) {
        return switch (region) {
            case "الرياض"          -> 1;
            case "الغربية"         -> 2;
            case "المدينة المنورة" -> 3;
            case "حائل"            -> 4;
            case "حفر الباطن"      -> 5;
            case "عسير/جيزان"      -> 6;
            default                -> 0;
        };
    }

    // ─── Row classification helpers ───────────────────────────────────────────

    private boolean isDataRowA(Row row) {
        Cell c = row.getCell(15);
        return c != null && c.getCellType() == CellType.NUMERIC && c.getNumericCellValue() >= 1;
    }

    private boolean isDataRowB(Row row) {
        if (row == null) return false;
        Cell c = row.getCell(0);
        return c != null && c.getCellType() == CellType.NUMERIC && c.getNumericCellValue() >= 1;
    }

    // ─── Cell value extractors ────────────────────────────────────────────────

    private double getNumRaw(Row row, int col) {
        Cell c = row.getCell(col);
        if (c == null) return 0;
        if (c.getCellType() == CellType.NUMERIC) return c.getNumericCellValue();
        if (c.getCellType() == CellType.FORMULA) {
            try { return c.getNumericCellValue(); } catch (Exception e) { return 0; }
        }
        if (c.getCellType() == CellType.STRING) {
            try { return Double.parseDouble(c.getStringCellValue().replace(",", "").trim()); }
            catch (Exception ignored) {}
        }
        return 0;
    }

    private String getStr(Row row, int col) {
        Cell c = row.getCell(col);
        if (c == null) return "";
        CellType type = c.getCellType() == CellType.FORMULA
            ? c.getCachedFormulaResultType()
            : c.getCellType();
        if (type == CellType.STRING) return c.getStringCellValue().trim();
        if (type == CellType.NUMERIC) {
            double v = c.getNumericCellValue();
            if (v == Math.floor(v)) return String.valueOf((long) v);
            return String.valueOf(v);
        }
        return "";
    }

    // ─── Date parsing ─────────────────────────────────────────────────────────

    private LocalDate parseSerialDate(double serial) {
        if (serial <= 0) return LocalDate.now();
        try {
            long days = (long) serial - 25569;
            return java.time.Instant.ofEpochSecond(days * 86400L)
                .atZone(java.time.ZoneOffset.UTC).toLocalDate();
        } catch (Exception e) {
            return LocalDate.now();
        }
    }

    private LocalDate extractDateFromRow(Row row, LocalDate fallback) {
        for (Cell cell : row) {
            if (cell == null) continue;
            if (cell.getCellType() == CellType.STRING) {
                String s = cell.getStringCellValue().trim();
                try { return LocalDate.parse(s, DD_MM_YYYY); } catch (Exception ignored) {}
                try { return LocalDate.parse(s); }            catch (Exception ignored) {}
            }
        }
        return null;
    }

    /** Scan the first 15 rows for an embedded date to use as the carry-forward starting value. */
    private LocalDate extractDateFromHeader(Sheet sheet) {
        int maxRows = Math.min(15, sheet.getLastRowNum() + 1);
        for (int i = 0; i < maxRows; i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            for (Cell cell : row) {
                if (cell == null) continue;
                if (cell.getCellType() == CellType.STRING) {
                    String s = cell.getStringCellValue().trim();
                    try { return LocalDate.parse(s, DD_MM_YYYY); } catch (Exception ignored) {}
                    try { return LocalDate.parse(s); }            catch (Exception ignored) {}
                    java.util.regex.Matcher m = DATE_HEADER_A.matcher(s);
                    if (m.find()) {
                        try {
                            if (m.group(1) != null)
                                return LocalDate.of(
                                    Integer.parseInt(m.group(3)),
                                    Integer.parseInt(m.group(2)),
                                    Integer.parseInt(m.group(1)));
                            if (m.group(4) != null)
                                return LocalDate.of(
                                    Integer.parseInt(m.group(4)),
                                    Integer.parseInt(m.group(5)),
                                    Integer.parseInt(m.group(6)));
                        } catch (Exception ignored) {}
                    }
                }
                if (cell.getCellType() == CellType.NUMERIC) {
                    double v = cell.getNumericCellValue();
                    if (v > 30000 && v < 70000) {
                        try {
                            LocalDate d = parseSerialDate(v);
                            if (d != null && d.getYear() > 2000) return d;
                        } catch (Exception ignored) {}
                    }
                }
            }
        }
        return null;
    }

    private LocalDate parseMothanDate(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return null;

        CellType type = cell.getCellType() == CellType.FORMULA
            ? cell.getCachedFormulaResultType()
            : cell.getCellType();

        if (type == CellType.NUMERIC) {
            double v = cell.getNumericCellValue();
            if (v > 30000 && v < 70000) return parseSerialDate(v);
        }
        if (type == CellType.STRING) {
            String s = cell.getStringCellValue().trim();
            if (s.contains("\n")) s = s.split("\n")[0].trim();
            for (java.time.format.DateTimeFormatter fmt : MOTHAN_DATE_FMTS) {
                try { return LocalDate.parse(s, fmt); } catch (Exception ignored) {}
            }
        }
        return null;
    }

    // ─── Verification ─────────────────────────────────────────────────────────

    private void verifyImport(String tenantId, String dateField, String sarField,
                               String collectionName, LocalDate minDate, LocalDate maxDate,
                               long parsedCount, double parsedSar) {
        try {
            Query q = Query.query(Criteria.where("tenantId").is(tenantId)
                .and(dateField).gte(minDate).lte(maxDate));
            long dbCount = mongo.count(q, collectionName);
            Aggregation agg = Aggregation.newAggregation(
                Aggregation.match(Criteria.where("tenantId").is(tenantId)
                    .and(dateField).gte(minDate).lte(maxDate)),
                Aggregation.group().sum(sarField).as("total")
            );
            List<Document> r = mongo.aggregate(agg, collectionName, Document.class).getMappedResults();
            double dbSar  = r.isEmpty() ? 0 : toDouble(r.get(0), "total");
            double sarPct = parsedSar > 0 ? Math.abs(dbSar - parsedSar) / parsedSar * 100 : 0;
            if (dbCount != parsedCount || sarPct > 0.1) {
                log.warn("VERIFY [{}] MISMATCH: parsed={} db={} | parsedSar={} dbSar={} ({}%)",
                    collectionName, parsedCount, dbCount,
                    Math.round(parsedSar), Math.round(dbSar),
                    Math.round(sarPct * 10) / 10.0);
            } else {
                log.info("VERIFY [{}] OK: {} records, SAR={}", collectionName, dbCount, Math.round(dbSar));
            }
        } catch (Exception e) {
            log.warn("VERIFY [{}] failed: {}", collectionName, e.getMessage());
        }
    }

    // ─── Utility methods ──────────────────────────────────────────────────────

    private static String mapKarat(double purity) {
        if (purity >= 0.74 && purity <= 0.76) return "18";
        if (purity >= 0.86 && purity <= 0.89) return "21";
        if (purity >= 0.90 && purity <= 0.93) return "22";
        if (purity >= 0.99 && purity <= 1.01) return "24";
        return null;
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }

    private <T> int bulkInsertSafe(List<T> items, Class<T> clazz, String importId) {
        int saved  = 0;
        int batchSz = 200;
        int total  = items.size();
        for (int i = 0; i < total; i += batchSz) {
            List<T> batch = items.subList(i, Math.min(i + batchSz, total));
            try {
                mongo.insertAll(batch);
                saved += batch.size();
            } catch (Exception batchEx) {
                log.warn("Batch {}-{} failed ({}), falling back to individual inserts",
                    i, i + batch.size(), batchEx.getMessage());
                for (T item : batch) {
                    try { mongo.insert(item); saved++; }
                    catch (Exception e) { log.error("Individual insert failed: {}", e.getMessage()); }
                }
            }
            if (importId != null && !importId.isEmpty()) {
                statusSvc.update(importId, "saving", total, saved, total);
            }
            if (i > 0 && i % 2000 == 0) {
                log.info("  progress: {}/{} saved", saved, total);
            }
        }
        return saved;
    }

    private static double toDouble(Document doc, String key) {
        Object v = doc.get(key);
        if (v instanceof Number n) return n.doubleValue();
        return 0.0;
    }

    // ─── Data wipe ────────────────────────────────────────────────────────────

    public void wipeV3Data(String tenantId) {
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3SaleTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3EmployeeSaleTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3PurchaseTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3MothanTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3BranchPurchaseRate.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3Branch.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3Employee.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), "v3_staged_records");
        log.info("Wiped all V3 data (including staged records) for tenant {}", tenantId);
    }
}
