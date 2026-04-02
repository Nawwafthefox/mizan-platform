package com.mizan.service;

import com.mizan.config.BranchMaps;
import com.mizan.model.*;
import com.mizan.repository.*;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * V3 Excel Import — stores INDIVIDUAL TRANSACTION ROWS (one per Sl.# row, no aggregation).
 *
 * Supports two Excel formats (auto-detected):
 *   Format A: Sl.# in col15, total SAR in col3, branch carry-forward from col12 header rows
 *   Format B: Sl.# in col0,  total SAR in col15, branchCode in col1, date in col6 (Excel serial)
 *
 * Sign convention (both formats): rawTotal < 0 in file = sale → sar = -rawTotal (positive)
 *                                  rawTotal > 0 in file = return → sar = -rawTotal (negative)
 */
@Slf4j
@Service
public class V3ExcelImportService {

    private final MongoTemplate                        mongo;
    private final V3BranchPurchaseRateRepository       rateRepo;
    private final V3BranchRepository                   branchRepo;
    private final V3EmployeeRepository                 empRepo;

    private static final DateTimeFormatter DD_MM_YYYY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final int PIECE_CAP = 500;

    public V3ExcelImportService(MongoTemplate mongo,
                                 V3BranchPurchaseRateRepository rateRepo,
                                 V3BranchRepository branchRepo,
                                 V3EmployeeRepository empRepo) {
        this.mongo      = mongo;
        this.rateRepo   = rateRepo;
        this.branchRepo = branchRepo;
        this.empRepo    = empRepo;
    }

    // ─── Public entry points ──────────────────────────────────────────────────

    public int importBranchSales(MultipartFile file, String tenantId) throws Exception {
        try (InputStream is = file.getInputStream();
             Workbook wb   = new HSSFWorkbook(is)) {
            Sheet sheet = wb.getSheetAt(0);
            Format fmt  = detectFormat(sheet);
            List<V3SaleTransaction> txns = fmt == Format.B
                ? parseSalesB(sheet, tenantId, file.getOriginalFilename())
                : parseSalesA(sheet, tenantId, file.getOriginalFilename());

            if (txns.isEmpty()) return 0;
            LocalDate minDate = txns.stream().map(V3SaleTransaction::getSaleDate).min(LocalDate::compareTo).orElseThrow();
            LocalDate maxDate = txns.stream().map(V3SaleTransaction::getSaleDate).max(LocalDate::compareTo).orElseThrow();

            mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                .and("saleDate").gte(minDate).lte(maxDate)), V3SaleTransaction.class);

            bulkInsert(txns, V3SaleTransaction.class);
            upsertBranches(txns.stream().map(V3SaleTransaction::getBranchCode).distinct().toList(), tenantId);
            log.info("V3 branch_sales: {} records, {} – {}", txns.size(), minDate, maxDate);
            return txns.size();
        }
    }

    public int importEmployeeSales(MultipartFile file, String tenantId) throws Exception {
        try (InputStream is = file.getInputStream();
             Workbook wb   = new HSSFWorkbook(is)) {
            Sheet sheet = wb.getSheetAt(0);
            Format fmt  = detectFormat(sheet);
            List<V3EmployeeSaleTransaction> txns = fmt == Format.B
                ? parseEmpSalesB(sheet, tenantId, file.getOriginalFilename())
                : parseEmpSalesA(sheet, tenantId, file.getOriginalFilename());

            if (txns.isEmpty()) return 0;
            LocalDate minDate = txns.stream().map(V3EmployeeSaleTransaction::getSaleDate).min(LocalDate::compareTo).orElseThrow();
            LocalDate maxDate = txns.stream().map(V3EmployeeSaleTransaction::getSaleDate).max(LocalDate::compareTo).orElseThrow();

            mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                .and("saleDate").gte(minDate).lte(maxDate)), V3EmployeeSaleTransaction.class);

            bulkInsert(txns, V3EmployeeSaleTransaction.class);
            upsertEmployees(txns, tenantId);
            log.info("V3 employee_sale_transactions: {} records", txns.size());
            return txns.size();
        }
    }

    public int importPurchases(MultipartFile file, String tenantId) throws Exception {
        try (InputStream is = file.getInputStream();
             Workbook wb   = new HSSFWorkbook(is)) {
            Sheet sheet = wb.getSheetAt(0);
            Format fmt  = detectFormat(sheet);
            List<V3PurchaseTransaction> txns = fmt == Format.B
                ? parsePurchasesB(sheet, tenantId, file.getOriginalFilename())
                : parsePurchasesA(sheet, tenantId, file.getOriginalFilename());

            if (txns.isEmpty()) return 0;
            LocalDate minDate = txns.stream().map(V3PurchaseTransaction::getPurchaseDate).min(LocalDate::compareTo).orElseThrow();
            LocalDate maxDate = txns.stream().map(V3PurchaseTransaction::getPurchaseDate).max(LocalDate::compareTo).orElseThrow();

            mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                .and("purchaseDate").gte(minDate).lte(maxDate)), V3PurchaseTransaction.class);

            bulkInsert(txns, V3PurchaseTransaction.class);
            recomputePurchaseRates(tenantId);
            log.info("V3 purchase_transactions: {} records", txns.size());
            return txns.size();
        }
    }

    public int importMothan(MultipartFile file, String tenantId) throws Exception {
        try (InputStream is = file.getInputStream();
             Workbook wb   = new HSSFWorkbook(is)) {
            Sheet sheet = wb.getSheetAt(0);
            List<V3MothanTransaction> txns = parseMothan(sheet, tenantId, file.getOriginalFilename());

            if (txns.isEmpty()) return 0;
            LocalDate minDate = txns.stream().map(V3MothanTransaction::getTransactionDate).min(LocalDate::compareTo).orElseThrow();
            LocalDate maxDate = txns.stream().map(V3MothanTransaction::getTransactionDate).max(LocalDate::compareTo).orElseThrow();

            mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)
                .and("transactionDate").gte(minDate).lte(maxDate)), V3MothanTransaction.class);

            bulkInsert(txns, V3MothanTransaction.class);
            recomputePurchaseRates(tenantId);
            log.info("V3 mothan_transactions: {} records", txns.size());
            return txns.size();
        }
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
                // Check col1 for a 4-digit branch code to confirm Format B
                String c1 = getStr(row, 1);
                if (c1.matches("\\d{4}")) return Format.B;
            }
            Cell c15 = row.getCell(15);
            if (c15 != null && c15.getCellType() == CellType.NUMERIC && c15.getNumericCellValue() >= 1) {
                return Format.A;
            }
        }
        return Format.A; // default
    }

    // ─── FORMAT B PARSERS ─────────────────────────────────────────────────────
    // Col layout: 0=Sl.#, 1=branchCode, 2=invoice, 3=empId(emp only),
    //             5=empName, 6=date(serial), 7=pieces, 8=grossWt,
    //             10=netWt, 11=purity, 12=pureWt, 13=metalVal, 14=mkgChg, 15=totalSAR

    private List<V3SaleTransaction> parseSalesB(Sheet sheet, String tenantId, String src) {
        List<V3SaleTransaction> result = new ArrayList<>();
        for (Row row : sheet) {
            if (!isDataRowB(row)) continue;
            String branchCode = getStr(row, 1);
            if (branchCode.isBlank() || !branchCode.matches("\\d{3,6}")) continue;

            double rawTotal = getNumRaw(row, 15);
            if (rawTotal == 0) continue;
            double sar  = -rawTotal;
            double sign = sar >= 0 ? 1.0 : -1.0;

            LocalDate date     = parseSerialDate(getNumRaw(row, 6));
            double pureWt      = sign * Math.abs(getNumRaw(row, 12));
            double grossWt     = sign * Math.abs(getNumRaw(row, 8));
            int    pieces      = Math.min((int) Math.abs(getNumRaw(row, 7)), PIECE_CAP);
            double purity      = Math.abs(getNumRaw(row, 11));
            double metalVal    = sign * Math.abs(getNumRaw(row, 13));
            double mkgCharge   = sign * Math.abs(getNumRaw(row, 14));

            V3SaleTransaction t = new V3SaleTransaction();
            t.setTenantId(tenantId); t.setSourceFile(src);
            t.setSaleDate(date); t.setBranchCode(branchCode);
            t.setSarAmount(sar); t.setPureWeightG(pureWt); t.setGrossWeightG(grossWt);
            t.setPieces(pieces); t.setPurity(purity); t.setKarat(mapKarat(purity));
            t.setMetalValue(metalVal); t.setMakingCharge(mkgCharge);
            t.setReturn(sar < 0);
            result.add(t);
        }
        return result;
    }

    private List<V3EmployeeSaleTransaction> parseEmpSalesB(Sheet sheet, String tenantId, String src) {
        List<V3EmployeeSaleTransaction> result = new ArrayList<>();
        for (Row row : sheet) {
            if (!isDataRowB(row)) continue;
            String branchCode = getStr(row, 1);
            if (branchCode.isBlank() || !branchCode.matches("\\d{3,6}")) continue;

            double rawTotal = getNumRaw(row, 15);
            if (rawTotal == 0) continue;
            double sar  = -rawTotal;
            double sign = sar >= 0 ? 1.0 : -1.0;

            LocalDate date   = parseSerialDate(getNumRaw(row, 6));
            double pureWt    = sign * Math.abs(getNumRaw(row, 12));
            double grossWt   = sign * Math.abs(getNumRaw(row, 8));
            int    pieces    = Math.min((int) Math.abs(getNumRaw(row, 7)), PIECE_CAP);
            double purity    = Math.abs(getNumRaw(row, 11));
            double metalVal  = sign * Math.abs(getNumRaw(row, 13));
            double mkgCharge = sign * Math.abs(getNumRaw(row, 14));

            // Employee ID: col3 (integer) else col2
            String empId = "";
            double c3v = getNumRaw(row, 3);
            if (c3v >= 1 && c3v == Math.floor(c3v)) empId = String.valueOf((long) c3v);
            if (empId.isBlank()) { String c2 = getStr(row, 2); if (c2.matches("\\d+")) empId = c2; }
            if (empId.isBlank()) empId = "BR_" + branchCode;
            String empName = getStr(row, 5);
            if (empName.isBlank()) empName = empId;

            V3EmployeeSaleTransaction t = new V3EmployeeSaleTransaction();
            t.setTenantId(tenantId); t.setSourceFile(src);
            t.setSaleDate(date); t.setBranchCode(branchCode);
            t.setEmpId(empId); t.setEmpName(empName);
            t.setSarAmount(sar); t.setPureWeightG(pureWt); t.setGrossWeightG(grossWt);
            t.setPieces(pieces); t.setPurity(purity); t.setKarat(mapKarat(purity));
            t.setMetalValue(metalVal); t.setMakingCharge(mkgCharge);
            t.setReturn(sar < 0);
            result.add(t);
        }
        return result;
    }

    private List<V3PurchaseTransaction> parsePurchasesB(Sheet sheet, String tenantId, String src) {
        List<V3PurchaseTransaction> result = new ArrayList<>();
        for (Row row : sheet) {
            if (!isDataRowB(row)) continue;
            String branchCode = getStr(row, 1);
            if (branchCode.isBlank() || !branchCode.matches("\\d{3,6}")) continue;

            double rawTotal = getNumRaw(row, 15);
            if (rawTotal == 0) continue;
            double sar    = Math.abs(rawTotal); // purchases always positive
            double pureWt = Math.abs(getNumRaw(row, 12));
            double grossWt = Math.abs(getNumRaw(row, 8));
            int    pieces  = Math.min((int) Math.abs(getNumRaw(row, 7)), PIECE_CAP);
            double purity  = Math.abs(getNumRaw(row, 11));
            LocalDate date = parseSerialDate(getNumRaw(row, 6));

            V3PurchaseTransaction t = new V3PurchaseTransaction();
            t.setTenantId(tenantId); t.setSourceFile(src);
            t.setPurchaseDate(date); t.setBranchCode(branchCode);
            t.setSarAmount(sar); t.setPureWeightG(pureWt); t.setGrossWeightG(grossWt);
            t.setPieces(pieces); t.setPurity(purity); t.setKarat(mapKarat(purity));
            result.add(t);
        }
        return result;
    }

    // ─── FORMAT A PARSERS ─────────────────────────────────────────────────────
    // Col layout: 15=Sl.#, 12=description/branchHeader, 13=empId(emp only),
    //             3=totalSAR, 6=pureWt, 7=purity, 10=grossWt, 11=pieces,
    //             4=mkgCharge, 5=metalVal

    private static final java.util.regex.Pattern BRANCH_HEADER_A =
        java.util.regex.Pattern.compile("^(\\d{4})\\s*[-–]\\s*(.+)");
    private static final java.util.regex.Pattern DATE_HEADER_A =
        java.util.regex.Pattern.compile("(\\d{1,2})/(\\d{1,2})/(\\d{4})|(\\d{4})-(\\d{2})-(\\d{2})");

    private List<V3SaleTransaction> parseSalesA(Sheet sheet, String tenantId, String src) {
        List<V3SaleTransaction> result = new ArrayList<>();
        String currentBranch = null;
        LocalDate currentDate = LocalDate.now();

        for (Row row : sheet) {
            if (row == null) continue;
            String col12 = getStr(row, 12);
            java.util.regex.Matcher bm = BRANCH_HEADER_A.matcher(col12);
            if (bm.matches()) { currentBranch = bm.group(1); continue; }

            // Try to extract date from any cell
            LocalDate rowDate = extractDateFromRow(row, currentDate);
            if (rowDate != null) currentDate = rowDate;

            if (!isDataRowA(row) || currentBranch == null) continue;
            if (col12.contains("Sub Total") || col12.contains("Grand Total") || col12.contains("إجمالي")) continue;

            double rawTotal = getNumRaw(row, 3);
            if (rawTotal == 0) continue;
            double sar  = -rawTotal;
            double sign = sar >= 0 ? 1.0 : -1.0;

            double pureWt    = sign * Math.abs(getNumRaw(row, 6));
            double grossWt   = sign * Math.abs(getNumRaw(row, 10));
            int    pieces    = Math.min((int) Math.abs(getNumRaw(row, 11)), PIECE_CAP);
            double purity    = Math.abs(getNumRaw(row, 7));
            double metalVal  = sign * Math.abs(getNumRaw(row, 5));
            double mkgCharge = sign * Math.abs(getNumRaw(row, 4));

            V3SaleTransaction t = new V3SaleTransaction();
            t.setTenantId(tenantId); t.setSourceFile(src);
            t.setSaleDate(currentDate); t.setBranchCode(currentBranch);
            t.setSarAmount(sar); t.setPureWeightG(pureWt); t.setGrossWeightG(grossWt);
            t.setPieces(pieces); t.setPurity(purity); t.setKarat(mapKarat(purity));
            t.setMetalValue(metalVal); t.setMakingCharge(mkgCharge);
            t.setReturn(sar < 0);
            result.add(t);
        }
        return result;
    }

    private List<V3EmployeeSaleTransaction> parseEmpSalesA(Sheet sheet, String tenantId, String src) {
        List<V3EmployeeSaleTransaction> result = new ArrayList<>();
        String currentBranch = null;
        LocalDate currentDate = LocalDate.now();

        for (Row row : sheet) {
            if (row == null) continue;
            String col12 = getStr(row, 12);
            java.util.regex.Matcher bm = BRANCH_HEADER_A.matcher(col12);
            if (bm.matches()) { currentBranch = bm.group(1); continue; }

            LocalDate rowDate = extractDateFromRow(row, currentDate);
            if (rowDate != null) currentDate = rowDate;

            if (!isDataRowA(row) || currentBranch == null) continue;
            if (col12.contains("Sub Total") || col12.contains("Grand Total") || col12.contains("إجمالي")) continue;

            double rawTotal = getNumRaw(row, 3);
            if (rawTotal == 0) continue;
            double sar  = -rawTotal;
            double sign = sar >= 0 ? 1.0 : -1.0;

            String empId   = getStr(row, 13).trim();
            String empName = col12.trim();

            double pureWt    = sign * Math.abs(getNumRaw(row, 6));
            double grossWt   = sign * Math.abs(getNumRaw(row, 10));
            int    pieces    = Math.min((int) Math.abs(getNumRaw(row, 11)), PIECE_CAP);
            double purity    = Math.abs(getNumRaw(row, 7));
            double metalVal  = sign * Math.abs(getNumRaw(row, 5));
            double mkgCharge = sign * Math.abs(getNumRaw(row, 4));

            V3EmployeeSaleTransaction t = new V3EmployeeSaleTransaction();
            t.setTenantId(tenantId); t.setSourceFile(src);
            t.setSaleDate(currentDate); t.setBranchCode(currentBranch);
            t.setEmpId(empId.isEmpty() ? "BR_" + currentBranch : empId);
            t.setEmpName(empName.isEmpty() ? empId : empName);
            t.setSarAmount(sar); t.setPureWeightG(pureWt); t.setGrossWeightG(grossWt);
            t.setPieces(pieces); t.setPurity(purity); t.setKarat(mapKarat(purity));
            t.setMetalValue(metalVal); t.setMakingCharge(mkgCharge);
            t.setReturn(sar < 0);
            result.add(t);
        }
        return result;
    }

    private List<V3PurchaseTransaction> parsePurchasesA(Sheet sheet, String tenantId, String src) {
        List<V3PurchaseTransaction> result = new ArrayList<>();
        String currentBranch = null;
        LocalDate currentDate = LocalDate.now();

        for (Row row : sheet) {
            if (row == null) continue;
            String col12 = getStr(row, 12);
            java.util.regex.Matcher bm = BRANCH_HEADER_A.matcher(col12);
            if (bm.matches()) { currentBranch = bm.group(1); continue; }

            LocalDate rowDate = extractDateFromRow(row, currentDate);
            if (rowDate != null) currentDate = rowDate;

            if (!isDataRowA(row) || currentBranch == null) continue;
            if (col12.contains("Sub Total") || col12.contains("Grand Total") || col12.contains("إجمالي")) continue;

            double rawTotal = getNumRaw(row, 3);
            if (rawTotal == 0) continue;

            double sar    = Math.abs(rawTotal);
            double pureWt = Math.abs(getNumRaw(row, 6));
            double grossWt = Math.abs(getNumRaw(row, 10));
            int    pieces  = Math.min((int) Math.abs(getNumRaw(row, 11)), PIECE_CAP);
            double purity  = Math.abs(getNumRaw(row, 7));

            V3PurchaseTransaction t = new V3PurchaseTransaction();
            t.setTenantId(tenantId); t.setSourceFile(src);
            t.setPurchaseDate(currentDate); t.setBranchCode(currentBranch);
            t.setSarAmount(sar); t.setPureWeightG(pureWt); t.setGrossWeightG(grossWt);
            t.setPieces(pieces); t.setPurity(purity); t.setKarat(mapKarat(purity));
            result.add(t);
        }
        return result;
    }

    // ─── Mothan parser ────────────────────────────────────────────────────────
    // Structured columnar format:
    // Col0=balanceGoldG, Col1=creditGold, Col2=debitGold★, Col3=balanceSar,
    // Col4=creditSar★, Col5=debitSar, Col6=description, Col7=branchCode★,
    // Col8=docReference★, Col9=date(DD/MM/YYYY)★

    private List<V3MothanTransaction> parseMothan(Sheet sheet, String tenantId, String src) {
        List<V3MothanTransaction> result = new ArrayList<>();
        for (Row row : sheet) {
            if (row == null) continue;
            String branchCode = getStr(row, 7).trim();
            if (!branchCode.matches("\\d{4}")) continue;

            double debitGold = getNumRaw(row, 2);
            if (debitGold <= 0) continue;

            double creditSar   = Math.abs(getNumRaw(row, 4));
            double weightCredit = getNumRaw(row, 1);
            double balanceGold  = getNumRaw(row, 0);
            double balanceSar   = getNumRaw(row, 3);
            double debitSar     = getNumRaw(row, 5);
            String description  = getStr(row, 6);
            String docRef       = getStr(row, 8);

            // Parse date from col9 (DD/MM/YYYY string or Excel serial)
            LocalDate date = parseMothanDate(row, 9);
            if (date == null) continue;

            V3MothanTransaction t = new V3MothanTransaction();
            t.setTenantId(tenantId); t.setSourceFile(src);
            t.setTransactionDate(date); t.setBranchCode(branchCode);
            t.setDocReference(docRef); t.setDescription(description);
            t.setAmountSar(creditSar);
            t.setWeightDebitG(debitGold);
            t.setWeightCreditG(weightCredit);
            t.setBalanceGoldG(balanceGold);
            t.setBalanceSar(balanceSar);
            result.add(t);
        }
        return result;
    }

    private LocalDate parseMothanDate(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        if (cell.getCellType() == CellType.STRING) {
            String s = cell.getStringCellValue().trim();
            try { return LocalDate.parse(s, DD_MM_YYYY); } catch (Exception ignored) {}
            try { return LocalDate.parse(s); } catch (Exception ignored) {}
        }
        if (cell.getCellType() == CellType.NUMERIC) {
            double v = cell.getNumericCellValue();
            if (v > 40000 && v < 60000) return parseSerialDate(v);
        }
        return null;
    }

    // ─── Post-import: compute purchase rates ─────────────────────────────────

    public void recomputePurchaseRates(String tenantId) {
        // Aggregate purchase SAR/weight per branch
        Query q = Query.query(Criteria.where("tenantId").is(tenantId));
        List<V3PurchaseTransaction> purchases = mongo.find(q, V3PurchaseTransaction.class);
        List<V3MothanTransaction> mothan = mongo.find(q, V3MothanTransaction.class);

        Map<String, double[]> purch = new LinkedHashMap<>(); // [sar, wt]
        for (V3PurchaseTransaction p : purchases) {
            double[] a = purch.computeIfAbsent(p.getBranchCode(), k -> new double[2]);
            a[0] += p.getSarAmount(); a[1] += p.getPureWeightG();
        }
        Map<String, double[]> mothanMap = new LinkedHashMap<>();
        for (V3MothanTransaction m : mothan) {
            if (m.getWeightDebitG() <= 0) continue;
            double[] a = mothanMap.computeIfAbsent(m.getBranchCode(), k -> new double[2]);
            a[0] += m.getAmountSar(); a[1] += m.getWeightDebitG();
        }

        Set<String> allBranches = new LinkedHashSet<>();
        allBranches.addAll(purch.keySet()); allBranches.addAll(mothanMap.keySet());

        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3BranchPurchaseRate.class);

        List<V3BranchPurchaseRate> rates = new ArrayList<>();
        for (String code : allBranches) {
            double[] p = purch.getOrDefault(code, new double[2]);
            double[] m = mothanMap.getOrDefault(code, new double[2]);
            double combSar = p[0] + m[0];
            double combWt  = p[1] + m[1];
            V3BranchPurchaseRate r = new V3BranchPurchaseRate();
            r.setTenantId(tenantId); r.setBranchCode(code);
            r.setTotalPurchSar(p[0]); r.setTotalPurchWeightG(p[1]);
            r.setTotalMothanSar(m[0]); r.setTotalMothanWeightG(m[1]);
            r.setCombinedSar(combSar); r.setCombinedWeightG(combWt);
            r.setPurchaseRate(combWt > 0 ? round4(combSar / combWt) : 0);
            r.setComputedAt(LocalDateTime.now());
            rates.add(r);
        }
        if (!rates.isEmpty()) bulkInsert(rates, V3BranchPurchaseRate.class);
        log.info("V3 purchase rates recomputed for {} branches", rates.size());
    }

    // ─── Dimension upserts ────────────────────────────────────────────────────

    private void upsertBranches(List<String> codes, String tenantId) {
        for (String code : codes) {
            Query q = Query.query(Criteria.where("tenantId").is(tenantId).and("branchCode").is(code));
            if (mongo.exists(q, V3Branch.class)) continue;
            V3Branch b = new V3Branch();
            b.setTenantId(tenantId); b.setBranchCode(code);
            b.setBranchName(BranchMaps.getName(code));
            b.setRegionId(regionIdFromName(BranchMaps.getRegion(code)));
            mongo.insert(b);
        }
    }

    private void upsertEmployees(List<V3EmployeeSaleTransaction> txns, String tenantId) {
        Map<String, V3EmployeeSaleTransaction> latest = new LinkedHashMap<>();
        for (V3EmployeeSaleTransaction t : txns) {
            latest.merge(t.getEmpId(), t, (a, b) ->
                b.getSaleDate().isAfter(a.getSaleDate()) ? b : a);
        }
        for (Map.Entry<String, V3EmployeeSaleTransaction> e : latest.entrySet()) {
            V3EmployeeSaleTransaction t = e.getValue();
            Query q = Query.query(Criteria.where("tenantId").is(tenantId).and("empId").is(e.getKey()));
            mongo.remove(q, V3Employee.class);
            V3Employee emp = new V3Employee();
            emp.setTenantId(tenantId); emp.setEmpId(t.getEmpId());
            emp.setEmpName(t.getEmpName()); emp.setCurrentBranchCode(t.getBranchCode());
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

    // ─── Helpers ──────────────────────────────────────────────────────────────

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
        if (c.getCellType() == CellType.STRING) return c.getStringCellValue().trim();
        if (c.getCellType() == CellType.NUMERIC) {
            double v = c.getNumericCellValue();
            if (v == Math.floor(v)) return String.valueOf((long) v);
            return String.valueOf(v);
        }
        return "";
    }

    private LocalDate parseSerialDate(double serial) {
        if (serial <= 0) return LocalDate.now();
        try {
            long days = (long) serial - 25569; // Excel epoch → Unix epoch
            return java.time.Instant.ofEpochSecond(days * 86400)
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

    private static String mapKarat(double purity) {
        if (purity >= 0.74 && purity <= 0.76) return "18";
        if (purity >= 0.86 && purity <= 0.89) return "21";
        if (purity >= 0.90 && purity <= 0.93) return "22";
        if (purity >= 0.99 && purity <= 1.01) return "24";
        return null;
    }

    private static double round4(double v) { return Math.round(v * 10000.0) / 10000.0; }

    private <T> void bulkInsert(List<T> items, Class<T> clazz) {
        int batch = 200;
        for (int i = 0; i < items.size(); i += batch) {
            mongo.insertAll(items.subList(i, Math.min(i + batch, items.size())));
        }
    }

    public void wipeV3Data(String tenantId) {
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3SaleTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3EmployeeSaleTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3PurchaseTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3MothanTransaction.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3BranchPurchaseRate.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3Branch.class);
        mongo.remove(Query.query(Criteria.where("tenantId").is(tenantId)), V3Employee.class);
        log.info("Wiped all V3 data for tenant {}", tenantId);
    }
}
