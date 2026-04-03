package com.mizan.service;
import com.mizan.security.MizanUserDetails;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class DashboardService {
    private final V3CalculationService calcSvc;

    public DashboardService(V3CalculationService calcSvc) {
        this.calcSvc = calcSvc;
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
     * Returns branch summaries sourced from V3 collections.
     * Applies scopedBranches filter in-process after fetching all branches.
     */
    public List<BranchData> getBranchSummaries(String tenantId, LocalDate from, LocalDate to,
            List<String> scopedBranches) {
        List<Map<String, Object>> v3 = calcSvc.getBranchSummaries(tenantId, from, to);
        return v3.stream()
            .filter(m -> scopedBranches == null || scopedBranches.contains(str(m, "branchCode")))
            .map(DashboardService::toRecord)
            .collect(Collectors.toList());
    }

    private static BranchData toRecord(Map<String, Object> m) {
        double returns    = dbl(m, "returns");
        int    returnDays = (int) lng(m, "returnDays");
        return new BranchData(
            str(m, "branchCode"), str(m, "branchName"), str(m, "region"),
            dbl(m, "totalSar"), dbl(m, "totalWeight"), 0.0, lng(m, "totalPieces"),
            dbl(m, "purchSar"), dbl(m, "purchWt"),
            dbl(m, "mothanSar"), dbl(m, "mothanWt"),
            dbl(m, "k18Sar"), dbl(m, "k18Wt"),
            dbl(m, "k21Sar"), dbl(m, "k21Wt"),
            dbl(m, "k22Sar"), dbl(m, "k22Wt"),
            dbl(m, "k24Sar"), dbl(m, "k24Wt"),
            Math.abs(returns), returns != 0, returnDays,
            dbl(m, "saleRate"), dbl(m, "purchRate"), dbl(m, "diffRate"),
            dbl(m, "net"), dbl(m, "avgInvoice")
        );
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

    private static double dbl(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v instanceof Number n ? n.doubleValue() : 0.0;
    }
    private static long lng(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v instanceof Number n ? n.longValue() : 0L;
    }
    private static String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString() : "";
    }
}
