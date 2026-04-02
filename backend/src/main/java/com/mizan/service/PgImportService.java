package com.mizan.service;

import com.mizan.model.*;
import com.mizan.repository.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.util.*;

@Slf4j
@Service
public class PgImportService {

    private final AdminNoteRepository adminNoteRepo;
    private final RegionRepository regionRepo;
    private final BranchRepository branchRepo;
    private final EmployeeTargetRepository empTargetRepo;
    private final EmployeeTransferRepository empTransferRepo;
    private final DailySaleRepository dailySaleRepo;
    private final MonthlySummaryRepository monthlySummaryRepo;
    private final BranchTargetRepository branchTargetRepo;
    private final BranchSaleRepository branchSaleRepo;
    private final BranchPurchaseRepository branchPurchaseRepo;
    private final EmployeeSaleRepository employeeSaleRepo;
    private final MothanTransactionRepository mothanRepo;
    private final BranchPurchaseRateRepository purchaseRateRepo;

    public PgImportService(AdminNoteRepository adminNoteRepo, RegionRepository regionRepo,
            BranchRepository branchRepo, EmployeeTargetRepository empTargetRepo,
            EmployeeTransferRepository empTransferRepo, DailySaleRepository dailySaleRepo,
            MonthlySummaryRepository monthlySummaryRepo, BranchTargetRepository branchTargetRepo,
            BranchSaleRepository branchSaleRepo, BranchPurchaseRepository branchPurchaseRepo,
            EmployeeSaleRepository employeeSaleRepo, MothanTransactionRepository mothanRepo,
            BranchPurchaseRateRepository purchaseRateRepo) {
        this.adminNoteRepo = adminNoteRepo;
        this.regionRepo = regionRepo;
        this.branchRepo = branchRepo;
        this.empTargetRepo = empTargetRepo;
        this.empTransferRepo = empTransferRepo;
        this.dailySaleRepo = dailySaleRepo;
        this.monthlySummaryRepo = monthlySummaryRepo;
        this.branchTargetRepo = branchTargetRepo;
        this.branchSaleRepo = branchSaleRepo;
        this.branchPurchaseRepo = branchPurchaseRepo;
        this.employeeSaleRepo = employeeSaleRepo;
        this.mothanRepo = mothanRepo;
        this.purchaseRateRepo = purchaseRateRepo;
    }

    /** Entry point: accepts raw SQL dump content (from MultipartFile) */
    public Map<String, Object> importFromContent(String sqlContent, String tenantId) throws IOException {
        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, List<String[]>> tables = parseSqlContent(sqlContent);

        // ── 1. Regions ────────────────────────────────────────────────
        List<String[]> regionsData = tables.getOrDefault("regions", List.of());
        regionRepo.deleteByTenantId(tenantId);
        List<Region> regions = new ArrayList<>();
        Map<Integer, Region> regionMap = new LinkedHashMap<>();
        for (String[] row : regionsData) {
            if (row.length < 2) continue;
            Region r = new Region();
            r.setTenantId(tenantId);
            r.setPgId(colI(row, 0));
            r.setName(col(row, 1));
            r.setColor(row.length > 2 ? row[2] : "#2563eb");
            regions.add(r);
            regionMap.put(r.getPgId(), r);
        }
        regionRepo.saveAll(regions);
        result.put("regions", regions.size());
        log.info("Imported {} regions", regions.size());

        // ── 2. Branches ───────────────────────────────────────────────
        List<String[]> branchesData = tables.getOrDefault("branches", List.of());
        branchRepo.deleteByTenantId(tenantId);
        List<Branch> branches = new ArrayList<>();
        Map<Integer, Branch> branchById = new LinkedHashMap<>();
        for (String[] row : branchesData) {
            if (row.length < 2) continue;
            Branch b = new Branch();
            b.setTenantId(tenantId);
            b.setPgId(colI(row, 0));
            b.setName(col(row, 1));
            b.setRegionId(colI(row, 2));
            Region reg = regionMap.get(b.getRegionId());
            if (reg != null) { b.setRegionName(reg.getName()); b.setRegionColor(reg.getColor()); }
            branches.add(b);
            branchById.put(b.getPgId(), b);
        }
        branchRepo.saveAll(branches);
        result.put("branches", branches.size());
        log.info("Imported {} branches", branches.size());

        // ── 3. branch_sales ───────────────────────────────────────────
        // Columns: id, report_date, branch_code, branch_name, region,
        //          total_sar(5), total_weight_g(6), total_pieces(7),
        //          k18_sar(8), k18_weight_g(9), k18_pieces(10),
        //          k21_sar(11), k21_weight_g(12), k21_pieces(13),
        //          k24_sar(14), k24_weight_g(15), k24_pieces(16),
        //          avg_invoice_sar(17), wt_pure_g(18), wt_safe_g(19),
        //          sale_rate(20), avg_mkg_charge(21),
        //          k18_wt_pure(22), k18_wt_safe(23), k18_rate(24), k18_avg_mkg(25),
        //          k21_wt_pure(26), k21_wt_safe(27), k21_rate(28), k21_avg_mkg(29),
        //          k24_wt_pure(30), k24_wt_safe(31), k24_rate(32), k24_avg_mkg(33),
        //          k22_sar(34), k22_weight_g(35), k22_pieces(36),
        //          k22_wt_pure(37), k22_wt_safe(38), k22_rate(39), k22_avg_mkg(40)
        List<String[]> branchSalesData = tables.getOrDefault("branch_sales", List.of());
        branchSaleRepo.deleteByTenantId(tenantId);
        List<BranchSale> branchSales = new ArrayList<>();
        for (int i = 0; i < branchSalesData.size(); i++) {
            String[] row = branchSalesData.get(i);
            if (row.length < 3) continue; // skip malformed rows
            if (i < 3) log.info("branch_sales row {}: sar={} wt={} pieces={}", i, col(row,5), col(row,6), col(row,7));
            BranchSale s = new BranchSale();
            s.setTenantId(tenantId);
            s.setSaleDate(parseDate(col(row, 1)));
            s.setBranchCode(col(row, 2));
            s.setBranchName(nullOrValue(col(row, 3)));
            s.setRegion(nullOrValue(col(row, 4)));
            s.setTotalSarAmount(Math.abs(colD(row, 5)));
            s.setNetWeight(Math.abs(colD(row, 6)));
            s.setInvoiceCount(parseLongSafe(col(row, 7)));
            s.setK18Sar(colD(row, 8));
            s.setK18WeightG(colD(row, 9));
            s.setK18Pieces(colI(row, 10));
            s.setK21Sar(colD(row, 11));
            s.setK21WeightG(colD(row, 12));
            s.setK21Pieces(colI(row, 13));
            s.setK24Sar(colD(row, 14));
            s.setK24WeightG(colD(row, 15));
            s.setK24Pieces(colI(row, 16));
            s.setAvgInvoiceSar(colD(row, 17));
            s.setWtPureG(colD(row, 18));
            s.setGrossWeight(colD(row, 18));
            s.setWtSafeG(colD(row, 19));
            s.setSaleRate(colD(row, 20));
            s.setAvgMkgCharge(colD(row, 21));
            s.setK18WtPure(colD(row, 22));
            s.setK18WtSafe(colD(row, 23));
            s.setK18Rate(colD(row, 24));
            s.setK18AvgMkg(colD(row, 25));
            s.setK21WtPure(colD(row, 26));
            s.setK21WtSafe(colD(row, 27));
            s.setK21Rate(colD(row, 28));
            s.setK21AvgMkg(colD(row, 29));
            s.setK24WtPure(colD(row, 30));
            s.setK24WtSafe(colD(row, 31));
            s.setK24Rate(colD(row, 32));
            s.setK24AvgMkg(colD(row, 33));
            s.setK22Sar(colD(row, 34));
            s.setK22WeightG(colD(row, 35));
            s.setK22Pieces(colI(row, 36));
            s.setK22WtPure(colD(row, 37));
            s.setK22WtSafe(colD(row, 38));
            s.setK22Rate(colD(row, 39));
            s.setK22AvgMkg(colD(row, 40));
            s.setReturn(s.getTotalSarAmount() < 0);
            s.setSourceFileName("pg-import");
            s.setCreatedAt(LocalDateTime.now());
            branchSales.add(s);
        }
        saveBatched(branchSaleRepo, branchSales, "branch_sales");
        result.put("branchSales", branchSales.size());
        log.info("Imported {} branch_sales", branchSales.size());

        // ── 4. branch_purchases ───────────────────────────────────────
        // Columns: id, report_date(1), branch_code(2), branch_name(3), region(4),
        //          total_sar(5), total_weight_g(6), purchase_avg_mkg(7),
        //          k18_sar(8), k18_weight_g(9), k21_sar(10), k21_weight_g(11),
        //          k24_sar(12), k24_weight_g(13),
        //          wt_pure_g(14), wt_safe_g(15), purchase_rate(16),
        //          k18_wt_pure(17), k18_wt_safe(18), k18_rate(19),
        //          k21_wt_pure(20), k21_wt_safe(21), k21_rate(22),
        //          k24_wt_pure(23), k24_wt_safe(24), k24_rate(25)
        List<String[]> purchasesData = tables.getOrDefault("branch_purchases", List.of());
        branchPurchaseRepo.deleteByTenantId(tenantId);
        List<BranchPurchase> purchases = new ArrayList<>();
        for (String[] row : purchasesData) {
            if (row.length < 3) continue;
            BranchPurchase p = new BranchPurchase();
            p.setTenantId(tenantId);
            p.setPurchaseDate(parseDate(col(row, 1)));
            p.setBranchCode(col(row, 2));
            p.setBranchName(nullOrValue(col(row, 3)));
            p.setRegion(nullOrValue(col(row, 4)));
            p.setTotalSarAmount(Math.abs(colD(row, 5)));
            p.setNetWeight(Math.abs(colD(row, 6)));
            p.setPurchaseAvgMkg(colD(row, 7));
            p.setK18Sar(colD(row, 8));
            p.setK18WeightG(colD(row, 9));
            p.setK21Sar(colD(row, 10));
            p.setK21WeightG(colD(row, 11));
            p.setK24Sar(colD(row, 12));
            p.setK24WeightG(colD(row, 13));
            p.setWtPureG(colD(row, 14));
            p.setGrossWeight(colD(row, 14));
            p.setWtSafeG(colD(row, 15));
            p.setPurchaseRate(colD(row, 16));
            p.setK18WtPure(colD(row, 17));
            p.setK18WtSafe(colD(row, 18));
            p.setK18Rate(colD(row, 19));
            p.setK21WtPure(colD(row, 20));
            p.setK21WtSafe(colD(row, 21));
            p.setK21Rate(colD(row, 22));
            p.setK24WtPure(colD(row, 23));
            p.setK24WtSafe(colD(row, 24));
            p.setK24Rate(colD(row, 25));
            p.setSourceFileName("pg-import");
            p.setCreatedAt(LocalDateTime.now());
            purchases.add(p);
        }
        saveBatched(branchPurchaseRepo, purchases, "branch_purchases");
        result.put("branchPurchases", purchases.size());
        log.info("Imported {} branch_purchases", purchases.size());

        // ── 5. employee_sales ─────────────────────────────────────────
        // Columns: id, report_date(1), date_from(2), date_to(3),
        //          emp_id(4), emp_name(5), branch_code(6), branch_name(7), region(8),
        //          total_sar(9), weight_net_g(10), weight_pure_g(11), pieces(12),
        //          avg_invoice_sar(13), emp_avg_mkg(14), branch_purchase_avg(15),
        //          diff_avg(16), achieved_target(17), sale_rate_g(18)
        List<String[]> empSalesData = tables.getOrDefault("employee_sales", List.of());
        employeeSaleRepo.deleteByTenantId(tenantId);
        List<EmployeeSale> empSales = new ArrayList<>();
        for (String[] row : empSalesData) {
            if (row.length < 3) continue;
            EmployeeSale e = new EmployeeSale();
            e.setTenantId(tenantId);
            e.setSaleDate(parseDate(col(row, 1)));
            e.setDateFrom(parseDate(col(row, 2)));
            e.setDateTo(parseDate(col(row, 3)));
            e.setEmployeeId(col(row, 4));
            e.setEmployeeName(nullOrValue(col(row, 5)));
            e.setBranchCode(col(row, 6));
            e.setBranchName(nullOrValue(col(row, 7)));
            e.setRegion(nullOrValue(col(row, 8)));
            e.setTotalSarAmount(Math.abs(colD(row, 9)));
            e.setNetWeight(Math.abs(colD(row, 10)));
            e.setGrossWeight(Math.abs(colD(row, 11)));
            e.setInvoiceCount(parseLongSafe(col(row, 12)));
            e.setAvgInvoiceSar(colD(row, 13));
            e.setAvgMakingCharge(colD(row, 14));
            e.setBranchPurchaseAvg(colD(row, 15));
            e.setDiffAvg(colD(row, 16));
            String achv = nullOrValue(col(row, 17));
            e.setAchievedTarget("t".equals(achv) || "true".equalsIgnoreCase(achv));
            e.setSaleRate(colD(row, 18));
            e.setReturn(e.getTotalSarAmount() < 0);
            e.setSourceFileName("pg-import");
            e.setCreatedAt(LocalDateTime.now());
            empSales.add(e);
        }
        saveBatched(employeeSaleRepo, empSales, "employee_sales");
        result.put("employeeSales", empSales.size());
        log.info("Imported {} employee_sales", empSales.size());

        // ── 6. mothan_transactions ────────────────────────────────────
        // Columns: id, report_date(1), transaction_date(2), doc_ref(3),
        //          branch_code(4), branch_name(5), description(6),
        //          amount_sar(7), balance(8), weight_credit_g(9), weight_debit_g(10),
        //          rate_sar_per_g(11), balance_gold_g(12), balance_sar(13)
        List<String[]> mothanData = tables.getOrDefault("mothan_transactions", List.of());
        mothanRepo.deleteByTenantId(tenantId);
        List<MothanTransaction> mothans = new ArrayList<>();
        for (String[] row : mothanData) {
            if (row.length < 5) continue;
            MothanTransaction m = new MothanTransaction();
            m.setTenantId(tenantId);
            m.setReportDate(parseDate(col(row, 1)));
            m.setTransactionDate(parseDate(col(row, 2)));
            m.setDocReference(nullOrValue(col(row, 3)));
            m.setBranchCode(col(row, 4));
            m.setBranchName(nullOrValue(col(row, 5)));
            m.setDescription(nullOrValue(col(row, 6)));
            m.setAmountSar(colD(row, 7));
            m.setCreditSar(colD(row, 7));
            m.setRunningBalance(colD(row, 8));
            m.setWeightCreditG(colD(row, 9));
            m.setWeightDebitG(colD(row, 10));
            m.setGoldWeightGrams(colD(row, 10));
            m.setRateSarPerGram(colD(row, 11));
            m.setBalanceGoldG(colD(row, 12));
            m.setBalanceSar(colD(row, 13));
            m.setSourceFileName("pg-import");
            m.setCreatedAt(LocalDateTime.now());
            mothans.add(m);
        }
        mothanRepo.saveAll(mothans);
        result.put("mothanTransactions", mothans.size());
        log.info("Imported {} mothan_transactions", mothans.size());

        // ── 7. branch_purchase_rates ──────────────────────────────────
        // Columns: branch_code(0), branch_name(1), rate_purchase(2),
        //          total_sar(3), total_weight(4), last_updated(5), source_date(6)
        List<String[]> ratesData = tables.getOrDefault("branch_purchase_rates", List.of());
        purchaseRateRepo.deleteByTenantId(tenantId);
        List<BranchPurchaseRate> rates = new ArrayList<>();
        for (String[] row : ratesData) {
            if (row.length < 1) continue;
            BranchPurchaseRate r = new BranchPurchaseRate();
            r.setTenantId(tenantId);
            r.setBranchCode(col(row, 0));
            r.setBranchName(nullOrValue(col(row, 1)));
            r.setPurchaseRate(colD(row, 2));
            r.setTotalSar(colD(row, 3));
            r.setTotalWeight(colD(row, 4));
            r.setSourceDate(parseDate(col(row, row.length > 6 ? 6 : 5)));
            r.setUpdatedAt(LocalDateTime.now());
            rates.add(r);
        }
        purchaseRateRepo.saveAll(rates);
        result.put("branchPurchaseRates", rates.size());
        log.info("Imported {} branch_purchase_rates", rates.size());

        // ── 8. branch_targets ─────────────────────────────────────────
        // Columns: id(0), branch_code(1), branch_name(2), target_month(3),
        //          annual_target(4), monthly_target(5), daily_target(6),
        //          daily_per_emp(7), emp_count(8), target_rate_diff(9),
        //          month_pct(10), created_at(11)
        List<String[]> targetsData = tables.getOrDefault("branch_targets", List.of());
        branchTargetRepo.deleteByTenantId(tenantId);
        List<BranchTarget> targets = new ArrayList<>();
        for (String[] row : targetsData) {
            if (row.length < 2) continue;
            BranchTarget t = new BranchTarget();
            t.setTenantId(tenantId);
            t.setBranchCode(nullOrValue(col(row, 1)));
            t.setBranchName(nullOrValue(col(row, 2)));
            t.setTargetDate(parseDate(col(row, 3)));
            t.setAnnualTarget(colD(row, 4));
            t.setMonthlyTarget(colD(row, 5));
            t.setDailyTarget(colD(row, 6));
            t.setTargetNetWeightDaily(colD(row, 7));
            t.setEmpCount(colI(row, 8));
            t.setTargetRateDifference(colD(row, 9));
            t.setMonthPct(colD(row, 10));
            t.setUpdatedAt(parseDateTime(col(row, 11)));
            targets.add(t);
        }
        saveBatched(branchTargetRepo, targets, "branch_targets");
        result.put("branchTargets", targets.size());
        log.info("Imported {} branch_targets", targets.size());

        // ── 9. admin_notes ────────────────────────────────────────────
        List<String[]> notesData = tables.getOrDefault("admin_notes", List.of());
        adminNoteRepo.deleteByTenantId(tenantId);
        List<AdminNote> notes = new ArrayList<>();
        for (String[] row : notesData) {
            if (row.length < 2) continue;
            AdminNote n = new AdminNote();
            n.setTenantId(tenantId);
            n.setBranchCode(nullOrValue(col(row, 1)));
            n.setNoteDate(parseDate(col(row, 2)));
            n.setNoteText(col(row, 3));
            n.setCreatedBy(nullOrValue(col(row, 4)));
            n.setCreatedAt(parseDateTime(col(row, 5)));
            notes.add(n);
        }
        adminNoteRepo.saveAll(notes);
        result.put("adminNotes", notes.size());

        // ── 10. employee_targets ──────────────────────────────────────
        List<String[]> empTargetsData = tables.getOrDefault("employee_targets", List.of());
        empTargetRepo.deleteByTenantId(tenantId);
        List<EmployeeTarget> empTargets = new ArrayList<>();
        for (String[] row : empTargetsData) {
            if (row.length < 2) continue;
            EmployeeTarget et = new EmployeeTarget();
            et.setTenantId(tenantId);
            et.setEmpId(colI(row, 1));
            et.setEmpName(nullOrValue(col(row, 2)));
            et.setBranchCode(nullOrValue(col(row, 3)));
            et.setTargetMonth(parseDate(col(row, 4)));
            et.setTargetWeightG(colD(row, 5));
            et.setTargetDiffAvg(colD(row, 6));
            et.setTargetPieces(colI(row, 7));
            et.setTargetSalesSar(colD(row, 8));
            et.setCreatedBy(nullOrValue(col(row, 9)));
            et.setUpdatedAt(parseDateTime(col(row, 10)));
            empTargets.add(et);
        }
        empTargetRepo.saveAll(empTargets);
        result.put("employeeTargets", empTargets.size());

        // ── 11. employee_transfers ────────────────────────────────────
        List<String[]> transfersData = tables.getOrDefault("employee_transfers", List.of());
        empTransferRepo.deleteByTenantId(tenantId);
        List<EmployeeTransfer> transfers = new ArrayList<>();
        for (String[] row : transfersData) {
            if (row.length < 2) continue;
            EmployeeTransfer et = new EmployeeTransfer();
            et.setTenantId(tenantId);
            et.setEmpId(colI(row, 1));
            et.setEmpName(nullOrValue(col(row, 2)));
            et.setFromBranchCode(nullOrValue(col(row, 3)));
            et.setFromBranchName(nullOrValue(col(row, 4)));
            et.setToBranchCode(nullOrValue(col(row, 5)));
            et.setToBranchName(nullOrValue(col(row, 6)));
            et.setTransferDate(parseDate(col(row, 7)));
            et.setNotes(nullOrValue(col(row, 8)));
            et.setCreatedAt(parseDateTime(col(row, 9)));
            transfers.add(et);
        }
        empTransferRepo.saveAll(transfers);
        result.put("employeeTransfers", transfers.size());

        // ── 12. daily_sales ───────────────────────────────────────────
        List<String[]> dailySalesData = tables.getOrDefault("daily_sales", List.of());
        dailySaleRepo.deleteByTenantId(tenantId);
        List<DailySale> dailySales = new ArrayList<>();
        for (String[] row : dailySalesData) {
            if (row.length < 2) continue;
            DailySale ds = new DailySale();
            ds.setTenantId(tenantId);
            ds.setBranchId(colI(row, 1));
            ds.setSaleDate(parseDate(col(row, 2)));
            ds.setNetSales(colD(row, 3));
            ds.setGrossSales(colD(row, 4));
            ds.setDailyTarget(colD(row, 5));
            ds.setPurchases(colD(row, 6));
            ds.setCash(colD(row, 7));
            ds.setBank(colD(row, 8));
            double tgt = ds.getDailyTarget();
            ds.setAchievementPct(tgt > 0 ? Math.round(ds.getNetSales() / tgt * 10000.0) / 100.0 : 0);
            ds.setCreatedAt(parseDateTime(col(row, 9)));
            Branch b = branchById.get(ds.getBranchId());
            if (b != null) { ds.setBranchCode(String.valueOf(b.getPgId())); ds.setBranchName(b.getName()); }
            dailySales.add(ds);
        }
        dailySaleRepo.saveAll(dailySales);
        result.put("dailySales", dailySales.size());

        // ── 13. monthly_summaries ─────────────────────────────────────
        List<String[]> summariesData = tables.getOrDefault("monthly_summaries", List.of());
        monthlySummaryRepo.deleteByTenantId(tenantId);
        List<MonthlySummary> summaries = new ArrayList<>();
        for (String[] row : summariesData) {
            if (row.length < 2) continue;
            MonthlySummary ms = new MonthlySummary();
            ms.setTenantId(tenantId);
            ms.setBranchId(colI(row, 1));
            ms.setYear(colI(row, 2));
            ms.setMonth(colI(row, 3));
            ms.setTotalSales(colD(row, 4));
            ms.setTotalTarget(colD(row, 5));
            double tgt = ms.getTotalTarget();
            ms.setAchievementPct(tgt > 0 ? Math.round(ms.getTotalSales() / tgt * 10000.0) / 100.0 : 0);
            Branch b = branchById.get(ms.getBranchId());
            if (b != null) { ms.setBranchCode(String.valueOf(b.getPgId())); ms.setBranchName(b.getName()); }
            summaries.add(ms);
        }
        monthlySummaryRepo.saveAll(summaries);
        result.put("monthlySummaries", summaries.size());

        result.put("status", "ok");
        result.put("tenantId", tenantId);
        return result;
    }

    /** Batch-save in groups of 500 to avoid Atlas document size limits */
    private <T> void saveBatched(org.springframework.data.mongodb.repository.MongoRepository<T, String> repo,
            List<T> items, String label) {
        int batchSize = 500;
        for (int i = 0; i < items.size(); i += batchSize) {
            repo.saveAll(items.subList(i, Math.min(i + batchSize, items.size())));
            log.info("{}: saved {}/{}", label, Math.min(i + batchSize, items.size()), items.size());
        }
    }

    /** Parse PG dump SQL content: return Map of tableName → list of tab-split rows */
    private Map<String, List<String[]>> parseSqlContent(String content) throws IOException {
        Map<String, List<String[]>> result = new LinkedHashMap<>();
        String currentTable = null;
        List<String[]> currentRows = null;
        boolean inCopy = false;

        try (BufferedReader reader = new BufferedReader(new StringReader(content))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("COPY public.")) {
                    int dotIdx = line.indexOf('.') + 1;
                    int spaceIdx = line.indexOf(' ', dotIdx);
                    currentTable = line.substring(dotIdx, spaceIdx);
                    currentRows = new ArrayList<>();
                    result.put(currentTable, currentRows);
                    inCopy = true;
                    continue;
                }
                if (inCopy) {
                    if (line.equals("\\.")) {
                        inCopy = false;
                        currentTable = null;
                        currentRows = null;
                    } else if (!line.isEmpty()) {
                        currentRows.add(line.split("\t", -1));
                    }
                }
            }
        }
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private LocalDate parseDate(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return null;
        try { return LocalDate.parse(s.trim()); } catch (Exception e) { return null; }
    }

    private LocalDateTime parseDateTime(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return LocalDateTime.now();
        try {
            String c = s.trim().replace(" ", "T");
            if (c.contains("+")) c = c.substring(0, c.lastIndexOf('+')) + "+00:00";
            return ZonedDateTime.parse(c).toLocalDateTime();
        } catch (Exception e) { return LocalDateTime.now(); }
    }

    private double parseDouble(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return 0;
        try { return Double.parseDouble(s.trim()); } catch (Exception e) { return 0; }
    }

    private int parseInt(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return 0;
        try { return (int) Double.parseDouble(s.trim()); } catch (Exception e) { return 0; }
    }

    /** Parse piece/invoice counts: handles decimals like "50.0", always positive */
    private long parseLongSafe(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return 0;
        try { return Math.abs(Math.round(Double.parseDouble(s.trim()))); } catch (Exception e) { return 0; }
    }

    private String nullOrValue(String s) {
        return (s == null || s.equals("\\N")) ? null : s;
    }

    /** Safe column access — returns null if index is out of bounds */
    private String col(String[] row, int i) {
        return (row != null && i < row.length) ? row[i] : null;
    }

    private double colD(String[] row, int i) { return parseDouble(col(row, i)); }
    private int    colI(String[] row, int i) { return parseInt(col(row, i)); }
}
