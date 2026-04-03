package com.mizan.service;
import com.mizan.model.BranchPurchaseRate;
import com.mizan.repository.BranchPurchaseRateRepository;
import com.mizan.security.MizanUserDetails;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

@Service
public class DashboardService {
    private final BranchPurchaseRateRepository rateRepo;
    private final MongoTemplate mongoTemplate;

    public DashboardService(BranchPurchaseRateRepository rateRepo, MongoTemplate mongoTemplate) {
        this.rateRepo = rateRepo;
        this.mongoTemplate = mongoTemplate;
    }

    public record BranchData(
        String code, String name, String region,
        double sar, double wn, double wp, long pcs,
        double purch, double purchWt, double mothan, double mothanWt,
        double k18Sar, double k18Wt, double k21Sar, double k21Wt,
        double k22Sar, double k22Wt, double k24Sar, double k24Wt,
        double returns, boolean isReturn, int returnDays,
        double saleRate, double purchRate, double diffRate, double net, double avgInvoice
    ) {}

    /**
     * Returns pre-aggregated branch summaries using MongoDB aggregation pipelines.
     * Returns ~29 branch-grouped documents instead of loading all 22K+ records into memory.
     */
    public List<BranchData> getBranchSummaries(String tenantId, LocalDate from, LocalDate to,
            List<String> scopedBranches) {
        // 3 aggregation pipelines run in parallel — each returns one doc per branch
        CompletableFuture<List<Document>> salesFuture   = CompletableFuture.supplyAsync(() -> aggregateSales(tenantId, from, to, scopedBranches));
        CompletableFuture<List<Document>> purchFuture   = CompletableFuture.supplyAsync(() -> aggregatePurchases(tenantId, from, to, scopedBranches));
        CompletableFuture<List<Document>> mothanFuture  = CompletableFuture.supplyAsync(() -> aggregateMothan(tenantId, from, to));
        CompletableFuture<Map<String,Double>> ratesFuture = CompletableFuture.supplyAsync(() ->
            rateRepo.findByTenantId(tenantId).stream()
                .collect(Collectors.toMap(BranchPurchaseRate::getBranchCode, BranchPurchaseRate::getPurchaseRate, (a, b_) -> a)));

        CompletableFuture.allOf(salesFuture, purchFuture, mothanFuture, ratesFuture).join();
        List<Document> salesDocs, purchDocs, mothanDocs;
        Map<String,Double> savedRates;
        try {
            salesDocs  = salesFuture.get();
            purchDocs  = purchFuture.get();
            mothanDocs = mothanFuture.get();
            savedRates = ratesFuture.get();
        } catch (Exception e) {
            throw new RuntimeException("Dashboard aggregation failed", e);
        }

        // Combine pre-grouped branch results into MutableBranch map
        Map<String, MutableBranch> bmap = new LinkedHashMap<>();

        for (Document s : salesDocs) {
            String code = s.getString("_id");
            MutableBranch b = bmap.computeIfAbsent(code, k -> new MutableBranch(k, s.getString("branchName"), s.getString("region")));
            b.sar    += getDouble(s, "sar");
            b.wn     += getDouble(s, "wn");
            b.wp     += getDouble(s, "wp");
            b.pcs    += getLong(s, "pcs");
            b.returns    += getDouble(s, "returns");
            b.returnDays += getInt(s, "returnDays");
            b.k18Sar += getDouble(s, "k18Sar"); b.k18Wt += getDouble(s, "k18Wt");
            b.k21Sar += getDouble(s, "k21Sar"); b.k21Wt += getDouble(s, "k21Wt");
            b.k22Sar += getDouble(s, "k22Sar"); b.k22Wt += getDouble(s, "k22Wt");
            b.k24Sar += getDouble(s, "k24Sar"); b.k24Wt += getDouble(s, "k24Wt");
        }

        for (Document p : purchDocs) {
            String code = p.getString("_id");
            MutableBranch b = bmap.computeIfAbsent(code, k -> new MutableBranch(k, p.getString("branchName"), p.getString("region")));
            b.purch   += getDouble(p, "purch");
            b.purchWt += getDouble(p, "purchWt");
        }

        for (Document m : mothanDocs) {
            String code = m.getString("_id");
            String name = m.getString("branchName");
            MutableBranch b = bmap.computeIfAbsent(code, k -> new MutableBranch(k, name, "غير محدد"));
            b.mothan   += getDouble(m, "mothan");
            b.mothanWt += getDouble(m, "mothanWt");
        }

        // Calculate derived rates — same formulas as before, zero change to logic
        return bmap.values().stream().map(b -> {
            double saleRate   = r4(b.wn > 0 ? b.sar / b.wn : 0);
            double combinedWt = b.purchWt + b.mothanWt;
            double purchRate  = r4(combinedWt > 0
                ? (b.purch + b.mothan) / combinedWt
                : savedRates.getOrDefault(b.code, 0.0));
            double diffRate  = r4(purchRate > 0 ? saleRate - purchRate : 0);
            double net       = b.sar - (b.purch + b.mothan);
            double avgInvoice = r2(b.pcs > 0 ? b.sar / b.pcs : 0);
            return new BranchData(b.code, b.name, b.region,
                b.sar, b.wn, b.wp, b.pcs, b.purch, b.purchWt, b.mothan, b.mothanWt,
                b.k18Sar, b.k18Wt, b.k21Sar, b.k21Wt, b.k22Sar, b.k22Wt, b.k24Sar, b.k24Wt,
                Math.abs(b.returns), b.returns != 0, b.returnDays,
                saleRate, purchRate, diffRate, net, avgInvoice);
        }).collect(Collectors.toList());
    }

    // ── Aggregation helpers ────────────────────────────────────────────────────

    /**
     * Aggregates branch_sales by branchCode.
     * Handles dual karat format: embedded karatRows array OR flat k18Sar/k18WeightG fields.
     * Returns one Document per branch with totals.
     */
    private List<Document> aggregateSales(String tenantId, LocalDate from, LocalDate to, List<String> scopedBranches) {
        Criteria criteria = Criteria.where("tenantId").is(tenantId).and("saleDate").gte(from).lte(to);
        if (scopedBranches != null) criteria = criteria.and("branchCode").in(scopedBranches);
        AggregationOperation matchOp = Aggregation.match(criteria);

        // Normalize karat from both formats:
        //   if karatRows is non-empty → reduce filtered array
        //   else                      → use flat field (k18Sar / k18WeightG, etc.)
        Document addFields = new Document();
        for (String[] k : new String[][]{
                {"18","k18Sar","k18WeightG"},
                {"21","k21Sar","k21WeightG"},
                {"22","k22Sar","k22WeightG"},
                {"24","k24Sar","k24WeightG"}}) {
            String kv = k[0], flatSar = k[1], flatWt = k[2];
            Document hasRows = new Document("$gt", List.of(
                new Document("$size", new Document("$ifNull", List.of("$karatRows", List.of()))), 0));

            // SAR from karatRows OR flat field
            addFields.append("_k" + kv + "s", new Document("$cond", List.of(hasRows,
                new Document("$reduce", new Document()
                    .append("input", new Document("$filter", new Document()
                        .append("input", new Document("$ifNull", List.of("$karatRows", List.of())))
                        .append("as", "kr")
                        .append("cond", new Document("$eq", List.of("$$kr.karat", kv)))))
                    .append("initialValue", 0.0)
                    .append("in", new Document("$add", List.of("$$value", new Document("$ifNull", List.of("$$this.sarAmount", 0.0)))))),
                new Document("$ifNull", List.of("$" + flatSar, 0.0)))));

            // Weight from karatRows OR flat field
            addFields.append("_k" + kv + "w", new Document("$cond", List.of(hasRows,
                new Document("$reduce", new Document()
                    .append("input", new Document("$filter", new Document()
                        .append("input", new Document("$ifNull", List.of("$karatRows", List.of())))
                        .append("as", "kr")
                        .append("cond", new Document("$eq", List.of("$$kr.karat", kv)))))
                    .append("initialValue", 0.0)
                    .append("in", new Document("$add", List.of("$$value", new Document("$ifNull", List.of("$$this.netWeight", 0.0)))))),
                new Document("$ifNull", List.of("$" + flatWt, 0.0)))));
        }
        // Absolute invoice count and return fields
        addFields.append("_absPcs",     new Document("$abs", "$invoiceCount"));
        addFields.append("_returnSar",  new Document("$cond", List.of("$isReturn", "$totalSarAmount", 0.0)));
        addFields.append("_returnFlag", new Document("$cond", List.of("$isReturn", 1, 0)));
        AggregationOperation addFieldsOp = ctx -> new Document("$addFields", addFields);

        // Group by branchCode — one doc per branch
        AggregationOperation groupOp = ctx -> new Document("$group", new Document("_id", "$branchCode")
            .append("branchName",  new Document("$first", "$branchName"))
            .append("region",      new Document("$first", "$region"))
            .append("sar",         new Document("$sum", "$totalSarAmount"))
            .append("wn",          new Document("$sum", "$netWeight"))
            .append("wp",          new Document("$sum", "$grossWeight"))
            .append("pcs",         new Document("$sum", "$_absPcs"))
            .append("returns",     new Document("$sum", "$_returnSar"))
            .append("returnDays",  new Document("$sum", "$_returnFlag"))
            .append("k18Sar",      new Document("$sum", "$_k18s"))
            .append("k18Wt",       new Document("$sum", "$_k18w"))
            .append("k21Sar",      new Document("$sum", "$_k21s"))
            .append("k21Wt",       new Document("$sum", "$_k21w"))
            .append("k22Sar",      new Document("$sum", "$_k22s"))
            .append("k22Wt",       new Document("$sum", "$_k22w"))
            .append("k24Sar",      new Document("$sum", "$_k24s"))
            .append("k24Wt",       new Document("$sum", "$_k24w")));

        return mongoTemplate.aggregate(
            Aggregation.newAggregation(matchOp, addFieldsOp, groupOp),
            "branch_sales", Document.class
        ).getMappedResults();
    }

    /** Aggregates branch_purchases by branchCode. */
    private List<Document> aggregatePurchases(String tenantId, LocalDate from, LocalDate to, List<String> scopedBranches) {
        Criteria criteria = Criteria.where("tenantId").is(tenantId).and("purchaseDate").gte(from).lte(to);
        if (scopedBranches != null) criteria = criteria.and("branchCode").in(scopedBranches);
        AggregationOperation matchOp = Aggregation.match(criteria);
        AggregationOperation groupOp = ctx -> new Document("$group", new Document("_id", "$branchCode")
            .append("branchName", new Document("$first", "$branchName"))
            .append("region",     new Document("$first", "$region"))
            .append("purch",      new Document("$sum", "$totalSarAmount"))
            .append("purchWt",    new Document("$sum", "$netWeight")));
        return mongoTemplate.aggregate(
            Aggregation.newAggregation(matchOp, groupOp),
            "branch_purchases", Document.class
        ).getMappedResults();
    }

    /** Aggregates mothan_transactions by branchCode (only positive-weight entries). */
    private List<Document> aggregateMothan(String tenantId, LocalDate from, LocalDate to) {
        AggregationOperation matchOp = Aggregation.match(
            Criteria.where("tenantId").is(tenantId)
                .and("transactionDate").gte(from).lte(to)
                .and("goldWeightGrams").gt(0));
        AggregationOperation groupOp = ctx -> new Document("$group", new Document("_id", "$branchCode")
            .append("branchName", new Document("$first", "$branchName"))
            .append("mothan",     new Document("$sum", "$creditSar"))
            .append("mothanWt",   new Document("$sum", "$goldWeightGrams")));
        return mongoTemplate.aggregate(
            Aggregation.newAggregation(matchOp, groupOp),
            "mothan_transactions", Document.class
        ).getMappedResults();
    }

    // ── Utility ────────────────────────────────────────────────────────────────

    public List<String> resolveScopedBranches(MizanUserDetails user) {
        return switch (user.getRole()) {
            case "SUPER_ADMIN","COMPANY_ADMIN","CEO","HEAD_OF_SALES" -> null;
            case "REGION_MANAGER" -> user.getAllowedRegions() == null ? null :
                com.mizan.config.BranchMaps.BRANCH_REGION.entrySet().stream()
                    .filter(e -> user.getAllowedRegions().contains(e.getValue()))
                    .map(Map.Entry::getKey).collect(Collectors.toList());
            default -> user.getAllowedBranches();
        };
    }

    private static double getDouble(Document doc, String key) {
        Object val = doc.get(key);
        return val instanceof Number n ? n.doubleValue() : 0.0;
    }
    private static long getLong(Document doc, String key) {
        Object val = doc.get(key);
        return val instanceof Number n ? n.longValue() : 0L;
    }
    private static int getInt(Document doc, String key) {
        Object val = doc.get(key);
        return val instanceof Number n ? n.intValue() : 0;
    }

    private static double r4(double v) { return Math.round(v * 10000.0) / 10000.0; }
    private static double r2(double v) { return Math.round(v * 100.0)   / 100.0; }

    private static class MutableBranch {
        String code, name, region;
        double sar, wn, wp, purch, purchWt, mothan, mothanWt, returns;
        double k18Sar, k18Wt, k21Sar, k21Wt, k22Sar, k22Wt, k24Sar, k24Wt;
        long pcs; int returnDays;
        MutableBranch(String code, String name, String region) {
            this.code = code; this.name = name; this.region = region;
        }
    }
}
