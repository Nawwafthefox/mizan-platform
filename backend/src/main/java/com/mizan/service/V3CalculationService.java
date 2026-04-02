package com.mizan.service;

import com.mizan.config.BranchMaps;
import com.mizan.model.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * V3 Calculation Service — computes everything from BCNF tables.
 * No pre-computed fields; all formulas mirror Dashboard-101 exactly.
 */
@Slf4j
@Service
public class V3CalculationService {

    private final MongoTemplate mongo;

    public V3CalculationService(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    // ─── Internal aggregate holder ────────────────────────────────────────────

    private static class BranchAgg {
        String code;
        double totalSar, totalWeight;
        long   totalPieces;
        double returns;
        Set<LocalDate> returnDates = new HashSet<>();
        double k18Sar, k18Wt, k21Sar, k21Wt, k22Sar, k22Wt, k24Sar, k24Wt;
        double purchSar, purchWt, mothanSar, mothanWt;

        BranchAgg(String code) { this.code = code; }

        void addSale(V3SaleTransaction s) {
            totalSar    += s.getSarAmount();
            totalWeight += s.getPureWeightG();
            totalPieces += Math.abs(s.getPieces());
            if (s.getSarAmount() < 0) {
                returns += Math.abs(s.getSarAmount());
                if (s.getSaleDate() != null) returnDates.add(s.getSaleDate());
            }
            String k = s.getKarat(); if (k == null) return;
            switch (k) {
                case "18" -> { k18Sar += Math.abs(s.getSarAmount()); k18Wt += Math.abs(s.getPureWeightG()); }
                case "21" -> { k21Sar += Math.abs(s.getSarAmount()); k21Wt += Math.abs(s.getPureWeightG()); }
                case "22" -> { k22Sar += Math.abs(s.getSarAmount()); k22Wt += Math.abs(s.getPureWeightG()); }
                case "24" -> { k24Sar += Math.abs(s.getSarAmount()); k24Wt += Math.abs(s.getPureWeightG()); }
            }
        }
        void addPurch(V3PurchaseTransaction p) { purchSar += p.getSarAmount(); purchWt += p.getPureWeightG(); }
        void addMothan(V3MothanTransaction m)   { mothanSar += m.getAmountSar(); mothanWt += m.getWeightDebitG(); }

        Map<String, Object> toMap(Map<String, Double> fallbackRates) {
            double combSar  = purchSar + mothanSar;
            double combWt   = purchWt  + mothanWt;
            double saleRate = totalWeight != 0 ? r4(totalSar / totalWeight) : 0;
            double purchRate = combWt > 0 ? r4(combSar / combWt)
                : fallbackRates.getOrDefault(code, 0.0);
            double diffRate  = purchRate > 0 ? r4(saleRate - purchRate) : 0;
            double net       = totalSar - combSar;
            double avgInv    = totalPieces > 0 ? r2(totalSar / totalPieces) : 0;

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("branchCode",   code);
            m.put("branchName",   BranchMaps.getName(code));
            m.put("region",       BranchMaps.getRegion(code));
            m.put("totalSar",     totalSar);
            m.put("totalWeight",  totalWeight);
            m.put("totalPieces",  totalPieces);
            m.put("returns",      returns);
            m.put("returnDays",   returnDates.size());
            m.put("k18Sar", k18Sar); m.put("k18Wt", k18Wt);
            m.put("k21Sar", k21Sar); m.put("k21Wt", k21Wt);
            m.put("k22Sar", k22Sar); m.put("k22Wt", k22Wt);
            m.put("k24Sar", k24Sar); m.put("k24Wt", k24Wt);
            m.put("purchSar",     purchSar);
            m.put("purchWt",      purchWt);
            m.put("mothanSar",    mothanSar);
            m.put("mothanWt",     mothanWt);
            m.put("purchCombined", combSar);
            m.put("combinedWt",   combWt);
            m.put("saleRate",     saleRate);
            m.put("purchRate",    purchRate);
            m.put("diffRate",     diffRate);
            m.put("net",          net);
            m.put("avgInvoice",   avgInv);
            return m;
        }
    }

    // ─── Branch summaries ─────────────────────────────────────────────────────

    public List<Map<String, Object>> getBranchSummaries(String tenantId, LocalDate from, LocalDate to) {
        List<V3SaleTransaction>     sales     = querySales(tenantId, from, to);
        List<V3PurchaseTransaction> purchases = queryPurchases(tenantId, from, to);
        List<V3MothanTransaction>   mothan    = queryMothan(tenantId, from, to);
        Map<String, Double>         rates     = queryFallbackRates(tenantId);

        Map<String, BranchAgg> map = new LinkedHashMap<>();
        for (V3SaleTransaction s : sales)
            map.computeIfAbsent(s.getBranchCode(), BranchAgg::new).addSale(s);
        for (V3PurchaseTransaction p : purchases)
            map.computeIfAbsent(p.getBranchCode(), BranchAgg::new).addPurch(p);
        for (V3MothanTransaction m : mothan)
            if (m.getWeightDebitG() > 0)
                map.computeIfAbsent(m.getBranchCode(), BranchAgg::new).addMothan(m);

        return map.values().stream()
            .map(a -> a.toMap(rates))
            .sorted(Comparator.comparingDouble((Map<String, Object> r) -> (double) r.get("totalSar")).reversed())
            .collect(Collectors.toList());
    }

    // ─── Overview KPIs ────────────────────────────────────────────────────────

    public Map<String, Object> getOverviewKpis(String tenantId, LocalDate from, LocalDate to) {
        List<Map<String, Object>> branches = getBranchSummaries(tenantId, from, to);

        double totalSales   = branches.stream().mapToDouble(b -> (double)b.get("totalSar")).sum();
        double totalWeight  = branches.stream().mapToDouble(b -> (double)b.get("totalWeight")).sum();
        long   totalInv     = branches.stream().mapToLong(b -> (long)b.get("totalPieces")).sum();
        double totalPurch   = branches.stream().mapToDouble(b -> (double)b.get("purchCombined")).sum();
        double totalPurchWt = branches.stream().mapToDouble(b -> (double)b.get("combinedWt")).sum();
        double totalReturns = branches.stream().mapToDouble(b -> (double)b.get("returns")).sum();
        double branchPurch  = branches.stream().mapToDouble(b -> (double)b.get("purchSar")).sum();
        double branchPurchWt= branches.stream().mapToDouble(b -> (double)b.get("purchWt")).sum();
        double totalMothan  = branches.stream().mapToDouble(b -> (double)b.get("mothanSar")).sum();
        double totalMothanWt= branches.stream().mapToDouble(b -> (double)b.get("mothanWt")).sum();

        double saleRate  = totalWeight  > 0 ? r2(totalSales  / totalWeight)  : 0;
        double purchRate = totalPurchWt > 0 ? r2(totalPurch  / totalPurchWt) : 0;
        double rateDiff  = r2(saleRate - purchRate);
        double net       = totalSales - totalPurch;
        double avgInv    = totalInv > 0 ? r2(totalSales / totalInv) : 0;

        long profitableBranches = branches.stream().filter(b -> (double)b.get("diffRate") > 0).count();
        long negativeBranches   = branches.stream().filter(b -> (double)b.get("diffRate") < 0 && (double)b.get("purchRate") > 0).count();
        long returnBranchCount  = branches.stream().filter(b -> (double)b.get("returns") > 0).count();
        double returnPct        = totalSales > 0 ? r1(totalReturns / totalSales * 100) : 0;

        // Mothan transaction count
        Query mq = Query.query(Criteria.where("tenantId").is(tenantId)
            .and("transactionDate").gte(from).lte(to).and("weightDebitG").gt(0));
        long mothanTxnCount = mongo.count(mq, V3MothanTransaction.class);

        // Top branch
        Map<String, Object> topBranch = branches.stream()
            .max(Comparator.comparingDouble(b -> (double)b.get("totalSar"))).orElse(null);
        Map<String, Object> topReturnBranch = branches.stream()
            .max(Comparator.comparingDouble(b -> (double)b.get("returns"))).orElse(null);

        Map<String, Object> kpis = new LinkedHashMap<>();
        kpis.put("totalSales",          totalSales);
        kpis.put("totalPurchases",       totalPurch);
        kpis.put("net",                  net);
        kpis.put("totalWeight",          totalWeight);
        kpis.put("totalInvoices",        totalInv);
        kpis.put("avgInvoice",           avgInv);
        kpis.put("saleRate",             saleRate);
        kpis.put("totalPurchWt",         totalPurchWt);
        kpis.put("purchRate",            purchRate);
        kpis.put("rateDiff",             rateDiff);
        kpis.put("branchCount",          branches.size());
        kpis.put("profitableBranches",   profitableBranches);
        kpis.put("lossBranches",         negativeBranches);
        kpis.put("negativeBranches",     negativeBranches);
        kpis.put("branchPurchases",      branchPurch);
        kpis.put("branchPurchWt",        branchPurchWt);
        kpis.put("totalMothan",          totalMothan);
        kpis.put("totalMothanWt",        totalMothanWt);
        kpis.put("mothanTxnCount",       mothanTxnCount);
        kpis.put("totalReturns",         totalReturns);
        kpis.put("returnBranchCount",    returnBranchCount);
        kpis.put("returnPctOfSales",     returnPct);
        kpis.put("topBranchName",        topBranch != null ? topBranch.get("branchName") : null);
        kpis.put("topBranchSar",         topBranch != null ? topBranch.get("totalSar")   : 0);
        kpis.put("topReturnBranchName",  topReturnBranch != null ? topReturnBranch.get("branchName") : null);
        kpis.put("topReturnBranchSar",   topReturnBranch != null ? topReturnBranch.get("returns")    : 0);
        return kpis;
    }

    // ─── Employee performance ─────────────────────────────────────────────────

    public List<Map<String, Object>> getEmployeePerformance(String tenantId, LocalDate from, LocalDate to) {
        Query q = Query.query(Criteria.where("tenantId").is(tenantId)
            .and("saleDate").gte(from).lte(to));
        List<V3EmployeeSaleTransaction> empSales = mongo.find(q, V3EmployeeSaleTransaction.class);

        // Per-branch purch rates from branch summaries
        List<Map<String, Object>> branchSums = getBranchSummaries(tenantId, from, to);
        Map<String, Double> branchPurchRates = branchSums.stream()
            .collect(Collectors.toMap(b -> (String)b.get("branchCode"), b -> (double)b.get("purchRate")));

        // Aggregate per employee
        Map<String, EmpAgg> empMap = new LinkedHashMap<>();
        for (V3EmployeeSaleTransaction t : empSales) {
            EmpAgg agg = empMap.computeIfAbsent(t.getEmpId(),
                k -> new EmpAgg(t.getEmpId(), t.getEmpName(), t.getBranchCode()));
            agg.add(t);
        }

        List<Map<String, Object>> result = empMap.values().stream()
            .map(a -> a.toMap(branchPurchRates))
            .sorted(Comparator.comparingDouble((Map<String, Object> r) -> (double)r.get("totalSar")).reversed())
            .collect(Collectors.toList());

        // Group by branch
        Map<String, List<Map<String,Object>>> byBranch = result.stream()
            .collect(Collectors.groupingBy(e -> (String)e.get("branchCode"), LinkedHashMap::new, Collectors.toList()));

        List<Map<String,Object>> branches = new ArrayList<>();
        for (Map.Entry<String, List<Map<String,Object>>> e : byBranch.entrySet()) {
            List<Map<String,Object>> emps = e.getValue();
            Map<String,Object> br = new LinkedHashMap<>();
            br.put("branchCode",     e.getKey());
            br.put("branchName",     BranchMaps.getName(e.getKey()));
            br.put("region",         BranchMaps.getRegion(e.getKey()));
            br.put("employeeCount",  emps.size());
            br.put("totalSar",       emps.stream().mapToDouble(x -> (double)x.get("totalSar")).sum());
            br.put("employees",      emps);
            branches.add(br);
        }
        branches.sort(Comparator.comparingDouble((Map<String,Object> b) -> (double)b.get("totalSar")).reversed());
        return branches;
    }

    // ─── Daily trend ──────────────────────────────────────────────────────────

    public List<Map<String, Object>> getDailyTrend(String tenantId, LocalDate from, LocalDate to) {
        List<V3SaleTransaction>     sales     = querySales(tenantId, from, to);
        List<V3PurchaseTransaction> purchases = queryPurchases(tenantId, from, to);
        List<V3MothanTransaction>   mothan    = queryMothan(tenantId, from, to);

        Map<LocalDate, double[]> dayMap = new TreeMap<>(); // [sar, wt, purch, mothan]
        for (V3SaleTransaction s : sales) {
            double[] d = dayMap.computeIfAbsent(s.getSaleDate(), k -> new double[4]);
            d[0] += s.getSarAmount(); d[1] += s.getPureWeightG();
        }
        for (V3PurchaseTransaction p : purchases) {
            double[] d = dayMap.computeIfAbsent(p.getPurchaseDate(), k -> new double[4]);
            d[2] += p.getSarAmount();
        }
        for (V3MothanTransaction m : mothan) {
            if (m.getWeightDebitG() > 0) {
                double[] d = dayMap.computeIfAbsent(m.getTransactionDate(), k -> new double[4]);
                d[3] += m.getAmountSar();
            }
        }

        List<Map<String, Object>> trend = new ArrayList<>();
        for (Map.Entry<LocalDate, double[]> e : dayMap.entrySet()) {
            double[] d = e.getValue();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date",       e.getKey().toString());
            row.put("totalSar",   d[0]);
            row.put("totalWeight", d[1]);
            row.put("purchases",  d[2] + d[3]);
            row.put("net",        d[0] - d[2] - d[3]);
            trend.add(row);
        }
        return trend;
    }

    // ─── Target achievement ───────────────────────────────────────────────────

    public List<Map<String, Object>> getTargetAchievement(String tenantId, LocalDate from, LocalDate to) {
        List<Map<String, Object>> branches = getBranchSummaries(tenantId, from, to);
        Query tq = Query.query(Criteria.where("tenantId").is(tenantId));
        List<com.mizan.model.BranchTarget> targets = mongo.find(tq, com.mizan.model.BranchTarget.class);

        if (targets.isEmpty()) return List.of();

        // Months in range
        long months = from.until(to, java.time.temporal.ChronoUnit.MONTHS) + 1;

        Map<String, Map<String,Object>> branchMap = branches.stream()
            .collect(Collectors.toMap(b -> (String)b.get("branchCode"), b -> b));

        Map<String, com.mizan.model.BranchTarget> targetMap = targets.stream()
            .collect(Collectors.toMap(com.mizan.model.BranchTarget::getBranchCode, t -> t, (a, b) -> a));

        List<Map<String, Object>> result = new ArrayList<>();
        for (String code : branchMap.keySet()) {
            com.mizan.model.BranchTarget target = targetMap.get(code);
            if (target == null) continue;
            Map<String,Object> b = branchMap.get(code);

            int empCount = Math.max(1, target.getEmpCount() - 1);
            double monthlyTotal = target.getMonthlyTarget() * months;
            double targetWt = (monthlyTotal / empCount);
            double actualWt = Math.abs((double)b.get("totalWeight"));
            double wtPct    = targetWt > 0 ? r2((actualWt - targetWt) / targetWt * 100) : 0;
            double diffRate = Math.abs((double)b.get("diffRate"));
            double actualProfit = actualWt * diffRate;
            double targetProfit = targetWt * target.getTargetRateDifference();
            double profitPct = targetProfit > 0 ? r2((actualProfit - targetProfit) / targetProfit * 100) : 0;
            double achievePct = targetWt > 0 ? r2(actualWt / targetWt * 100) : 0;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("branchCode",    code);
            row.put("branchName",    b.get("branchName"));
            row.put("region",        b.get("region"));
            row.put("targetWt",      targetWt);
            row.put("actualWt",      actualWt);
            row.put("wtPct",         wtPct);
            row.put("achievePct",    achievePct);
            row.put("actualProfit",  actualProfit);
            row.put("targetProfit",  targetProfit);
            row.put("profitPct",     profitPct);
            row.put("status",        achievePct >= 100 ? "exceeded" : achievePct >= 70 ? "onTrack" : "behind");
            result.add(row);
        }
        result.sort(Comparator.comparingDouble((Map<String,Object> r) -> (double)r.get("achievePct")).reversed());
        return result;
    }

    // ─── Query helpers ────────────────────────────────────────────────────────

    private List<V3SaleTransaction> querySales(String tenantId, LocalDate from, LocalDate to) {
        return mongo.find(Query.query(Criteria.where("tenantId").is(tenantId)
            .and("saleDate").gte(from).lte(to)), V3SaleTransaction.class);
    }

    private List<V3PurchaseTransaction> queryPurchases(String tenantId, LocalDate from, LocalDate to) {
        return mongo.find(Query.query(Criteria.where("tenantId").is(tenantId)
            .and("purchaseDate").gte(from).lte(to)), V3PurchaseTransaction.class);
    }

    private List<V3MothanTransaction> queryMothan(String tenantId, LocalDate from, LocalDate to) {
        return mongo.find(Query.query(Criteria.where("tenantId").is(tenantId)
            .and("transactionDate").gte(from).lte(to)), V3MothanTransaction.class);
    }

    private Map<String, Double> queryFallbackRates(String tenantId) {
        return mongo.find(Query.query(Criteria.where("tenantId").is(tenantId)), V3BranchPurchaseRate.class)
            .stream().collect(Collectors.toMap(V3BranchPurchaseRate::getBranchCode,
                V3BranchPurchaseRate::getPurchaseRate, (a, b) -> a));
    }

    // ─── Math ─────────────────────────────────────────────────────────────────

    private static double r4(double v) { return Math.round(v * 10000.0) / 10000.0; }
    private static double r2(double v) { return Math.round(v * 100.0)   / 100.0; }
    private static double r1(double v) { return Math.round(v * 10.0)    / 10.0; }

    // ─── Employee aggregate ───────────────────────────────────────────────────

    private static class EmpAgg {
        final String empId, empName, branchCode;
        double totalSar, totalWeight;
        long totalPieces;
        double returns;
        Set<LocalDate> returnDates = new HashSet<>();
        int days = 0;

        EmpAgg(String empId, String empName, String branchCode) {
            this.empId = empId; this.empName = empName; this.branchCode = branchCode;
        }

        void add(V3EmployeeSaleTransaction t) {
            totalSar    += t.getSarAmount();
            totalWeight += t.getPureWeightG();
            totalPieces += Math.abs(t.getPieces());
            days++;
            if (t.getSarAmount() < 0) {
                returns += Math.abs(t.getSarAmount());
                if (t.getSaleDate() != null) returnDates.add(t.getSaleDate());
            }
        }

        Map<String, Object> toMap(Map<String, Double> branchPurchRates) {
            double saleRate     = totalWeight != 0 ? r4(totalSar / totalWeight) : 0;
            double purchRate    = branchPurchRates.getOrDefault(branchCode, 0.0);
            double diffRate     = Math.round((saleRate - purchRate) * 10) / 10.0;
            double profitMargin = purchRate > 0 ? r2(totalWeight * diffRate) : 0;
            double avgInvoice   = totalPieces > 0 ? r2(totalSar / totalPieces) : 0;
            String rating = saleRate >= 700 ? "excellent" : saleRate >= 600 ? "good"
                          : saleRate >= 500 ? "average" : "weak";

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("empId",        empId);
            m.put("empName",      empName);
            m.put("branchCode",   branchCode);
            m.put("branchName",   BranchMaps.getName(branchCode));
            m.put("region",       BranchMaps.getRegion(branchCode));
            m.put("totalSar",     totalSar);
            m.put("totalWeight",  totalWeight);
            m.put("totalPieces",  totalPieces);
            m.put("days",         days);
            m.put("returns",      returns);
            m.put("returnDays",   returnDates.size());
            m.put("saleRate",     saleRate);
            m.put("purchRate",    purchRate);
            m.put("diffRate",     diffRate);
            m.put("profitMargin", profitMargin);
            m.put("avgInvoice",   avgInvoice);
            m.put("achieved",     saleRate > purchRate);
            m.put("rating",       rating);
            return m;
        }

        private static double r4(double v) { return Math.round(v * 10000.0) / 10000.0; }
        private static double r2(double v) { return Math.round(v * 100.0) / 100.0; }
    }
}
