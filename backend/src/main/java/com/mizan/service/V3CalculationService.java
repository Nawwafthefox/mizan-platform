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
import java.util.function.Function;
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

    // ─── Regions ─────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getRegions(String tenantId, LocalDate from, LocalDate to) {
        List<Map<String, Object>> branches = getBranchSummaries(tenantId, from, to);
        Map<String, List<Map<String, Object>>> byRegion = branches.stream()
            .collect(Collectors.groupingBy(b -> (String) b.get("region"), LinkedHashMap::new, Collectors.toList()));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> e : byRegion.entrySet()) {
            List<Map<String, Object>> bl = e.getValue();
            double totalSar   = bl.stream().mapToDouble(b -> (double) b.get("totalSar")).sum();
            double totalWt    = bl.stream().mapToDouble(b -> (double) b.get("totalWeight")).sum();
            double totalPurch = bl.stream().mapToDouble(b -> (double) b.get("purchCombined")).sum();
            double totalPurchWt = bl.stream().mapToDouble(b -> (double) b.get("combinedWt")).sum();
            double net        = totalSar - totalPurch;
            double saleRate   = totalWt > 0 ? r4(totalSar / totalWt) : 0;
            double purchRate  = totalPurchWt > 0 ? r4(totalPurch / totalPurchWt) : 0;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("region",      e.getKey());
            m.put("branchCount", bl.size());
            m.put("totalSar",    totalSar);
            m.put("totalWeight", totalWt);
            m.put("totalPurch",  totalPurch);
            m.put("net",         net);
            m.put("saleRate",    saleRate);
            m.put("purchRate",   purchRate);
            m.put("diffRate",    r2(saleRate - purchRate));
            m.put("branches",    bl);
            result.add(m);
        }
        result.sort(Comparator.comparingDouble((Map<String, Object> r) -> (double) r.get("totalSar")).reversed());
        return result;
    }

    // ─── Karat Breakdown ─────────────────────────────────────────────────────

    public Map<String, Object> getKaratBreakdown(String tenantId, LocalDate from, LocalDate to) {
        List<V3SaleTransaction> sales     = querySales(tenantId, from, to);
        List<V3PurchaseTransaction> purch = queryPurchases(tenantId, from, to);
        List<String> karats = List.of("18", "21", "22", "24");

        Map<String, double[]> ks = new LinkedHashMap<>(); // [saleSar, saleWt, purchSar, purchWt]
        karats.forEach(k -> ks.put(k, new double[4]));

        for (V3SaleTransaction s : sales) {
            String k = s.getKarat(); if (k == null || !ks.containsKey(k)) continue;
            double[] t = ks.get(k);
            t[0] += Math.abs(s.getSarAmount()); t[1] += Math.abs(s.getPureWeightG());
        }
        for (V3PurchaseTransaction p : purch) {
            String k = p.getKarat(); if (k == null || !ks.containsKey(k)) continue;
            double[] t = ks.get(k);
            t[2] += p.getSarAmount(); t[3] += p.getPureWeightG();
        }
        double grandSar = ks.values().stream().mapToDouble(t -> t[0]).sum();

        Map<String, Object> totals = new LinkedHashMap<>();
        for (Map.Entry<String, double[]> e : ks.entrySet()) {
            double[] t = e.getValue();
            double sr = t[1] > 0 ? r2(t[0] / t[1]) : 0;
            double pr = t[3] > 0 ? r2(t[2] / t[3]) : 0;
            Map<String, Object> km = new LinkedHashMap<>();
            km.put("sar", t[0]); km.put("wt", t[1]); km.put("purchSar", t[2]); km.put("purchWt", t[3]);
            km.put("saleRate", sr); km.put("purchRate", pr);
            km.put("marginPerGram", r2(sr - pr));
            km.put("pct", grandSar > 0 ? r1(t[0] / grandSar * 100) : 0);
            totals.put("k" + e.getKey(), km);
        }

        Map<String, Map<String, double[]>> branchKarat = new LinkedHashMap<>();
        for (V3SaleTransaction s : sales) {
            String k = s.getKarat(); if (k == null || !ks.containsKey(k)) continue;
            Map<String, double[]> bm = branchKarat.computeIfAbsent(s.getBranchCode(), bc -> {
                Map<String, double[]> m = new LinkedHashMap<>();
                karats.forEach(kk -> m.put(kk, new double[2]));
                return m;
            });
            bm.get(k)[0] += Math.abs(s.getSarAmount());
            bm.get(k)[1] += Math.abs(s.getPureWeightG());
        }
        List<Map<String, Object>> byBranch = branchKarat.entrySet().stream().map(e -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("branchCode", e.getKey()); row.put("branchName", BranchMaps.getName(e.getKey()));
            row.put("region", BranchMaps.getRegion(e.getKey()));
            karats.forEach(k -> { double[] t = e.getValue().get(k); row.put("k"+k+"Sar", t[0]); row.put("k"+k+"Wt", t[1]); });
            return row;
        }).sorted(Comparator.comparingDouble((Map<String,Object> r) ->
            -karats.stream().mapToDouble(k -> (double) r.get("k"+k+"Sar")).sum()))
          .collect(Collectors.toList());

        return Map.of("totals", totals, "byBranch", byBranch);
    }

    // ─── Mothan Detail ────────────────────────────────────────────────────────

    public Map<String, Object> getMothanDetail(String tenantId, LocalDate from, LocalDate to) {
        List<V3MothanTransaction> txns = queryMothan(tenantId, from, to)
            .stream().filter(m -> m.getWeightDebitG() > 0).collect(Collectors.toList());
        double totalSar = txns.stream().mapToDouble(V3MothanTransaction::getAmountSar).sum();
        double totalWt  = txns.stream().mapToDouble(V3MothanTransaction::getWeightDebitG).sum();
        List<Map<String, Object>> transactions = txns.stream().map(m -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date",         m.getTransactionDate() != null ? m.getTransactionDate().toString() : "");
            row.put("branchCode",   m.getBranchCode()); row.put("branchName", BranchMaps.getName(m.getBranchCode()));
            row.put("region",       BranchMaps.getRegion(m.getBranchCode()));
            row.put("docRef",       m.getDocReference()); row.put("description", m.getDescription());
            row.put("amountSar",    m.getAmountSar()); row.put("weightDebitG", m.getWeightDebitG());
            row.put("rate",         m.getWeightDebitG() > 0 ? r2(m.getAmountSar() / m.getWeightDebitG()) : 0);
            return row;
        }).sorted(Comparator.comparing(r -> ((String) r.get("date")), Comparator.reverseOrder())).collect(Collectors.toList());

        Map<String, double[]> bbMap = new LinkedHashMap<>();
        Map<String, Integer>  bbCnt = new LinkedHashMap<>();
        for (V3MothanTransaction m : txns) {
            String bc = m.getBranchCode();
            bbMap.computeIfAbsent(bc, k -> new double[2]);
            bbMap.get(bc)[0] += m.getAmountSar(); bbMap.get(bc)[1] += m.getWeightDebitG();
            bbCnt.merge(bc, 1, Integer::sum);
        }
        List<Map<String, Object>> byBranch = bbMap.entrySet().stream().map(e -> {
            double[] t = e.getValue();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("branchCode", e.getKey()); row.put("branchName", BranchMaps.getName(e.getKey()));
            row.put("region", BranchMaps.getRegion(e.getKey()));
            row.put("totalSar", t[0]); row.put("totalWt", t[1]);
            row.put("avgRate", t[1] > 0 ? r2(t[0] / t[1]) : 0);
            row.put("txnCount", bbCnt.getOrDefault(e.getKey(), 0));
            return row;
        }).sorted(Comparator.comparingDouble((Map<String,Object> r) -> (double) r.get("totalSar")).reversed()).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalSar", totalSar); result.put("totalWt", totalWt);
        result.put("avgRate",  totalWt > 0 ? r2(totalSar / totalWt) : 0);
        result.put("txnCount", txns.size());
        result.put("transactions", transactions); result.put("byBranch", byBranch);
        return result;
    }

    // ─── Comparison ────────────────────────────────────────────────────────────

    public Map<String, Object> getComparison(String tenantId, LocalDate d1, LocalDate d2) {
        List<Map<String, Object>> b1 = getBranchSummaries(tenantId, d1, d1);
        List<Map<String, Object>> b2 = getBranchSummaries(tenantId, d2, d2);
        Map<String, Map<String, Object>> map1 = b1.stream().collect(Collectors.toMap(b -> (String) b.get("branchCode"), b -> b));
        Map<String, Map<String, Object>> map2 = b2.stream().collect(Collectors.toMap(b -> (String) b.get("branchCode"), b -> b));

        double sar1 = b1.stream().mapToDouble(b -> (double) b.get("totalSar")).sum();
        double sar2 = b2.stream().mapToDouble(b -> (double) b.get("totalSar")).sum();
        double p1   = b1.stream().mapToDouble(b -> (double) b.get("purchCombined")).sum();
        double p2   = b2.stream().mapToDouble(b -> (double) b.get("purchCombined")).sum();
        double w1   = b1.stream().mapToDouble(b -> (double) b.get("totalWeight")).sum();
        double w2   = b2.stream().mapToDouble(b -> (double) b.get("totalWeight")).sum();
        double pw1  = b1.stream().mapToDouble(b -> (double) b.get("combinedWt")).sum();
        double pw2  = b2.stream().mapToDouble(b -> (double) b.get("combinedWt")).sum();

        java.util.function.Function<double[], Map<String,Object>> summary = arr -> {
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("totalSar",   arr[0]); m.put("totalPurch", arr[1]); m.put("net", arr[0]-arr[1]);
            m.put("totalWeight", arr[2]);
            m.put("saleRate",  arr[2]>0 ? r2(arr[0]/arr[2]) : 0);
            m.put("purchRate", arr[3]>0 ? r2(arr[1]/arr[3]) : 0);
            return m;
        };

        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("totalSarDelta", r2(sar2-sar1)); delta.put("totalSarPct", sar1!=0 ? r1((sar2-sar1)/Math.abs(sar1)*100) : 0);
        delta.put("netDelta", r2((sar2-p2)-(sar1-p1)));
        delta.put("purchDelta", r2(p2-p1)); delta.put("weightDelta", r2(w2-w1));
        delta.put("saleRateDelta", r2((w2>0?sar2/w2:0)-(w1>0?sar1/w1:0)));

        Set<String> allCodes = new LinkedHashSet<>(map1.keySet()); allCodes.addAll(map2.keySet());
        List<Map<String, Object>> byBranch = new ArrayList<>();
        for (String code : allCodes) {
            Map<String,Object> bb1 = map1.get(code), bb2 = map2.get(code);
            double bs1=bb1!=null?(double)bb1.get("totalSar"):0, bs2=bb2!=null?(double)bb2.get("totalSar"):0;
            double bw1=bb1!=null?(double)bb1.get("totalWeight"):0, bw2=bb2!=null?(double)bb2.get("totalWeight"):0;
            double bp1=bb1!=null?(double)bb1.get("purchCombined"):0, bp2=bb2!=null?(double)bb2.get("purchCombined"):0;
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode",  code); row.put("branchName", BranchMaps.getName(code));
            row.put("region",      BranchMaps.getRegion(code));
            row.put("sar1",bs1); row.put("sar2",bs2); row.put("sarDelta",r2(bs2-bs1));
            row.put("sarDeltaPct", bs1!=0 ? r1((bs2-bs1)/Math.abs(bs1)*100) : 0);
            row.put("wt1",bw1); row.put("wt2",bw2); row.put("wtDelta",r2(bw2-bw1));
            row.put("purch1",bp1); row.put("purch2",bp2); row.put("purchDelta",r2(bp2-bp1));
            row.put("net1",r2(bs1-bp1)); row.put("net2",r2(bs2-bp2)); row.put("netDelta",r2((bs2-bp2)-(bs1-bp1)));
            byBranch.add(row);
        }
        byBranch.sort(Comparator.comparingDouble((Map<String,Object> r) -> -Math.abs((double) r.get("sarDelta"))));

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("d1", d1.toString()); res.put("d2", d2.toString());
        res.put("day1", summary.apply(new double[]{sar1,p1,w1,pw1}));
        res.put("day2", summary.apply(new double[]{sar2,p2,w2,pw2}));
        res.put("delta", delta); res.put("byBranch", byBranch);
        return res;
    }

    // ─── Alerts ───────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getAlerts(String tenantId, LocalDate from, LocalDate to) {
        List<Map<String, Object>> branches = getBranchSummaries(tenantId, from, to);
        List<Map<String, Object>> alerts = new ArrayList<>();
        for (Map<String, Object> b : branches) {
            String code = (String) b.get("branchCode"), name = (String) b.get("branchName"), region = (String) b.get("region");
            double sar = (double) b.get("totalSar"), returns = (double) b.get("returns"),
                   diffRate = (double) b.get("diffRate"), purchRate = (double) b.get("purchRate"),
                   purch = (double) b.get("purchCombined");
            int returnDays = (int) b.get("returnDays");
            double returnPct = sar > 0 ? returns / sar * 100 : 0;
            if (sar == 0) continue;
            if (purchRate > 0 && diffRate < 0)
                alerts.add(mkAlert(code,name,region,"NEGATIVE_RATE","critical","فرق معدل سلبي",
                    String.format("معدل البيع %.0f < معدل الشراء %.0f (الفارق %.1f ر/ج)",(double)b.get("saleRate"),purchRate,diffRate),diffRate));
            if (purch == 0)
                alerts.add(mkAlert(code,name,region,"NO_PURCHASES","info","لا توجد مشتريات",
                    String.format("مبيعات %.0f ريال بدون مشتريات",sar),0.0));
            if (returns > 0) {
                String sev = returnPct>=10?"critical":returnPct>=5?"warning":"info";
                alerts.add(mkAlert(code,name,region,"RETURNS",sev,
                    returnPct>=10?"مرتجعات مرتفعة جداً":returnPct>=5?"مرتجعات مرتفعة":"مرتجعات",
                    String.format("%.1f%% من المبيعات مرتجعات (%.0f ريال)",returnPct,returns),returnPct));
            }
            if (returnDays >= 3)
                alerts.add(mkAlert(code,name,region,"CONSECUTIVE_RETURNS","critical","مرتجعات متتالية",
                    String.format("مرتجعات في %d أيام خلال الفترة",returnDays),(double)returnDays));
        }
        Map<String,Integer> ord = Map.of("critical",0,"warning",1,"info",2);
        alerts.sort(Comparator.comparingInt(a -> ord.getOrDefault((String) a.get("severity"), 3)));
        return alerts;
    }

    private Map<String, Object> mkAlert(String code, String name, String region, String type,
                                         String sev, String title, String msg, double val) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("branchCode",code); m.put("branchName",name); m.put("region",region);
        m.put("type",type); m.put("severity",sev); m.put("titleAr",title);
        m.put("messageAr",msg); m.put("value",val);
        return m;
    }

    // ─── Premium Analytics ───────────────────────────────────────────────────

    public Map<String, Object> getPremiumAnalytics(String tenantId, LocalDate from, LocalDate to) {
        List<Map<String, Object>> branches  = getBranchSummaries(tenantId, from, to);
        List<V3SaleTransaction>   sales     = querySales(tenantId, from, to);
        List<V3PurchaseTransaction> purchases = queryPurchases(tenantId, from, to);
        List<V3MothanTransaction>   mothan  = queryMothan(tenantId, from, to);
        Map<String, Object> result = new LinkedHashMap<>();

        double totalSar   = branches.stream().mapToDouble(b -> (double) b.get("totalSar")).sum();
        double totalWt    = branches.stream().mapToDouble(b -> (double) b.get("totalWeight")).sum();
        double totalPurch = branches.stream().mapToDouble(b -> (double) b.get("purchCombined")).sum();
        double totalPurchWt = branches.stream().mapToDouble(b -> (double) b.get("combinedWt")).sum();
        double revPerGram = totalWt > 0 ? r2(totalSar / totalWt) : 0;

        // Revenue efficiency vs previous period
        long periodDays = from.until(to, java.time.temporal.ChronoUnit.DAYS) + 1;
        List<Map<String, Object>> prev = getBranchSummaries(tenantId, from.minusDays(periodDays), from.minusDays(1));
        double prevSar = prev.stream().mapToDouble(b -> (double) b.get("totalSar")).sum();
        double prevWt  = prev.stream().mapToDouble(b -> (double) b.get("totalWeight")).sum();
        double prevRPG = prevWt > 0 ? r2(prevSar / prevWt) : 0;

        Map<LocalDate, double[]> dayRevMap = new TreeMap<>();
        for (V3SaleTransaction s : sales) {
            double[] d = dayRevMap.computeIfAbsent(s.getSaleDate(), k -> new double[2]);
            d[0] += s.getSarAmount(); d[1] += s.getPureWeightG();
        }
        List<Map<String,Object>> revTrend = new ArrayList<>();
        for (Map.Entry<LocalDate, double[]> e : dayRevMap.entrySet()) {
            double[] d = e.getValue();
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("date", e.getKey().toString()); row.put("value", d[1]>0?r2(d[0]/d[1]):0);
            revTrend.add(row);
        }
        Map<String,Object> revEff = new LinkedHashMap<>();
        revEff.put("current",revPerGram); revEff.put("previous",prevRPG);
        revEff.put("changePct", prevRPG>0?r1((revPerGram-prevRPG)/prevRPG*100):0);
        revEff.put("trend",revTrend);
        result.put("revenueEfficiency", revEff);

        // Branch quadrant
        double[] sarArr = branches.stream().mapToDouble(b -> (double) b.get("totalSar")).sorted().toArray();
        double[] drArr  = branches.stream().mapToDouble(b -> (double) b.get("diffRate")).sorted().toArray();
        double medSar   = sarArr.length > 0 ? sarArr[sarArr.length / 2] : 0;
        double medDiff  = drArr.length  > 0 ? drArr[drArr.length / 2] : 0;
        List<Map<String,Object>> quadrant = branches.stream().map(b -> {
            double bSar = (double)b.get("totalSar"), bDr = (double)b.get("diffRate");
            String q = bSar>=medSar && bDr>=medDiff ? "star" : bSar>=medSar ? "cash_cow" : bDr>=medDiff ? "question" : "dog";
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode",b.get("branchCode")); row.put("branchName",b.get("branchName"));
            row.put("region",b.get("region")); row.put("totalSar",bSar);
            row.put("diffRate",bDr); row.put("quadrant",q);
            return row;
        }).collect(Collectors.toList());
        result.put("branchQuadrant",quadrant); result.put("medianSar",medSar); result.put("medianDiff",medDiff);

        // Karat profitability
        List<String> karats = List.of("18","21","22","24");
        Map<String,double[]> kSale=new LinkedHashMap<>(), kPurch=new LinkedHashMap<>();
        karats.forEach(k -> { kSale.put(k,new double[2]); kPurch.put(k,new double[2]); });
        for (V3SaleTransaction s : sales) { String k=s.getKarat(); if(k==null||!kSale.containsKey(k))continue; kSale.get(k)[0]+=Math.abs(s.getSarAmount()); kSale.get(k)[1]+=Math.abs(s.getPureWeightG()); }
        for (V3PurchaseTransaction p : purchases) { String k=p.getKarat(); if(k==null||!kPurch.containsKey(k))continue; kPurch.get(k)[0]+=p.getSarAmount(); kPurch.get(k)[1]+=p.getPureWeightG(); }
        double grandKarSar = kSale.values().stream().mapToDouble(t->t[0]).sum();
        List<Map<String,Object>> karatProfit = karats.stream().map(k -> {
            double[] s=kSale.get(k), p=kPurch.get(k);
            double sr=s[1]>0?r2(s[0]/s[1]):0, pr=p[1]>0?r2(p[0]/p[1]):0;
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("karat",k); row.put("totalSar",s[0]); row.put("totalWt",s[1]);
            row.put("avgSaleRate",sr); row.put("avgPurchRate",pr);
            row.put("marginPerGram",r2(sr-pr)); row.put("pctOfSales",grandKarSar>0?r1(s[0]/grandKarSar*100):0);
            return row;
        }).collect(Collectors.toList());
        result.put("karatProfitability", karatProfit);

        // Purchase timing trend
        Map<LocalDate,double[]> dayP=new TreeMap<>(), dayS2=new TreeMap<>();
        for (V3PurchaseTransaction p : purchases) { if(p.getPurchaseDate()==null)continue; double[]d=dayP.computeIfAbsent(p.getPurchaseDate(),k->new double[2]); d[0]+=p.getSarAmount(); d[1]+=p.getPureWeightG(); }
        for (V3MothanTransaction m : mothan) { if(m.getTransactionDate()==null||m.getWeightDebitG()<=0)continue; double[]d=dayP.computeIfAbsent(m.getTransactionDate(),k->new double[2]); d[0]+=m.getAmountSar(); d[1]+=m.getWeightDebitG(); }
        for (V3SaleTransaction s : sales) { if(s.getSaleDate()==null)continue; double[]d=dayS2.computeIfAbsent(s.getSaleDate(),k->new double[2]); d[0]+=s.getSarAmount(); d[1]+=s.getPureWeightG(); }
        Set<LocalDate> allD=new TreeSet<>(dayP.keySet()); allD.addAll(dayS2.keySet());
        List<Map<String,Object>> ptTrend=new ArrayList<>();
        for (LocalDate d : allD) {
            double[]ps=dayP.getOrDefault(d,new double[2]), ss=dayS2.getOrDefault(d,new double[2]);
            double pr=ps[1]>0?r2(ps[0]/ps[1]):0, sr=ss[1]>0?r2(ss[0]/ss[1]):0;
            if(pr==0&&sr==0)continue;
            Map<String,Object> row=new LinkedHashMap<>(); row.put("date",d.toString()); row.put("purchRate",pr); row.put("saleRate",sr); row.put("spread",r2(sr-pr));
            ptTrend.add(row);
        }
        Map<String,Object> pt=new LinkedHashMap<>();
        double avgPR=totalPurchWt>0?r2(totalPurch/totalPurchWt):0, avgSR=totalWt>0?r2(totalSar/totalWt):0;
        pt.put("avgPurchRate",avgPR); pt.put("avgSaleRate",avgSR); pt.put("spread",r2(avgSR-avgPR)); pt.put("trend",ptTrend);
        result.put("purchaseTiming",pt);

        // Return risk
        List<Map<String,Object>> returnRisk = branches.stream().filter(b->(double)b.get("totalSar")>0).map(b -> {
            double bSar=(double)b.get("totalSar"), bRet=(double)b.get("returns"); int bRd=(int)b.get("returnDays");
            double rPct=bSar>0?r1(bRet/bSar*100):0;
            String risk=rPct>=10?"critical":rPct>=5?"warning":bRet>0?"low":"none";
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("branchCode",b.get("branchCode")); row.put("branchName",b.get("branchName")); row.put("region",b.get("region"));
            row.put("totalReturns",bRet); row.put("returnPct",rPct); row.put("returnDays",bRd); row.put("riskLevel",risk);
            return row;
        }).sorted(Comparator.comparingDouble((Map<String,Object> r)->(double)r.get("returnPct")).reversed()).collect(Collectors.toList());
        result.put("returnRisk",returnRisk);

        // Gold exposure
        List<Map<String,Object>> byBranchExp = branches.stream().map(b -> {
            double bS=(double)b.get("totalSar"), bP=(double)b.get("purchCombined");
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("branchCode",b.get("branchCode")); row.put("branchName",b.get("branchName")); row.put("region",b.get("region"));
            row.put("salesSar",bS); row.put("purchSar",bP); row.put("netExposure",r2(bS-bP));
            return row;
        }).sorted(Comparator.comparingDouble((Map<String,Object> r)->(double)r.get("netExposure")).reversed()).collect(Collectors.toList());
        Map<String,Object> goldExp=new LinkedHashMap<>();
        goldExp.put("totalSalesSar",totalSar); goldExp.put("totalPurchSar",totalPurch);
        goldExp.put("netExposure",r2(totalSar-totalPurch)); goldExp.put("byBranch",byBranchExp);
        result.put("goldExposure",goldExp);

        // Seasonal patterns
        Map<Integer,double[]> byDow=new TreeMap<>();
        for(int i=1;i<=7;i++) byDow.put(i,new double[3]);
        for (V3SaleTransaction s : sales) { if(s.getSaleDate()==null)continue; double[]d=byDow.get(s.getSaleDate().getDayOfWeek().getValue()); d[0]+=s.getSarAmount(); d[1]+=s.getPureWeightG(); d[2]++; }
        String[] dayNames={"الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"};
        List<Map<String,Object>> seasonDow=new ArrayList<>();
        for(int i=1;i<=7;i++) { double[]d=byDow.get(i); Map<String,Object> row=new LinkedHashMap<>(); row.put("day",dayNames[i-1]); row.put("dayNum",i); row.put("avgSar",d[2]>0?r2(d[0]/d[2]):0); row.put("avgWeight",d[2]>0?r2(d[1]/d[2]):0); row.put("txnCount",(long)d[2]); seasonDow.add(row); }
        Map<Integer,double[]> byMonth=new TreeMap<>();
        for (V3SaleTransaction s : sales) { if(s.getSaleDate()==null)continue; double[]d=byMonth.computeIfAbsent(s.getSaleDate().getMonthValue(),k->new double[2]); d[0]+=s.getSarAmount(); d[1]+=s.getPureWeightG(); }
        List<Map<String,Object>> seasonMonth=new ArrayList<>();
        for (Map.Entry<Integer,double[]> e : byMonth.entrySet()) { double[]d=e.getValue(); Map<String,Object> row=new LinkedHashMap<>(); row.put("month",e.getKey()); row.put("totalSar",d[0]); row.put("totalWeight",d[1]); seasonMonth.add(row); }
        Map<String,Object> seasonal=new LinkedHashMap<>(); seasonal.put("byDayOfWeek",seasonDow); seasonal.put("byMonth",seasonMonth);
        result.put("seasonalPatterns",seasonal);

        // Break-even
        List<Map<String,Object>> breakEven = branches.stream().filter(b->(double)b.get("purchCombined")>0&&(double)b.get("saleRate")>0).map(b->{
            double bPurch=(double)b.get("purchCombined"), bSR=(double)b.get("saleRate"), bActWt=(double)b.get("totalWeight");
            double beWt=r2(bPurch/bSR), surplus=r2(bActWt-beWt);
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("branchCode",b.get("branchCode")); row.put("branchName",b.get("branchName")); row.put("region",b.get("region"));
            row.put("totalPurchases",bPurch); row.put("saleRate",bSR); row.put("breakEvenWeightG",beWt);
            row.put("actualWeightG",bActWt); row.put("surplusWeightG",surplus); row.put("surplusPct",beWt>0?r1(surplus/beWt*100):0);
            return row;
        }).sorted(Comparator.comparingDouble((Map<String,Object> r)->(double)r.get("surplusPct")).reversed()).collect(Collectors.toList());
        result.put("breakEven",breakEven);

        // Top performers
        List<Map<String,Object>> empPerf = getEmployeePerformance(tenantId, from, to);
        List<Map<String,Object>> topP = new ArrayList<>();
        for (Map<String,Object> br : empPerf) { @SuppressWarnings("unchecked") List<Map<String,Object>> emps=(List<Map<String,Object>>)br.get("employees"); if(emps!=null)topP.addAll(emps); }
        topP.sort(Comparator.comparingDouble((Map<String,Object> e)->(double)e.get("profitMargin")).reversed());
        for(int i=0;i<Math.min(10,topP.size());i++) topP.get(i).put("profitRank",i+1);
        result.put("topPerformers", topP.subList(0,Math.min(10,topP.size())));

        // Executive summary
        String bestBr = branches.isEmpty()?"—":(String)branches.get(0).get("branchName");
        String bestEmp = topP.isEmpty()?"—":(String)topP.get(0).get("empName");
        double profit = branches.stream().mapToDouble(b->(double)b.get("net")).sum();
        double profPct = totalSar>0?r1(profit/totalSar*100):0;
        Map<String,Object> exec=new LinkedHashMap<>();
        exec.put("totalRevenue",totalSar); exec.put("totalProfit",profit); exec.put("profitMarginPct",profPct);
        exec.put("avgSaleRate",totalWt>0?r2(totalSar/totalWt):0); exec.put("bestBranch",bestBr); exec.put("bestEmployee",bestEmp);
        exec.put("summaryText",String.format("في الفترة من %s إلى %s، حققت الشركة مبيعات بقيمة %,.0f ريال مع هامش ربح %.1f%%. معدل البيع المتوسط %.0f ريال/جرام. أفضل فرع: %s. أفضل موظف: %s.",from,to,totalSar,profPct,totalWt>0?totalSar/totalWt:0,bestBr,bestEmp));
        result.put("executiveSummary",exec);
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
