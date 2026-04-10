package com.mizan.service;

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

@Slf4j
@Service
public class V3UnifiedImportService {

    private final MongoTemplate mongo;
    private final V3BranchPurchaseRateRepository rateRepo;
    private final V3BranchRepository branchRepo;
    private final V3EmployeeRepository empRepo;
    private final V3RegionRepository regionRepo;
    private final V3CacheService cache;
    private final V3ImportProgressService progress;
    private final V3StagedRecordRepository stagedRepo;
    private final BranchLookupService branchLookup;

    private static final DateTimeFormatter DD_MM_YYYY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final int PIECE_CAP = 500;

    // ─── Inner types ──────────────────────────────────────────────────────────

    static class ParsedRow {
        int excelRow;
        String rawBranchCode;
        String branchCode;
        LocalDate date;
        String rawDate;
        double totalSar;
        double pureWeight;
        double grossWeight;
        double metalValue;
        double makingCharge;
        double rawPieces;
        double purity;
        String empId;
        String empName;
        double creditSar;
        double debitGold;
        double weightCredit;
        double balanceGold;
        double balanceSar;
        String docRef;
        String description;
    }

    static class BranchStats {
        double medianSarPerPiece;
        int cleanRowCount;
    }

    private enum Format { A, B }

    // ─── Patterns ─────────────────────────────────────────────────────────────

    private static final java.util.regex.Pattern BRANCH_HEADER_A =
        java.util.regex.Pattern.compile("^(\\d{3,6})\\s*[-–—/: ]\\s*(.+)");
    private static final java.util.regex.Pattern BRANCH_HEADER_PLAIN =
        java.util.regex.Pattern.compile("^(\\d{4})\\s+(.+)");
    private static final java.util.regex.Pattern DATE_HEADER_A =
        java.util.regex.Pattern.compile("(\\d{1,2})/(\\d{1,2})/(\\d{4})|(\\d{4})-(\\d{2})-(\\d{2})");

    private static final DateTimeFormatter[] MOTHAN_DATE_FMTS = {
        DD_MM_YYYY,
        DateTimeFormatter.ofPattern("d/M/yyyy"),
        DateTimeFormatter.ofPattern("dd-MM-yyyy"),
        DateTimeFormatter.ofPattern("d-M-yyyy"),
        DateTimeFormatter.ofPattern("yyyy/MM/dd"),
        DateTimeFormatter.ofPattern("yyyy-MM-dd"),
        DateTimeFormatter.ofPattern("MM/dd/yyyy"),
    };

    // ─── Constructor ──────────────────────────────────────────────────────────

    public V3UnifiedImportService(MongoTemplate mongo,
                                   V3BranchPurchaseRateRepository rateRepo,
                                   V3BranchRepository branchRepo,
                                   V3EmployeeRepository empRepo,
                                   V3RegionRepository regionRepo,
                                   V3CacheService cache,
                                   V3ImportProgressService progress,
                                   V3StagedRecordRepository stagedRepo,
                                   BranchLookupService branchLookup) {
        this.mongo = mongo;
        this.rateRepo = rateRepo;
        this.branchRepo = branchRepo;
        this.empRepo = empRepo;
        this.regionRepo = regionRepo;
        this.cache = cache;
        this.progress = progress;
        this.stagedRepo = stagedRepo;
        this.branchLookup = branchLookup;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED IMPORT PIPELINE
    // ═══════════════════════════════════════════════════════════════════════════

    public void runUnifiedImport(String importId, String tenantId, String userId,
                                  Map<String, byte[]> files, Map<String, String> fileNames) {
        try {
            long t0 = System.currentTimeMillis();

            // ════════════════════════════════════════════
            // STEP 1: PARSE ALL FILES (no DB writes)
            // ════════════════════════════════════════════
            progress.updateStep(importId, 1, "تحليل الملفات...", 10);

            List<ParsedRow> salesRows = new ArrayList<>();
            List<ParsedRow> empSalesRows = new ArrayList<>();
            List<ParsedRow> purchaseRows = new ArrayList<>();
            List<ParsedRow> mothanRows = new ArrayList<>();

            if (files.containsKey("branchSales")) {
                salesRows = parseFile(files.get("branchSales"), "sales");
                progress.updateParseResult(importId, "branch-sales", salesRows.size(),
                    fileNames.getOrDefault("branchSales", "branch-sales.xls"));
            }
            if (files.containsKey("employeeSales")) {
                empSalesRows = parseFile(files.get("employeeSales"), "employee-sales");
                progress.updateParseResult(importId, "employee-sales", empSalesRows.size(),
                    fileNames.getOrDefault("employeeSales", "employee-sales.xls"));
            }
            if (files.containsKey("purchases")) {
                purchaseRows = parseFile(files.get("purchases"), "purchases");
                progress.updateParseResult(importId, "purchases", purchaseRows.size(),
                    fileNames.getOrDefault("purchases", "purchases.xls"));
            }
            if (files.containsKey("mothan")) {
                mothanRows = parseFile(files.get("mothan"), "mothan");
                progress.updateParseResult(importId, "mothan", mothanRows.size(),
                    fileNames.getOrDefault("mothan", "mothan.xls"));
            }

            int totalParsed = salesRows.size() + empSalesRows.size() + purchaseRows.size() + mothanRows.size();
            if (totalParsed == 0) {
                progress.error(importId, "لم يتم العثور على بيانات في الملفات المرفوعة");
                return;
            }
            log.info("STEP 1 DONE: {} total parsed (sales={}, emp={}, purch={}, mothan={})",
                totalParsed, salesRows.size(), empSalesRows.size(), purchaseRows.size(), mothanRows.size());

            // ════════════════════════════════════════════
            // STEP 2: SEED REGIONS (one-time, idempotent)
            // ════════════════════════════════════════════
            progress.updateStep(importId, 2, "تهيئة المناطق...", 20);
            seedRegionsIfEmpty(tenantId);

            // ════════════════════════════════════════════
            // STEP 3: DISCOVER BRANCHES
            // ════════════════════════════════════════════
            progress.updateStep(importId, 3, "اكتشاف الفروع...", 30);
            Set<String> allBranchCodes = new LinkedHashSet<>();
            for (ParsedRow r : salesRows) if (r.branchCode != null) allBranchCodes.add(r.branchCode);
            for (ParsedRow r : empSalesRows) if (r.branchCode != null) allBranchCodes.add(r.branchCode);
            for (ParsedRow r : purchaseRows) if (r.branchCode != null) allBranchCodes.add(r.branchCode);
            for (ParsedRow r : mothanRows) if (r.branchCode != null) allBranchCodes.add(r.branchCode);

            int knownBranches = 0, newBranches = 0;
            for (String code : allBranchCodes) {
                Optional<V3Branch> existing = branchRepo.findByTenantIdAndBranchCode(tenantId, code);
                if (existing.isPresent()) {
                    knownBranches++;
                } else {
                    V3Branch b = new V3Branch();
                    b.setTenantId(tenantId);
                    b.setBranchCode(code);
                    b.setBranchName(code); // placeholder
                    int regionId = BranchLookupService.guessRegionId(code);
                    b.setRegionId(regionId);
                    b.setRegionName(BranchLookupService.guessRegionName(regionId));
                    b.setStatus("pending_name");
                    b.setAutoDiscovered(true);
                    b.setCreatedAt(LocalDateTime.now());
                    mongo.insert(b);
                    newBranches++;
                }
            }
            branchLookup.invalidateCache(tenantId);
            log.info("STEP 3 DONE: {} known branches, {} new branches", knownBranches, newBranches);

            // ════════════════════════════════════════════
            // STEP 4: DISCOVER EMPLOYEES
            // ════════════════════════════════════════════
            progress.updateStep(importId, 4, "اكتشاف الموظفين...", 35);
            int knownEmps = 0, newEmps = 0;
            Map<String, ParsedRow> latestEmpRows = new LinkedHashMap<>();
            for (ParsedRow r : empSalesRows) {
                if (r.empId != null && !r.empId.isBlank()) {
                    latestEmpRows.merge(r.empId, r, (a, b) ->
                        b.date != null && a.date != null && b.date.isAfter(a.date) ? b : a);
                }
            }
            for (Map.Entry<String, ParsedRow> e : latestEmpRows.entrySet()) {
                ParsedRow r = e.getValue();
                Optional<V3Employee> existing = empRepo.findByTenantIdAndEmpId(tenantId, e.getKey());
                if (existing.isPresent()) {
                    V3Employee emp = existing.get();
                    emp.setCurrentBranchCode(r.branchCode);
                    if (r.empName != null && !r.empName.isBlank()) emp.setEmpName(r.empName);
                    mongo.save(emp);
                    knownEmps++;
                } else {
                    V3Employee emp = new V3Employee();
                    emp.setTenantId(tenantId);
                    emp.setEmpId(e.getKey());
                    emp.setEmpName(r.empName != null ? r.empName : e.getKey());
                    emp.setCurrentBranchCode(r.branchCode);
                    mongo.insert(emp);
                    newEmps++;
                }
            }
            progress.updateDiscovery(importId, knownBranches, newBranches, knownEmps, newEmps);
            log.info("STEP 4 DONE: {} known employees, {} new employees", knownEmps, newEmps);

            // ════════════════════════════════════════════
            // STEP 5: VALIDATE + CLASSIFY EVERY ROW
            // ════════════════════════════════════════════
            progress.updateStep(importId, 5, "التحقق من البيانات...", 40);

            Map<String, BranchStats> salesStats = buildBranchStats(salesRows);
            Map<String, BranchStats> empStats = buildBranchStats(empSalesRows);
            Map<String, List<Map<String, Object>>> empsByBranch = buildEmployeesByBranch(tenantId);

            String salesFile = fileNames.getOrDefault("branchSales", "branch-sales.xls");
            String empFile = fileNames.getOrDefault("employeeSales", "employee-sales.xls");
            String purchFile = fileNames.getOrDefault("purchases", "purchases.xls");
            String mothanFile = fileNames.getOrDefault("mothan", "mothan.xls");

            List<V3SaleTransaction> cleanSales = new ArrayList<>();
            List<V3StagedRecord> stagedSales = new ArrayList<>();
            for (ParsedRow row : salesRows) {
                List<V3StagedRecord.FieldIssue> issues = validateSalesRow(row, salesStats, tenantId);
                if (issues.isEmpty()) {
                    cleanSales.add(toSaleTransaction(row, tenantId, salesFile));
                } else {
                    stagedSales.add(buildStagedRecord(row, "branch-sales", issues,
                        salesStats.get(row.branchCode), buildSalesParsedMap(row, tenantId, salesFile),
                        tenantId, importId, null));
                }
            }

            List<V3EmployeeSaleTransaction> cleanEmpSales = new ArrayList<>();
            List<V3StagedRecord> stagedEmpSales = new ArrayList<>();
            for (ParsedRow row : empSalesRows) {
                List<V3StagedRecord.FieldIssue> issues = validateEmpRow(row, empStats, tenantId);
                if (issues.isEmpty()) {
                    cleanEmpSales.add(toEmpSaleTransaction(row, tenantId, empFile));
                } else {
                    List<Map<String, Object>> availEmps = empsByBranch.getOrDefault(
                        row.branchCode != null ? row.branchCode : "", Collections.emptyList());
                    stagedEmpSales.add(buildStagedRecord(row, "employee-sales", issues,
                        empStats.get(row.branchCode), buildEmpParsedMap(row, tenantId, empFile),
                        tenantId, importId, availEmps));
                }
            }

            List<V3PurchaseTransaction> cleanPurch = new ArrayList<>();
            List<V3StagedRecord> stagedPurch = new ArrayList<>();
            for (ParsedRow row : purchaseRows) {
                List<V3StagedRecord.FieldIssue> issues = validatePurchaseRow(row, tenantId);
                if (issues.isEmpty()) {
                    cleanPurch.add(toPurchaseTransaction(row, tenantId, purchFile));
                } else {
                    stagedPurch.add(buildStagedRecord(row, "purchases", issues,
                        null, buildPurchaseParsedMap(row, tenantId, purchFile),
                        tenantId, importId, null));
                }
            }

            List<V3MothanTransaction> cleanMothan = new ArrayList<>();
            List<V3StagedRecord> stagedMothan = new ArrayList<>();
            for (ParsedRow row : mothanRows) {
                List<V3StagedRecord.FieldIssue> issues = validateMothanRow(row, tenantId);
                if (issues.isEmpty()) {
                    cleanMothan.add(toMothanTransaction(row, tenantId, mothanFile));
                } else {
                    stagedMothan.add(buildStagedRecord(row, "mothan", issues,
                        null, buildMothanParsedMap(row, tenantId, mothanFile),
                        tenantId, importId, null));
                }
            }

            int totalClean = cleanSales.size() + cleanEmpSales.size() + cleanPurch.size() + cleanMothan.size();
            int totalStaged = stagedSales.size() + stagedEmpSales.size() + stagedPurch.size() + stagedMothan.size();
            log.info("STEP 5 DONE: {} clean, {} staged", totalClean, totalStaged);

            // ════════════════════════════════════════════
            // STEP 6: SAVE CLEAN RECORDS (BCNF ORDER)
            // ════════════════════════════════════════════
            progress.updateStep(importId, 6, "حفظ البيانات...", 50);
            int totalAutoSaved = 0;

            // 6a. PURCHASES
            if (!cleanPurch.isEmpty()) {
                LocalDate minDate = cleanPurch.stream().map(V3PurchaseTransaction::getPurchaseDate)
                    .filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
                LocalDate maxDate = cleanPurch.stream().map(V3PurchaseTransaction::getPurchaseDate)
                    .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
                if (minDate != null && maxDate != null) {
                    mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                        .and("purchaseDate").gte(minDate).lte(maxDate)), V3PurchaseTransaction.class);
                }
                int saved = bulkInsertSafe(cleanPurch, V3PurchaseTransaction.class, importId, "purchases");
                totalAutoSaved += saved;
                progress.updateSaveProgress(importId, "purchases", saved, cleanPurch.size(), stagedPurch.size());
                log.info("6a. Purchases: {} saved", saved);
            }

            // 6b. MOTHAN
            if (!cleanMothan.isEmpty()) {
                LocalDate minDate = cleanMothan.stream().map(V3MothanTransaction::getTransactionDate)
                    .filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
                LocalDate maxDate = cleanMothan.stream().map(V3MothanTransaction::getTransactionDate)
                    .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
                if (minDate != null && maxDate != null) {
                    mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                        .and("transactionDate").gte(minDate).lte(maxDate)), V3MothanTransaction.class);
                }
                int saved = bulkInsertSafe(cleanMothan, V3MothanTransaction.class, importId, "mothan");
                totalAutoSaved += saved;
                progress.updateSaveProgress(importId, "mothan", saved, cleanMothan.size(), stagedMothan.size());
                log.info("6b. Mothan: {} saved", saved);
            }

            // 6c. COMPUTE PURCHASE RATES
            progress.updateStep(importId, 6, "حساب معدلات الشراء...", 65);
            recomputePurchaseRates(tenantId);
            log.info("6c. Purchase rates recomputed");

            // 6d. BRANCH SALES
            if (!cleanSales.isEmpty()) {
                LocalDate minDate = cleanSales.stream().map(V3SaleTransaction::getSaleDate)
                    .filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
                LocalDate maxDate = cleanSales.stream().map(V3SaleTransaction::getSaleDate)
                    .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
                if (minDate != null && maxDate != null) {
                    mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                        .and("saleDate").gte(minDate).lte(maxDate)), V3SaleTransaction.class);
                }
                int saved = bulkInsertSafe(cleanSales, V3SaleTransaction.class, importId, "branch-sales");
                totalAutoSaved += saved;
                progress.updateSaveProgress(importId, "branch-sales", saved, cleanSales.size(), stagedSales.size());
                log.info("6d. Branch sales: {} saved", saved);
            }

            // 6e. EMPLOYEE SALES (LAST)
            if (!cleanEmpSales.isEmpty()) {
                LocalDate minDate = cleanEmpSales.stream().map(V3EmployeeSaleTransaction::getSaleDate)
                    .filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
                LocalDate maxDate = cleanEmpSales.stream().map(V3EmployeeSaleTransaction::getSaleDate)
                    .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
                if (minDate != null && maxDate != null) {
                    mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                        .and("saleDate").gte(minDate).lte(maxDate)), V3EmployeeSaleTransaction.class);
                }
                int saved = bulkInsertSafe(cleanEmpSales, V3EmployeeSaleTransaction.class, importId, "employee-sales");
                totalAutoSaved += saved;
                progress.updateSaveProgress(importId, "employee-sales", saved, cleanEmpSales.size(), stagedEmpSales.size());
                log.info("6e. Employee sales: {} saved", saved);
            }

            // ════════════════════════════════════════════
            // STEP 7: SAVE STAGED RECORDS
            // ════════════════════════════════════════════
            progress.updateStep(importId, 7, "حفظ السجلات المعلقة...", 90);
            mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                .and("status").is("pending")), "v3_staged_records");
            List<V3StagedRecord> allStaged = new ArrayList<>();
            allStaged.addAll(stagedSales);
            allStaged.addAll(stagedEmpSales);
            allStaged.addAll(stagedPurch);
            allStaged.addAll(stagedMothan);
            if (!allStaged.isEmpty()) {
                mongo.insertAll(allStaged);
            }
            log.info("STEP 7 DONE: {} staged records saved", allStaged.size());

            // ════════════════════════════════════════════
            // STEP 8: COMPUTE CONFIDENCE + FINALIZE
            // ════════════════════════════════════════════
            progress.updateStep(importId, 8, "التحقق النهائي...", 95);

            cache.invalidate(tenantId);
            branchLookup.invalidateCache(tenantId);

            long elapsed = System.currentTimeMillis() - t0;
            log.info("IMPORT COMPLETE: {} auto-saved, {} staged, confidence={}, elapsed={}ms",
                totalAutoSaved, totalStaged,
                totalParsed > 0 ? String.format("%.2f%%", (double) totalAutoSaved / totalParsed * 100) : "N/A",
                elapsed);

            progress.complete(importId, totalAutoSaved, totalStaged, totalParsed);

        } catch (Exception e) {
            log.error("Unified import failed: {}", e.getMessage(), e);
            progress.error(importId, e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SEED REGIONS
    // ═══════════════════════════════════════════════════════════════════════════

    public void seedRegionsIfEmpty(String tenantId) {
        List<V3Region> existing = regionRepo.findByTenantId(tenantId);
        if (!existing.isEmpty()) return;

        String[][] regions = {
            {"1", "الرياض", "#4CAF50"},
            {"2", "الغربية", "#2196F3"},
            {"3", "المدينة المنورة", "#FF9800"},
            {"4", "حائل", "#9C27B0"},
            {"5", "حفر الباطن", "#F44336"},
            {"6", "عسير/جيزان", "#00BCD4"},
        };
        for (String[] r : regions) {
            V3Region region = new V3Region();
            region.setTenantId(tenantId);
            region.setRegionId(Integer.parseInt(r[0]));
            region.setName(r[1]);
            region.setColor(r[2]);
            mongo.insert(region);
        }
        log.info("Seeded 6 regions for tenant {}", tenantId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SEED KNOWN BRANCHES
    // ═══════════════════════════════════════════════════════════════════════════

    public int seedKnownBranches(String tenantId) {
        String[][] branches = {
            {"1404", "البوادي", "2", "الغربية"},
            {"1461", "حائل 1", "4", "حائل"}, {"1462", "حائل 2", "4", "حائل"},
            {"1463", "حائل 3", "4", "حائل"}, {"1464", "حائل 4", "4", "حائل"},
            {"1465", "حائل 5", "4", "حائل"},
            {"1601", "الرياض 1", "1", "الرياض"}, {"1602", "الرياض 2", "1", "الرياض"},
            {"1603", "الرياض 3", "1", "الرياض"}, {"1604", "الرياض 4", "1", "الرياض"},
            {"1605", "الرياض 5", "1", "الرياض"},
            {"1702", "مكة 2", "2", "الغربية"},
            {"3401", "حفر الباطن 1", "5", "حفر الباطن"}, {"3402", "حفر الباطن 2", "5", "حفر الباطن"},
            {"3403", "حفر الباطن 3", "5", "حفر الباطن"}, {"3404", "حفر الباطن 4", "5", "حفر الباطن"},
            {"3407", "حفر الباطن 7", "5", "حفر الباطن"},
            {"3408", "العلا", "3", "المدينة المنورة"},
            {"4405", "المدينة 5", "3", "المدينة المنورة"}, {"4406", "المدينة 6", "3", "المدينة المنورة"},
            {"4408", "المدينة 8", "3", "المدينة المنورة"}, {"4409", "المدينة 9", "3", "المدينة المنورة"},
            {"4420", "العلا", "3", "المدينة المنورة"},
            {"5401", "خميس مشيط 1", "6", "عسير/جيزان"}, {"5402", "خميس مشيط 2", "6", "عسير/جيزان"},
            {"5405", "خميس مشيط 5", "6", "عسير/جيزان"},
            {"7403", "أبو عريش 2", "6", "عسير/جيزان"},
            {"7405", "أبو عريش 3", "6", "عسير/جيزان"},
            {"7410", "صبيا", "6", "عسير/جيزان"},
        };
        int seeded = 0;
        for (String[] br : branches) {
            Optional<V3Branch> existing = branchRepo.findByTenantIdAndBranchCode(tenantId, br[0]);
            if (existing.isPresent()) continue;
            V3Branch b = new V3Branch();
            b.setTenantId(tenantId);
            b.setBranchCode(br[0]);
            b.setBranchName(br[1]);
            b.setRegionId(Integer.parseInt(br[2]));
            b.setRegionName(br[3]);
            b.setStatus("active");
            b.setAutoDiscovered(false);
            b.setCreatedAt(LocalDateTime.now());
            mongo.insert(b);
            seeded++;
        }
        branchLookup.invalidateCache(tenantId);
        log.info("Seeded {} known branches for tenant {}", seeded, tenantId);
        return seeded;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1: PARSE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    List<ParsedRow> parseFile(byte[] bytes, String type) throws Exception {
        try (Workbook wb = new HSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);
            List<ParsedRow> rows = switch (type) {
                case "sales" -> parseAllRowsForSales(sheet);
                case "employee-sales" -> parseAllRowsForEmpSales(sheet);
                case "purchases" -> parseAllRowsForPurchases(sheet);
                case "mothan" -> parseAllRowsForMothan(sheet);
                default -> throw new IllegalArgumentException("Unknown type: " + type);
            };

            // Filter out empty/no-data rows
            int before = rows.size();
            rows.removeIf(r -> isEmptyRow(r, type));
            int removed = before - rows.size();
            if (removed > 0) {
                log.info("parseFile({}): removed {} empty rows, {} remaining", type, removed, rows.size());
            }
            return rows;
        }
    }

    /** A row is "empty" if it has no meaningful data — no amount, no weight, no branch code. */
    private boolean isEmptyRow(ParsedRow r, String type) {
        // No branch code at all
        if (r.branchCode == null && (r.rawBranchCode == null || r.rawBranchCode.isBlank())) {
            // For mothan, also check if there's any monetary value
            if ("mothan".equals(type)) {
                return r.creditSar == 0 && r.debitGold == 0 && r.weightCredit == 0
                    && r.balanceGold == 0 && r.balanceSar == 0;
            }
            // For sales/purchases, no branch + no amounts = empty
            return r.totalSar == 0 && r.grossWeight == 0 && r.pureWeight == 0;
        }

        // Has a branch code but every numeric field is zero
        if ("mothan".equals(type)) {
            return r.creditSar == 0 && r.debitGold == 0 && r.weightCredit == 0
                && r.balanceGold == 0 && r.balanceSar == 0
                && (r.description == null || r.description.isBlank());
        }
        // Sales, employee-sales, purchases: zero SAR + zero weight + zero pieces = empty
        return r.totalSar == 0 && r.grossWeight == 0 && r.pureWeight == 0 && r.rawPieces == 0;
    }

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

    List<ParsedRow> parseAllRowsForSales(Sheet sheet) {
        Format fmt = detectFormat(sheet);
        List<ParsedRow> result = new ArrayList<>();

        if (fmt == Format.B) {
            for (Row row : sheet) {
                if (!isDataRowB(row)) continue;
                String rawBranch = getStr(row, 1);
                ParsedRow pr = new ParsedRow();
                pr.excelRow = row.getRowNum();
                pr.rawBranchCode = rawBranch;
                pr.branchCode = rawBranch.matches("\\d{4}") ? rawBranch : null;
                pr.totalSar = getNumRaw(row, 15);
                pr.date = parseSerialDate(getNumRaw(row, 6));
                pr.pureWeight = getNumRaw(row, 12);
                pr.grossWeight = getNumRaw(row, 8);
                pr.purity = getNumRaw(row, 11);
                pr.rawPieces = getNumRaw(row, 7);
                pr.metalValue = getNumRaw(row, 13);
                pr.makingCharge = getNumRaw(row, 14);
                result.add(pr);
            }
        } else {
            String currentBranch = null;
            LocalDate currentDate = extractDateFromHeader(sheet);
            Set<String> loggedMisses = new LinkedHashSet<>();

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

                ParsedRow pr = new ParsedRow();
                pr.excelRow = row.getRowNum();
                pr.rawBranchCode = currentBranch;
                pr.branchCode = currentBranch != null && currentBranch.matches("\\d{4}") ? currentBranch : null;
                pr.date = currentDate;
                pr.totalSar = getNumRaw(row, 3);
                pr.pureWeight = getNumRaw(row, 6);
                pr.grossWeight = getNumRaw(row, 10);
                pr.purity = getNumRaw(row, 7);
                pr.rawPieces = getNumRaw(row, 11);
                pr.metalValue = getNumRaw(row, 5);
                pr.makingCharge = getNumRaw(row, 4);
                result.add(pr);
            }
            log.info("parseAllRowsForSales(A): {} rows", result.size());
            if (!loggedMisses.isEmpty())
                log.warn("parseAllRowsForSales: col12 misses: {}", loggedMisses);
        }
        return result;
    }

    List<ParsedRow> parseAllRowsForEmpSales(Sheet sheet) {
        Format fmt = detectFormat(sheet);
        List<ParsedRow> result = new ArrayList<>();

        if (fmt == Format.B) {
            for (Row row : sheet) {
                if (!isDataRowB(row)) continue;
                String rawBranch = getStr(row, 1);
                ParsedRow pr = new ParsedRow();
                pr.excelRow = row.getRowNum();
                pr.rawBranchCode = rawBranch;
                pr.branchCode = rawBranch.matches("\\d{4}") ? rawBranch : null;
                pr.totalSar = getNumRaw(row, 15);
                pr.date = parseSerialDate(getNumRaw(row, 6));
                pr.pureWeight = getNumRaw(row, 12);
                pr.grossWeight = getNumRaw(row, 8);
                pr.purity = getNumRaw(row, 11);
                pr.rawPieces = getNumRaw(row, 7);
                pr.metalValue = getNumRaw(row, 13);
                pr.makingCharge = getNumRaw(row, 14);
                String empId = "";
                double c3v = getNumRaw(row, 3);
                if (c3v >= 1 && c3v == Math.floor(c3v)) empId = String.valueOf((long) c3v);
                if (empId.isBlank()) {
                    String c2 = getStr(row, 2);
                    if (c2.matches("\\d+")) empId = c2;
                }
                pr.empId = empId.isBlank() ? "" : empId;
                pr.empName = getStr(row, 5);
                result.add(pr);
            }
        } else {
            String currentBranch = null;
            LocalDate currentDate = extractDateFromHeader(sheet);

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

                ParsedRow pr = new ParsedRow();
                pr.excelRow = row.getRowNum();
                pr.rawBranchCode = currentBranch;
                pr.branchCode = currentBranch != null && currentBranch.matches("\\d{4}") ? currentBranch : null;
                pr.date = currentDate;
                pr.totalSar = getNumRaw(row, 3);
                pr.pureWeight = getNumRaw(row, 6);
                pr.grossWeight = getNumRaw(row, 10);
                pr.purity = getNumRaw(row, 7);
                pr.rawPieces = getNumRaw(row, 11);
                pr.metalValue = getNumRaw(row, 5);
                pr.makingCharge = getNumRaw(row, 4);
                pr.empId = getStr(row, 13).trim();
                pr.empName = col12.trim();
                result.add(pr);
            }
            log.info("parseAllRowsForEmpSales(A): {} rows", result.size());
        }
        return result;
    }

    List<ParsedRow> parseAllRowsForPurchases(Sheet sheet) {
        Format fmt = detectFormat(sheet);
        List<ParsedRow> result = new ArrayList<>();

        if (fmt == Format.B) {
            for (Row row : sheet) {
                if (!isDataRowB(row)) continue;
                String rawBranch = getStr(row, 1);
                ParsedRow pr = new ParsedRow();
                pr.excelRow = row.getRowNum();
                pr.rawBranchCode = rawBranch;
                pr.branchCode = rawBranch.matches("\\d{4}") ? rawBranch : null;
                pr.totalSar = getNumRaw(row, 15);
                pr.date = parseSerialDate(getNumRaw(row, 6));
                pr.pureWeight = getNumRaw(row, 12);
                pr.grossWeight = getNumRaw(row, 8);
                pr.purity = getNumRaw(row, 11);
                pr.rawPieces = getNumRaw(row, 7);
                result.add(pr);
            }
        } else {
            String currentBranch = null;
            LocalDate currentDate = extractDateFromHeader(sheet);

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

                ParsedRow pr = new ParsedRow();
                pr.excelRow = row.getRowNum();
                pr.rawBranchCode = currentBranch;
                pr.branchCode = currentBranch != null && currentBranch.matches("\\d{4}") ? currentBranch : null;
                pr.date = currentDate;
                pr.totalSar = getNumRaw(row, 3);
                pr.pureWeight = getNumRaw(row, 6);
                pr.grossWeight = getNumRaw(row, 10);
                pr.purity = getNumRaw(row, 7);
                pr.rawPieces = getNumRaw(row, 11);
                result.add(pr);
            }
            log.info("parseAllRowsForPurchases(A): {} rows", result.size());
        }
        return result;
    }

    List<ParsedRow> parseAllRowsForMothan(Sheet sheet) {
        List<ParsedRow> result = new ArrayList<>();
        int headerFooter = 0;

        for (Row row : sheet) {
            if (row == null) continue;
            String rawBranch = getStr(row, 7).trim();
            double creditSarRaw = Math.abs(getNumRaw(row, 4));

            if (rawBranch.isBlank() && creditSarRaw == 0) {
                headerFooter++;
                continue;
            }

            String rawDateStr = null;
            Cell dateCell = row.getCell(9);
            if (dateCell != null && dateCell.getCellType() == CellType.STRING) {
                rawDateStr = dateCell.getStringCellValue();
            }

            LocalDate date = parseMothanDate(row, 9);

            ParsedRow pr = new ParsedRow();
            pr.excelRow = row.getRowNum();
            pr.rawBranchCode = rawBranch;
            pr.branchCode = rawBranch.matches("\\d{4}") ? rawBranch : null;
            pr.date = date;
            pr.rawDate = rawDateStr;
            pr.creditSar = creditSarRaw;
            pr.debitGold = getNumRaw(row, 2);
            pr.weightCredit = getNumRaw(row, 1);
            pr.balanceGold = getNumRaw(row, 0);
            pr.balanceSar = getNumRaw(row, 3);
            pr.description = getStr(row, 6);
            pr.docRef = getStr(row, 8);
            result.add(pr);
        }
        log.info("parseAllRowsForMothan: {} rows, {} header/footer skipped", result.size(), headerFooter);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: VALIDATION METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    List<V3StagedRecord.FieldIssue> validateSalesRow(ParsedRow row, Map<String, BranchStats> stats, String tenantId) {
        List<V3StagedRecord.FieldIssue> issues = new ArrayList<>();

        if (row.branchCode == null || !row.branchCode.matches("\\d{3,6}")) {
            issues.add(issue("branchCode", "invalid", row.rawBranchCode, null, 0.0, null));
        } else if (branchLookup.getBranch(tenantId, row.branchCode).isEmpty()) {
            issues.add(issue("branchCode", "unknown_branch", row.branchCode, null, 0.0, null));
        }

        if (row.date == null) {
            issues.add(issue("date", "missing", null, null, 0.0, null));
        }

        if (row.totalSar == 0) {
            issues.add(issue("sarAmount", "zero_value", "0", null, 0.0, null));
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
                confidence = (bs != null && bs.cleanRowCount > 20) ? 0.9
                           : (bs != null && bs.cleanRowCount > 5) ? 0.7 : 0.4;
            }
            issues.add(issue("pieces", "corrupt_value", String.valueOf((long) row.rawPieces), suggested, confidence,
                suggested != null ? "branch_median_sar_per_piece" : null));
        }

        return issues;
    }

    List<V3StagedRecord.FieldIssue> validateEmpRow(ParsedRow row, Map<String, BranchStats> stats, String tenantId) {
        List<V3StagedRecord.FieldIssue> issues = new ArrayList<>();

        if (row.branchCode == null || !row.branchCode.matches("\\d{3,6}")) {
            issues.add(issue("branchCode", "invalid", row.rawBranchCode, null, 0.0, null));
        } else if (branchLookup.getBranch(tenantId, row.branchCode).isEmpty()) {
            issues.add(issue("branchCode", "unknown_branch", row.branchCode, null, 0.0, null));
        }

        if (row.date == null) {
            issues.add(issue("date", "missing", null, null, 0.0, null));
        }

        if (row.totalSar == 0) {
            issues.add(issue("sarAmount", "zero_value", "0", null, 0.0, null));
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
                confidence = (bs != null && bs.cleanRowCount > 20) ? 0.9
                           : (bs != null && bs.cleanRowCount > 5) ? 0.7 : 0.4;
            }
            issues.add(issue("pieces", "corrupt_value", String.valueOf((long) row.rawPieces), suggested, confidence,
                suggested != null ? "branch_median_sar_per_piece" : null));
        }

        if (row.empId == null || row.empId.isBlank() || !row.empId.matches("\\d+")) {
            issues.add(issue("empId", "missing", row.empId, null, 0.0, "needs_manual_assignment"));
        }

        return issues;
    }

    List<V3StagedRecord.FieldIssue> validatePurchaseRow(ParsedRow row, String tenantId) {
        List<V3StagedRecord.FieldIssue> issues = new ArrayList<>();

        if (row.branchCode == null || !row.branchCode.matches("\\d{3,6}")) {
            issues.add(issue("branchCode", "invalid", row.rawBranchCode, null, 0.0, null));
        } else if (branchLookup.getBranch(tenantId, row.branchCode).isEmpty()) {
            issues.add(issue("branchCode", "unknown_branch", row.branchCode, null, 0.0, null));
        }

        if (row.date == null) {
            issues.add(issue("date", "missing", null, null, 0.0, null));
        }

        if (row.totalSar == 0) {
            issues.add(issue("sarAmount", "zero_value", "0", null, 0.0, null));
        }

        return issues;
    }

    List<V3StagedRecord.FieldIssue> validateMothanRow(ParsedRow row, String tenantId) {
        List<V3StagedRecord.FieldIssue> issues = new ArrayList<>();

        if (row.branchCode == null || !row.branchCode.matches("\\d{3,6}")) {
            issues.add(issue("branchCode", "invalid", row.rawBranchCode, null, 0.0, null));
        } else if (branchLookup.getBranch(tenantId, row.branchCode).isEmpty()) {
            issues.add(issue("branchCode", "unknown_branch", row.branchCode, null, 0.0, null));
        }

        if (row.date == null) {
            issues.add(issue("date", "missing", null, null, 0.0, null));
        }

        if (row.creditSar == 0) {
            issues.add(issue("sarAmount", "zero_value", "0", null, 0.0, null));
        }

        if (row.rawDate != null && row.rawDate.contains("\n")) {
            String firstLine = row.rawDate.split("\n")[0].trim();
            issues.add(issue("transactionDate", "multiline", row.rawDate, firstLine, 0.9, "first_line_extraction"));
        }

        return issues;
    }

    private V3StagedRecord.FieldIssue issue(String field, String issueType, String originalValue,
                                              String suggestedValue, double confidence, String method) {
        V3StagedRecord.FieldIssue fi = new V3StagedRecord.FieldIssue();
        fi.setField(field);
        fi.setIssueType(issueType);
        fi.setOriginalValue(originalValue);
        fi.setSuggestedValue(suggestedValue);
        fi.setConfidence(confidence);
        fi.setMethod(method);
        return fi;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BRANCH STATS
    // ═══════════════════════════════════════════════════════════════════════════

    Map<String, BranchStats> buildBranchStats(List<ParsedRow> rows) {
        Map<String, List<Double>> ratiosByBranch = new HashMap<>();
        Map<String, Integer> countsByBranch = new HashMap<>();

        for (ParsedRow row : rows) {
            if (row.branchCode == null) continue;
            double absSar = Math.abs(row.totalSar);
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
            bs.cleanRowCount = countsByBranch.getOrDefault(entry.getKey(), 0);
            result.put(entry.getKey(), bs);
        }
        return result;
    }

    private double computeMedian(List<Double> vals) {
        if (vals.isEmpty()) return 0;
        List<Double> sorted = new ArrayList<>(vals);
        Collections.sort(sorted);
        int mid = sorted.size() / 2;
        return sorted.size() % 2 == 1 ? sorted.get(mid) : (sorted.get(mid - 1) + sorted.get(mid)) / 2.0;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSFORM METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    private V3SaleTransaction toSaleTransaction(ParsedRow row, String tenantId, String src) {
        double sar = -row.totalSar;
        double sign = sar >= 0 ? 1.0 : -1.0;
        V3SaleTransaction t = new V3SaleTransaction();
        t.setTenantId(tenantId); t.setSourceFile(src);
        t.setSaleDate(row.date); t.setBranchCode(row.branchCode);
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

    private V3EmployeeSaleTransaction toEmpSaleTransaction(ParsedRow row, String tenantId, String src) {
        double sar = -row.totalSar;
        double sign = sar >= 0 ? 1.0 : -1.0;
        V3EmployeeSaleTransaction t = new V3EmployeeSaleTransaction();
        t.setTenantId(tenantId); t.setSourceFile(src);
        t.setSaleDate(row.date); t.setBranchCode(row.branchCode);
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

    private V3PurchaseTransaction toPurchaseTransaction(ParsedRow row, String tenantId, String src) {
        V3PurchaseTransaction t = new V3PurchaseTransaction();
        t.setTenantId(tenantId); t.setSourceFile(src);
        t.setPurchaseDate(row.date); t.setBranchCode(row.branchCode);
        t.setSarAmount(Math.abs(row.totalSar));
        t.setPureWeightG(Math.abs(row.pureWeight));
        t.setGrossWeightG(Math.abs(row.grossWeight));
        t.setPieces((int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        t.setPurity(Math.abs(row.purity));
        t.setKarat(mapKarat(Math.abs(row.purity)));
        return t;
    }

    private V3MothanTransaction toMothanTransaction(ParsedRow row, String tenantId, String src) {
        V3MothanTransaction t = new V3MothanTransaction();
        t.setTenantId(tenantId); t.setSourceFile(src);
        t.setTransactionDate(row.date); t.setBranchCode(row.branchCode);
        t.setDocReference(row.docRef); t.setDescription(row.description);
        t.setAmountSar(row.creditSar);
        t.setWeightDebitG(row.debitGold); t.setWeightCreditG(row.weightCredit);
        t.setBalanceGoldG(row.balanceGold); t.setBalanceSar(row.balanceSar);
        return t;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PARSED MAP BUILDERS (for staged records)
    // ═══════════════════════════════════════════════════════════════════════════

    private Map<String, Object> buildSalesParsedMap(ParsedRow row, String tenantId, String src) {
        double sar = -row.totalSar;
        double sign = Math.signum(sar);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tenantId", tenantId); map.put("sourceFile", src);
        map.put("saleDate", row.date); map.put("branchCode", row.branchCode);
        map.put("sarAmount", sar);
        map.put("pureWeightG", sign * Math.abs(row.pureWeight));
        map.put("grossWeightG", sign * Math.abs(row.grossWeight));
        map.put("pieces", (int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        map.put("purity", Math.abs(row.purity));
        map.put("karat", mapKarat(Math.abs(row.purity)));
        map.put("metalValue", sign * Math.abs(row.metalValue));
        map.put("makingCharge", sign * Math.abs(row.makingCharge));
        map.put("isReturn", sar < 0);
        return map;
    }

    private Map<String, Object> buildEmpParsedMap(ParsedRow row, String tenantId, String src) {
        double sar = -row.totalSar;
        double sign = Math.signum(sar);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tenantId", tenantId); map.put("sourceFile", src);
        map.put("saleDate", row.date); map.put("branchCode", row.branchCode);
        map.put("empId", row.empId); map.put("empName", row.empName);
        map.put("sarAmount", sar);
        map.put("pureWeightG", sign * Math.abs(row.pureWeight));
        map.put("grossWeightG", sign * Math.abs(row.grossWeight));
        map.put("pieces", (int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        map.put("purity", Math.abs(row.purity));
        map.put("karat", mapKarat(Math.abs(row.purity)));
        map.put("metalValue", sign * Math.abs(row.metalValue));
        map.put("makingCharge", sign * Math.abs(row.makingCharge));
        map.put("isReturn", sar < 0);
        return map;
    }

    private Map<String, Object> buildPurchaseParsedMap(ParsedRow row, String tenantId, String src) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tenantId", tenantId); map.put("sourceFile", src);
        map.put("purchaseDate", row.date); map.put("branchCode", row.branchCode);
        map.put("sarAmount", Math.abs(row.totalSar));
        map.put("pureWeightG", Math.abs(row.pureWeight));
        map.put("grossWeightG", Math.abs(row.grossWeight));
        map.put("pieces", (int) Math.min(Math.abs(row.rawPieces), PIECE_CAP));
        map.put("purity", Math.abs(row.purity));
        map.put("karat", mapKarat(Math.abs(row.purity)));
        return map;
    }

    private Map<String, Object> buildMothanParsedMap(ParsedRow row, String tenantId, String src) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("tenantId", tenantId); map.put("sourceFile", src);
        map.put("transactionDate", row.date); map.put("branchCode", row.branchCode);
        map.put("amountSar", row.creditSar);
        map.put("weightDebitG", row.debitGold); map.put("weightCreditG", row.weightCredit);
        map.put("balanceGoldG", row.balanceGold); map.put("balanceSar", row.balanceSar);
        map.put("docReference", row.docRef); map.put("description", row.description);
        return map;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD STAGED RECORD
    // ═══════════════════════════════════════════════════════════════════════════

    private V3StagedRecord buildStagedRecord(ParsedRow row, String fileType,
                                              List<V3StagedRecord.FieldIssue> issues,
                                              BranchStats stats,
                                              Map<String, Object> parsedMap,
                                              String tenantId, String importId,
                                              List<Map<String, Object>> availableEmployees) {
        // Build suggestedFixes from issues
        Map<String, Object> suggestedFixes = new LinkedHashMap<>();
        for (V3StagedRecord.FieldIssue issue : issues) {
            if (issue.getSuggestedValue() != null && !issue.getSuggestedValue().isBlank()) {
                suggestedFixes.put(issue.getField(), issue.getSuggestedValue());
            }
        }

        // Build context
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("branchCode", row.branchCode);
        context.put("branchName", branchLookup.getName(tenantId, row.branchCode != null ? row.branchCode : ""));
        if (stats != null) {
            context.put("branchMedianSarPerPiece", round4(stats.medianSarPerPiece));
            context.put("branchCleanRowCount", stats.cleanRowCount);
        }
        if (availableEmployees != null && !availableEmployees.isEmpty()) {
            context.put("availableEmployees", availableEmployees);
        }
        if (row.rawDate != null && row.rawDate.contains("\n")) {
            String[] parts = row.rawDate.split("\n");
            List<String> dates = new ArrayList<>();
            for (String p : parts) { if (!p.trim().isEmpty()) dates.add(p.trim()); }
            context.put("bothDates", dates);
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
        sr.setSuggestedFixes(suggestedFixes.isEmpty() ? null : suggestedFixes);
        sr.setContext(context);
        sr.setCreatedAt(LocalDateTime.now());
        return sr;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EMPLOYEES BY BRANCH
    // ═══════════════════════════════════════════════════════════════════════════

    private Map<String, List<Map<String, Object>>> buildEmployeesByBranch(String tenantId) {
        List<V3Employee> employees = empRepo.findByTenantId(tenantId);
        Map<String, List<Map<String, Object>>> result = new HashMap<>();
        for (V3Employee emp : employees) {
            String branch = emp.getCurrentBranchCode();
            if (branch == null) continue;
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("empId", emp.getEmpId());
            e.put("empName", emp.getEmpName());
            result.computeIfAbsent(branch, k -> new ArrayList<>()).add(e);
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PURCHASE RATES COMPUTATION
    // ═══════════════════════════════════════════════════════════════════════════

    public void recomputePurchaseRates(String tenantId) {
        Aggregation purchAgg = Aggregation.newAggregation(
            Aggregation.match(Criteria.where("tenantId").is(tenantId)),
            Aggregation.group("branchCode").sum("sarAmount").as("totalSar").sum("pureWeightG").as("totalWt")
        );
        List<Document> purchByBranch = mongo.aggregate(purchAgg, "v3_purchase_transactions", Document.class).getMappedResults();

        Aggregation mothanAgg = Aggregation.newAggregation(
            Aggregation.match(Criteria.where("tenantId").is(tenantId).and("weightDebitG").gt(0)),
            Aggregation.group("branchCode").sum("amountSar").as("totalSar").sum("weightDebitG").as("totalWt")
        );
        List<Document> mothanByBranch = mongo.aggregate(mothanAgg, "v3_mothan_transactions", Document.class).getMappedResults();

        Map<String, double[]> purch = new LinkedHashMap<>();
        Map<String, double[]> mothanMap = new LinkedHashMap<>();

        for (Document d : purchByBranch) {
            String code = d.getString("_id");
            if (code == null) continue;
            purch.put(code, new double[]{toDouble(d, "totalSar"), toDouble(d, "totalWt")});
        }
        for (Document d : mothanByBranch) {
            String code = d.getString("_id");
            if (code == null) continue;
            mothanMap.put(code, new double[]{toDouble(d, "totalSar"), toDouble(d, "totalWt")});
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
            double combWt = p[1] + m[1];
            V3BranchPurchaseRate r = new V3BranchPurchaseRate();
            r.setTenantId(tenantId); r.setBranchCode(code);
            r.setTotalPurchSar(p[0]); r.setTotalPurchWeightG(p[1]);
            r.setTotalMothanSar(m[0]); r.setTotalMothanWeightG(m[1]);
            r.setCombinedSar(combSar); r.setCombinedWeightG(combWt);
            r.setPurchaseRate(combWt > 0 ? round4(combSar / combWt) : 0);
            r.setComputedAt(LocalDateTime.now());
            rates.add(r);
        }
        if (!rates.isEmpty()) bulkInsertSafe(rates, V3BranchPurchaseRate.class, null, null);
        log.info("Purchase rates recomputed for {} branches", rates.size());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DATA WIPE
    // ═══════════════════════════════════════════════════════════════════════════

    public void wipeV3Data(String tenantId) {
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3SaleTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3EmployeeSaleTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3PurchaseTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3MothanTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3BranchPurchaseRate.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3Branch.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3Employee.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), "v3_staged_records");
        branchLookup.invalidateCache(tenantId);
        log.info("Wiped all V3 data for tenant {}", tenantId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    private boolean isDataRowA(Row row) {
        Cell c = row.getCell(15);
        return c != null && c.getCellType() == CellType.NUMERIC && c.getNumericCellValue() >= 1;
    }

    private boolean isDataRowB(Row row) {
        if (row == null) return false;
        Cell c = row.getCell(0);
        return c != null && c.getCellType() == CellType.NUMERIC && c.getNumericCellValue() >= 1;
    }

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
        CellType type = c.getCellType() == CellType.FORMULA ? c.getCachedFormulaResultType() : c.getCellType();
        if (type == CellType.STRING) return c.getStringCellValue().trim();
        if (type == CellType.NUMERIC) {
            double v = c.getNumericCellValue();
            if (v == Math.floor(v)) return String.valueOf((long) v);
            return String.valueOf(v);
        }
        return "";
    }

    private LocalDate parseSerialDate(double serial) {
        if (serial <= 0) return LocalDate.now();
        try {
            long days = (long) serial - 25569;
            return java.time.Instant.ofEpochSecond(days * 86400L)
                .atZone(java.time.ZoneOffset.UTC).toLocalDate();
        } catch (Exception e) { return LocalDate.now(); }
    }

    private LocalDate extractDateFromRow(Row row, LocalDate fallback) {
        for (Cell cell : row) {
            if (cell == null) continue;
            if (cell.getCellType() == CellType.STRING) {
                String s = cell.getStringCellValue().trim();
                try { return LocalDate.parse(s, DD_MM_YYYY); } catch (Exception ignored) {}
                try { return LocalDate.parse(s); } catch (Exception ignored) {}
            }
        }
        return null;
    }

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
                    try { return LocalDate.parse(s); } catch (Exception ignored) {}
                    java.util.regex.Matcher m = DATE_HEADER_A.matcher(s);
                    if (m.find()) {
                        try {
                            if (m.group(1) != null)
                                return LocalDate.of(Integer.parseInt(m.group(3)),
                                    Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
                            if (m.group(4) != null)
                                return LocalDate.of(Integer.parseInt(m.group(4)),
                                    Integer.parseInt(m.group(5)), Integer.parseInt(m.group(6)));
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
        CellType type = cell.getCellType() == CellType.FORMULA ? cell.getCachedFormulaResultType() : cell.getCellType();
        if (type == CellType.NUMERIC) {
            double v = cell.getNumericCellValue();
            if (v > 30000 && v < 70000) return parseSerialDate(v);
        }
        if (type == CellType.STRING) {
            String s = cell.getStringCellValue().trim();
            if (s.contains("\n")) s = s.split("\n")[0].trim();
            for (DateTimeFormatter fmt : MOTHAN_DATE_FMTS) {
                try { return LocalDate.parse(s, fmt); } catch (Exception ignored) {}
            }
        }
        return null;
    }

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

    private <T> int bulkInsertSafe(List<T> items, Class<T> clazz, String importId, String fileType) {
        int saved = 0;
        int batchSz = 200;
        int total = items.size();
        for (int i = 0; i < total; i += batchSz) {
            List<T> batch = items.subList(i, Math.min(i + batchSz, total));
            try {
                mongo.insertAll(batch);
                saved += batch.size();
            } catch (Exception batchEx) {
                log.warn("Batch {}-{} failed ({}), falling back", i, i + batch.size(), batchEx.getMessage());
                for (T item : batch) {
                    try { mongo.insert(item); saved++; }
                    catch (Exception e) { log.error("Insert failed: {}", e.getMessage()); }
                }
            }
            if (importId != null && fileType != null) {
                progress.updateSaveProgress(importId, fileType, saved, total, 0);
            }
        }
        return saved;
    }

    private static double toDouble(Document doc, String key) {
        Object v = doc.get(key);
        if (v instanceof Number n) return n.doubleValue();
        return 0.0;
    }
}
