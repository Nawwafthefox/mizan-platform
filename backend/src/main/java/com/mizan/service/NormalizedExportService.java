package com.mizan.service;

import com.mizan.model.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * Generates a BCNF-normalised Excel workbook of all tenant data.
 * Reference sheets = blue tabs, Fact sheets = grey tabs, VIEW sheets = green tabs.
 */
@Service
public class NormalizedExportService {

    private final MongoTemplate mongo;

    public NormalizedExportService(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    // ─── Tab colours ─────────────────────────────────────────────────────────
    private static final byte[] BLUE_TAB  = { (byte)0x15, (byte)0x65, (byte)0xC0 };
    private static final byte[] GREY_TAB  = { (byte)0x54, (byte)0x6E, (byte)0x7A };
    private static final byte[] GREEN_TAB = { (byte)0x2E, (byte)0x7D, (byte)0x32 };

    // ─── Styles ──────────────────────────────────────────────────────────────
    private static class Styles {
        final CellStyle def, pk, fk, view, hdr, num2, num4, dateS;

        Styles(XSSFWorkbook wb) {
            DataFormat df = wb.createDataFormat();

            Font hf = wb.createFont();
            hf.setColor(IndexedColors.WHITE.getIndex());
            hf.setBold(true);
            hf.setFontHeightInPoints((short) 9);

            hdr = wb.createCellStyle();
            hdr.setFillForegroundColor(IndexedColors.GREY_80_PERCENT.getIndex());
            hdr.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            hdr.setFont(hf);
            hdr.setAlignment(HorizontalAlignment.CENTER);

            Font pkf = wb.createFont();
            pkf.setBold(true);
            pkf.setFontHeightInPoints((short) 9);

            pk = wb.createCellStyle();
            pk.setFillForegroundColor(IndexedColors.LEMON_CHIFFON.getIndex());
            pk.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            pk.setFont(pkf);

            fk = wb.createCellStyle();
            fk.setFillForegroundColor(IndexedColors.LIGHT_CORNFLOWER_BLUE.getIndex());
            fk.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            view = wb.createCellStyle();
            view.setFillForegroundColor(IndexedColors.LIGHT_GREEN.getIndex());
            view.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            def  = wb.createCellStyle();

            num2 = wb.createCellStyle();
            num2.setDataFormat(df.getFormat("#,##0.00"));

            num4 = wb.createCellStyle();
            num4.setDataFormat(df.getFormat("#,##0.0000"));

            dateS = wb.createCellStyle();
            dateS.setDataFormat(df.getFormat("yyyy-mm-dd"));
        }
    }

    // ─── Sheet / cell helpers ─────────────────────────────────────────────────

    private XSSFSheet makeSheet(XSSFWorkbook wb, String name, byte[] tabColor) {
        XSSFSheet sh = wb.createSheet(name);
        sh.setTabColor(new XSSFColor(tabColor, null));
        sh.setDefaultColumnWidth(14);
        return sh;
    }

    private void hdr(XSSFRow row, int col, String label, Styles st) {
        XSSFCell c = row.createCell(col);
        c.setCellValue(label);
        c.setCellStyle(st.hdr);
    }

    private void str(XSSFRow row, int col, String val, CellStyle style) {
        XSSFCell c = row.createCell(col);
        c.setCellValue(val == null ? "" : val);
        c.setCellStyle(style);
    }

    private void num(XSSFRow row, int col, double val, Styles st) {
        XSSFCell c = row.createCell(col);
        c.setCellValue(val);
        c.setCellStyle(st.num2);
    }

    private void num4(XSSFRow row, int col, double val, Styles st) {
        XSSFCell c = row.createCell(col);
        c.setCellValue(val);
        c.setCellStyle(st.num4);
    }

    private void lng(XSSFRow row, int col, long val) {
        row.createCell(col).setCellValue(val);
    }

    private void dt(XSSFRow row, int col, LocalDate date, Styles st) {
        if (date == null) { row.createCell(col); return; }
        XSSFCell c = row.createCell(col);
        c.setCellValue(Date.from(date.atStartOfDay(ZoneId.systemDefault()).toInstant()));
        c.setCellStyle(st.dateS);
    }

    private void formula(XSSFRow row, int col, String f, CellStyle style) {
        XSSFCell c = row.createCell(col);
        c.setCellFormula(f);
        c.setCellStyle(style);
    }

    private void autoSize(XSSFSheet sh, int cols) {
        for (int i = 0; i < cols; i++) {
            try { sh.autoSizeColumn(i); } catch (Exception ignore) {}
        }
    }

    // ─── Main generate ────────────────────────────────────────────────────────

    public byte[] generate(String tenantId) throws IOException {
        Query q = Query.query(Criteria.where("tenantId").is(tenantId));

        List<BranchSale>        sales      = mongo.find(q, BranchSale.class);
        List<BranchPurchase>    purchases  = mongo.find(q, BranchPurchase.class);
        List<EmployeeSale>      empSales   = mongo.find(q, EmployeeSale.class);
        List<MothanTransaction> mothan     = mongo.find(q, MothanTransaction.class);
        List<BranchPurchaseRate> rates     = mongo.find(q, BranchPurchaseRate.class);
        List<BranchTarget>      targets    = mongo.find(q, BranchTarget.class);
        List<EmployeeTarget>    empTargets = mongo.find(q, EmployeeTarget.class);
        List<EmployeeTransfer>  transfers  = mongo.find(q, EmployeeTransfer.class);
        List<DailySale>         dailySales = mongo.find(q, DailySale.class);
        List<MonthlySummary>    monthly    = mongo.find(q, MonthlySummary.class);
        List<Region>            regions    = mongo.find(q, Region.class);

        // Build dimension maps from transaction data (canonical source)
        Map<String, String> regionMap = new LinkedHashMap<>(); // regionName -> regionName
        for (BranchSale s : sales)
            if (s.getRegion() != null) regionMap.putIfAbsent(s.getRegion(), s.getRegion());
        if (regionMap.isEmpty())
            for (Region r : regions) regionMap.putIfAbsent(r.getName(), r.getName());

        // branchCode -> [branchName, region]
        Map<String, String[]> branchMap = new LinkedHashMap<>();
        for (BranchSale s : sales)
            if (s.getBranchCode() != null)
                branchMap.putIfAbsent(s.getBranchCode(), new String[]{ s.getBranchName(), s.getRegion() });
        for (BranchPurchase p : purchases)
            if (p.getBranchCode() != null)
                branchMap.putIfAbsent(p.getBranchCode(), new String[]{ p.getBranchName(), p.getRegion() });

        // empId -> [empName, branchCode]  (keep earliest-seen branch per employee)
        Map<String, String[]> empMap = new LinkedHashMap<>();
        for (EmployeeSale e : empSales)
            if (e.getEmployeeId() != null)
                empMap.putIfAbsent(e.getEmployeeId(), new String[]{ e.getEmployeeName(), e.getBranchCode() });

        // SUMPRODUCT range upper bounds
        int sMax = Math.max(sales.size() + 1, 2);
        int eMax = Math.max(empSales.size() + 1, 2);

        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            Styles st = new Styles(wb);

            writeRegions(wb, st, regionMap);
            writeBranches(wb, st, branchMap);
            writeEmployees(wb, st, empMap);
            writeBranchSales(wb, st, sales);
            writeBranchSaleKarats(wb, st, sales);
            writeBranchPurchases(wb, st, purchases);
            writeBranchPurchaseKarats(wb, st, purchases);
            writeEmployeeSales(wb, st, empSales);
            writeMothanTransactions(wb, st, mothan);
            writeBranchPurchaseRates(wb, st, rates);
            writeBranchTargets(wb, st, targets);
            writeEmployeeTargets(wb, st, empTargets);
            writeEmployeeTransfers(wb, st, transfers);
            writeDailySales(wb, st, dailySales);
            writeMonthlySummaries(wb, st, monthly);

            writeViewBranchSummary(wb, st, branchMap, sMax);
            writeViewOverviewKpis(wb, st, branchMap.size());
            writeViewEmployeePerformance(wb, st, empMap, eMax);
            writeViewTargetAchievement(wb, st, targets);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    // ─── Reference sheets ─────────────────────────────────────────────────────

    private void writeRegions(XSSFWorkbook wb, Styles st, Map<String, String> regionMap) {
        XSSFSheet sh = makeSheet(wb, "regions", BLUE_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "region_code (PK)", st);
        hdr(h, 1, "region_name", st);
        int r = 1;
        for (Map.Entry<String, String> e : regionMap.entrySet()) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, e.getKey(), st.pk);
            str(row, 1, e.getValue(), st.def);
        }
        autoSize(sh, 2);
    }

    private void writeBranches(XSSFWorkbook wb, Styles st, Map<String, String[]> branchMap) {
        XSSFSheet sh = makeSheet(wb, "branches", BLUE_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "branch_code (PK)", st);
        hdr(h, 1, "branch_name", st);
        hdr(h, 2, "region_code (FK)", st);
        int r = 1;
        for (Map.Entry<String, String[]> e : branchMap.entrySet()) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, e.getKey(), st.pk);
            str(row, 1, e.getValue()[0], st.def);
            str(row, 2, e.getValue()[1], st.fk);
        }
        autoSize(sh, 3);
    }

    private void writeEmployees(XSSFWorkbook wb, Styles st, Map<String, String[]> empMap) {
        XSSFSheet sh = makeSheet(wb, "employees", BLUE_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "emp_id (PK)", st);
        hdr(h, 1, "emp_name", st);
        hdr(h, 2, "branch_code (FK)", st);
        int r = 1;
        for (Map.Entry<String, String[]> e : empMap.entrySet()) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, e.getKey(), st.pk);
            str(row, 1, e.getValue()[0], st.def);
            str(row, 2, e.getValue()[1], st.fk);
        }
        autoSize(sh, 3);
    }

    // ─── Fact sheets ──────────────────────────────────────────────────────────

    /**
     * branch_sales: A=sale_id, B=sale_date, C=branch_code, D=total_sar,
     *               E=net_weight_g, F=gross_weight_g, G=invoice_count,
     *               H=wt_pure_g, I=is_return
     */
    private void writeBranchSales(XSSFWorkbook wb, Styles st, List<BranchSale> sales) {
        XSSFSheet sh = makeSheet(wb, "branch_sales", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "sale_id (PK)", st); hdr(h, 1, "sale_date", st);
        hdr(h, 2, "branch_code (FK)", st); hdr(h, 3, "total_sar", st);
        hdr(h, 4, "net_weight_g", st); hdr(h, 5, "gross_weight_g", st);
        hdr(h, 6, "invoice_count", st); hdr(h, 7, "wt_pure_g", st);
        hdr(h, 8, "is_return", st);
        int r = 1;
        for (BranchSale s : sales) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, s.getId(), st.pk);
            dt(row, 1, s.getSaleDate(), st);
            str(row, 2, s.getBranchCode(), st.fk);
            num(row, 3, s.getTotalSarAmount(), st);
            num4(row, 4, s.getNetWeight(), st);
            num4(row, 5, s.getGrossWeight(), st);
            lng(row, 6, s.getInvoiceCount());
            num4(row, 7, s.getWtPureG() > 0 ? s.getWtPureG() : s.getNetWeight(), st);
            str(row, 8, s.isReturn() ? "TRUE" : "FALSE", st.def);
        }
        autoSize(sh, 9);
    }

    private void writeBranchSaleKarats(XSSFWorkbook wb, Styles st, List<BranchSale> sales) {
        XSSFSheet sh = makeSheet(wb, "branch_sale_karats", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "sale_id (FK)", st); hdr(h, 1, "karat", st);
        hdr(h, 2, "sar_amount", st);   hdr(h, 3, "net_weight_g", st);
        hdr(h, 4, "wt_pure_g", st);    hdr(h, 5, "pieces", st);
        int r = 1;
        for (BranchSale s : sales) {
            if (s.getKaratRows() != null && !s.getKaratRows().isEmpty()) {
                for (KaratRow kr : s.getKaratRows()) {
                    XSSFRow row = sh.createRow(r++);
                    str(row, 0, s.getId(), st.fk); str(row, 1, kr.getKarat(), st.def);
                    num(row, 2, kr.getSarAmount(), st); num4(row, 3, kr.getNetWeight(), st);
                    num4(row, 4, 0, st); lng(row, 5, 0);
                }
            } else {
                if (s.getK18Sar() != 0 || s.getK18WeightG() != 0) {
                    XSSFRow row = sh.createRow(r++);
                    str(row,0,s.getId(),st.fk); str(row,1,"18",st.def);
                    num(row,2,s.getK18Sar(),st); num4(row,3,s.getK18WeightG(),st);
                    num4(row,4,s.getK18WtPure(),st); lng(row,5,s.getK18Pieces());
                }
                if (s.getK21Sar() != 0 || s.getK21WeightG() != 0) {
                    XSSFRow row = sh.createRow(r++);
                    str(row,0,s.getId(),st.fk); str(row,1,"21",st.def);
                    num(row,2,s.getK21Sar(),st); num4(row,3,s.getK21WeightG(),st);
                    num4(row,4,s.getK21WtPure(),st); lng(row,5,s.getK21Pieces());
                }
                if (s.getK22Sar() != 0 || s.getK22WeightG() != 0) {
                    XSSFRow row = sh.createRow(r++);
                    str(row,0,s.getId(),st.fk); str(row,1,"22",st.def);
                    num(row,2,s.getK22Sar(),st); num4(row,3,s.getK22WeightG(),st);
                    num4(row,4,s.getK22WtPure(),st); lng(row,5,s.getK22Pieces());
                }
                if (s.getK24Sar() != 0 || s.getK24WeightG() != 0) {
                    XSSFRow row = sh.createRow(r++);
                    str(row,0,s.getId(),st.fk); str(row,1,"24",st.def);
                    num(row,2,s.getK24Sar(),st); num4(row,3,s.getK24WeightG(),st);
                    num4(row,4,s.getK24WtPure(),st); lng(row,5,s.getK24Pieces());
                }
            }
        }
        autoSize(sh, 6);
    }

    private void writeBranchPurchases(XSSFWorkbook wb, Styles st, List<BranchPurchase> purchases) {
        XSSFSheet sh = makeSheet(wb, "branch_purchases", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "id (PK)", st);         hdr(h, 1, "purchase_date", st);
        hdr(h, 2, "branch_code (FK)", st); hdr(h, 3, "total_sar", st);
        hdr(h, 4, "net_weight_g", st);     hdr(h, 5, "wt_pure_g", st);
        hdr(h, 6, "invoice_count", st);
        int r = 1;
        for (BranchPurchase p : purchases) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, p.getId(), st.pk);
            dt(row, 1, p.getPurchaseDate(), st);
            str(row, 2, p.getBranchCode(), st.fk);
            num(row, 3, p.getTotalSarAmount(), st);
            num4(row, 4, p.getNetWeight(), st);
            num4(row, 5, p.getWtPureG() > 0 ? p.getWtPureG() : p.getNetWeight(), st);
            lng(row, 6, p.getInvoiceCount());
        }
        autoSize(sh, 7);
    }

    private void writeBranchPurchaseKarats(XSSFWorkbook wb, Styles st, List<BranchPurchase> purchases) {
        XSSFSheet sh = makeSheet(wb, "branch_purchase_karats", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "purchase_id (FK)", st); hdr(h, 1, "karat", st);
        hdr(h, 2, "sar_amount", st);       hdr(h, 3, "net_weight_g", st);
        hdr(h, 4, "wt_pure_g", st);
        int r = 1;
        for (BranchPurchase p : purchases) {
            if (p.getKaratRows() != null && !p.getKaratRows().isEmpty()) {
                for (KaratRow kr : p.getKaratRows()) {
                    XSSFRow row = sh.createRow(r++);
                    str(row,0,p.getId(),st.fk); str(row,1,kr.getKarat(),st.def);
                    num(row,2,kr.getSarAmount(),st); num4(row,3,kr.getNetWeight(),st);
                    num4(row,4,0,st);
                }
            } else {
                if (p.getK18Sar() != 0 || p.getK18WeightG() != 0) {
                    XSSFRow row = sh.createRow(r++);
                    str(row,0,p.getId(),st.fk); str(row,1,"18",st.def);
                    num(row,2,p.getK18Sar(),st); num4(row,3,p.getK18WeightG(),st); num4(row,4,p.getK18WtPure(),st);
                }
                if (p.getK21Sar() != 0 || p.getK21WeightG() != 0) {
                    XSSFRow row = sh.createRow(r++);
                    str(row,0,p.getId(),st.fk); str(row,1,"21",st.def);
                    num(row,2,p.getK21Sar(),st); num4(row,3,p.getK21WeightG(),st); num4(row,4,p.getK21WtPure(),st);
                }
                if (p.getK24Sar() != 0 || p.getK24WeightG() != 0) {
                    XSSFRow row = sh.createRow(r++);
                    str(row,0,p.getId(),st.fk); str(row,1,"24",st.def);
                    num(row,2,p.getK24Sar(),st); num4(row,3,p.getK24WeightG(),st); num4(row,4,p.getK24WtPure(),st);
                }
            }
        }
        autoSize(sh, 5);
    }

    /**
     * employee_sales: A=id, B=sale_date, C=emp_id, D=branch_code,
     *                 E=total_sar, F=weight_net_g, G=weight_pure_g, H=pieces, I=is_return
     */
    private void writeEmployeeSales(XSSFWorkbook wb, Styles st, List<EmployeeSale> empSales) {
        XSSFSheet sh = makeSheet(wb, "employee_sales", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "id (PK)", st);         hdr(h, 1, "sale_date", st);
        hdr(h, 2, "emp_id (FK)", st);      hdr(h, 3, "branch_code (FK)", st);
        hdr(h, 4, "total_sar", st);        hdr(h, 5, "weight_net_g", st);
        hdr(h, 6, "weight_pure_g", st);    hdr(h, 7, "pieces", st);
        hdr(h, 8, "is_return", st);
        int r = 1;
        for (EmployeeSale e : empSales) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, e.getId(), st.pk);
            dt(row, 1, e.getSaleDate(), st);
            str(row, 2, e.getEmployeeId(), st.fk);
            str(row, 3, e.getBranchCode(), st.fk);
            num(row, 4, e.getTotalSarAmount(), st);
            num4(row, 5, e.getNetWeight(), st);
            num4(row, 6, e.getGrossWeight(), st);
            lng(row, 7, e.getInvoiceCount());
            str(row, 8, e.isReturn() ? "TRUE" : "FALSE", st.def);
        }
        autoSize(sh, 9);
    }

    /**
     * mothan_transactions: A=id, B=transaction_date, C=branch_code, D=doc_reference,
     *                      E=description, F=amount_sar, G=weight_debit_g, H=weight_credit_g
     */
    private void writeMothanTransactions(XSSFWorkbook wb, Styles st, List<MothanTransaction> mothan) {
        XSSFSheet sh = makeSheet(wb, "mothan_transactions", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "id (PK)", st);          hdr(h, 1, "transaction_date", st);
        hdr(h, 2, "branch_code (FK)", st);  hdr(h, 3, "doc_reference", st);
        hdr(h, 4, "description", st);       hdr(h, 5, "amount_sar", st);
        hdr(h, 6, "weight_debit_g", st);    hdr(h, 7, "weight_credit_g", st);
        int r = 1;
        for (MothanTransaction m : mothan) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, m.getId(), st.pk);
            dt(row, 1, m.getTransactionDate(), st);
            str(row, 2, m.getBranchCode(), st.fk);
            str(row, 3, m.getDocReference(), st.def);
            str(row, 4, m.getDescription(), st.def);
            num(row, 5, m.getCreditSar(), st);
            num4(row, 6, m.getWeightDebitG(), st);
            num4(row, 7, m.getWeightCreditG() > 0 ? m.getWeightCreditG() : m.getGoldWeightGrams(), st);
        }
        autoSize(sh, 8);
    }

    /**
     * branch_purchase_rates: A=branch_code(PK), B=purchase_rate, C=total_sar,
     *                        D=total_weight, E=source_date
     */
    private void writeBranchPurchaseRates(XSSFWorkbook wb, Styles st, List<BranchPurchaseRate> rates) {
        XSSFSheet sh = makeSheet(wb, "branch_purchase_rates", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "branch_code (PK/FK)", st); hdr(h, 1, "purchase_rate", st);
        hdr(h, 2, "total_sar", st);            hdr(h, 3, "total_weight_g", st);
        hdr(h, 4, "source_date", st);
        int r = 1;
        for (BranchPurchaseRate rate : rates) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, rate.getBranchCode(), st.pk);
            num4(row, 1, rate.getPurchaseRate(), st);
            num(row, 2, rate.getTotalSar(), st);
            num4(row, 3, rate.getTotalWeight(), st);
            dt(row, 4, rate.getSourceDate(), st);
        }
        autoSize(sh, 5);
    }

    private void writeBranchTargets(XSSFWorkbook wb, Styles st, List<BranchTarget> targets) {
        XSSFSheet sh = makeSheet(wb, "branch_targets", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "id (PK)", st);         hdr(h, 1, "branch_code (FK)", st);
        hdr(h, 2, "target_date", st);      hdr(h, 3, "target_wt_daily_g", st);
        hdr(h, 4, "target_rate_diff", st); hdr(h, 5, "monthly_target", st);
        hdr(h, 6, "emp_count", st);        hdr(h, 7, "annual_target", st);
        int r = 1;
        for (BranchTarget t : targets) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, t.getId(), st.pk);
            str(row, 1, t.getBranchCode(), st.fk);
            dt(row, 2, t.getTargetDate(), st);
            num4(row, 3, t.getTargetNetWeightDaily(), st);
            num4(row, 4, t.getTargetRateDifference(), st);
            num(row, 5, t.getMonthlyTarget(), st);
            lng(row, 6, t.getEmpCount());
            num(row, 7, t.getAnnualTarget(), st);
        }
        autoSize(sh, 8);
    }

    private void writeEmployeeTargets(XSSFWorkbook wb, Styles st, List<EmployeeTarget> targets) {
        XSSFSheet sh = makeSheet(wb, "employee_targets", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "id (PK)", st);          hdr(h, 1, "emp_id (FK)", st);
        hdr(h, 2, "branch_code (FK)", st);  hdr(h, 3, "target_month", st);
        hdr(h, 4, "target_weight_g", st);   hdr(h, 5, "target_diff_avg", st);
        hdr(h, 6, "target_pieces", st);     hdr(h, 7, "target_sales_sar", st);
        int r = 1;
        for (EmployeeTarget t : targets) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, t.getId(), st.pk);
            str(row, 1, String.valueOf(t.getEmpId()), st.fk);
            str(row, 2, t.getBranchCode(), st.fk);
            dt(row, 3, t.getTargetMonth(), st);
            num4(row, 4, t.getTargetWeightG(), st);
            num4(row, 5, t.getTargetDiffAvg(), st);
            lng(row, 6, t.getTargetPieces());
            num(row, 7, t.getTargetSalesSar(), st);
        }
        autoSize(sh, 8);
    }

    private void writeEmployeeTransfers(XSSFWorkbook wb, Styles st, List<EmployeeTransfer> transfers) {
        XSSFSheet sh = makeSheet(wb, "employee_transfers", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "id (PK)", st);              hdr(h, 1, "emp_id (FK)", st);
        hdr(h, 2, "from_branch_code (FK)", st); hdr(h, 3, "to_branch_code (FK)", st);
        hdr(h, 4, "transfer_date", st);         hdr(h, 5, "notes", st);
        int r = 1;
        for (EmployeeTransfer t : transfers) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, t.getId(), st.pk);
            str(row, 1, String.valueOf(t.getEmpId()), st.fk);
            str(row, 2, t.getFromBranchCode(), st.fk);
            str(row, 3, t.getToBranchCode(), st.fk);
            dt(row, 4, t.getTransferDate(), st);
            str(row, 5, t.getNotes(), st.def);
        }
        autoSize(sh, 6);
    }

    private void writeDailySales(XSSFWorkbook wb, Styles st, List<DailySale> dailySales) {
        XSSFSheet sh = makeSheet(wb, "daily_sales", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "id (PK)", st);         hdr(h, 1, "branch_code (FK)", st);
        hdr(h, 2, "sale_date", st);        hdr(h, 3, "net_sales", st);
        hdr(h, 4, "gross_sales", st);      hdr(h, 5, "daily_target", st);
        hdr(h, 6, "purchases", st);        hdr(h, 7, "cash", st);
        hdr(h, 8, "bank", st);
        int r = 1;
        for (DailySale d : dailySales) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, d.getId(), st.pk);
            str(row, 1, d.getBranchCode(), st.fk);
            dt(row, 2, d.getSaleDate(), st);
            num(row, 3, d.getNetSales(), st);
            num(row, 4, d.getGrossSales(), st);
            num(row, 5, d.getDailyTarget(), st);
            num(row, 6, d.getPurchases(), st);
            num(row, 7, d.getCash(), st);
            num(row, 8, d.getBank(), st);
        }
        autoSize(sh, 9);
    }

    private void writeMonthlySummaries(XSSFWorkbook wb, Styles st, List<MonthlySummary> monthly) {
        XSSFSheet sh = makeSheet(wb, "monthly_summaries", GREY_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "id (PK)", st);       hdr(h, 1, "branch_code (FK)", st);
        hdr(h, 2, "year", st);          hdr(h, 3, "month", st);
        hdr(h, 4, "total_sales", st);   hdr(h, 5, "total_target", st);
        int r = 1;
        for (MonthlySummary m : monthly) {
            XSSFRow row = sh.createRow(r++);
            str(row, 0, m.getId(), st.pk);
            str(row, 1, m.getBranchCode(), st.fk);
            lng(row, 2, m.getYear());
            lng(row, 3, m.getMonth());
            num(row, 4, m.getTotalSales(), st);
            num(row, 5, m.getTotalTarget(), st);
        }
        autoSize(sh, 6);
    }

    // ─── VIEW sheets ──────────────────────────────────────────────────────────

    /**
     * _VIEW_branch_summary
     * Cols (1-based for VLOOKUP):
     *  A(1)=branch_code  B(2)=branch_name   C(3)=region
     *  D(4)=total_sar    E(5)=total_weight   F(6)=total_invoices
     *  G(7)=total_purch  H(8)=total_purch_wt I(9)=total_mothan  J(10)=total_mothan_wt
     *  K(11)=purch_combined  L(12)=combined_wt
     *  M(13)=sale_rate   N(14)=purch_rate   ← col 14 used in employee VLOOKUP
     *  O(15)=diff_rate   P(16)=net           Q(17)=avg_invoice
     *  R(18)=returns_sar  S(19)=return_days
     */
    private void writeViewBranchSummary(XSSFWorkbook wb, Styles st,
            Map<String, String[]> branchMap, int sMax) {
        XSSFSheet sh = makeSheet(wb, "_VIEW_branch_summary", GREEN_TAB);
        XSSFRow h = sh.createRow(0);
        String[] headers = {
            "branch_code","branch_name","region",
            "total_sar","total_weight_g","total_invoices",
            "total_purch_sar","total_purch_wt_g","total_mothan_sar","total_mothan_wt_g",
            "purch_combined_sar","combined_wt_g",
            "sale_rate","purch_rate","diff_rate","net_sar","avg_invoice_sar",
            "returns_sar","return_days"
        };
        for (int i = 0; i < headers.length; i++) hdr(h, i, headers[i], st);

        List<String> codes = new ArrayList<>(branchMap.keySet());
        for (int idx = 0; idx < codes.size(); idx++) {
            int r = idx + 2; // 1-based Excel row
            String code = codes.get(idx);
            XSSFRow row = sh.createRow(idx + 1);

            str(row, 0, code, st.pk); // A: branch_code (static seed)

            // B: branch_name
            formula(row, 1, "IFERROR(VLOOKUP(A"+r+",branches!A:B,2,0),\"\")", st.view);
            // C: region
            formula(row, 2, "IFERROR(VLOOKUP(A"+r+",branches!A:C,3,0),\"\")", st.view);
            // D: total_sar – SUMIF on branch_sales col C vs col D
            formula(row, 3, "SUMIF(branch_sales!C:C,A"+r+",branch_sales!D:D)", st.view);
            // E: total_weight
            formula(row, 4, "SUMIF(branch_sales!C:C,A"+r+",branch_sales!E:E)", st.view);
            // F: total_invoices (ABS to handle PG negative-sign convention)
            formula(row, 5,
                "SUMPRODUCT((branch_sales!C$2:C$"+sMax+"=A"+r+")*ABS(branch_sales!G$2:G$"+sMax+"))",
                st.view);
            // G: total_purch – branch_purchases col C vs col D
            formula(row, 6, "SUMIF(branch_purchases!C:C,A"+r+",branch_purchases!D:D)", st.view);
            // H: total_purch_wt
            formula(row, 7, "SUMIF(branch_purchases!C:C,A"+r+",branch_purchases!E:E)", st.view);
            // I: total_mothan – mothan_transactions col C vs col F (amount_sar)
            formula(row, 8, "SUMIF(mothan_transactions!C:C,A"+r+",mothan_transactions!F:F)", st.view);
            // J: total_mothan_wt (col H = weight_credit_g)
            formula(row, 9, "SUMIF(mothan_transactions!C:C,A"+r+",mothan_transactions!H:H)", st.view);
            // K: purch_combined = G + I
            formula(row, 10, "G"+r+"+I"+r, st.view);
            // L: combined_wt = H + J
            formula(row, 11, "H"+r+"+J"+r, st.view);
            // M: sale_rate
            formula(row, 12, "IF(E"+r+">0,ROUND(D"+r+"/E"+r+",4),0)", st.view);
            // N: purch_rate (period-actual first, saved-rate fallback) — col 14
            formula(row, 13,
                "IF(L"+r+">0,ROUND(K"+r+"/L"+r+",4),"
                +"IFERROR(VLOOKUP(A"+r+",branch_purchase_rates!A:B,2,0),0))",
                st.view);
            // O: diff_rate
            formula(row, 14, "IF(N"+r+">0,ROUND(M"+r+"-N"+r+",4),0)", st.view);
            // P: net
            formula(row, 15, "D"+r+"-K"+r, st.view);
            // Q: avg_invoice
            formula(row, 16, "IF(F"+r+">0,ROUND(D"+r+"/F"+r+",2),0)", st.view);
            // R: returns_sar
            formula(row, 17,
                "SUMPRODUCT((branch_sales!C$2:C$"+sMax+"=A"+r+")"
                +"*(branch_sales!D$2:D$"+sMax+"<0)"
                +"*ABS(branch_sales!D$2:D$"+sMax+"))",
                st.view);
            // S: return_days
            formula(row, 18,
                "SUMPRODUCT((branch_sales!C$2:C$"+sMax+"=A"+r+")"
                +"*(branch_sales!I$2:I$"+sMax+"=\"TRUE\"))",
                st.view);
        }
        autoSize(sh, 19);
    }

    /** _VIEW_overview_kpis – portfolio-level totals from _VIEW_branch_summary */
    private void writeViewOverviewKpis(XSSFWorkbook wb, Styles st, int branchCount) {
        XSSFSheet sh = makeSheet(wb, "_VIEW_overview_kpis", GREEN_TAB);
        XSSFRow h = sh.createRow(0);
        hdr(h, 0, "kpi", st);
        hdr(h, 1, "value", st);

        int last = branchCount + 1;
        String[][] kpis = {
            { "total_sales_sar",
              "SUM('_VIEW_branch_summary'!D2:D"+last+")" },
            { "total_net_weight_g",
              "SUM('_VIEW_branch_summary'!E2:E"+last+")" },
            { "total_invoices",
              "SUM('_VIEW_branch_summary'!F2:F"+last+")" },
            { "total_purch_sar",
              "SUM('_VIEW_branch_summary'!G2:G"+last+")" },
            { "total_mothan_sar",
              "SUM('_VIEW_branch_summary'!I2:I"+last+")" },
            { "total_combined_purch_sar",
              "SUM('_VIEW_branch_summary'!K2:K"+last+")" },
            { "total_net_sar",
              "SUM('_VIEW_branch_summary'!P2:P"+last+")" },
            { "total_returns_sar",
              "SUM('_VIEW_branch_summary'!R2:R"+last+")" },
            { "avg_sale_rate",
              "IFERROR(ROUND(SUM('_VIEW_branch_summary'!D2:D"+last+")"
              +"/SUM('_VIEW_branch_summary'!E2:E"+last+"),4),0)" },
            { "avg_purch_rate_across_branches",
              "IFERROR(AVERAGEIF('_VIEW_branch_summary'!N2:N"+last+",\">0\","
              +"'_VIEW_branch_summary'!N2:N"+last+"),0)" },
            { "avg_diff_rate",
              "IFERROR(AVERAGEIF('_VIEW_branch_summary'!N2:N"+last+",\">0\","
              +"'_VIEW_branch_summary'!O2:O"+last+"),0)" },
            { "branch_count",       String.valueOf(branchCount) },
            { "exposed_branches",
              "COUNTIF('_VIEW_branch_summary'!P2:P"+last+",\"<0\")" },
            { "safe_branches",
              "COUNTIF('_VIEW_branch_summary'!P2:P"+last+",\">=0\")" },
            { "avg_invoice_sar",
              "IFERROR(ROUND(SUM('_VIEW_branch_summary'!D2:D"+last+")"
              +"/SUM('_VIEW_branch_summary'!F2:F"+last+"),2),0)" },
        };

        for (int i = 0; i < kpis.length; i++) {
            XSSFRow row = sh.createRow(i + 1);
            str(row, 0, kpis[i][0], st.def);
            String val = kpis[i][1];
            if (val.matches("\\d+")) {
                row.createCell(1).setCellValue(Long.parseLong(val));
            } else {
                formula(row, 1, val, st.view);
            }
        }
        autoSize(sh, 2);
    }

    /**
     * _VIEW_employee_performance
     * Cols: A=emp_id, B=emp_name, C=branch_code,
     *       D=total_sar, E=total_weight, F=total_pieces,
     *       G=sale_rate, H=purch_rate, I=diff_rate, J=avg_invoice, K=achieved, L=returns_sar
     */
    private void writeViewEmployeePerformance(XSSFWorkbook wb, Styles st,
            Map<String, String[]> empMap, int eMax) {
        XSSFSheet sh = makeSheet(wb, "_VIEW_employee_performance", GREEN_TAB);
        XSSFRow h = sh.createRow(0);
        String[] headers = {
            "emp_id","emp_name","branch_code",
            "total_sar","total_weight_g","total_pieces",
            "sale_rate","purch_rate","diff_rate","avg_invoice_sar","achieved","returns_sar"
        };
        for (int i = 0; i < headers.length; i++) hdr(h, i, headers[i], st);

        List<String> empIds = new ArrayList<>(empMap.keySet());
        for (int idx = 0; idx < empIds.size(); idx++) {
            int r = idx + 2;
            XSSFRow row = sh.createRow(idx + 1);

            str(row, 0, empIds.get(idx), st.pk); // A: emp_id (static)
            // B: emp_name
            formula(row, 1, "IFERROR(VLOOKUP(A"+r+",employees!A:B,2,0),\"\")", st.view);
            // C: branch_code
            formula(row, 2, "IFERROR(VLOOKUP(A"+r+",employees!A:C,3,0),\"\")", st.view);
            // D: total_sar (employee_sales col C=emp_id, col E=total_sar)
            formula(row, 3, "SUMIF(employee_sales!C:C,A"+r+",employee_sales!E:E)", st.view);
            // E: total_weight (col F=weight_net_g)
            formula(row, 4, "SUMIF(employee_sales!C:C,A"+r+",employee_sales!F:F)", st.view);
            // F: total_pieces (ABS, col H=pieces)
            formula(row, 5,
                "SUMPRODUCT((employee_sales!C$2:C$"+eMax+"=A"+r+")"
                +"*ABS(employee_sales!H$2:H$"+eMax+"))",
                st.view);
            // G: sale_rate
            formula(row, 6, "IF(E"+r+">0,ROUND(D"+r+"/E"+r+",4),0)", st.view);
            // H: purch_rate from _VIEW_branch_summary col N (col index 14)
            formula(row, 7,
                "IFERROR(VLOOKUP(C"+r+",'_VIEW_branch_summary'!A:N,14,0),0)",
                st.view);
            // I: diff_rate
            formula(row, 8, "IF(H"+r+">0,ROUND(G"+r+"-H"+r+",4),0)", st.view);
            // J: avg_invoice
            formula(row, 9, "IF(F"+r+">0,ROUND(D"+r+"/F"+r+",2),0)", st.view);
            // K: achieved
            formula(row, 10, "G"+r+">H"+r, st.view);
            // L: returns_sar
            formula(row, 11,
                "SUMPRODUCT((employee_sales!C$2:C$"+eMax+"=A"+r+")"
                +"*(employee_sales!E$2:E$"+eMax+"<0)"
                +"*ABS(employee_sales!E$2:E$"+eMax+"))",
                st.view);
        }
        autoSize(sh, 12);
    }

    /**
     * _VIEW_target_achievement – branch_target rows with actual vs target
     */
    private void writeViewTargetAchievement(XSSFWorkbook wb, Styles st, List<BranchTarget> targets) {
        XSSFSheet sh = makeSheet(wb, "_VIEW_target_achievement", GREEN_TAB);
        XSSFRow h = sh.createRow(0);
        String[] headers = {
            "branch_code","branch_name","target_date","target_wt_daily_g",
            "monthly_target_g","actual_total_wt_g","achievement_pct","status"
        };
        for (int i = 0; i < headers.length; i++) hdr(h, i, headers[i], st);

        for (int idx = 0; idx < targets.size(); idx++) {
            int r = idx + 2;
            BranchTarget t = targets.get(idx);
            XSSFRow row = sh.createRow(idx + 1);

            str(row, 0, t.getBranchCode(), st.pk); // A: static
            formula(row, 1, "IFERROR(VLOOKUP(A"+r+",branches!A:B,2,0),\"\")", st.view); // B
            dt(row, 2, t.getTargetDate(), st);                                            // C
            num4(row, 3, t.getTargetNetWeightDaily(), st);                                // D
            num(row, 4, t.getMonthlyTarget(), st);                                        // E
            // F: actual total weight from _VIEW_branch_summary col E (col index 5)
            formula(row, 5,
                "IFERROR(VLOOKUP(A"+r+",'_VIEW_branch_summary'!A:E,5,0),0)",
                st.view);
            // G: achievement_pct = F / E * 100
            formula(row, 6, "IF(E"+r+">0,ROUND(F"+r+"/E"+r+"*100,2),0)", st.view);
            // H: status
            formula(row, 7,
                "IF(G"+r+">=100,\"exceeded\",IF(G"+r+">=70,\"onTrack\",\"behind\"))",
                st.view);
        }
        autoSize(sh, 8);
    }
}
