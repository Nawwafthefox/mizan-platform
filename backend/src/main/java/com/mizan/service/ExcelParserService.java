package com.mizan.service;
import com.mizan.config.BranchMaps;
import com.mizan.model.*;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.*;

/**
 * Parses ERP Excel exports (BIFF8 / HSSF format).
 *
 * ACTUAL COLUMN MAP — cols 0-15 — identical for Branch Sales, Employee Sales, Purchases:
 * (RTL report: Sl.# is the rightmost column = col15 in 0-based indexing)
 *
 *   Col  0  Avg. Mkg           — computed ratio (display only)
 *   Col  1  Pure Loss          — display only
 *   Col  2  Wst Qty            — display only
 *   Col  3  مجموع              — ★ TOTAL SAR (metal value + making charges) ★
 *   Col  4  Mkg. Stn. Kun. Chg — making charges SAR
 *   Col  5  قيمة المعادن       — metal value SAR
 *   Col  6  الوزن النقي        — ★ PURE WEIGHT = gross×purity = RATE DENOMINATOR ★
 *   Col  7  النقاوة            — purity ratio: 0.75=18K, 0.875=21K, 0.916=22K, 1.0=24K
 *   Col  8  الوزن الصافي       — net weight excl. stones (display only)
 *   Col  9  وزن الحجر          — stone weight (display only)
 *   Col 10  بالوزن الإجمالي   — gross weight incl. stones (display only)
 *   Col 11  القطع              — invoice/piece count
 *   Col 12  وصف                — description: branch "XXXX - Name", karat "18"/"21"/"22"/"24", employee name
 *   Col 13  الرمز              — reference code: karat string or employee ID
 *   Col 14  (empty)
 *   Col 15  Sl. #              — ★ ROW FILTER: numeric >= 1 ★
 *
 * SIGN convention (sales / employee sales):
 *   col3 negative in file → normal sale   → negate → positive SAR
 *   col3 positive in file → return/مرتجع → negate → negative SAR
 *   col6 always read as Math.abs(), sign follows SAR sign
 *
 * SIGN convention (purchases):
 *   col3 always positive → Math.abs()
 *   col6 always positive → Math.abs()
 *
 * BRANCH CARRY-FORWARD:
 *   Branch header rows: col12 = "XXXX - BranchName", col15 = '' (not a data row)
 *   Data rows:          col12 = karat or employee name, col15 = Sl.# >= 1
 *   Sub Total rows:     col12 = "Sub Total (XXXX)", col15 = '' (not a data row)
 */
@Slf4j
@Service
public class ExcelParserService {

    public enum FileType { BRANCH_SALES, EMPLOYEE_SALES, PURCHASES, MOTHAN, UNKNOWN }

    // ── Public ParseResult record (interface unchanged — UploadService depends on it) ──
    public record ParseResult(
        FileType fileType,
        LocalDate fileDate,
        List<BranchSale>         sales,
        List<BranchPurchase>     purchases,
        List<EmployeeSale>       empSales,
        List<MothanTransaction>  mothan,
        String error
    ) {}

    /** Date range extracted from "From YYYY-MM-DD To YYYY-MM-DD" file header. */
    public record DateRange(LocalDate from, LocalDate to) {}

    // ─────────────────────────────────────────────────────────────────────────────
    //  MAIN ENTRY POINT
    // ─────────────────────────────────────────────────────────────────────────────

    public ParseResult parse(InputStream is, String filename,
            String tenantId, String uploadBatch, String uploadedBy) {

        try (HSSFWorkbook wb = new HSSFWorkbook(is)) {
            Sheet sheet = wb.getSheetAt(0);

            FileType type = detectFromFilename(filename);
            if (type == FileType.UNKNOWN) type = detectFromContent(sheet);
            log.info("Parsing '{}' → detected type: {}", filename, type);

            LocalDate fileDate = extractDateFromHeader(sheet, filename);
            log.info("File date: {}", fileDate);

            return switch (type) {
                case BRANCH_SALES   -> parseBranchSales  (sheet, fileDate, tenantId, uploadBatch, uploadedBy);
                case EMPLOYEE_SALES -> parseEmployeeSales(sheet, fileDate, tenantId, uploadBatch, uploadedBy);
                case PURCHASES      -> parsePurchases     (sheet, fileDate, tenantId, uploadBatch, uploadedBy);
                case MOTHAN         -> parseMothan        (sheet, fileDate, tenantId, uploadBatch, uploadedBy);
                default -> fail(type, fileDate, "لا يمكن تحديد نوع الملف: " + filename);
            };
        } catch (Exception e) {
            log.error("Parse failed for '{}': {}", filename, e.getMessage(), e);
            String msg = e.getMessage();
            if (msg == null || msg.isBlank() || msg.contains("/tmp") || msg.length() > 150)
                msg = "تعذّر قراءة الملف — تأكد أنه بصيغة Excel .xls صحيحة";
            return fail(FileType.UNKNOWN, LocalDate.now(), msg);
        }
    }

    /**
     * Parse with a forced FileType — skips auto-detection.
     * Used by typed upload endpoints (/upload/branch-sales, etc.)
     */
    public ParseResult parseForced(InputStream is, String filename,
            String tenantId, String uploadBatch, String uploadedBy,
            FileType forcedType) {

        try (HSSFWorkbook wb = new HSSFWorkbook(is)) {
            Sheet sheet = wb.getSheetAt(0);
            LocalDate fileDate = extractDateFromHeader(sheet, filename);
            log.info("Parsing '{}' forced as {}, date={}", filename, forcedType, fileDate);

            return switch (forcedType) {
                case BRANCH_SALES   -> parseBranchSales  (sheet, fileDate, tenantId, uploadBatch, uploadedBy);
                case EMPLOYEE_SALES -> parseEmployeeSales(sheet, fileDate, tenantId, uploadBatch, uploadedBy);
                case PURCHASES      -> parsePurchases     (sheet, fileDate, tenantId, uploadBatch, uploadedBy);
                case MOTHAN         -> parseMothan        (sheet, fileDate, tenantId, uploadBatch, uploadedBy);
                default -> fail(forcedType, fileDate, "نوع ملف غير معروف: " + forcedType);
            };
        } catch (Exception e) {
            log.error("parseForced failed for '{}': {}", filename, e.getMessage(), e);
            String msg = e.getMessage();
            if (msg == null || msg.isBlank() || msg.contains("/tmp") || msg.length() > 150)
                msg = "تعذّر قراءة الملف — تأكد أنه بصيغة Excel .xls صحيحة";
            return fail(forcedType, LocalDate.now(), msg);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  FILE TYPE DETECTION
    // ─────────────────────────────────────────────────────────────────────────────

    FileType detectFromFilename(String filename) {
        if (filename == null) return FileType.UNKNOWN;
        // Check mothan FIRST — mothan files may also contain "مشتريات"
        if (filename.contains("موطن") || filename.toLowerCase().contains("mothan"))
            return FileType.MOTHAN;
        if (filename.contains("مشتريات") || filename.toLowerCase().contains("purch"))
            return FileType.PURCHASES;
        if (filename.contains("الموظفين") || filename.toLowerCase().contains("employee"))
            return FileType.EMPLOYEE_SALES;
        if (filename.contains("الفروع") || filename.toLowerCase().contains("branch"))
            return FileType.BRANCH_SALES;
        return FileType.UNKNOWN;
    }

    private FileType detectFromContent(Sheet sheet) {
        // Scan first 15 rows for the report title string
        StringBuilder header = new StringBuilder();
        for (int i = 0; i < 15; i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            for (Cell cell : row) {
                if (cell.getCellType() == CellType.STRING) {
                    header.append(cell.getStringCellValue()).append(" ");
                }
            }
        }
        String h = header.toString();
        if (h.contains("STATEMENT OF ACCOUNT") || h.contains("موطن"))
            return FileType.MOTHAN;
        if (h.contains("المشتريات"))
            return FileType.PURCHASES;
        if (h.contains("مندوب المبيعات") || h.contains("الموظفين"))
            return FileType.EMPLOYEE_SALES;
        if (h.contains("المبيعات") || h.contains("الفروع"))
            return FileType.BRANCH_SALES;
        return FileType.UNKNOWN;
    }

    /**
     * Extract date range from the file header.
     * Looks for "From YYYY-MM-DD To YYYY-MM-DD"; falls back to single date from filename.
     */
    public DateRange extractDateRangeFromHeader(Sheet sheet, String filename) {
        Pattern fromTo = Pattern.compile("From\\s+(\\d{4}-\\d{2}-\\d{2})\\s+To\\s+(\\d{4}-\\d{2}-\\d{2})");
        Pattern fromOnly = Pattern.compile("From\\s+(\\d{4}-\\d{2}-\\d{2})\\s+To");
        for (int i = 0; i < 8; i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            for (Cell cell : row) {
                if (cell.getCellType() != CellType.STRING) continue;
                String val = cell.getStringCellValue();
                Matcher m = fromTo.matcher(val);
                if (m.find()) {
                    try {
                        LocalDate from = LocalDate.parse(m.group(1));
                        LocalDate to   = LocalDate.parse(m.group(2));
                        return new DateRange(from, to);
                    } catch (Exception ignored) {}
                }
                Matcher m2 = fromOnly.matcher(val);
                if (m2.find()) {
                    try {
                        LocalDate from = LocalDate.parse(m2.group(1));
                        return new DateRange(from, from);
                    } catch (Exception ignored) {}
                }
            }
        }
        // Fallback: DD-MM-YYYY in filename
        Matcher fm = Pattern.compile("(\\d{2})-(\\d{2})-(\\d{4})").matcher(filename != null ? filename : "");
        if (fm.find()) {
            try {
                LocalDate d = LocalDate.of(
                    Integer.parseInt(fm.group(3)),
                    Integer.parseInt(fm.group(2)),
                    Integer.parseInt(fm.group(1)));
                return new DateRange(d, d);
            } catch (Exception ignored) {}
        }
        LocalDate today = LocalDate.now();
        return new DateRange(today, today);
    }

    private LocalDate extractDateFromHeader(Sheet sheet, String filename) {
        return extractDateRangeFromHeader(sheet, filename).from();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  BRANCH SALES PARSER
    // ─────────────────────────────────────────────────────────────────────────────

    private ParseResult parseBranchSales(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        Format fmt = detectSheetFormat(sheet);
        log.info("parseBranchSales: detected format={}", fmt);
        if (fmt == Format.B) return parseBranchSalesB(sheet, fallbackDate, tenantId, batch, by);

        Map<String, BranchSale>           salesMap  = new LinkedHashMap<>();
        Map<String, Map<String, KaratRow>> karatMap  = new LinkedHashMap<>();

        // All rows in a daily file share the same date (from filename/header)
        LocalDate date = fallbackDate;

        // Carry-forward: branch header rows ("XXXX - Name") precede data rows
        String lastBranchCode = null;
        Pattern branchPat = Pattern.compile("^(\\d{4})\\s*-");

        for (Row row : sheet) {
            // Update carry-forward from any row whose col12 is a branch header
            if (row != null) {
                String col12 = getStr(row, 12);
                Matcher bm = branchPat.matcher(col12);
                if (bm.find()) lastBranchCode = bm.group(1);
            }

            if (!isDataRow(row)) continue;

            String    branchCode = lastBranchCode;
            if (branchCode == null || branchCode.isBlank()) continue; // no branch context yet

            double    rawTotal   = getNumRaw(row, 3);    // col3 = مجموع (total SAR), neg=sale
            if (rawTotal == 0) continue;                  // skip zero-amount rows
            double    sar        = -rawTotal;             // negate: neg file value → positive SAR
            double    sign       = sar >= 0 ? 1.0 : -1.0;
            double    pureWt     = sign * Math.abs(getNumRaw(row, 6));  // col6 = الوزن النقي
            double    grossWt    = sign * Math.abs(getNumRaw(row, 10)); // col10 = بالوزن الإجمالي
            double    purity     = Math.abs(getNumRaw(row, 7));          // col7 = النقاوة
            String    karat      = mapKarat(purity);

            String key = branchCode + "|" + date;
            BranchSale bs = salesMap.computeIfAbsent(key, k -> {
                BranchSale b = new BranchSale();
                b.setTenantId(tenantId);
                b.setSaleDate(date);
                b.setBranchCode(branchCode);
                b.setBranchName(BranchMaps.getName(branchCode));
                b.setRegion(BranchMaps.getRegion(branchCode));
                b.setSourceFileName(date + "_" + branchCode);
                b.setUploadBatch(batch);
                b.setUploadedBy(by);
                b.setKaratRows(new ArrayList<>());
                return b;
            });

            bs.setTotalSarAmount(bs.getTotalSarAmount() + sar);
            bs.setNetWeight(bs.getNetWeight() + pureWt);
            bs.setGrossWeight(bs.getGrossWeight() + grossWt);
            bs.setInvoiceCount(bs.getInvoiceCount() + (int) Math.abs(getNumRaw(row, 11))); // col11 = القطع

            if (karat != null) {
                Map<String, KaratRow> km = karatMap.computeIfAbsent(key, k -> new LinkedHashMap<>());
                KaratRow kr = km.computeIfAbsent(karat, k -> {
                    KaratRow r = new KaratRow(); r.setKarat(karat); r.setPurity(purity); return r;
                });
                // accumulate absolute amounts per karat (returns tracked at BranchSale level)
                kr.setSarAmount(kr.getSarAmount() + Math.abs(sar));
                kr.setNetWeight(kr.getNetWeight() + Math.abs(pureWt));
                kr.setGrossWeight(kr.getGrossWeight() + Math.abs(grossWt));
                kr.setInvoiceCount(kr.getInvoiceCount() + 1);
            }
        }

        List<BranchSale> results = new ArrayList<>();
        for (Map.Entry<String, BranchSale> e : salesMap.entrySet()) {
            BranchSale bs = e.getValue();
            double nw = bs.getNetWeight();
            bs.setSaleRate(nw != 0 ? round4(bs.getTotalSarAmount() / nw) : 0);
            bs.setReturn(bs.getTotalSarAmount() < 0);
            Map<String, KaratRow> km = karatMap.get(e.getKey());
            if (km != null) {
                for (KaratRow kr : km.values())
                    kr.setSaleRate(kr.getNetWeight() > 0 ? kr.getSarAmount() / kr.getNetWeight() : 0);
                bs.setKaratRows(new ArrayList<>(km.values()));
            }
            results.add(bs);
        }
        log.info("parseBranchSales: scanned {} rows, found {} records, date={}", sheet.getLastRowNum(), results.size(), fallbackDate);
        if (results.isEmpty()) {
            int nullRows = 0, nonNumericC15 = 0, belowOne = 0, aggSkipped = 0, validDataRows = 0;
            for (Row row : sheet) {
                if (row == null) { nullRows++; continue; }
                Cell c15 = row.getCell(15, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                if (c15 == null) continue;
                if (c15.getCellType() != CellType.NUMERIC) { nonNumericC15++; continue; }
                if (c15.getNumericCellValue() < 1) { belowOne++; continue; }
                String desc = getStr(row, 12);
                if (desc.contains("Sub Total") || desc.contains("Grand Total")
                        ) { aggSkipped++; continue; }
                validDataRows++;
            }
            log.warn("ZERO RECORDS DIAGNOSTIC (branch-sales): totalRows={}, nullRows={}, nonNumericC15={}, belowOne={}, aggSkipped={}, validDataRows={}",
                sheet.getLastRowNum(), nullRows, nonNumericC15, belowOne, aggSkipped, validDataRows);
        }
        return new ParseResult(FileType.BRANCH_SALES, fallbackDate, results, List.of(), List.of(), List.of(), null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  EMPLOYEE SALES PARSER
    // ─────────────────────────────────────────────────────────────────────────────

    private ParseResult parseEmployeeSales(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        Format fmt = detectSheetFormat(sheet);
        log.info("parseEmployeeSales: detected format={}", fmt);
        if (fmt == Format.B) return parseEmployeeSalesB(sheet, fallbackDate, tenantId, batch, by);

        Map<String, EmployeeSale> empMap = new LinkedHashMap<>();

        LocalDate date = fallbackDate;

        // Carry-forward branch code (branch header rows precede employee data rows)
        String lastBranchCode = null;
        Pattern branchPat = Pattern.compile("^(\\d{4})\\s*-");

        for (Row row : sheet) {
            if (row != null) {
                String col12 = getStr(row, 12);
                Matcher bm = branchPat.matcher(col12);
                if (bm.find()) lastBranchCode = bm.group(1);
            }

            if (!isDataRow(row)) continue;

            String    branchCode = lastBranchCode;
            if (branchCode == null || branchCode.isBlank()) continue;

            String    empIdStr   = getStr(row, 13);  // col13 = الرمز (employee ID)
            if (empIdStr.isBlank() || empIdStr.equals("0")) continue;
            String    empName    = getStr(row, 12);  // col12 = وصف (employee name)
            double    rawTotal   = getNumRaw(row, 3);  // col3 = مجموع (total SAR)
            if (rawTotal == 0) continue;
            double    sar        = -rawTotal;
            double    sign       = sar >= 0 ? 1.0 : -1.0;
            double    pureWt     = sign * Math.abs(getNumRaw(row, 6));  // col6 = الوزن النقي
            double    grossWt    = sign * Math.abs(getNumRaw(row, 10)); // col10 = بالوزن الإجمالي

            String key = empIdStr + "|" + branchCode + "|" + date;
            EmployeeSale es = empMap.computeIfAbsent(key, k -> {
                EmployeeSale e2 = new EmployeeSale();
                e2.setTenantId(tenantId);
                e2.setSaleDate(date);
                e2.setBranchCode(branchCode);
                e2.setBranchName(BranchMaps.getName(branchCode));
                e2.setRegion(BranchMaps.getRegion(branchCode));
                e2.setEmployeeId(empIdStr);
                e2.setEmployeeName(empName);
                e2.setSourceFileName(date + "_" + empIdStr);
                e2.setUploadBatch(batch);
                e2.setUploadedBy(by);
                return e2;
            });

            es.setTotalSarAmount(es.getTotalSarAmount() + sar);
            es.setNetWeight(es.getNetWeight() + pureWt);
            es.setGrossWeight(es.getGrossWeight() + grossWt);
            es.setInvoiceCount(es.getInvoiceCount() + (int) Math.abs(getNumRaw(row, 11)));
        }

        List<EmployeeSale> results = new ArrayList<>(empMap.values());
        for (EmployeeSale es : results) {
            double nw = es.getNetWeight();
            es.setSaleRate(nw != 0 ? round4(es.getTotalSarAmount() / nw) : 0);
            es.setReturn(es.getTotalSarAmount() < 0);
        }
        log.info("parseEmployeeSales: scanned {} rows, found {} records, date={}", sheet.getLastRowNum(), results.size(), fallbackDate);
        if (results.isEmpty()) {
            int nullRows = 0, nonNumericC15 = 0, belowOne = 0, aggSkipped = 0, validDataRows = 0;
            for (Row row : sheet) {
                if (row == null) { nullRows++; continue; }
                Cell c15 = row.getCell(15, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                if (c15 == null) continue;
                if (c15.getCellType() != CellType.NUMERIC) { nonNumericC15++; continue; }
                if (c15.getNumericCellValue() < 1) { belowOne++; continue; }
                String desc = getStr(row, 12);
                if (desc.contains("Sub Total") || desc.contains("Grand Total")
                        ) { aggSkipped++; continue; }
                validDataRows++;
            }
            log.warn("ZERO RECORDS DIAGNOSTIC (employee-sales): totalRows={}, nullRows={}, nonNumericC15={}, belowOne={}, aggSkipped={}, validDataRows={}",
                sheet.getLastRowNum(), nullRows, nonNumericC15, belowOne, aggSkipped, validDataRows);
        }
        return new ParseResult(FileType.EMPLOYEE_SALES, fallbackDate, List.of(), List.of(), results, List.of(), null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  PURCHASES PARSER
    // ─────────────────────────────────────────────────────────────────────────────

    private ParseResult parsePurchases(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        Format fmt = detectSheetFormat(sheet);
        log.info("parsePurchases: detected format={}", fmt);
        if (fmt == Format.B) return parsePurchasesB(sheet, fallbackDate, tenantId, batch, by);

        Map<String, BranchPurchase> purchMap = new LinkedHashMap<>();

        LocalDate date = fallbackDate;

        // Carry-forward branch from header rows
        String lastBranchCode = null;
        Pattern branchPat = Pattern.compile("^(\\d{4})\\s*-");

        for (Row row : sheet) {
            if (row != null) {
                String col12 = getStr(row, 12);
                Matcher bm = branchPat.matcher(col12);
                if (bm.find()) lastBranchCode = bm.group(1);
            }

            if (!isDataRow(row)) continue;

            String    branchCode = lastBranchCode;
            if (branchCode == null || branchCode.isBlank()) continue;
            double    sar        = Math.abs(getNumRaw(row, 3));   // col3 = مجموع (always positive for purchases)
            double    pureWt     = Math.abs(getNumRaw(row, 6));   // col6 = الوزن النقي
            double    grossWt    = Math.abs(getNumRaw(row, 10));  // col10 = بالوزن الإجمالي
            int       pieces     = (int) Math.abs(getNum(row, 11)); // col11 = القطع
            double    purity     = Math.abs(getNumRaw(row, 7));    // col7 = النقاوة
            String    karat      = mapKarat(purity);

            String key = branchCode + "|" + date;
            BranchPurchase bp = purchMap.computeIfAbsent(key, k -> {
                BranchPurchase b = new BranchPurchase();
                b.setTenantId(tenantId);
                b.setPurchaseDate(date);
                b.setBranchCode(branchCode);
                b.setBranchName(BranchMaps.getName(branchCode));
                b.setRegion(BranchMaps.getRegion(branchCode));
                b.setSourceFileName(date + "_" + branchCode);
                b.setUploadBatch(batch);
                b.setUploadedBy(by);
                return b;
            });

            bp.setTotalSarAmount(bp.getTotalSarAmount() + sar);
            bp.setNetWeight(bp.getNetWeight() + pureWt);
            bp.setGrossWeight(bp.getGrossWeight() + grossWt);
            bp.setInvoiceCount(bp.getInvoiceCount() + pieces);
        }

        List<BranchPurchase> results = new ArrayList<>(purchMap.values());
        for (BranchPurchase bp : results) {
            double nw = bp.getNetWeight();
            bp.setPurchaseRate(nw > 0 ? round4(bp.getTotalSarAmount() / nw) : 0);
        }
        log.info("parsePurchases: scanned {} rows, found {} records, date={}", sheet.getLastRowNum(), results.size(), fallbackDate);
        if (results.isEmpty()) {
            int nullRows = 0, nonNumericC15 = 0, belowOne = 0, aggSkipped = 0, validDataRows = 0;
            for (Row row : sheet) {
                if (row == null) { nullRows++; continue; }
                Cell c15 = row.getCell(15, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                if (c15 == null) continue;
                if (c15.getCellType() != CellType.NUMERIC) { nonNumericC15++; continue; }
                if (c15.getNumericCellValue() < 1) { belowOne++; continue; }
                String desc = getStr(row, 12);
                if (desc.contains("Sub Total") || desc.contains("Grand Total")
                        ) { aggSkipped++; continue; }
                validDataRows++;
            }
            log.warn("ZERO RECORDS DIAGNOSTIC (purchases): totalRows={}, nullRows={}, nonNumericC15={}, belowOne={}, aggSkipped={}, validDataRows={}",
                sheet.getLastRowNum(), nullRows, nonNumericC15, belowOne, aggSkipped, validDataRows);
        }
        return new ParseResult(FileType.PURCHASES, fallbackDate, List.of(), results, List.of(), List.of(), null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  MOTHAN (STATEMENT OF ACCOUNT) PARSER
    // ─────────────────────────────────────────────────────────────────────────────

    private ParseResult parseMothan(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        List<MothanTransaction> results = new ArrayList<>();

        // Patterns to extract data from description strings — handle both "وزن ( X )" and "وزن X" formats
        Pattern wtPat   = Pattern.compile("وزن\\s*(?:\\(\\s*)?([\\d.,]+)(?:\\s*\\))?\\s*(?:جرام)?");
        Pattern amtPat  = Pattern.compile("(?:بمبلغ|مبلغ)\\s*(?:\\(\\s*)?([\\d,]+(?:\\.[\\d]+)?)(?:\\s*\\))?");
        Pattern ratePat = Pattern.compile("(?:معدل|سعر\\s*الجرام)\\s*(?:\\(\\s*)?([\\d.,]+)(?:\\s*\\))?");
        Pattern datePat = Pattern.compile("(\\d{2})-(\\d{2})-(\\d{4})");
        Pattern branch4 = Pattern.compile("^\\d{4}$");
        Pattern docRef  = Pattern.compile("^[A-Z]{2,}[\\-/]\\d+|^\\d{6,}$");

        String currentBranch = null;
        String currentDocRef = null;
        LocalDate currentDate = fallbackDate;
        int seq = 0;

        for (Row row : sheet) {
            if (row == null) continue;

            // Scan each cell in the row
            String description = null;
            String cellBranch  = null;
            String cellDocRef  = null;
            LocalDate cellDate = null;

            for (Cell cell : row) {
                if (cell == null) continue;
                CellType ct = cell.getCellType();

                if (ct == CellType.STRING) {
                    String val = cell.getStringCellValue().trim();
                    if (val.isEmpty()) continue;

                    // Branch code?
                    if (branch4.matcher(val).matches()) {
                        cellBranch = val;
                    }
                    // Doc ref?
                    else if (docRef.matcher(val).matches()) {
                        cellDocRef = val;
                    }
                    // Date string DD-MM-YYYY ?
                    else {
                        Matcher dm = datePat.matcher(val);
                        if (dm.find()) {
                            try {
                                cellDate = LocalDate.of(
                                    Integer.parseInt(dm.group(3)),
                                    Integer.parseInt(dm.group(2)),
                                    Integer.parseInt(dm.group(1)));
                            } catch (Exception ignored) {}
                        }
                    }
                    // Description with gold data?
                    if (val.contains("وزن") || val.contains("بمبلغ") ||
                        val.contains("تسكير") || val.contains("شراء")) {
                        description = val;
                    }
                } else if (ct == CellType.NUMERIC) {
                    double v = cell.getNumericCellValue();
                    // Excel serial date in mothan?
                    if (v > 40000 && v < 60000 && cellDate == null) {
                        cellDate = parseSerialDate(v, fallbackDate);
                    }
                }
            }

            // Update running context
            if (cellBranch != null)  currentBranch = cellBranch;
            if (cellDocRef != null)  currentDocRef = cellDocRef;
            if (cellDate   != null)  currentDate   = cellDate;

            // Build a transaction when this row has a branch code and gold data in description.
            // Row must have its own branch code (cellBranch != null) to avoid balance-summary rows.
            if (description != null && cellBranch != null) {
                Matcher wm  = wtPat.matcher(description);
                Matcher am  = amtPat.matcher(description);
                Matcher rm  = ratePat.matcher(description);
                boolean hasWt   = wm.find();
                boolean hasAmt  = am.find();
                boolean hasRate = rm.find();
                if (hasWt) {
                    try {
                        double weight = Double.parseDouble(wm.group(1).replace(",",""));
                        double rate   = hasRate ? Double.parseDouble(rm.group(1).replace(",","")) : 0;
                        // amount from description; fallback: weight × rate
                        double amount = 0;
                        if (hasAmt) {
                            double raw = Double.parseDouble(am.group(1).replace(",",""));
                            // sanity check: if rate is known, amount should be ≈ weight × rate (±30%)
                            if (rate > 0 && raw < weight * rate * 0.5) {
                                amount = weight * rate; // use calculated amount
                            } else {
                                amount = raw;
                            }
                        } else if (rate > 0) {
                            amount = weight * rate;
                        }
                        if (weight > 0 && amount > 500) { // filter noise (< 500 SAR = not real gold purchase)
                            MothanTransaction mt = new MothanTransaction();
                            mt.setTenantId(tenantId);
                            mt.setTransactionDate(currentDate);
                            mt.setBranchCode(currentBranch);
                            mt.setBranchName(BranchMaps.getName(currentBranch));
                            mt.setDocReference(currentDocRef != null ? currentDocRef : currentDate + "-" + (++seq));
                            mt.setDescription(description.length() > 250 ? description.substring(0, 250) : description);
                            mt.setCreditSar(amount);
                            mt.setGoldWeightGrams(weight);
                            mt.setRunningBalance(rate); // store rate in runningBalance for now
                            mt.setSourceFileName(currentDate + "_" + currentBranch + "_" + mt.getDocReference());
                            mt.setUploadBatch(batch);
                            mt.setUploadedBy(by);
                            results.add(mt);
                        }
                    } catch (Exception ignored) {}
                }
            }
        }
        log.info("Mothan: {} records", results.size());
        return new ParseResult(FileType.MOTHAN, fallbackDate, List.of(), List.of(), List.of(), results, null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  FORMAT B — TRANSACTION-LEVEL PARSERS
    //
    //  Format B column layout (cols 0-15):
    //   Col  0  Sl. #              — ★ ROW FILTER: integer >= 1 ★
    //   Col  1  الرمز              — branch code (4-digit, stored as numeric "1404")
    //   Col  2  CODE1              — invoice reference
    //   Col  4  CODE3              — invoice reference (duplicate)
    //   Col  5  وصف                — description (often blank)
    //   Col  6  تاريخ السند        — ★ DATE as Excel serial (e.g. 46082 = 2026-02-28) ★
    //   Col  7  القطع              — invoice/piece count (negative = return)
    //   Col  8  بالوزن الإجمالي   — gross weight
    //   Col 10  الوزن الصافي       — net weight
    //   Col 11  النقاوة            — purity ratio (0.875=21K, 1.0=24K)
    //   Col 12  الوزن النقي        — ★ PURE WEIGHT (negative = return) ★
    //   Col 13  قيمة المعادن       — metal value SAR
    //   Col 14  Mkg. Stn. Kun. Chgs — making charges SAR
    //   Col 15  مجموع              — ★ TOTAL SAR (positive = sale, negative = return) ★
    // ─────────────────────────────────────────────────────────────────────────────

    /** Report format: A = summary (Sl.# in col15), B = transaction-level (Sl.# in col0). */
    private enum Format { A, B }

    /**
     * Detect report format by scanning header rows.
     * Format B: col0 header starts with "Sl"
     * Format A: col15 header starts with "Sl"  (default)
     */
    private Format detectSheetFormat(Sheet sheet) {
        for (int i = 0; i < 20; i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            String c0  = getStr(row, 0).trim();
            String c15 = getStr(row, 15).trim();
            if (c0.startsWith("Sl"))  return Format.B;
            if (c15.startsWith("Sl")) return Format.A;
        }
        return Format.A;
    }

    /** Format B data row: col0 is a numeric integer >= 1 (Sl.#). */
    private boolean isDataRowB(Row row) {
        if (row == null) return false;
        Cell c0 = row.getCell(0, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        if (c0 == null || c0.getCellType() != CellType.NUMERIC) return false;
        double v = c0.getNumericCellValue();
        return v >= 1 && v == Math.floor(v);
    }

    private ParseResult parseBranchSalesB(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        Map<String, BranchSale>            salesMap = new LinkedHashMap<>();
        Map<String, Map<String, KaratRow>> karatMap = new LinkedHashMap<>();

        for (Row row : sheet) {
            if (!isDataRowB(row)) continue;

            String branchCode = getStr(row, 1);             // col1 = branch code
            if (branchCode.isBlank()) continue;

            double serial  = getNumRaw(row, 6);              // col6 = date (Excel serial)
            final LocalDate rowDate = parseSerialDate(serial, fallbackDate);

            double rawTotal = getNumRaw(row, 15);            // col15 = total SAR (neg=sale, like Format A col3)
            if (rawTotal == 0) continue;
            double sar    = -rawTotal;                        // negate: neg file value → positive SAR for sales
            double sign   = sar >= 0 ? 1.0 : -1.0;

            double pureWt  = sign * Math.abs(getNumRaw(row, 12)); // col12 = pure weight
            double grossWt = sign * Math.abs(getNumRaw(row, 8));  // col8  = gross weight
            double purity  = Math.abs(getNumRaw(row, 11));         // col11 = purity ratio
            int    pieces  = (int) Math.abs(getNumRaw(row, 7));    // col7 = invoice count
            String karat   = mapKarat(purity);

            String key = branchCode + "|" + rowDate;
            BranchSale bs = salesMap.computeIfAbsent(key, k -> {
                BranchSale b = new BranchSale();
                b.setTenantId(tenantId);
                b.setSaleDate(rowDate);
                b.setBranchCode(branchCode);
                b.setBranchName(BranchMaps.getName(branchCode));
                b.setRegion(BranchMaps.getRegion(branchCode));
                b.setSourceFileName(rowDate + "_" + branchCode);
                b.setUploadBatch(batch);
                b.setUploadedBy(by);
                b.setKaratRows(new ArrayList<>());
                return b;
            });

            bs.setTotalSarAmount(bs.getTotalSarAmount() + sar);
            bs.setNetWeight(bs.getNetWeight() + pureWt);
            bs.setGrossWeight(bs.getGrossWeight() + grossWt);
            bs.setInvoiceCount(bs.getInvoiceCount() + pieces);

            if (karat != null) {
                Map<String, KaratRow> km = karatMap.computeIfAbsent(key, k -> new LinkedHashMap<>());
                KaratRow kr = km.computeIfAbsent(karat, k -> {
                    KaratRow r = new KaratRow(); r.setKarat(karat); r.setPurity(purity); return r;
                });
                kr.setSarAmount(kr.getSarAmount() + Math.abs(sar));
                kr.setNetWeight(kr.getNetWeight() + Math.abs(pureWt));
                kr.setGrossWeight(kr.getGrossWeight() + Math.abs(grossWt));
                kr.setInvoiceCount(kr.getInvoiceCount() + 1);
            }
        }

        List<BranchSale> results = new ArrayList<>();
        for (Map.Entry<String, BranchSale> e : salesMap.entrySet()) {
            BranchSale bs = e.getValue();
            double nw = bs.getNetWeight();
            bs.setSaleRate(nw != 0 ? round4(bs.getTotalSarAmount() / nw) : 0);
            bs.setReturn(bs.getTotalSarAmount() < 0);
            Map<String, KaratRow> km = karatMap.get(e.getKey());
            if (km != null) {
                for (KaratRow kr : km.values())
                    kr.setSaleRate(kr.getNetWeight() > 0 ? kr.getSarAmount() / kr.getNetWeight() : 0);
                bs.setKaratRows(new ArrayList<>(km.values()));
            }
            results.add(bs);
        }
        log.info("parseBranchSalesB: {} records from {} rows, date range: {}–{}",
            results.size(), sheet.getLastRowNum(),
            results.stream().map(BranchSale::getSaleDate).min(LocalDate::compareTo).orElse(null),
            results.stream().map(BranchSale::getSaleDate).max(LocalDate::compareTo).orElse(null));
        return new ParseResult(FileType.BRANCH_SALES, fallbackDate, results, List.of(), List.of(), List.of(), null);
    }

    private ParseResult parseEmployeeSalesB(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        // Format B employee sales: same column layout as branch sales.
        // Employee ID is taken from col2 (invoice CODE1 ref) if it looks like a numeric ID,
        // otherwise we fall back to "BRANCH_" + branchCode so records are still saved.
        Map<String, EmployeeSale> empMap = new LinkedHashMap<>();

        for (Row row : sheet) {
            if (!isDataRowB(row)) continue;

            String branchCode = getStr(row, 1);
            if (branchCode.isBlank()) continue;

            double serial = getNumRaw(row, 6);
            final LocalDate rowDate = parseSerialDate(serial, fallbackDate);

            double rawTotal = getNumRaw(row, 15);       // neg=sale, same as Format A
            if (rawTotal == 0) continue;
            double sar  = -rawTotal;                     // negate → positive for sales
            double sign = sar >= 0 ? 1.0 : -1.0;

            double pureWt  = sign * Math.abs(getNumRaw(row, 12));
            double grossWt = sign * Math.abs(getNumRaw(row, 8));
            int    pieces  = (int) Math.abs(getNumRaw(row, 7));

            // Try to extract employee ID: col3 numeric (if integer, treat as employee ID)
            String empId   = "";
            double c3v = getNumRaw(row, 3);
            if (c3v >= 1 && c3v == Math.floor(c3v)) empId = String.valueOf((long) c3v);
            if (empId.isBlank()) {
                String c2s = getStr(row, 2);
                if (!c2s.isBlank() && c2s.matches("\\d+")) empId = c2s;
            }
            if (empId.isBlank()) empId = "BR_" + branchCode;

            String empName = getStr(row, 5);
            if (empName.isBlank()) empName = empId;

            final String finalBranchCode = branchCode;
            final String finalEmpId      = empId;
            final String finalEmpName    = empName;

            String key = finalEmpId + "|" + finalBranchCode + "|" + rowDate;
            EmployeeSale es = empMap.computeIfAbsent(key, k -> {
                EmployeeSale e2 = new EmployeeSale();
                e2.setTenantId(tenantId);
                e2.setSaleDate(rowDate);
                e2.setBranchCode(finalBranchCode);
                e2.setBranchName(BranchMaps.getName(finalBranchCode));
                e2.setRegion(BranchMaps.getRegion(finalBranchCode));
                e2.setEmployeeId(finalEmpId);
                e2.setEmployeeName(finalEmpName);
                e2.setSourceFileName(rowDate + "_" + finalEmpId);
                e2.setUploadBatch(batch);
                e2.setUploadedBy(by);
                return e2;
            });

            es.setTotalSarAmount(es.getTotalSarAmount() + sar);
            es.setNetWeight(es.getNetWeight() + pureWt);
            es.setGrossWeight(es.getGrossWeight() + grossWt);
            es.setInvoiceCount(es.getInvoiceCount() + pieces);
        }

        List<EmployeeSale> results = new ArrayList<>(empMap.values());
        for (EmployeeSale es : results) {
            double nw = es.getNetWeight();
            es.setSaleRate(nw != 0 ? round4(es.getTotalSarAmount() / nw) : 0);
            es.setReturn(es.getTotalSarAmount() < 0);
        }
        log.info("parseEmployeeSalesB: {} records from {} rows", results.size(), sheet.getLastRowNum());
        return new ParseResult(FileType.EMPLOYEE_SALES, fallbackDate, List.of(), List.of(), results, List.of(), null);
    }

    private ParseResult parsePurchasesB(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        Map<String, BranchPurchase> purchMap = new LinkedHashMap<>();

        for (Row row : sheet) {
            if (!isDataRowB(row)) continue;

            String branchCode = getStr(row, 1);
            if (branchCode.isBlank()) continue;

            double serial = getNumRaw(row, 6);
            final LocalDate rowDate = parseSerialDate(serial, fallbackDate);

            double sar    = Math.abs(getNumRaw(row, 15));
            if (sar == 0) continue;

            double pureWt  = Math.abs(getNumRaw(row, 12));
            double grossWt = Math.abs(getNumRaw(row, 8));
            int    pieces  = (int) Math.abs(getNumRaw(row, 7));
            double purity  = Math.abs(getNumRaw(row, 11));
            String karat   = mapKarat(purity);

            String key = branchCode + "|" + rowDate;
            BranchPurchase bp = purchMap.computeIfAbsent(key, k -> {
                BranchPurchase b = new BranchPurchase();
                b.setTenantId(tenantId);
                b.setPurchaseDate(rowDate);
                b.setBranchCode(branchCode);
                b.setBranchName(BranchMaps.getName(branchCode));
                b.setRegion(BranchMaps.getRegion(branchCode));
                b.setSourceFileName(rowDate + "_" + branchCode);
                b.setUploadBatch(batch);
                b.setUploadedBy(by);
                return b;
            });

            bp.setTotalSarAmount(bp.getTotalSarAmount() + sar);
            bp.setNetWeight(bp.getNetWeight() + pureWt);
            bp.setGrossWeight(bp.getGrossWeight() + grossWt);
            bp.setInvoiceCount(bp.getInvoiceCount() + pieces);
        }

        List<BranchPurchase> results = new ArrayList<>(purchMap.values());
        for (BranchPurchase bp : results) {
            double nw = bp.getNetWeight();
            bp.setPurchaseRate(nw > 0 ? round4(bp.getTotalSarAmount() / nw) : 0);
        }
        log.info("parsePurchasesB: {} records from {} rows", results.size(), sheet.getLastRowNum());
        return new ParseResult(FileType.PURCHASES, fallbackDate, List.of(), results, List.of(), List.of(), null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  ROW VALIDATION
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * A row is a data row if:
     *  1. col15 = Sl.# numeric integer >= 1
     *  2. col12 (description) does NOT contain aggregate-row keywords
     *     (Sub Total / Grand Total)
     *
     * Branch header rows ("XXXX - Name") and Sub Total rows normally have empty col15,
     * but some aggregate ERP exports incorrectly place a numeric in col15 for total rows.
     */
    private boolean isDataRow(Row row) {
        if (row == null) return false;
        Cell c15 = row.getCell(15, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        if (c15 == null) return false;
        if (c15.getCellType() != CellType.NUMERIC) return false;
        if (c15.getNumericCellValue() < 1) return false;
        // Guard: skip Sub Total / Grand Total rows that occasionally carry a numeric col15
        // in aggregate ERP exports. Only check English patterns — Arabic words like
        // "الإجمالي" also appear inside valid karat/description cells and must not be blocked.
        String desc = getStr(row, 12);
        if (desc.startsWith("Sub Total") || desc.startsWith("Grand Total")) {
            return false;
        }
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────────────────────────────────────

    /** Excel serial date → LocalDate. Epoch = 1899-12-30 (Excel's leap-year bug). */
    private LocalDate parseSerialDate(double serial, LocalDate fallback) {
        if (serial < 40000 || serial > 60000) return fallback;
        try { return LocalDate.of(1899, 12, 30).plusDays((long) serial); }
        catch (Exception e) { return fallback; }
    }

    /** Raw numeric value, sign preserved. */
    private double getNumRaw(Row row, int col) {
        Cell cell = row.getCell(col, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        if (cell == null) return 0.0;
        if (cell.getCellType() == CellType.NUMERIC) return cell.getNumericCellValue();
        if (cell.getCellType() == CellType.STRING) {
            try { return Double.parseDouble(cell.getStringCellValue().replace(",","").trim()); }
            catch (Exception ignored) {}
        }
        return 0.0;
    }

    /** Absolute numeric value. */
    private double getNum(Row row, int col) { return Math.abs(getNumRaw(row, col)); }

    /** String value. Numeric cells converted to integer string ("2511"). */
    private String getStr(Row row, int col) {
        Cell cell = row.getCell(col, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        if (cell == null) return "";
        if (cell.getCellType() == CellType.STRING) return cell.getStringCellValue().trim();
        if (cell.getCellType() == CellType.NUMERIC) {
            double v = cell.getNumericCellValue();
            return v == Math.floor(v) ? String.valueOf((long) v) : String.valueOf(v);
        }
        return "";
    }

    /**
     * Map purity ratio to karat label using range matching
     * (tolerates minor floating-point variations like 0.91600000001).
     */
    private String mapKarat(double purity) {
        if (purity >= 0.745 && purity <= 0.755) return "18";
        if (purity >= 0.870 && purity <= 0.880) return "21";
        if (purity >= 0.912 && purity <= 0.920) return "22";
        if (purity >= 0.995 && purity <= 1.005) return "24";
        return null;
    }

    private double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }

    private ParseResult fail(FileType type, LocalDate date, String msg) {
        return new ParseResult(type, date, List.of(), List.of(), List.of(), List.of(), msg);
    }
}
