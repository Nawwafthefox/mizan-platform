package com.mizan.service;
import com.mizan.model.*;
import com.mizan.repository.*;
import com.mizan.security.MizanUserDetails;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

@Service
public class DashboardService {
    private final BranchSaleRepository saleRepo;
    private final BranchPurchaseRepository purchRepo;
    private final EmployeeSaleRepository empRepo;
    private final MothanTransactionRepository mothanRepo;
    private final BranchPurchaseRateRepository rateRepo;

    public DashboardService(BranchSaleRepository saleRepo, BranchPurchaseRepository purchRepo,
            EmployeeSaleRepository empRepo, MothanTransactionRepository mothanRepo,
            BranchPurchaseRateRepository rateRepo) {
        this.saleRepo=saleRepo; this.purchRepo=purchRepo;
        this.empRepo=empRepo; this.mothanRepo=mothanRepo; this.rateRepo=rateRepo;
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

    public List<BranchData> getBranchSummaries(String tenantId, LocalDate from, LocalDate to,
            List<String> scopedBranches) {
        // Run all 4 queries in parallel — total time ≈ slowest single query
        CompletableFuture<List<BranchSale>> salesFuture = CompletableFuture.supplyAsync(() ->
            scopedBranches == null
                ? saleRepo.findByTenantAndRange(tenantId, from, to)
                : saleRepo.findByTenantAndRangeAndBranches(tenantId, from, to, scopedBranches));
        CompletableFuture<List<BranchPurchase>> purchFuture = CompletableFuture.supplyAsync(() ->
            scopedBranches == null
                ? purchRepo.findByTenantAndRange(tenantId, from, to)
                : purchRepo.findByTenantAndRangeAndBranches(tenantId, from, to, scopedBranches));
        CompletableFuture<List<MothanTransaction>> mothanFuture = CompletableFuture.supplyAsync(() ->
            mothanRepo.findByTenantAndRange(tenantId, from, to));
        CompletableFuture<Map<String,Double>> ratesFuture = CompletableFuture.supplyAsync(() ->
            rateRepo.findByTenantId(tenantId).stream()
                .collect(Collectors.toMap(BranchPurchaseRate::getBranchCode, BranchPurchaseRate::getPurchaseRate, (a,b_)->a)));

        CompletableFuture.allOf(salesFuture, purchFuture, mothanFuture, ratesFuture).join();
        List<BranchSale> sales;
        List<BranchPurchase> purchases;
        List<MothanTransaction> mothan;
        Map<String,Double> savedRates;
        try {
            sales = salesFuture.get();
            purchases = purchFuture.get();
            mothan = mothanFuture.get();
            savedRates = ratesFuture.get();
        } catch (Exception e) {
            throw new RuntimeException("Dashboard parallel query failed", e);
        }

        // Aggregate
        Map<String,MutableBranch> bmap = new LinkedHashMap<>();
        for (BranchSale s : sales) {
            MutableBranch b = bmap.computeIfAbsent(s.getBranchCode(),
                k -> new MutableBranch(k, s.getBranchName(), s.getRegion()));
            b.sar += s.getTotalSarAmount(); b.wn += s.getNetWeight();
            b.wp += s.getGrossWeight(); b.pcs += Math.abs(s.getInvoiceCount());
            if (s.isReturn()) { b.returns += s.getTotalSarAmount(); b.returnDays++; }
            if (s.getKaratRows() != null && !s.getKaratRows().isEmpty()) {
                for (KaratRow kr : s.getKaratRows()) {
                    switch (kr.getKarat()) {
                        case "18" -> { b.k18Sar+=kr.getSarAmount(); b.k18Wt+=kr.getNetWeight(); }
                        case "21" -> { b.k21Sar+=kr.getSarAmount(); b.k21Wt+=kr.getNetWeight(); }
                        case "22" -> { b.k22Sar+=kr.getSarAmount(); b.k22Wt+=kr.getNetWeight(); }
                        case "24" -> { b.k24Sar+=kr.getSarAmount(); b.k24Wt+=kr.getNetWeight(); }
                    }
                }
            } else {
                // PG-imported records use flat karat fields instead of karatRows
                b.k18Sar += s.getK18Sar(); b.k18Wt += s.getK18WeightG();
                b.k21Sar += s.getK21Sar(); b.k21Wt += s.getK21WeightG();
                b.k22Sar += s.getK22Sar(); b.k22Wt += s.getK22WeightG();
                b.k24Sar += s.getK24Sar(); b.k24Wt += s.getK24WeightG();
            }
        }
        for (BranchPurchase p : purchases) {
            MutableBranch b = bmap.computeIfAbsent(p.getBranchCode(),
                k -> new MutableBranch(k, p.getBranchName(), p.getRegion()));
            b.purch += p.getTotalSarAmount(); b.purchWt += p.getNetWeight();
        }
        for (MothanTransaction m : mothan) {
            if (m.getGoldWeightGrams() <= 0) continue;
            MutableBranch b = bmap.computeIfAbsent(m.getBranchCode(),
                k -> new MutableBranch(k, m.getBranchName(), "غير محدد"));
            b.mothan += m.getCreditSar(); b.mothanWt += m.getGoldWeightGrams();
        }

        return bmap.values().stream().map(b -> {
            double saleRate = r4(b.wn > 0 ? b.sar / b.wn : 0);
            double combinedWt = b.purchWt + b.mothanWt;
            double purchRate = r4(combinedWt > 0
                ? (b.purch + b.mothan) / combinedWt
                : savedRates.getOrDefault(b.code, 0.0));
            double diffRate = r4(purchRate > 0 ? saleRate - purchRate : 0);
            double net = b.sar - (b.purch + b.mothan);
            double avgInvoice = r2(b.pcs > 0 ? b.sar / b.pcs : 0);
            return new BranchData(b.code, b.name, b.region,
                b.sar, b.wn, b.wp, b.pcs, b.purch, b.purchWt, b.mothan, b.mothanWt,
                b.k18Sar, b.k18Wt, b.k21Sar, b.k21Wt, b.k22Sar, b.k22Wt, b.k24Sar, b.k24Wt,
                Math.abs(b.returns), b.returns != 0, b.returnDays,
                saleRate, purchRate, diffRate, net, avgInvoice);
        }).collect(Collectors.toList());
    }

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

    private static double r4(double v) { return Math.round(v * 10000.0) / 10000.0; }
    private static double r2(double v) { return Math.round(v * 100.0)   / 100.0; }


    private static class MutableBranch {
        String code,name,region;
        double sar,wn,wp,purch,purchWt,mothan,mothanWt,returns;
        double k18Sar,k18Wt,k21Sar,k21Wt,k22Sar,k22Wt,k24Sar,k24Wt;
        long pcs; int returnDays;
        MutableBranch(String code,String name,String region){
            this.code=code; this.name=name; this.region=region;
        }
    }
}
