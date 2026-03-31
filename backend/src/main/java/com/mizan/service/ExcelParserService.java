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
 * VERIFIED COLUMN MAP — cols 0-15 — identical for Branch Sales, Employee Sales, Purchases:
 *
 *   Col  0  Sl.#               — sequential integer  (ROW FILTER: >= 1)
 *   Col  1  Branch code        — 4-digit string       (ROW FILTER: matches \d{4})
 *   Col  2  CODE1              — transaction ref
 *   Col  3  CODE2 / EmployeeId — numeric integer (employee files only)
 *   Col  4  CODE3 / EmployeeId — same as col 3 (employee files only)
 *   Col  5  وصف / Name         — employee name string (employee files only)
 *   Col  6  تاريخ السند        — Excel serial date   (ROW FILTER: > 40000)
 *   Col  7  القطع              — invoice/piece count (negative = sale, positive = purchase)
 *   Col  8  بالوزن الإجمالي   — gross weight incl. stones (display only)
 *   Col  9  وزن الحجر          — stone weight (display only)
 *   Col 10  الوزن الصافي       — net weight excl. stones (display only)
 *   Col 11  النقاوة            — purity ratio: 0.75=18K, 0.875=21K, 0.916=22K, 1.0=24K
 *   Col 12  الوزن النقي        — ★ PURE NET WEIGHT = gross×purity = RATE DENOMINATOR ★
 *   Col 13  قيمة المعادن       — metal value SAR (excl. making charges)
 *   Col 14  Mkg.Chgs           — making charges SAR
 *   Col 15  مجموع              — ★ TOTAL SAR = col13 + col14 ★
 *
 * SIGN convention (sales / employee sales):
 *   col15 negative in file → normal sale   → negate → positive SAR
 *   col15 positive in file → return/مرتجع → negate → negative SAR
 *   col12 always read as Math.abs(), sign follows SAR sign
 *
 * SIGN convention (purchases):
 *   col15 always positive → Math.abs()
 *   col12 always positive → Math.abs()
 *
 * EXCEL SERIAL DATE:  LocalDate.of(1899, 12, 30).plusDays((long) serial)
 *   Excel epoch = 1899-12-30 (not 1900-01-01 — Excel leap year bug)
 *   Example: serial 46082 → 2026-03-01
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

    private LocalDate extractDateFromHeader(Sheet sheet, String filename) {
        // Try: header contains "From YYYY-MM-DD To YYYY-MM-DD"
        Pattern fromTo = Pattern.compile("From\\s+(\\d{4}-\\d{2}-\\d{2})\\s+To");
        for (int i = 0; i < 8; i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            for (Cell cell : row) {
                if (cell.getCellType() != CellType.STRING) continue;
                Matcher m = fromTo.matcher(cell.getStringCellValue());
                if (m.find()) {
                    try { return LocalDate.parse(m.group(1)); } catch (Exception ignored) {}
                }
            }
        }
        // Fallback: DD-MM-YYYY in filename
        Matcher fm = Pattern.compile("(\\d{2})-(\\d{2})-(\\d{4})").matcher(filename != null ? filename : "");
        if (fm.find()) {
            try {
                return LocalDate.of(
                    Integer.parseInt(fm.group(3)),
                    Integer.parseInt(fm.group(2)),
                    Integer.parseInt(fm.group(1)));
            } catch (Exception ignored) {}
        }
        return LocalDate.now();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  BRANCH SALES PARSER
    // ─────────────────────────────────────────────────────────────────────────────

    private ParseResult parseBranchSales(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        Map<String, BranchSale>           salesMap  = new LinkedHashMap<>();
        Map<String, Map<String, KaratRow>> karatMap  = new LinkedHashMap<>();

        for (Row row : sheet) {
            if (!isDataRow(row)) continue;

            String    branchCode = getStr(row, 1);
            LocalDate date       = parseSerialDate(getNum(row, 6), fallbackDate);
            double    rawTotal   = getNumRaw(row, 15);   // signed: neg=sale, pos=return
            double    sar        = -rawTotal;             // negate
            double    sign       = sar >= 0 ? 1.0 : -1.0;
            double    pureWt     = sign * Math.abs(getNumRaw(row, 12)); // rate denominator
            double    grossWt    = sign * Math.abs(getNumRaw(row, 10)); // display
            int       pieces     = (int)(sign * Math.abs(getNum(row, 7)));
            double    purity     = Math.abs(getNumRaw(row, 11));
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
            bs.setInvoiceCount(bs.getInvoiceCount() + pieces);

            if (karat != null) {
                Map<String, KaratRow> km = karatMap.computeIfAbsent(key, k -> new LinkedHashMap<>());
                KaratRow kr = km.computeIfAbsent(karat, k -> {
                    KaratRow r = new KaratRow(); r.setKarat(karat); r.setPurity(purity); return r;
                });
                // accumulate absolute amounts per karat (returns tracked at BranchSale level)
                kr.setSarAmount(kr.getSarAmount() + Math.abs(sar));
                kr.setNetWeight(kr.getNetWeight() + Math.abs(pureWt));
                kr.setGrossWeight(kr.getGrossWeight() + Math.abs(grossWt));
                kr.setInvoiceCount(kr.getInvoiceCount() + Math.abs(pieces));
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
        log.info("Branch sales: {} records", results.size());
        return new ParseResult(FileType.BRANCH_SALES, fallbackDate, results, List.of(), List.of(), List.of(), null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  EMPLOYEE SALES PARSER
    // ─────────────────────────────────────────────────────────────────────────────

    private ParseResult parseEmployeeSales(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        Map<String, EmployeeSale> empMap = new LinkedHashMap<>();

        for (Row row : sheet) {
            if (!isDataRow(row)) continue;

            String    branchCode = getStr(row, 1);
            String    empIdStr   = getStr(row, 3);   // col3 = Employee ID (numeric cell)
            if (empIdStr.isBlank() || empIdStr.equals("0")) continue;
            String    empName    = getStr(row, 5);   // col5 = Employee name
            LocalDate date       = parseSerialDate(getNum(row, 6), fallbackDate);
            double    rawTotal   = getNumRaw(row, 15);
            double    sar        = -rawTotal;
            double    sign       = sar >= 0 ? 1.0 : -1.0;
            double    pureWt     = sign * Math.abs(getNumRaw(row, 12));
            double    grossWt    = sign * Math.abs(getNumRaw(row, 10));
            int       pieces     = (int)(sign * Math.abs(getNum(row, 7)));

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
            es.setInvoiceCount(es.getInvoiceCount() + pieces);
        }

        List<EmployeeSale> results = new ArrayList<>(empMap.values());
        for (EmployeeSale es : results) {
            double nw = es.getNetWeight();
            es.setSaleRate(nw != 0 ? round4(es.getTotalSarAmount() / nw) : 0);
            es.setReturn(es.getTotalSarAmount() < 0);
        }
        log.info("Employee sales: {} records", results.size());
        return new ParseResult(FileType.EMPLOYEE_SALES, fallbackDate, List.of(), List.of(), results, List.of(), null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  PURCHASES PARSER
    // ─────────────────────────────────────────────────────────────────────────────

    private ParseResult parsePurchases(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        Map<String, BranchPurchase> purchMap = new LinkedHashMap<>();

        for (Row row : sheet) {
            if (!isDataRow(row)) continue;

            String    branchCode = getStr(row, 1);
            LocalDate date       = parseSerialDate(getNum(row, 6), fallbackDate);
            double    sar        = Math.abs(getNumRaw(row, 15));  // purchases always positive
            double    pureWt     = Math.abs(getNumRaw(row, 12));
            double    grossWt    = Math.abs(getNumRaw(row, 10));
            int       pieces     = (int) Math.abs(getNum(row, 7));
            double    purity     = Math.abs(getNumRaw(row, 11));
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
        log.info("Purchases: {} records", results.size());
        return new ParseResult(FileType.PURCHASES, fallbackDate, List.of(), results, List.of(), List.of(), null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  MOTHAN (STATEMENT OF ACCOUNT) PARSER
    // ─────────────────────────────────────────────────────────────────────────────

    private ParseResult parseMothan(Sheet sheet, LocalDate fallbackDate,
            String tenantId, String batch, String by) {

        List<MothanTransaction> results = new ArrayList<>();

        // Patterns to extract data from description strings
        Pattern wtPat   = Pattern.compile("وزن\\s*\\(\\s*([\\d.,]+)\\s*\\)");
        Pattern amtPat  = Pattern.compile("بمبلغ\\s*\\(\\s*([\\d,]+(?:\\.[\\d]+)?)\\s*\\)");
        Pattern ratePat = Pattern.compile("معدل\\s*\\(\\s*([\\d.,]+)\\s*\\)");
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

            // Build a transaction if we have a description with weight + amount
            if (description != null && currentBranch != null) {
                Matcher wm  = wtPat.matcher(description);
                Matcher am  = amtPat.matcher(description);
                if (wm.find() && am.find()) {
                    try {
                        double weight = Double.parseDouble(wm.group(1).replace(",",""));
                        double amount = Double.parseDouble(am.group(1).replace(",",""));
                        if (weight > 0 && amount > 0) {
                            double rate = 0;
                            Matcher rm = ratePat.matcher(description);
                            if (rm.find()) {
                                try { rate = Double.parseDouble(rm.group(1).replace(",","")); }
                                catch (Exception ignored) {}
                            }
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
    //  ROW VALIDATION
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * A row is a data row if:
     *  col0 = numeric integer >= 1   (sequential row number)
     *  col1 = 4-digit string         (branch code)
     *  col6 = numeric > 40000        (Excel serial date)
     */
    private boolean isDataRow(Row row) {
        if (row == null) return false;
        Cell c0 = row.getCell(0, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        Cell c1 = row.getCell(1, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        Cell c6 = row.getCell(6, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
        if (c0 == null || c1 == null || c6 == null) return false;
        // col0: numeric integer >= 1
        if (c0.getCellType() != CellType.NUMERIC) return false;
        if (c0.getNumericCellValue() < 1) return false;
        // col1: 4-digit branch code string
        if (c1.getCellType() != CellType.STRING) return false;
        if (!c1.getStringCellValue().trim().matches("^\\d{4}$")) return false;
        // col6: Excel serial date > 40000
        if (c6.getCellType() != CellType.NUMERIC) return false;
        if (c6.getNumericCellValue() < 40000) return false;
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
