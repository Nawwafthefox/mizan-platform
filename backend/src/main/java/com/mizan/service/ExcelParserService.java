package com.mizan.service;
import com.mizan.config.BranchMaps;
import com.mizan.model.*;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.*;

@Slf4j
@Service
public class ExcelParserService {
    public enum FileType { BRANCH_SALES, EMPLOYEE_SALES, PURCHASES, MOTHAN, UNKNOWN }

    public record ParseResult(
        FileType fileType, LocalDate fileDate,
        List<BranchSale> sales, List<BranchPurchase> purchases,
        List<EmployeeSale> empSales, List<MothanTransaction> mothan,
        String error
    ) {}

    // ─── File type detection from filename ────────────────────────────────────
    public FileType detectType(String filename) {
        String f = filename.toLowerCase();
        if (f.contains("موطن") || f.contains("mothan")) return FileType.MOTHAN;
        if (f.contains("مشتريات") || f.contains("purch")) return FileType.PURCHASES;
        if (f.contains("الموظفين") || f.contains("employee")) return FileType.EMPLOYEE_SALES;
        if (f.contains("الفروع") || f.contains("branch")) return FileType.BRANCH_SALES;
        return FileType.UNKNOWN;
    }

    public LocalDate extractDate(String filename) {
        Pattern p = Pattern.compile("(\\d{2})-(\\d{2})-(\\d{4})");
        Matcher m = p.matcher(filename);
        if (m.find()) {
            try {
                return LocalDate.parse(m.group(1)+"-"+m.group(2)+"-"+m.group(3),
                    DateTimeFormatter.ofPattern("dd-MM-yyyy"));
            } catch (Exception ignored) {}
        }
        return LocalDate.now();
    }

    // ─── Main entry point ─────────────────────────────────────────────────────
    public ParseResult parse(InputStream is, String filename, String tenantId,
            String uploadBatch, String uploadedBy) {
        FileType type = detectType(filename);
        LocalDate date = extractDate(filename);
        try {
            // Read entire stream into memory first.
            // WorkbookFactory requires mark/reset support; multipart streams don't provide it.
            // Reading to byte array avoids POI creating temp files (which leak paths in errors).
            byte[] bytes = is.readAllBytes();
            try (Workbook wb = WorkbookFactory.create(new BufferedInputStream(new ByteArrayInputStream(bytes)))) {
                Sheet sheet = wb.getSheetAt(0);
                return switch (type) {
                    case BRANCH_SALES    -> parseBranchSales(sheet, date, tenantId, uploadBatch, uploadedBy, filename);
                    case PURCHASES       -> parsePurchases(sheet, date, tenantId, uploadBatch, uploadedBy, filename);
                    case EMPLOYEE_SALES  -> parseEmployeeSales(sheet, date, tenantId, uploadBatch, uploadedBy, filename);
                    case MOTHAN          -> parseMothan(sheet, date, tenantId, uploadBatch, uploadedBy, filename);
                    default -> new ParseResult(type, date, List.of(), List.of(), List.of(), List.of(), "نوع ملف غير معروف");
                };
            }
        } catch (Exception e) {
            log.error("Parse error for {}: {}", filename, e.getMessage(), e);
            String msg = e.getMessage();
            if (msg == null || msg.isBlank() || msg.contains("/tmp") || msg.contains("\\tmp") || msg.length() > 150) {
                msg = "تعذّر قراءة الملف — تأكد أن الملف بصيغة Excel صحيحة (.xls أو .xlsx)";
            }
            return new ParseResult(type, date, List.of(), List.of(), List.of(), List.of(), msg);
        }
    }

    // ─── Format router: branch sales ──────────────────────────────────────────
    private ParseResult parseBranchSales(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        if (isAggregateFormat(sheet)) {
            log.info("Detected aggregate format for {}", filename);
            return parseAggBranchSales(sheet, date, tenantId, batch, by);
        }
        return parseDailyBranchSales(sheet, date, tenantId, batch, by, filename);
    }

    // ─── Format router: purchases ─────────────────────────────────────────────
    private ParseResult parsePurchases(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        if (isAggregateFormat(sheet)) {
            log.info("Detected aggregate purchases format for {}", filename);
            return parseAggPurchases(sheet, date, tenantId, batch, by);
        }
        return parseDailyPurchases(sheet, date, tenantId, batch, by, filename);
    }

    // ─── Format router: employee sales ────────────────────────────────────────
    private ParseResult parseEmployeeSales(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        if (isAggregateFormat(sheet)) {
            log.info("Detected aggregate employee sales format for {}", filename);
            return parseAggEmployeeSales(sheet, date, tenantId, batch, by);
        }
        return parseDailyEmployeeSales(sheet, date, tenantId, batch, by, filename);
    }

    // ─── Format router: mothan ────────────────────────────────────────────────
    private ParseResult parseMothan(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        if (isAggregateFormat(sheet)) {
            log.info("Detected aggregate mothan format for {}", filename);
            return parseAggMothan(sheet, date, tenantId, batch, by);
        }
        return parseDailyMothan(sheet, date, tenantId, batch, by, filename);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // FORMAT DETECTION
    // ════════════════════════════════════════════════════════════════════════════

    private boolean isAggregateFormat(Sheet sheet) {
        int checked = 0;
        for (int i = 5; i <= Math.min(25, sheet.getLastRowNum()) && checked < 15; i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            String col0 = safeGetString(row, 0);
            String col1 = safeGetString(row, 1);
            if (col0 == null || col1 == null) { checked++; continue; }
            col0 = col0.trim(); col1 = col1.trim();
            boolean isSeqNum    = col0.matches("^\\d+$");
            boolean isBranchCode = col1.matches("^\\d{4}$");
            if (!isSeqNum || !isBranchCode) { checked++; continue; }
            // Check col6 has a date-like value
            Cell col6Cell = row.getCell(6);
            boolean hasDate = false;
            if (col6Cell != null) {
                if (col6Cell.getCellType() == CellType.NUMERIC) {
                    double v = col6Cell.getNumericCellValue();
                    hasDate = (v > 40000 && v < 60000);
                } else {
                    String s = safeGetString(row, 6);
                    if (s != null) {
                        hasDate = s.matches(".*\\d{2}/\\d{2}/\\d{4}.*")
                               || s.matches("^\\d{4}-\\d{2}-\\d{2}.*");
                    }
                }
            }
            if (hasDate) return true;
            checked++;
        }
        return false;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // AGGREGATE FORMAT PARSERS
    // ════════════════════════════════════════════════════════════════════════════

    private ParseResult parseAggBranchSales(Sheet sheet, LocalDate fallback, String tenantId,
            String batch, String by) {
        // key → BranchSale accumulator
        Map<String, BranchSale> salesMap = new LinkedHashMap<>();
        // key → karat → KaratRow accumulator
        Map<String, Map<String, KaratRow>> karatMap = new LinkedHashMap<>();

        for (Row row : sheet) {
            String col0 = safeGetString(row, 0);
            String col1 = safeGetString(row, 1);
            if (col0 == null || col1 == null) continue;
            col0 = col0.trim(); col1 = col1.trim();
            if (!col0.matches("^\\d+$") || !col1.matches("^\\d{4}$")) continue;

            String branchCode = col1;
            LocalDate txDate  = parseAggDate(row, 6, fallback);
            double rawSar     = getDoubleRaw(row, 15);
            double sar        = -rawSar;                          // negate: neg in file = sale
            double sign       = sar >= 0 ? 1.0 : -1.0;
            double netWt      = sign * Math.abs(getDoubleAbs(row, 10));
            double grossWt    = sign * Math.abs(getDoubleAbs(row, 12));
            int pieces        = (int)(sign * Math.abs(getDoubleAbs(row, 7)));
            String purity     = safeGetString(row, 11);
            String karat      = purity != null ? mapKarat(purity.trim()) : null;

            String key = branchCode + "|" + txDate.toString();
            BranchSale bs = salesMap.computeIfAbsent(key, k -> {
                BranchSale b = new BranchSale();
                b.setTenantId(tenantId);
                b.setSaleDate(txDate);
                b.setBranchCode(branchCode);
                b.setBranchName(BranchMaps.getName(branchCode));
                b.setRegion(BranchMaps.getRegion(branchCode));
                b.setTotalSarAmount(0); b.setNetWeight(0); b.setGrossWeight(0); b.setInvoiceCount(0);
                b.setKaratRows(new ArrayList<>());
                b.setSourceFileName(txDate.toString() + "_" + branchCode);
                b.setUploadBatch(batch); b.setUploadedBy(by);
                return b;
            });

            bs.setTotalSarAmount(bs.getTotalSarAmount() + sar);
            bs.setNetWeight(bs.getNetWeight() + netWt);
            bs.setGrossWeight(bs.getGrossWeight() + grossWt);
            bs.setInvoiceCount(bs.getInvoiceCount() + pieces);

            // accumulate karat
            if (karat != null) {
                Map<String, KaratRow> kMap = karatMap.computeIfAbsent(key, k -> new LinkedHashMap<>());
                KaratRow kr = kMap.computeIfAbsent(karat, k -> new KaratRow(karat, 0, 0, 0, 0, 0, 0));
                kr.setSarAmount(kr.getSarAmount() + sar);
                kr.setNetWeight(kr.getNetWeight() + netWt);
                kr.setGrossWeight(kr.getGrossWeight() + grossWt);
                kr.setInvoiceCount(kr.getInvoiceCount() + pieces);
            }
        }

        // finalise each record
        List<BranchSale> results = new ArrayList<>();
        for (Map.Entry<String, BranchSale> e : salesMap.entrySet()) {
            BranchSale bs = e.getValue();
            double nw = bs.getNetWeight();
            bs.setSaleRate(nw != 0 ? Math.round(bs.getTotalSarAmount() / nw * 10000.0) / 10000.0 : 0);
            bs.setReturn(bs.getTotalSarAmount() < 0);

            Map<String, KaratRow> kMap = karatMap.get(e.getKey());
            if (kMap != null) {
                List<KaratRow> kList = new ArrayList<>();
                for (KaratRow kr : kMap.values()) {
                    kr.setSaleRate(kr.getNetWeight() != 0 ? kr.getSarAmount() / kr.getNetWeight() : 0);
                    kList.add(kr);
                }
                bs.setKaratRows(kList);
            }
            results.add(bs);
        }
        log.info("Aggregate branch sales parsed: {} records", results.size());
        return new ParseResult(FileType.BRANCH_SALES, fallback, results, List.of(), List.of(), List.of(), null);
    }

    private ParseResult parseAggPurchases(Sheet sheet, LocalDate fallback, String tenantId,
            String batch, String by) {
        Map<String, BranchPurchase> map = new LinkedHashMap<>();

        for (Row row : sheet) {
            String col0 = safeGetString(row, 0);
            String col1 = safeGetString(row, 1);
            if (col0 == null || col1 == null) continue;
            col0 = col0.trim(); col1 = col1.trim();
            if (!col0.matches("^\\d+$") || !col1.matches("^\\d{4}$")) continue;

            String branchCode = col1;
            LocalDate txDate  = parseAggDate(row, 6, fallback);
            double sar        = Math.abs(getDoubleRaw(row, 15));
            double netWt      = Math.abs(getDoubleAbs(row, 10));
            double grossWt    = Math.abs(getDoubleAbs(row, 12));
            int pieces        = (int) Math.abs(getDoubleAbs(row, 7));

            String key = branchCode + "|" + txDate.toString();
            BranchPurchase bp = map.computeIfAbsent(key, k -> {
                BranchPurchase b = new BranchPurchase();
                b.setTenantId(tenantId);
                b.setPurchaseDate(txDate);
                b.setBranchCode(branchCode);
                b.setBranchName(BranchMaps.getName(branchCode));
                b.setRegion(BranchMaps.getRegion(branchCode));
                b.setTotalSarAmount(0); b.setNetWeight(0); b.setGrossWeight(0); b.setInvoiceCount(0);
                b.setSourceFileName(txDate.toString() + "_" + branchCode);
                b.setUploadBatch(batch); b.setUploadedBy(by);
                return b;
            });

            bp.setTotalSarAmount(bp.getTotalSarAmount() + sar);
            bp.setNetWeight(bp.getNetWeight() + netWt);
            bp.setGrossWeight(bp.getGrossWeight() + grossWt);
            bp.setInvoiceCount(bp.getInvoiceCount() + pieces);
        }

        List<BranchPurchase> results = new ArrayList<>(map.values());
        for (BranchPurchase bp : results) {
            double nw = bp.getNetWeight();
            bp.setPurchaseRate(nw > 0 ? Math.round(bp.getTotalSarAmount() / nw * 10000.0) / 10000.0 : 0);
        }
        log.info("Aggregate purchases parsed: {} records", results.size());
        return new ParseResult(FileType.PURCHASES, fallback, List.of(), results, List.of(), List.of(), null);
    }

    private ParseResult parseAggEmployeeSales(Sheet sheet, LocalDate fallback, String tenantId,
            String batch, String by) {
        // key: employeeId|branchCode|date
        Map<String, EmployeeSale> map = new LinkedHashMap<>();

        for (Row row : sheet) {
            String col0 = safeGetString(row, 0);
            String col1 = safeGetString(row, 1);
            if (col0 == null || col1 == null) continue;
            col0 = col0.trim(); col1 = col1.trim();
            if (!col0.matches("^\\d+$") || !col1.matches("^\\d{4}$")) continue;

            String branchCode = col1;
            String empId      = safeGetString(row, 3);
            String empName    = safeGetString(row, 5);
            if (empId == null || empId.isBlank() || empId.equals("0")) continue;
            empId   = empId.trim();
            empName = empName != null ? empName.trim() : "";

            LocalDate txDate = parseAggDate(row, 6, fallback);
            double rawSar    = getDoubleRaw(row, 15);
            double sar       = -rawSar;
            double sign      = sar >= 0 ? 1.0 : -1.0;
            double netWt     = sign * Math.abs(getDoubleAbs(row, 10));
            double grossWt   = sign * Math.abs(getDoubleAbs(row, 12));
            int pieces       = (int)(sign * Math.abs(getDoubleAbs(row, 7)));

            String key = empId + "|" + branchCode + "|" + txDate.toString();
            final String finalEmpId   = empId;
            final String finalEmpName = empName;
            EmployeeSale es = map.computeIfAbsent(key, k -> {
                EmployeeSale e2 = new EmployeeSale();
                e2.setTenantId(tenantId);
                e2.setSaleDate(txDate);
                e2.setBranchCode(branchCode);
                e2.setBranchName(BranchMaps.getName(branchCode));
                e2.setRegion(BranchMaps.getRegion(branchCode));
                e2.setEmployeeId(finalEmpId);
                e2.setEmployeeName(finalEmpName);
                e2.setTotalSarAmount(0); e2.setNetWeight(0); e2.setGrossWeight(0); e2.setInvoiceCount(0);
                e2.setSourceFileName(txDate.toString() + "_" + finalEmpId);
                e2.setUploadBatch(batch); e2.setUploadedBy(by);
                return e2;
            });

            es.setTotalSarAmount(es.getTotalSarAmount() + sar);
            es.setNetWeight(es.getNetWeight() + netWt);
            es.setGrossWeight(es.getGrossWeight() + grossWt);
            es.setInvoiceCount(es.getInvoiceCount() + pieces);
        }

        List<EmployeeSale> results = new ArrayList<>(map.values());
        for (EmployeeSale es : results) {
            double nw = es.getNetWeight();
            es.setSaleRate(nw != 0 ? Math.round(es.getTotalSarAmount() / nw * 10000.0) / 10000.0 : 0);
            es.setReturn(es.getTotalSarAmount() < 0);
        }
        log.info("Aggregate employee sales parsed: {} records", results.size());
        return new ParseResult(FileType.EMPLOYEE_SALES, fallback, List.of(), List.of(), results, List.of(), null);
    }

    private ParseResult parseAggMothan(Sheet sheet, LocalDate fallback, String tenantId,
            String batch, String by) {
        List<MothanTransaction> results = new ArrayList<>();
        Pattern weightPat1 = Pattern.compile("وزن\\s*\\(\\s*([\\d.]+)\\s*\\)");
        Pattern weightPat2 = Pattern.compile("([\\d.]+)\\s*جم");
        Pattern weightPat3 = Pattern.compile("weight\\s+([\\d.]+)", Pattern.CASE_INSENSITIVE);

        for (Row row : sheet) {
            String col0 = safeGetString(row, 0);
            String col1 = safeGetString(row, 1);
            if (col0 == null || col1 == null) continue;
            col0 = col0.trim(); col1 = col1.trim();
            if (!col0.matches("^\\d+$")) continue;
            // branch code may be in col1 or col2
            String branchCode = col1.matches("^\\d{3,5}$") ? col1 :
                                 safeGetStringTrimmed(row, 2);
            if (branchCode == null || branchCode.isBlank()) continue;

            LocalDate txDate    = parseAggDate(row, 6, fallback);
            String docRef       = safeGetStringTrimmed(row, 2);
            String description  = safeGetStringTrimmed(row, 3);
            if (description == null) description = safeGetStringTrimmed(row, 4);
            double credit       = Math.abs(getDoubleRaw(row, 5));
            if (credit <= 0) credit = Math.abs(getDoubleRaw(row, 15));
            // if still zero, skip
            if (credit <= 0) continue;

            double weight = extractWeight(description, weightPat1, weightPat2, weightPat3);

            MothanTransaction mt = new MothanTransaction();
            mt.setTenantId(tenantId);
            mt.setTransactionDate(txDate);
            mt.setBranchCode(branchCode);
            mt.setBranchName(BranchMaps.getName(branchCode));
            mt.setDocReference(docRef);
            mt.setDescription(description);
            mt.setCreditSar(credit);
            mt.setGoldWeightGrams(weight);
            mt.setSourceFileName(txDate.toString() + "_" + branchCode + "_" + col0);
            mt.setUploadBatch(batch); mt.setUploadedBy(by);
            results.add(mt);
        }
        log.info("Aggregate mothan parsed: {} records", results.size());
        return new ParseResult(FileType.MOTHAN, fallback, List.of(), List.of(), List.of(), results, null);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // DAILY FORMAT PARSERS (original logic — unchanged)
    // ════════════════════════════════════════════════════════════════════════════

    private ParseResult parseDailyBranchSales(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        List<BranchSale> results = new ArrayList<>();
        String currentCode = null;
        List<KaratRow> karatRows = new ArrayList<>();
        Pattern branchPat = Pattern.compile("^(\\d{4})\\s*-");

        for (Row row : sheet) {
            String desc = getString(row, 12);
            if (desc == null) continue;
            Matcher bm = branchPat.matcher(desc);
            if (bm.find()) {
                currentCode = bm.group(1).trim();
                karatRows = new ArrayList<>();
                continue;
            }
            if (desc.equals("18")||desc.equals("21")||desc.equals("22")||desc.equals("24")) {
                double sar = getAbs(row,3); double nw = getAbs(row,6);
                karatRows.add(new KaratRow(desc, 0, sar, nw, getAbs(row,8), (int)getAbs(row,11),
                    nw>0?sar/nw:0));
                continue;
            }
            if (desc.contains("Sub Total") && currentCode != null) {
                double sar = getAbs(row,3); double nw = getAbs(row,6);
                boolean isReturn = getRaw(row,3) > 0;
                BranchSale bs = new BranchSale();
                bs.setTenantId(tenantId); bs.setSaleDate(date);
                bs.setBranchCode(currentCode);
                bs.setBranchName(BranchMaps.getName(currentCode));
                bs.setRegion(BranchMaps.getRegion(currentCode));
                bs.setTotalSarAmount(sar); bs.setNetWeight(nw);
                bs.setGrossWeight(getAbs(row,8)); bs.setInvoiceCount((int)getAbs(row,11));
                bs.setSaleRate(nw>0?sar/nw:0); bs.setReturn(isReturn);
                bs.setKaratRows(new ArrayList<>(karatRows));
                bs.setSourceFileName(filename); bs.setUploadBatch(batch); bs.setUploadedBy(by);
                results.add(bs);
                karatRows = new ArrayList<>();
            }
        }
        return new ParseResult(FileType.BRANCH_SALES, date, results, List.of(), List.of(), List.of(), null);
    }

    private ParseResult parseDailyPurchases(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        List<BranchPurchase> results = new ArrayList<>();
        String currentCode = null;
        Pattern branchPat = Pattern.compile("^(\\d{4})\\s*-");

        for (Row row : sheet) {
            String desc = getString(row, 12);
            if (desc == null) continue;
            Matcher bm = branchPat.matcher(desc);
            if (bm.find()) { currentCode = bm.group(1).trim(); continue; }
            if (desc.contains("Sub Total") && currentCode != null) {
                double sar = getAbs(row,3); double nw = getAbs(row,6);
                BranchPurchase bp = new BranchPurchase();
                bp.setTenantId(tenantId); bp.setPurchaseDate(date);
                bp.setBranchCode(currentCode);
                bp.setBranchName(BranchMaps.getName(currentCode));
                bp.setRegion(BranchMaps.getRegion(currentCode));
                bp.setTotalSarAmount(sar); bp.setNetWeight(nw);
                bp.setGrossWeight(getAbs(row,8)); bp.setInvoiceCount((int)getAbs(row,11));
                bp.setPurchaseRate(nw>0?sar/nw:0);
                bp.setSourceFileName(filename); bp.setUploadBatch(batch); bp.setUploadedBy(by);
                results.add(bp);
            }
        }
        return new ParseResult(FileType.PURCHASES, date, List.of(), results, List.of(), List.of(), null);
    }

    private ParseResult parseDailyEmployeeSales(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        List<EmployeeSale> results = new ArrayList<>();
        String currentCode = null;
        Pattern branchPat = Pattern.compile("^(\\d{4})\\s*-");

        for (Row row : sheet) {
            String desc = getString(row, 12);
            if (desc == null) continue;
            Matcher bm = branchPat.matcher(desc);
            if (bm.find()) { currentCode = bm.group(1).trim(); continue; }
            if (desc.contains("Sub Total") || desc.contains("المجموع")) continue;
            String empId = getString(row, 13);
            if (empId == null || empId.isBlank() || currentCode == null) continue;
            double sar = getAbs(row,3); double nw = getAbs(row,6);
            EmployeeSale es = new EmployeeSale();
            es.setTenantId(tenantId); es.setSaleDate(date);
            es.setBranchCode(currentCode);
            es.setBranchName(BranchMaps.getName(currentCode));
            es.setRegion(BranchMaps.getRegion(currentCode));
            es.setEmployeeId(empId.trim()); es.setEmployeeName(desc.trim());
            es.setAvgMakingCharge(getAbs(row,0));
            es.setTotalSarAmount(sar); es.setNetWeight(nw);
            es.setGrossWeight(getAbs(row,8)); es.setInvoiceCount((int)getAbs(row,11));
            es.setSaleRate(nw>0?sar/nw:0); es.setReturn(getRaw(row,3)>0);
            es.setSourceFileName(filename); es.setUploadBatch(batch); es.setUploadedBy(by);
            results.add(es);
        }
        return new ParseResult(FileType.EMPLOYEE_SALES, date, List.of(), List.of(), results, List.of(), null);
    }

    private ParseResult parseDailyMothan(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        List<MothanTransaction> results = new ArrayList<>();
        Pattern weightPat1 = Pattern.compile("وزن\\s*\\(\\s*([\\d.]+)\\s*\\)");
        Pattern weightPat2 = Pattern.compile("([\\d.]+)\\s*جم");
        Pattern weightPat3 = Pattern.compile("weight\\s+([\\d.]+)", Pattern.CASE_INSENSITIVE);
        Pattern datePat    = Pattern.compile("^(\\d{2})/(\\d{2})/(\\d{4})$");

        for (Row row : sheet) {
            String col0 = getString(row, 0);
            if (col0 == null) continue;
            Matcher dm = datePat.matcher(col0.trim());
            LocalDate rowDate = date;
            if (dm.matches()) {
                try { rowDate = LocalDate.parse(dm.group(1)+"-"+dm.group(2)+"-"+dm.group(3),
                    DateTimeFormatter.ofPattern("dd-MM-yyyy")); } catch (Exception ignored) {}
            } else continue;

            String branchCode = getString(row,2);
            if (branchCode == null || branchCode.isBlank()) continue;
            String description = getString(row,3);
            double credit = Math.abs(getAbs(row,5));
            if (credit <= 0) continue;

            double weight = extractWeight(description, weightPat1, weightPat2, weightPat3);
            if (weight <= 0) continue;

            MothanTransaction mt = new MothanTransaction();
            mt.setTenantId(tenantId); mt.setTransactionDate(rowDate);
            mt.setBranchCode(branchCode.trim());
            mt.setBranchName(BranchMaps.getName(branchCode.trim()));
            mt.setDocReference(getString(row,1));
            mt.setDescription(description);
            mt.setDebitSar(getAbs(row,4)); mt.setCreditSar(credit);
            mt.setRunningBalance(getAbs(row,6)); mt.setGoldWeightGrams(weight);
            mt.setSourceFileName(filename); mt.setUploadBatch(batch); mt.setUploadedBy(by);
            results.add(mt);
        }
        return new ParseResult(FileType.MOTHAN, date, List.of(), List.of(), List.of(), results, null);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ════════════════════════════════════════════════════════════════════════════

    /** Parse date from aggregate format column (Excel serial or string DD/MM/YYYY) */
    private LocalDate parseAggDate(Row row, int col, LocalDate fallback) {
        Cell cell = row.getCell(col);
        if (cell == null) return fallback;
        if (cell.getCellType() == CellType.NUMERIC) {
            double v = cell.getNumericCellValue();
            if (v > 40000 && v < 60000) {
                try {
                    long ms = (long)((v - 25569) * 86400000L);
                    return Instant.ofEpochMilli(ms).atZone(ZoneId.of("Asia/Riyadh")).toLocalDate();
                } catch (Exception ignored) {}
            }
        }
        String s = safeGetString(row, col);
        if (s == null) return fallback;
        s = s.trim();
        // DD/MM/YYYY
        Matcher m1 = Pattern.compile("(\\d{2})/(\\d{2})/(\\d{4})").matcher(s);
        if (m1.find()) {
            try { return LocalDate.of(Integer.parseInt(m1.group(3)),
                                      Integer.parseInt(m1.group(2)),
                                      Integer.parseInt(m1.group(1))); }
            catch (Exception ignored) {}
        }
        // YYYY-MM-DD
        Matcher m2 = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})").matcher(s);
        if (m2.find()) {
            try { return LocalDate.parse(m2.group()); }
            catch (Exception ignored) {}
        }
        return fallback;
    }

    /** Map karat purity ratio to karat label */
    private String mapKarat(String purity) {
        if (purity == null) return null;
        return switch (purity) {
            case "0.75", "0.750", "0.7500", "0.75000", "0.750000" -> "18";
            case "0.875", "0.8750", "0.87500", "0.875000" -> "21";
            case "0.916", "0.9160", "0.91600", "0.916000",
                 "0.9166", "0.91660", "0.916600",
                 "0.91667", "0.916670" -> "22";
            case "1", "1.0", "1.00", "1.000", "1.0000", "1.00000", "1.000000" -> "24";
            default -> null;
        };
    }

    /** Get raw numeric value without Math.abs() */
    private double getDoubleRaw(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return 0.0;
        if (cell.getCellType() == CellType.NUMERIC) return cell.getNumericCellValue();
        if (cell.getCellType() == CellType.STRING) {
            try { return Double.parseDouble(cell.getStringCellValue().replace(",","").replace(" ","").trim()); }
            catch (Exception ignored) {}
        }
        return 0.0;
    }

    /** Get absolute numeric value */
    private double getDoubleAbs(Row row, int col) {
        return Math.abs(getDoubleRaw(row, col));
    }

    /** Get string, returns null if empty */
    private String safeGetString(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        String v;
        if (cell.getCellType() == CellType.STRING) {
            v = cell.getStringCellValue().trim();
        } else if (cell.getCellType() == CellType.NUMERIC) {
            double d = cell.getNumericCellValue();
            // If it looks like a whole number, return without decimals
            if (d == Math.floor(d) && !Double.isInfinite(d)) {
                v = String.valueOf((long) d);
            } else {
                v = String.valueOf(d);
            }
        } else {
            return null;
        }
        return v.isEmpty() ? null : v;
    }

    private String safeGetStringTrimmed(Row row, int col) {
        String s = safeGetString(row, col);
        return s != null ? s.trim() : null;
    }

    private double extractWeight(String description, Pattern... patterns) {
        if (description == null) return 0;
        for (Pattern p : patterns) {
            Matcher m = p.matcher(description);
            if (m.find()) {
                try { return Double.parseDouble(m.group(1)); } catch (Exception ignored) {}
            }
        }
        return 0;
    }

    // ─── Original helpers (kept for daily parsers) ────────────────────────────

    private double getAbs(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return 0;
        if (cell.getCellType() == CellType.NUMERIC) return Math.abs(cell.getNumericCellValue());
        if (cell.getCellType() == CellType.STRING) {
            try { return Math.abs(Double.parseDouble(cell.getStringCellValue().replace(",",""))); }
            catch (Exception ignored) {}
        }
        return 0;
    }

    private double getRaw(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return 0;
        if (cell.getCellType() == CellType.NUMERIC) return cell.getNumericCellValue();
        return 0;
    }

    private String getString(Row row, int col) {
        Cell cell = row.getCell(col);
        if (cell == null) return null;
        if (cell.getCellType() == CellType.STRING) {
            String v = cell.getStringCellValue().trim();
            return v.isEmpty() ? null : v;
        }
        if (cell.getCellType() == CellType.NUMERIC) return String.valueOf((long)cell.getNumericCellValue());
        return null;
    }
}
