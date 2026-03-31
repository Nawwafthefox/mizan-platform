package com.mizan.service;
import com.mizan.config.BranchMaps;
import com.mizan.model.*;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import java.io.InputStream;
import java.time.LocalDate;
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

    public ParseResult parse(InputStream is, String filename, String tenantId,
            String uploadBatch, String uploadedBy) {
        FileType type = detectType(filename);
        LocalDate date = extractDate(filename);
        try (HSSFWorkbook wb = new HSSFWorkbook(is)) {
            Sheet sheet = wb.getSheetAt(0);
            return switch (type) {
                case BRANCH_SALES    -> parseBranchSales(sheet, date, tenantId, uploadBatch, uploadedBy, filename);
                case PURCHASES       -> parsePurchases(sheet, date, tenantId, uploadBatch, uploadedBy, filename);
                case EMPLOYEE_SALES  -> parseEmployeeSales(sheet, date, tenantId, uploadBatch, uploadedBy, filename);
                case MOTHAN          -> parseMothan(sheet, date, tenantId, uploadBatch, uploadedBy, filename);
                default -> new ParseResult(type, date, List.of(), List.of(), List.of(), List.of(), "Unknown file type");
            };
        } catch (Exception e) {
            log.error("Parse error for {}: {}", filename, e.getMessage(), e);
            return new ParseResult(type, date, List.of(), List.of(), List.of(), List.of(), e.getMessage());
        }
    }

    private ParseResult parseBranchSales(Sheet sheet, LocalDate date, String tenantId,
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

    private ParseResult parsePurchases(Sheet sheet, LocalDate date, String tenantId,
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

    private ParseResult parseEmployeeSales(Sheet sheet, LocalDate date, String tenantId,
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

    private ParseResult parseMothan(Sheet sheet, LocalDate date, String tenantId,
            String batch, String by, String filename) {
        List<MothanTransaction> results = new ArrayList<>();
        Pattern weightPat = Pattern.compile("وزن\\s*\\(\\s*([\\d.]+)\\s*\\)");
        Pattern datePat = Pattern.compile("^(\\d{2})/(\\d{2})/(\\d{4})$");

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

            double weight = 0;
            if (description != null) {
                Matcher wm = weightPat.matcher(description);
                if (wm.find()) {
                    try { weight = Double.parseDouble(wm.group(1)); } catch (Exception ignored) {}
                }
            }
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
