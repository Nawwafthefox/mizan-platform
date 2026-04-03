package com.mizan.service;

import com.mizan.config.BranchMaps;
import com.mizan.model.*;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
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

    // ─── Branch summaries ─────────────────────────────────────────────────────

    public List<Map<String, Object>> getBranchSummaries(String tenantId, LocalDate from, LocalDate to) {
        long t0 = System.currentTimeMillis();
        // MongoDB aggregations — returns ~29 rows instead of loading 26K+ documents
        Map<String, Document> sMap = toDocMap(aggSalesByBranch(tenantId, from, to));
        Map<String, Document> pMap = toDocMap(aggPurchasesByBranch(tenantId, from, to));
        Map<String, Document> mMap = toDocMap(aggMothanByBranch(tenantId, from, to));
        Map<String, Double>   rates = queryFallbackRates(tenantId);

        Set<String> codes = new LinkedHashSet<>(sMap.keySet());
        codes.addAll(pMap.keySet());
        codes.addAll(mMap.keySet());

        List<Map<String, Object>> result = new ArrayList<>();
        for (String code : codes) {
            Document s = sMap.getOrDefault(code, new Document());
            Document p = pMap.getOrDefault(code, new Document());
            Document m = mMap.getOrDefault(code, new Document());

            double totalSar    = dbl(s, "totalSar");
            double totalWeight = dbl(s, "totalWeight");
            long   totalPieces = lng(s, "totalPieces");
            double returns     = dbl(s, "returns");
            int    returnDays  = (int) lng(s, "returnDays");
            double k18Sar = dbl(s,"k18Sar"), k18Wt = dbl(s,"k18Wt");
            double k21Sar = dbl(s,"k21Sar"), k21Wt = dbl(s,"k21Wt");
            double k22Sar = dbl(s,"k22Sar"), k22Wt = dbl(s,"k22Wt");
            double k24Sar = dbl(s,"k24Sar"), k24Wt = dbl(s,"k24Wt");
            double purchSar  = dbl(p, "purchSar");
            double purchWt   = dbl(p, "purchWt");
            double mothanSar = dbl(m, "mothanSar");
            double mothanWt  = dbl(m, "mothanWt");

            double combSar   = purchSar + mothanSar;
            double combWt    = purchWt  + mothanWt;
            double saleRate  = totalWeight != 0 ? r4(totalSar / totalWeight) : 0;
            double purchRate = combWt > 0 ? r4(combSar / combWt) : rates.getOrDefault(code, 0.0);
            double diffRate  = purchRate > 0 ? r4(saleRate - purchRate) : 0;
            double net       = totalSar - combSar;
            double avgInv    = totalPieces > 0 ? r2(totalSar / totalPieces) : 0;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("branchCode",    code);
            row.put("branchName",    BranchMaps.getName(code));
            row.put("region",        BranchMaps.getRegion(code));
            row.put("totalSar",      totalSar);
            row.put("totalWeight",   totalWeight);
            row.put("totalPieces",   totalPieces);
            row.put("returns",       returns);
            row.put("returnDays",    returnDays);
            row.put("k18Sar", k18Sar); row.put("k18Wt", k18Wt);
            row.put("k21Sar", k21Sar); row.put("k21Wt", k21Wt);
            row.put("k22Sar", k22Sar); row.put("k22Wt", k22Wt);
            row.put("k24Sar", k24Sar); row.put("k24Wt", k24Wt);
            row.put("purchSar",      purchSar);
            row.put("purchWt",       purchWt);
            row.put("mothanSar",     mothanSar);
            row.put("mothanWt",      mothanWt);
            row.put("purchCombined", combSar);
            row.put("combinedWt",    combWt);
            row.put("saleRate",      saleRate);
            row.put("purchRate",     purchRate);
            row.put("diffRate",      diffRate);
            row.put("net",           net);
            row.put("avgInvoice",    avgInv);
            result.add(row);
        }
        result.sort(Comparator.comparingDouble((Map<String, Object> r) -> (double) r.get("totalSar")).reversed());
        log.info("Branch summaries ({} branches) computed in {}ms", result.size(), System.currentTimeMillis() - t0);
        return result;
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
            .and("transactionDate").gte(from).lte(to).and("amountSar").gt(0));
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
        long t0 = System.currentTimeMillis();

        // Per-branch purchase rates
        List<Map<String, Object>> branchSums = getBranchSummaries(tenantId, from, to);
        Map<String, Double> branchPurchRates = branchSums.stream()
            .collect(Collectors.toMap(b -> (String) b.get("branchCode"), b -> mapDbl(b, "purchRate")));

        // Aggregation pipeline — returns ~few hundred rows instead of 21,896 documents
        List<Document> empDocs = aggEmployeesByBranch(tenantId, from, to);

        List<Map<String, Object>> empRows = new ArrayList<>();
        for (Document d : empDocs) {
            Object idObj = d.get("_id");
            if (!(idObj instanceof Document id)) continue;
            String empId      = id.getString("empId");
            String branchCode = id.getString("branchCode");
            if (empId == null || branchCode == null) continue;

            double totalSar    = dbl(d, "totalSar");
            double totalWeight = dbl(d, "totalWeight");
            long   totalPieces = lng(d, "totalPieces");
            double returns     = dbl(d, "returns");
            long   returnDays  = lng(d, "returnDays");

            double saleRate     = totalWeight != 0 ? r4(totalSar / totalWeight) : 0;
            double purchRate    = branchPurchRates.getOrDefault(branchCode, 0.0);
            double diffRate     = Math.round((saleRate - purchRate) * 10) / 10.0;
            double profitMargin = purchRate > 0 ? r2(totalWeight * diffRate) : 0;
            double avgInvoice   = totalPieces > 0 ? r2(totalSar / totalPieces) : 0;
            String rating = saleRate >= 700 ? "excellent" : saleRate >= 600 ? "good"
                          : saleRate >= 500 ? "average" : "weak";

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("empId", empId); row.put("empName", d.getString("empName"));
            row.put("branchCode", branchCode); row.put("branchName", BranchMaps.getName(branchCode));
            row.put("region", BranchMaps.getRegion(branchCode));
            row.put("totalSar", totalSar); row.put("totalWeight", totalWeight);
            row.put("totalPieces", totalPieces); row.put("returns", returns);
            row.put("returnDays", returnDays); row.put("saleRate", saleRate);
            row.put("purchRate", purchRate); row.put("diffRate", diffRate);
            row.put("profitMargin", profitMargin); row.put("avgInvoice", avgInvoice);
            row.put("achieved", saleRate > purchRate); row.put("rating", rating);
            empRows.add(row);
        }
        empRows.sort(Comparator.comparingDouble((Map<String, Object> r) -> mapDbl(r, "totalSar")).reversed());

        // Group by branch
        Map<String, List<Map<String, Object>>> byBranch = empRows.stream()
            .collect(Collectors.groupingBy(e -> (String) e.get("branchCode"), LinkedHashMap::new, Collectors.toList()));

        List<Map<String, Object>> branches = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> e : byBranch.entrySet()) {
            List<Map<String, Object>> emps = e.getValue();
            Map<String, Object> br = new LinkedHashMap<>();
            br.put("branchCode", e.getKey()); br.put("branchName", BranchMaps.getName(e.getKey()));
            br.put("region", BranchMaps.getRegion(e.getKey()));
            br.put("employeeCount", emps.size());
            br.put("totalSar", emps.stream().mapToDouble(x -> mapDbl(x, "totalSar")).sum());
            br.put("employees", emps);
            branches.add(br);
        }
        branches.sort(Comparator.comparingDouble((Map<String, Object> b) -> mapDbl(b, "totalSar")).reversed());
        log.info("Employee performance computed in {}ms", System.currentTimeMillis() - t0);
        return branches;
    }

    // ─── Daily trend ──────────────────────────────────────────────────────────

    public List<Map<String, Object>> getDailyTrend(String tenantId, LocalDate from, LocalDate to) {
        // Use daily aggregations — returns ~90 rows instead of loading 26K+ documents
        List<Document> salesDays  = aggSalesByDay(tenantId, from, to);
        List<Document> purchDays  = aggPurchasesByDay(tenantId, from, to);
        List<Document> mothanDays = aggMothanByDay(tenantId, from, to);

        Map<String, double[]> dayMap = new TreeMap<>(); // [sar, wt, purch, mothan]
        for (Document d : salesDays) {
            String date = toDateString(d.get("_id"));
            if (date.isEmpty()) continue;
            double[] arr = dayMap.computeIfAbsent(date, k -> new double[4]);
            arr[0] += dbl(d, "totalSar"); arr[1] += dbl(d, "totalWeight");
        }
        for (Document d : purchDays) {
            String date = toDateString(d.get("_id"));
            if (date.isEmpty()) continue;
            dayMap.computeIfAbsent(date, k -> new double[4])[2] += dbl(d, "totalSar");
        }
        for (Document d : mothanDays) {
            String date = toDateString(d.get("_id"));
            if (date.isEmpty()) continue;
            dayMap.computeIfAbsent(date, k -> new double[4])[3] += dbl(d, "totalSar");
        }

        List<Map<String, Object>> trend = new ArrayList<>();
        for (Map.Entry<String, double[]> e : dayMap.entrySet()) {
            double[] d = e.getValue();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date",        e.getKey());
            row.put("totalSar",    d[0]);
            row.put("totalWeight", d[1]);
            row.put("purchases",   d[2] + d[3]);
            row.put("net",         d[0] - d[2] - d[3]);
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
        long t0 = System.currentTimeMillis();
        List<String> karats = List.of("18", "21", "22", "24");

        // getBranchSummaries already contains per-branch karat SAR+weight from the 2-stage pipeline
        List<Map<String, Object>> branches = getBranchSummaries(tenantId, from, to);

        // Purchase karat breakdown (already aggregation-based)
        Map<String, Map<String, double[]>> purchKaratMap = aggPurchasesByBranchAndKarat(tenantId, from, to);

        // Sum karat totals across all branches — [saleSar, saleWt, purchSar, purchWt]
        Map<String, double[]> ks = new LinkedHashMap<>();
        karats.forEach(k -> ks.put(k, new double[4]));
        for (Map<String, Object> b : branches) {
            for (String k : karats) {
                ks.get(k)[0] += mapDbl(b, "k" + k + "Sar");
                ks.get(k)[1] += mapDbl(b, "k" + k + "Wt");
            }
        }
        for (Map<String, double[]> bk : purchKaratMap.values()) {
            for (String k : karats) {
                double[] pk = bk.getOrDefault(k, new double[2]);
                ks.get(k)[2] += pk[0]; ks.get(k)[3] += pk[1];
            }
        }
        double grandSar = ks.values().stream().mapToDouble(t -> t[0]).sum();

        Map<String, Object> totals = new LinkedHashMap<>();
        for (Map.Entry<String, double[]> e : ks.entrySet()) {
            double[] t = e.getValue();
            double sr = t[1] > 0 ? r2(t[0] / t[1]) : 0, pr = t[3] > 0 ? r2(t[2] / t[3]) : 0;
            Map<String, Object> km = new LinkedHashMap<>();
            km.put("sar", t[0]); km.put("wt", t[1]); km.put("purchSar", t[2]); km.put("purchWt", t[3]);
            km.put("saleRate", sr); km.put("purchRate", pr);
            km.put("marginPerGram", r2(sr - pr));
            km.put("pct", grandSar > 0 ? r1(t[0] / grandSar * 100) : 0);
            totals.put("k" + e.getKey(), km);
        }

        // byBranch — already in branch summaries (no extra query needed)
        List<Map<String, Object>> byBranch = branches.stream()
            .filter(b -> karats.stream().anyMatch(k -> mapDbl(b, "k" + k + "Sar") > 0))
            .map(b -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName"));
                row.put("region", b.get("region"));
                karats.forEach(k -> {
                    row.put("k" + k + "Sar", mapDbl(b, "k" + k + "Sar"));
                    row.put("k" + k + "Wt",  mapDbl(b, "k" + k + "Wt"));
                });
                return row;
            })
            .sorted(Comparator.comparingDouble((Map<String, Object> r) ->
                -karats.stream().mapToDouble(k -> mapDbl(r, "k" + k + "Sar")).sum()))
            .collect(Collectors.toList());

        log.info("Karat breakdown computed in {}ms", System.currentTimeMillis() - t0);
        return Map.of("totals", totals, "byBranch", byBranch);
    }

    // ─── Mothan Detail ────────────────────────────────────────────────────────

    public Map<String, Object> getMothanDetail(String tenantId, LocalDate from, LocalDate to) {
        long t0 = System.currentTimeMillis();

        // Individual transactions — mothan collection is small (~379 rows total across all dates)
        Query q = Query.query(Criteria.where("tenantId").is(tenantId)
            .and("transactionDate").gte(from).lte(to)
            .and("weightDebitG").gt(0))
            .with(org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.DESC, "transactionDate"))
            .limit(500);
        List<V3MothanTransaction> txns = mongo.find(q, V3MothanTransaction.class);

        List<Map<String, Object>> transactions = new ArrayList<>();
        Map<String, double[]> bbMap = new LinkedHashMap<>();
        double totalSar = 0, totalWt = 0;
        for (V3MothanTransaction m : txns) {
            String bc = m.getBranchCode();
            totalSar += m.getAmountSar(); totalWt += m.getWeightDebitG();
            double[] t = bbMap.computeIfAbsent(bc, k -> new double[3]); // [sar, wt, count]
            t[0] += m.getAmountSar(); t[1] += m.getWeightDebitG(); t[2]++;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date",        m.getTransactionDate() != null ? m.getTransactionDate().toString() : "");
            row.put("branchCode",  bc); row.put("branchName", BranchMaps.getName(bc));
            row.put("region",      BranchMaps.getRegion(bc));
            row.put("docRef",      m.getDocReference()); row.put("description", m.getDescription());
            row.put("amountSar",   m.getAmountSar()); row.put("weightDebitG", m.getWeightDebitG());
            row.put("rate",        m.getWeightDebitG() > 0 ? r2(m.getAmountSar() / m.getWeightDebitG()) : 0);
            transactions.add(row);
        }
        List<Map<String, Object>> byBranch = bbMap.entrySet().stream().map(e -> {
            double[] t = e.getValue(); String bc = e.getKey();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("branchCode", bc); row.put("branchName", BranchMaps.getName(bc));
            row.put("region", BranchMaps.getRegion(bc));
            row.put("totalSar", t[0]); row.put("totalWt", t[1]);
            row.put("avgRate", t[1] > 0 ? r2(t[0] / t[1]) : 0); row.put("txnCount", (long) t[2]);
            return row;
        }).sorted(Comparator.comparingDouble((Map<String, Object> r) -> mapDbl(r, "totalSar")).reversed())
          .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalSar", totalSar); result.put("totalWt", totalWt);
        result.put("avgRate",  totalWt > 0 ? r2(totalSar / totalWt) : 0);
        result.put("txnCount", (long) txns.size());
        result.put("transactions", transactions); result.put("byBranch", byBranch);
        log.info("Mothan detail computed in {}ms", System.currentTimeMillis() - t0);
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

    // ─── Premium Analytics (delegates to aggregation-based implementation) ─────

    public Map<String, Object> getPremiumAnalytics(String tenantId, LocalDate from, LocalDate to) {
        return getPremiumDashboard(tenantId, from, to);
    }

    @SuppressWarnings("unused") // kept for reference; no longer called
    private Map<String, Object> getPremiumAnalyticsLegacy(String tenantId, LocalDate from, LocalDate to) {
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

    // ─── Premium Dashboard (aggregation-only, no full-doc loads) ─────────────

    public Map<String, Object> getPremiumDashboard(String tenantId, LocalDate from, LocalDate to) {
        List<Map<String, Object>> branches = getBranchSummaries(tenantId, from, to);
        Map<String, Object> result = new LinkedHashMap<>();

        double totalSar     = branches.stream().mapToDouble(b -> mapDbl(b, "totalSar")).sum();
        double totalWt      = branches.stream().mapToDouble(b -> mapDbl(b, "totalWeight")).sum();
        double totalPurch   = branches.stream().mapToDouble(b -> mapDbl(b, "purchCombined")).sum();
        double totalPurchWt = branches.stream().mapToDouble(b -> mapDbl(b, "combinedWt")).sum();

        // ── 1. Revenue efficiency ──────────────────────────────────────────────
        long periodDays = from.until(to, java.time.temporal.ChronoUnit.DAYS) + 1;
        List<Map<String, Object>> prev = getBranchSummaries(tenantId, from.minusDays(periodDays), from.minusDays(1));
        double prevSar = prev.stream().mapToDouble(b -> mapDbl(b, "totalSar")).sum();
        double prevWt  = prev.stream().mapToDouble(b -> mapDbl(b, "totalWeight")).sum();
        double curRPG  = totalWt > 0 ? r2(totalSar / totalWt) : 0;
        double prevRPG = prevWt  > 0 ? r2(prevSar  / prevWt)  : 0;

        // Daily trend from aggSalesByDay (already includes totalWeight)
        List<Document> salesByDay = aggSalesByDay(tenantId, from, to);
        // Build date → [SAR, weight] map (sorted)
        Map<String, double[]> dayRevMap = new TreeMap<>();
        for (Document d : salesByDay) {
            String dateStr = toDateString(d.get("_id"));
            if (!dateStr.isEmpty())
                dayRevMap.put(dateStr, new double[]{ dbl(d, "totalSar"), dbl(d, "totalWeight") });
        }
        List<Map<String,Object>> revTrend = new ArrayList<>();
        for (Map.Entry<String, double[]> e : dayRevMap.entrySet()) {
            double[] v = e.getValue();
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("date", e.getKey()); row.put("value", v[1] > 0 ? r2(v[0] / v[1]) : 0);
            revTrend.add(row);
        }
        Map<String,Object> revEff = new LinkedHashMap<>();
        revEff.put("current", curRPG); revEff.put("previous", prevRPG);
        revEff.put("changePct", prevRPG > 0 ? r1((curRPG - prevRPG) / prevRPG * 100) : 0);
        revEff.put("trend", revTrend);
        result.put("revenueEfficiency", revEff);

        // ── 2. Branch quadrant ─────────────────────────────────────────────────
        double[] sarArr = branches.stream().mapToDouble(b -> mapDbl(b, "totalSar")).sorted().toArray();
        double[] drArr  = branches.stream().mapToDouble(b -> mapDbl(b, "diffRate")).sorted().toArray();
        double medSar  = sarArr.length > 0 ? sarArr[sarArr.length / 2] : 0;
        double medDiff = drArr.length  > 0 ? drArr[drArr.length  / 2] : 0;
        List<Map<String,Object>> quadrant = branches.stream().map(b -> {
            double bSar = mapDbl(b, "totalSar"), bDr = mapDbl(b, "diffRate");
            String q = bSar >= medSar && bDr >= medDiff ? "star"
                     : bSar >= medSar ? "cash_cow" : bDr >= medDiff ? "question" : "dog";
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName"));
            row.put("region", b.get("region")); row.put("totalSar", bSar);
            row.put("diffRate", bDr); row.put("quadrant", q);
            return row;
        }).collect(Collectors.toList());
        result.put("branchQuadrant", quadrant);
        result.put("medianSar", medSar); result.put("medianDiff", medDiff);

        // ── 3. Karat profitability ─────────────────────────────────────────────
        Map<String, Map<String, double[]>> purchKaratMap = aggPurchasesByBranchAndKarat(tenantId, from, to);
        Map<String, double[]> kSale  = new LinkedHashMap<>();
        Map<String, double[]> kPurch = new LinkedHashMap<>();
        for (String k : List.of("18", "21", "22", "24")) {
            double kSar = 0, kWt = 0;
            for (Map<String,Object> b : branches) { kSar += mapDbl(b, "k" + k + "Sar"); kWt += mapDbl(b, "k" + k + "Wt"); }
            kSale.put(k, new double[]{ kSar, kWt });
            double pSar = 0, pWt = 0;
            for (Map<String, double[]> bk : purchKaratMap.values()) { double[] a = bk.getOrDefault(k, new double[2]); pSar += a[0]; pWt += a[1]; }
            kPurch.put(k, new double[]{ pSar, pWt });
        }
        double grandKarSar = kSale.values().stream().mapToDouble(t -> t[0]).sum();
        List<Map<String,Object>> karatProfit = List.of("18","21","22","24").stream().map(k -> {
            double[] s = kSale.get(k), p = kPurch.get(k);
            double sr = s[1] > 0 ? r2(s[0] / s[1]) : 0, pr = p[1] > 0 ? r2(p[0] / p[1]) : 0;
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("karat", k); row.put("totalSar", s[0]); row.put("totalWt", s[1]);
            row.put("avgSaleRate", sr); row.put("avgPurchRate", pr);
            row.put("marginPerGram", r2(sr - pr)); row.put("pctOfSales", grandKarSar > 0 ? r1(s[0] / grandKarSar * 100) : 0);
            return row;
        }).collect(Collectors.toList());
        result.put("karatProfitability", karatProfit);

        // ── 4. Purchase timing trend ──────────────────────────────────────────
        List<Document> purchByDay = aggPurchasesByDayWithWeight(tenantId, from, to);
        Map<String, double[]> dayS = new TreeMap<>(), dayP = new TreeMap<>();
        for (Map.Entry<String, double[]> e : dayRevMap.entrySet()) dayS.put(e.getKey(), e.getValue());
        for (Document d : purchByDay) {
            String dt = toDateString(d.get("_id"));
            if (!dt.isEmpty()) dayP.put(dt, new double[]{ dbl(d, "totalSar"), dbl(d, "totalWeight") });
        }
        Set<String> allDates = new TreeSet<>(dayS.keySet()); allDates.addAll(dayP.keySet());
        List<Map<String,Object>> ptTrend = new ArrayList<>();
        for (String dt : allDates) {
            double[] ss = dayS.getOrDefault(dt, new double[2]), ps = dayP.getOrDefault(dt, new double[2]);
            double sr = ss[1] > 0 ? r2(ss[0] / ss[1]) : 0, pr = ps[1] > 0 ? r2(ps[0] / ps[1]) : 0;
            if (sr == 0 && pr == 0) continue;
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("date", dt); row.put("saleRate", sr); row.put("purchRate", pr); row.put("spread", r2(sr - pr));
            ptTrend.add(row);
        }
        double avgSR = totalWt > 0 ? r2(totalSar / totalWt) : 0;
        double avgPR = totalPurchWt > 0 ? r2(totalPurch / totalPurchWt) : 0;
        Map<String,Object> pt = new LinkedHashMap<>();
        pt.put("avgSaleRate", avgSR); pt.put("avgPurchRate", avgPR);
        pt.put("spread", r2(avgSR - avgPR)); pt.put("trend", ptTrend);
        result.put("purchaseTiming", pt);

        // ── 5. Return risk ────────────────────────────────────────────────────
        List<Map<String,Object>> returnRisk = branches.stream()
            .filter(b -> mapDbl(b, "totalSar") > 0)
            .map(b -> {
                double bSar = mapDbl(b, "totalSar"), bRet = mapDbl(b, "returns");
                double rPct = bSar > 0 ? r1(bRet / bSar * 100) : 0;
                String risk = rPct >= 10 ? "critical" : rPct >= 5 ? "warning" : bRet > 0 ? "low" : "none";
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName")); row.put("region", b.get("region"));
                row.put("totalReturns", bRet); row.put("returnPct", rPct); row.put("riskLevel", risk);
                return row;
            })
            .sorted(Comparator.comparingDouble((Map<String,Object> r) -> mapDbl(r, "returnPct")).reversed())
            .collect(Collectors.toList());
        result.put("returnRisk", returnRisk);

        // ── 6. Gold exposure ──────────────────────────────────────────────────
        List<Map<String,Object>> byBranchExp = branches.stream().map(b -> {
            double bS = mapDbl(b, "totalSar"), bP = mapDbl(b, "purchCombined");
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName")); row.put("region", b.get("region"));
            row.put("salesSar", bS); row.put("purchSar", bP); row.put("netExposure", r2(bS - bP));
            return row;
        }).sorted(Comparator.comparingDouble((Map<String,Object> r) -> mapDbl(r, "netExposure")).reversed())
          .collect(Collectors.toList());
        Map<String,Object> goldExp = new LinkedHashMap<>();
        goldExp.put("totalSalesSar", totalSar); goldExp.put("totalPurchSar", totalPurch);
        goldExp.put("netExposure", r2(totalSar - totalPurch)); goldExp.put("byBranch", byBranchExp);
        result.put("goldExposure", goldExp);

        // ── 7. Seasonal patterns (from daily data — no extra agg needed) ──────
        // Java DayOfWeek: 1=Mon...7=Sun
        String[] dayNames = {"الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"};
        Map<Integer, double[]> dowMap = new TreeMap<>();
        for (int i = 1; i <= 7; i++) dowMap.put(i, new double[2]); // [sumSar, dayCount]
        for (Map.Entry<String, double[]> e : dayRevMap.entrySet()) {
            try {
                LocalDate ld = LocalDate.parse(e.getKey());
                int dow = ld.getDayOfWeek().getValue();
                double[] arr = dowMap.get(dow);
                arr[0] += e.getValue()[0]; arr[1]++;
            } catch (Exception ignored) {}
        }
        List<Map<String,Object>> seasonDow = new ArrayList<>();
        for (int i = 1; i <= 7; i++) {
            double[] arr = dowMap.get(i);
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("day", dayNames[i-1]); row.put("dayNum", i);
            row.put("avgSar", arr[1] > 0 ? r2(arr[0] / arr[1]) : 0);
            row.put("dayCount", (long) arr[1]);
            seasonDow.add(row);
        }
        List<Map<String,Object>> dailyTrendSeason = new ArrayList<>();
        for (Map.Entry<String, double[]> e : dayRevMap.entrySet()) {
            double[] v = e.getValue();
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("date", e.getKey());
            row.put("totalSar", r2(v[0]));
            row.put("totalWeight", r2(v[1]));
            dailyTrendSeason.add(row);
        }
        Map<String,Object> seasonal = new LinkedHashMap<>();
        seasonal.put("byDayOfWeek", seasonDow);
        seasonal.put("dailyTrend", dailyTrendSeason);
        result.put("seasonalPatterns", seasonal);

        // ── 8. Break-even ──────────────────────────────────────────────────────
        List<Map<String,Object>> breakEven = branches.stream()
            .filter(b -> mapDbl(b, "purchCombined") > 0 && mapDbl(b, "saleRate") > 0)
            .map(b -> {
                double bPurch = mapDbl(b, "purchCombined"), bSR = mapDbl(b, "saleRate"), bActWt = mapDbl(b, "totalWeight");
                double beWt = r2(bPurch / bSR), surplus = r2(bActWt - beWt);
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName")); row.put("region", b.get("region"));
                row.put("totalPurchases", bPurch); row.put("saleRate", bSR);
                row.put("breakEvenWeightG", beWt); row.put("actualWeightG", bActWt);
                row.put("surplusWeightG", surplus); row.put("surplusPct", beWt > 0 ? r1(surplus / beWt * 100) : 0);
                return row;
            })
            .sorted(Comparator.comparingDouble((Map<String,Object> r) -> mapDbl(r, "surplusPct")).reversed())
            .collect(Collectors.toList());
        result.put("breakEven", breakEven);

        // ── 9. Top performers ─────────────────────────────────────────────────
        List<Map<String,Object>> empPerf = getEmployeePerformance(tenantId, from, to);
        List<Map<String,Object>> topP = new ArrayList<>();
        for (Map<String,Object> br : empPerf) {
            @SuppressWarnings("unchecked") List<Map<String,Object>> emps = (List<Map<String,Object>>) br.get("employees");
            if (emps != null) topP.addAll(emps);
        }
        topP.sort(Comparator.comparingDouble((Map<String,Object> e) -> mapDbl(e, "profitMargin")).reversed());
        for (int i = 0; i < Math.min(10, topP.size()); i++) topP.get(i).put("profitRank", i + 1);
        result.put("topPerformers", topP.subList(0, Math.min(10, topP.size())));

        // ── 10. Executive summary ─────────────────────────────────────────────
        String bestBr  = branches.isEmpty() ? "—" : (String) branches.get(0).get("branchName");
        String bestEmp = topP.isEmpty() ? "—" : (String) topP.get(0).get("empName");
        double profit  = branches.stream().mapToDouble(b -> mapDbl(b, "net")).sum();
        double profPct = totalSar > 0 ? r1(profit / totalSar * 100) : 0;
        Map<String,Object> exec = new LinkedHashMap<>();
        exec.put("totalRevenue", totalSar); exec.put("totalProfit", profit);
        exec.put("profitMarginPct", profPct); exec.put("avgSaleRate", totalWt > 0 ? r2(totalSar / totalWt) : 0);
        exec.put("bestBranch", bestBr); exec.put("bestEmployee", bestEmp);
        exec.put("summaryText", String.format(
            "في الفترة من %s إلى %s، حققت الشركة مبيعات بقيمة %,.0f ريال مع هامش ربح %.1f%%. متوسط سعر البيع %.1f ريال/جرام. أفضل فرع: %s. أفضل موظف: %s.",
            from, to, totalSar, profPct, totalWt > 0 ? totalSar / totalWt : 0.0, bestBr, bestEmp));
        result.put("executiveSummary", exec);

        return result;
    }

    // ─── Mothan paginated ($facet) ────────────────────────────────────────────

    /**
     * Single $facet query: summary from ALL records + paginated transactions + byBranch.
     * Returns { totalSar, totalWt, avgRate, txnCount, transactions, byBranch,
     *           totalElements, totalPages, page, size }.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getMothanDetailPaged(String tenantId, LocalDate from, LocalDate to,
                                                     int page, int size) {
        long t0 = System.currentTimeMillis();
        Criteria criteria = Criteria.where("tenantId").is(tenantId)
            .and("transactionDate").gte(from).lte(to)
            .and("weightDebitG").gt(0);

        AggregationOperation matchOp = Aggregation.match(criteria);
        // $facet: all three branches in ONE MongoDB round-trip
        AggregationOperation facetOp = ctx -> new Document("$facet", new Document()
            .append("summary", List.of(
                new Document("$group", new Document("_id", null)
                    .append("totalSar", new Document("$sum", "$amountSar"))
                    .append("totalWt",  new Document("$sum", "$weightDebitG"))
                    .append("count",    new Document("$sum", 1)))
            ))
            .append("transactions", List.of(
                new Document("$sort",  new Document("transactionDate", -1)),
                new Document("$skip",  (long) page * size),
                new Document("$limit", (long) size)
            ))
            .append("byBranch", List.of(
                new Document("$group", new Document("_id", "$branchCode")
                    .append("totalSar", new Document("$sum", "$amountSar"))
                    .append("totalWt",  new Document("$sum", "$weightDebitG"))
                    .append("txnCount", new Document("$sum", 1))),
                new Document("$sort", new Document("totalSar", -1))
            ))
        );

        List<Document> results = mongo.aggregate(
            Aggregation.newAggregation(matchOp, facetOp),
            V3MothanTransaction.class, Document.class).getMappedResults();

        if (results.isEmpty()) {
            return Map.of("totalSar", 0, "totalWt", 0, "avgRate", 0, "txnCount", 0,
                "transactions", List.of(), "byBranch", List.of(),
                "totalElements", 0, "totalPages", 0, "page", page, "size", size);
        }
        Document facetResult = results.get(0);

        // ── Summary ──────────────────────────────────────────────────────────
        List<Document> summaryArr = (List<Document>) facetResult.get("summary");
        Document sum    = summaryArr != null && !summaryArr.isEmpty() ? summaryArr.get(0) : new Document();
        double totalSar = dbl(sum, "totalSar");
        double totalWt  = dbl(sum, "totalWt");
        int    totalAll = (int) lng(sum, "count");

        // ── Transactions (paginated) ──────────────────────────────────────────
        List<Document> txnDocs = (List<Document>) facetResult.get("transactions");
        List<Map<String, Object>> transactions = new ArrayList<>();
        if (txnDocs != null) {
            for (Document d : txnDocs) {
                String bc = d.getString("branchCode");
                double sar = dbl(d, "amountSar"), wt = dbl(d, "weightDebitG");
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("date",        toDateString(d.get("transactionDate")));
                row.put("branchCode",  bc);
                row.put("branchName",  BranchMaps.getName(bc));
                row.put("region",      BranchMaps.getRegion(bc));
                row.put("docRef",      d.getString("docReference"));
                row.put("description", d.getString("description"));
                row.put("amountSar",   sar);
                row.put("weightDebitG", wt);
                row.put("rate",        wt > 0 ? r2(sar / wt) : 0);
                transactions.add(row);
            }
        }

        // ── ByBranch (from all records) ───────────────────────────────────────
        List<Document> bbDocs = (List<Document>) facetResult.get("byBranch");
        List<Map<String, Object>> byBranch = new ArrayList<>();
        if (bbDocs != null) {
            for (Document d : bbDocs) {
                String bc = d.getString("_id");
                double bSar = dbl(d, "totalSar"), bWt = dbl(d, "totalWt");
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("branchCode", bc);
                row.put("branchName", BranchMaps.getName(bc));
                row.put("region",     BranchMaps.getRegion(bc));
                row.put("totalSar",   bSar);
                row.put("totalWt",    bWt);
                row.put("avgRate",    bWt > 0 ? r2(bSar / bWt) : 0);
                row.put("txnCount",   lng(d, "txnCount"));
                byBranch.add(row);
            }
        }

        int totalPages = size > 0 ? (int) Math.ceil((double) totalAll / size) : 1;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalSar",      totalSar);
        result.put("totalWt",       totalWt);
        result.put("avgRate",       totalWt > 0 ? r2(totalSar / totalWt) : 0);
        result.put("txnCount",      totalAll);
        result.put("transactions",  transactions);
        result.put("byBranch",      byBranch);
        result.put("totalElements", totalAll);
        result.put("totalPages",    totalPages);
        result.put("page",          page);
        result.put("size",          size);
        log.info("Mothan paged p={} s={} ({} txns of {}) in {}ms", page, size,
            transactions.size(), totalAll, System.currentTimeMillis() - t0);
        return result;
    }

    // ─── Premium (pure-Java, zero MongoDB) ───────────────────────────────────

    /**
     * Builds premium dashboard from pre-loaded (cached) sub-results.
     * No MongoDB queries — all computation is Java list transforms.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> buildPremiumFromData(
            List<Map<String, Object>> branches,
            List<Map<String, Object>> empGroups,
            List<Map<String, Object>> dailyTrend,
            Map<String, Object> karatBreakdown,
            LocalDate from, LocalDate to) {

        long t0 = System.currentTimeMillis();
        Map<String, Object> result = new LinkedHashMap<>();

        double totalSar     = branches.stream().mapToDouble(b -> mapDbl(b, "totalSar")).sum();
        double totalWt      = branches.stream().mapToDouble(b -> mapDbl(b, "totalWeight")).sum();
        double totalPurch   = branches.stream().mapToDouble(b -> mapDbl(b, "purchCombined")).sum();
        double totalPurchWt = branches.stream().mapToDouble(b -> mapDbl(b, "combinedWt")).sum();
        double curRPG       = totalWt > 0 ? r2(totalSar / totalWt) : 0;
        double avgPR        = totalPurchWt > 0 ? r2(totalPurch / totalPurchWt) : 0;

        // ── 1. Revenue efficiency ──────────────────────────────────────────────
        List<Map<String,Object>> revTrend = dailyTrend.stream().map(d -> {
            double sar = mapDbl(d, "totalSar"), wt = mapDbl(d, "totalWeight");
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("date", d.get("date")); row.put("value", wt > 0 ? r2(sar / wt) : 0);
            return row;
        }).collect(Collectors.toList());
        Map<String,Object> revEff = new LinkedHashMap<>();
        revEff.put("current", curRPG); revEff.put("previous", 0); revEff.put("changePct", 0);
        revEff.put("trend", revTrend);
        result.put("revenueEfficiency", revEff);

        // ── 2. Branch quadrant ─────────────────────────────────────────────────
        double[] sarArr = branches.stream().mapToDouble(b -> mapDbl(b, "totalSar")).sorted().toArray();
        double[] drArr  = branches.stream().mapToDouble(b -> mapDbl(b, "diffRate")).sorted().toArray();
        double medSar  = sarArr.length > 0 ? sarArr[sarArr.length / 2] : 0;
        double medDiff = drArr.length  > 0 ? drArr[drArr.length  / 2] : 0;
        List<Map<String,Object>> quadrant = branches.stream().map(b -> {
            double bSar = mapDbl(b, "totalSar"), bDr = mapDbl(b, "diffRate");
            String q = bSar >= medSar && bDr >= medDiff ? "star"
                     : bSar >= medSar ? "cash_cow" : bDr >= medDiff ? "question" : "dog";
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName"));
            row.put("region", b.get("region")); row.put("totalSar", bSar);
            row.put("diffRate", bDr); row.put("quadrant", q);
            return row;
        }).collect(Collectors.toList());
        result.put("branchQuadrant", quadrant);
        result.put("medianSar", medSar); result.put("medianDiff", medDiff);

        // ── 3. Karat profitability (from karatBreakdown.totals) ────────────────
        Map<String,Object> totals = (Map<String,Object>) karatBreakdown.getOrDefault("totals", Map.of());
        List<Map<String,Object>> karatProfit = List.of("18","21","22","24").stream().map(k -> {
            Map<String,Object> kt = (Map<String,Object>) totals.getOrDefault("k" + k, Map.of());
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("karat", k);
            row.put("totalSar",       kt.getOrDefault("sar", 0.0));
            row.put("totalWt",        kt.getOrDefault("wt",  0.0));
            row.put("avgSaleRate",    kt.getOrDefault("saleRate", 0.0));
            row.put("avgPurchRate",   kt.getOrDefault("purchRate", 0.0));
            row.put("marginPerGram",  kt.getOrDefault("marginPerGram", 0.0));
            row.put("pctOfSales",     kt.getOrDefault("pct", 0.0));
            return row;
        }).collect(Collectors.toList());
        result.put("karatProfitability", karatProfit);

        // ── 4. Purchase timing trend (saleRate from trend; purchRate = overall avg flat) ──
        List<Map<String,Object>> ptTrend = dailyTrend.stream().map(d -> {
            double sar = mapDbl(d, "totalSar"), wt = mapDbl(d, "totalWeight");
            double sr = wt > 0 ? r2(sar / wt) : 0;
            if (sr == 0 && avgPR == 0) return null;
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("date", d.get("date")); row.put("saleRate", sr);
            row.put("purchRate", avgPR); row.put("spread", r2(sr - avgPR));
            return row;
        }).filter(Objects::nonNull).collect(Collectors.toList());
        Map<String,Object> pt = new LinkedHashMap<>();
        pt.put("avgSaleRate", curRPG); pt.put("avgPurchRate", avgPR);
        pt.put("spread", r2(curRPG - avgPR)); pt.put("trend", ptTrend);
        result.put("purchaseTiming", pt);

        // ── 5. Return risk ────────────────────────────────────────────────────
        List<Map<String,Object>> returnRisk = branches.stream()
            .filter(b -> mapDbl(b, "totalSar") > 0)
            .map(b -> {
                double bSar = mapDbl(b, "totalSar"), bRet = mapDbl(b, "returns");
                double rPct = bSar > 0 ? r1(bRet / bSar * 100) : 0;
                String risk = rPct >= 10 ? "critical" : rPct >= 5 ? "warning" : bRet > 0 ? "low" : "none";
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName"));
                row.put("region", b.get("region")); row.put("totalReturns", bRet);
                row.put("returnPct", rPct); row.put("riskLevel", risk);
                return row;
            })
            .sorted(Comparator.comparingDouble((Map<String,Object> r) -> mapDbl(r, "returnPct")).reversed())
            .collect(Collectors.toList());
        result.put("returnRisk", returnRisk);

        // ── 6. Gold exposure ──────────────────────────────────────────────────
        List<Map<String,Object>> byBranchExp = branches.stream().map(b -> {
            double bS = mapDbl(b, "totalSar"), bP = mapDbl(b, "purchCombined");
            double bSWt = mapDbl(b, "totalWeight"), bPWt = mapDbl(b, "combinedWt");
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName"));
            row.put("region", b.get("region")); row.put("salesSar", bS);
            row.put("purchSar", bP); row.put("netExposure", r2(bS - bP));
            row.put("salesWt", bSWt); row.put("purchWt", bPWt);
            row.put("netExposureWt", r2(bSWt - bPWt));
            return row;
        }).sorted(Comparator.comparingDouble((Map<String,Object> r) -> mapDbl(r, "netExposureWt")).reversed())
          .collect(Collectors.toList());
        Map<String,Object> goldExp = new LinkedHashMap<>();
        goldExp.put("totalSalesSar", totalSar); goldExp.put("totalPurchSar", totalPurch);
        goldExp.put("netExposure", r2(totalSar - totalPurch));
        goldExp.put("totalSalesWt", totalWt); goldExp.put("totalPurchWt", totalPurchWt);
        goldExp.put("netExposureWt", r2(totalWt - totalPurchWt));
        goldExp.put("byBranch", byBranchExp);
        result.put("goldExposure", goldExp);

        // ── 7. Seasonal patterns (from daily trend — parse date for DayOfWeek) ──
        String[] dayNames = {"الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"};
        Map<Integer, double[]> dowMap = new TreeMap<>();
        for (int i = 1; i <= 7; i++) dowMap.put(i, new double[2]); // [sumSar, dayCount]
        for (Map<String,Object> d : dailyTrend) {
            try {
                LocalDate ld = LocalDate.parse((String) d.get("date"));
                int dow = ld.getDayOfWeek().getValue();
                double[] arr = dowMap.get(dow);
                arr[0] += mapDbl(d, "totalSar"); arr[1]++;
            } catch (Exception ignored) {}
        }
        List<Map<String,Object>> seasonDow = new ArrayList<>();
        for (int i = 1; i <= 7; i++) {
            double[] arr = dowMap.get(i);
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("day", dayNames[i-1]); row.put("dayNum", i);
            row.put("avgSar", arr[1] > 0 ? r2(arr[0] / arr[1]) : 0);
            row.put("dayCount", (long) arr[1]);
            seasonDow.add(row);
        }
        Map<String,Object> seasonal = new LinkedHashMap<>();
        seasonal.put("byDayOfWeek", seasonDow);
        result.put("seasonalPatterns", seasonal);

        // ── 8. Break-even ──────────────────────────────────────────────────────
        List<Map<String,Object>> breakEven = branches.stream()
            .filter(b -> mapDbl(b, "purchCombined") > 0 && mapDbl(b, "saleRate") > 0)
            .map(b -> {
                double bPurch = mapDbl(b, "purchCombined"), bSR = mapDbl(b, "saleRate"), bActWt = mapDbl(b, "totalWeight");
                double beWt = r2(bPurch / bSR), surplus = r2(bActWt - beWt);
                Map<String,Object> row = new LinkedHashMap<>();
                row.put("branchCode", b.get("branchCode")); row.put("branchName", b.get("branchName"));
                row.put("region", b.get("region")); row.put("totalPurchases", bPurch);
                row.put("saleRate", bSR); row.put("breakEvenWeightG", beWt);
                row.put("actualWeightG", bActWt); row.put("surplusWeightG", surplus);
                row.put("surplusPct", beWt > 0 ? r1(surplus / beWt * 100) : 0);
                return row;
            })
            .sorted(Comparator.comparingDouble((Map<String,Object> r) -> mapDbl(r, "surplusPct")).reversed())
            .collect(Collectors.toList());
        result.put("breakEven", breakEven);

        // add dailyTrend to seasonal so frontend can build different time-period views
        ((Map<String,Object>) result.get("seasonalPatterns")).put("dailyTrend", dailyTrend);

        // ── 9. Top performers (flatten empGroups[].employees) ─────────────────
        List<Map<String,Object>> topP = new ArrayList<>();
        for (Map<String,Object> br : empGroups) {
            List<Map<String,Object>> emps = (List<Map<String,Object>>) br.get("employees");
            if (emps != null) topP.addAll(emps);
        }
        topP.sort(Comparator.comparingDouble((Map<String,Object> e) -> mapDbl(e, "profitMargin")).reversed());
        for (int i = 0; i < Math.min(10, topP.size()); i++) topP.get(i).put("profitRank", i + 1);
        result.put("topPerformers", topP.subList(0, Math.min(10, topP.size())));

        // ── 10. Executive summary ─────────────────────────────────────────────
        String bestBr  = branches.isEmpty() ? "—" : (String) branches.get(0).get("branchName");
        String bestEmp = topP.isEmpty()     ? "—" : (String) topP.get(0).get("empName");
        double profit  = branches.stream().mapToDouble(b -> mapDbl(b, "net")).sum();
        double profPct = totalSar > 0 ? r1(profit / totalSar * 100) : 0;
        Map<String,Object> exec = new LinkedHashMap<>();
        exec.put("totalRevenue", totalSar); exec.put("totalProfit", profit);
        exec.put("profitMarginPct", profPct); exec.put("avgSaleRate", curRPG);
        exec.put("bestBranch", bestBr); exec.put("bestEmployee", bestEmp);
        exec.put("summaryText", String.format(
            "في الفترة من %s إلى %s، حققت الشركة مبيعات بقيمة %,.0f ريال مع هامش ربح %.1f%%. متوسط سعر البيع %.1f ريال/جرام. أفضل فرع: %s. أفضل موظف: %s.",
            from, to, totalSar, profPct, curRPG, bestBr, bestEmp));
        result.put("executiveSummary", exec);

        log.info("Premium built from cache in {}ms (zero MongoDB queries)", System.currentTimeMillis() - t0);
        return result;
    }

    // ─── Heatmap ─────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getHeatmapData(String tenantId, LocalDate from, LocalDate to) {
        List<Map<String, Object>> branches = getBranchSummaries(tenantId, from, to);
        Map<String, Map<String, double[]>> purchKarat = aggPurchasesByBranchAndKarat(tenantId, from, to);
        return branches.stream().map(b -> {
            String code = (String) b.get("branchCode");
            Map<String, double[]> pk = purchKarat.getOrDefault(code, Map.of());
            Map<String, Object> row = new LinkedHashMap<>(b);
            for (String k : List.of("18", "21", "22", "24")) {
                double kSar  = mapDbl(b, "k" + k + "Sar"), kWt = mapDbl(b, "k" + k + "Wt");
                double kSaleRate  = kWt > 0 ? r4(kSar / kWt) : 0;
                double[] p = pk.getOrDefault(k, new double[]{0, 0});
                double kPurchRate = p[1] > 0 ? r4(p[0] / p[1]) : 0;
                row.put("k" + k + "DiffRate", kPurchRate > 0 ? r2(kSaleRate - kPurchRate) : 0.0);
            }
            return row;
        }).collect(Collectors.toList());
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

    // ─── Aggregation helpers ──────────────────────────────────────────────────

    private List<Document> aggSalesByBranch(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId).and("saleDate").gte(from).lte(to));

        // Stage 1: aggregate to branch+date level.
        // Returns are computed at the DAILY NET level (matching Dashboard-101):
        // a day with 500K sales and 50K returns = net +450K = NOT a return day.
        AggregationOperation groupByDay = ctx -> new Document("$group",
            new Document("_id", new Document("branchCode", "$branchCode").append("saleDate", "$saleDate"))
                .append("dailySar",    new Document("$sum", "$sarAmount"))
                .append("dailyWeight", new Document("$sum", "$pureWeightG"))
                .append("dailyPieces", new Document("$sum", new Document("$abs", "$pieces")))
                .append("k18Sar", new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$eq", Arrays.asList("$karat", "18")),
                    new Document("$abs", "$sarAmount"), 0))))
                .append("k18Wt",  new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$eq", Arrays.asList("$karat", "18")),
                    new Document("$abs", "$pureWeightG"), 0))))
                .append("k21Sar", new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$eq", Arrays.asList("$karat", "21")),
                    new Document("$abs", "$sarAmount"), 0))))
                .append("k21Wt",  new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$eq", Arrays.asList("$karat", "21")),
                    new Document("$abs", "$pureWeightG"), 0))))
                .append("k22Sar", new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$eq", Arrays.asList("$karat", "22")),
                    new Document("$abs", "$sarAmount"), 0))))
                .append("k22Wt",  new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$eq", Arrays.asList("$karat", "22")),
                    new Document("$abs", "$pureWeightG"), 0))))
                .append("k24Sar", new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$eq", Arrays.asList("$karat", "24")),
                    new Document("$abs", "$sarAmount"), 0))))
                .append("k24Wt",  new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$eq", Arrays.asList("$karat", "24")),
                    new Document("$abs", "$pureWeightG"), 0)))));

        // Stage 2: aggregate to branch level.
        // returns = sum of abs(dailySar) for days where dailySar < 0 (net-negative day).
        // returnDays = count of such days.
        AggregationOperation groupByBranch = ctx -> new Document("$group",
            new Document("_id", "$_id.branchCode")
                .append("totalSar",    new Document("$sum", "$dailySar"))
                .append("totalWeight", new Document("$sum", "$dailyWeight"))
                .append("totalPieces", new Document("$sum", "$dailyPieces"))
                .append("returns", new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$lt", Arrays.asList("$dailySar", 0)),
                    new Document("$abs", "$dailySar"), 0))))
                .append("returnDays", new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$lt", Arrays.asList("$dailySar", 0)), 1, 0))))
                .append("k18Sar", new Document("$sum", "$k18Sar"))
                .append("k18Wt",  new Document("$sum", "$k18Wt"))
                .append("k21Sar", new Document("$sum", "$k21Sar"))
                .append("k21Wt",  new Document("$sum", "$k21Wt"))
                .append("k22Sar", new Document("$sum", "$k22Sar"))
                .append("k22Wt",  new Document("$sum", "$k22Wt"))
                .append("k24Sar", new Document("$sum", "$k24Sar"))
                .append("k24Wt",  new Document("$sum", "$k24Wt")));

        return mongo.aggregate(Aggregation.newAggregation(match, groupByDay, groupByBranch),
            V3SaleTransaction.class, Document.class).getMappedResults();
    }

    private List<Document> aggPurchasesByBranch(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId).and("purchaseDate").gte(from).lte(to));
        AggregationOperation group = ctx -> new Document("$group", new Document("_id", "$branchCode")
            .append("purchSar", new Document("$sum", "$sarAmount"))
            .append("purchWt",  new Document("$sum", "$pureWeightG")));
        return mongo.aggregate(Aggregation.newAggregation(match, group),
            V3PurchaseTransaction.class, Document.class).getMappedResults();
    }

    private Map<String, Map<String, double[]>> aggPurchasesByBranchAndKarat(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId).and("purchaseDate").gte(from).lte(to));
        AggregationOperation group = ctx -> new Document("$group",
            new Document("_id", new Document("branchCode", "$branchCode").append("karat", "$karat"))
                .append("totalSar", new Document("$sum", "$sarAmount"))
                .append("totalWt",  new Document("$sum", "$pureWeightG")));
        List<Document> results = mongo.aggregate(Aggregation.newAggregation(match, group),
            V3PurchaseTransaction.class, Document.class).getMappedResults();
        Map<String, Map<String, double[]>> map = new LinkedHashMap<>();
        for (Document d : results) {
            Object idObj = d.get("_id");
            if (!(idObj instanceof Document id)) continue;
            String branch = id.getString("branchCode");
            String karat  = id.getString("karat");
            if (branch == null || karat == null) continue;
            map.computeIfAbsent(branch, k -> new LinkedHashMap<>())
               .put(karat, new double[]{ dbl(d, "totalSar"), dbl(d, "totalWt") });
        }
        return map;
    }

    private List<Document> aggEmployeesByBranch(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId).and("saleDate").gte(from).lte(to));
        // Group by {empId, branchCode} — returns a few hundred rows instead of 21,896 documents
        AggregationOperation group = ctx -> new Document("$group",
            new Document("_id", new Document("empId", "$empId").append("branchCode", "$branchCode"))
                .append("empName",     new Document("$first", "$empName"))
                .append("totalSar",    new Document("$sum", "$sarAmount"))
                .append("totalWeight", new Document("$sum", "$pureWeightG"))
                .append("totalPieces", new Document("$sum", new Document("$abs",
                    new Document("$ifNull", Arrays.asList("$pieces", 0)))))
                .append("returns", new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$lt", Arrays.asList("$sarAmount", 0)),
                    new Document("$abs", "$sarAmount"), 0))))
                .append("returnDays", new Document("$sum", new Document("$cond", Arrays.asList(
                    new Document("$lt", Arrays.asList("$sarAmount", 0)), 1, 0)))));
        return mongo.aggregate(Aggregation.newAggregation(match, group),
            V3EmployeeSaleTransaction.class, Document.class).getMappedResults();
    }

    private List<Document> aggMothanByBranch(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId)
                .and("transactionDate").gte(from).lte(to)
                .and("amountSar").gt(0));
        AggregationOperation group = ctx -> new Document("$group", new Document("_id", "$branchCode")
            .append("mothanSar", new Document("$sum", "$amountSar"))
            .append("mothanWt",  new Document("$sum", "$weightDebitG")));
        return mongo.aggregate(Aggregation.newAggregation(match, group),
            V3MothanTransaction.class, Document.class).getMappedResults();
    }

    private List<Document> aggSalesByDay(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId).and("saleDate").gte(from).lte(to));
        AggregationOperation group = ctx -> new Document("$group", new Document("_id", "$saleDate")
            .append("totalSar",    new Document("$sum", "$sarAmount"))
            .append("totalWeight", new Document("$sum", "$pureWeightG")));
        return mongo.aggregate(Aggregation.newAggregation(match, group),
            V3SaleTransaction.class, Document.class).getMappedResults();
    }

    private List<Document> aggPurchasesByDay(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId).and("purchaseDate").gte(from).lte(to));
        AggregationOperation group = ctx -> new Document("$group", new Document("_id", "$purchaseDate")
            .append("totalSar", new Document("$sum", "$sarAmount")));
        return mongo.aggregate(Aggregation.newAggregation(match, group),
            V3PurchaseTransaction.class, Document.class).getMappedResults();
    }

    private List<Document> aggPurchasesByDayWithWeight(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId).and("purchaseDate").gte(from).lte(to));
        AggregationOperation group = ctx -> new Document("$group", new Document("_id", "$purchaseDate")
            .append("totalSar",    new Document("$sum", "$sarAmount"))
            .append("totalWeight", new Document("$sum", "$pureWeightG")));
        return mongo.aggregate(Aggregation.newAggregation(match, group),
            V3PurchaseTransaction.class, Document.class).getMappedResults();
    }

    private List<Document> aggMothanByDay(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation match = Aggregation.match(
            Criteria.where("tenantId").is(tenantId)
                .and("transactionDate").gte(from).lte(to)
                .and("amountSar").gt(0));
        AggregationOperation group = ctx -> new Document("$group", new Document("_id", "$transactionDate")
            .append("totalSar", new Document("$sum", "$amountSar")));
        return mongo.aggregate(Aggregation.newAggregation(match, group),
            V3MothanTransaction.class, Document.class).getMappedResults();
    }

    // ─── Document helpers ─────────────────────────────────────────────────────

    private static Map<String, Document> toDocMap(List<Document> docs) {
        Map<String, Document> map = new LinkedHashMap<>();
        for (Document d : docs) {
            String key = d.getString("_id");
            if (key != null) map.put(key, d);
        }
        return map;
    }

    private static double dbl(Document d, String key) {
        Object v = d.get(key);
        return v instanceof Number n ? n.doubleValue() : 0.0;
    }

    private static double mapDbl(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v instanceof Number n ? n.doubleValue() : 0.0;
    }

    private static long lng(Document d, String key) {
        Object v = d.get(key);
        return v instanceof Number n ? n.longValue() : 0L;
    }

    private static String toDateString(Object id) {
        if (id == null) return "";
        if (id instanceof java.util.Date date)
            return date.toInstant().atZone(java.time.ZoneOffset.UTC).toLocalDate().toString();
        return id.toString();
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
