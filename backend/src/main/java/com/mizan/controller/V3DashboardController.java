package com.mizan.controller;

import com.mizan.security.TenantContext;
import com.mizan.service.V3CacheService;
import com.mizan.service.V3CalculationService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/v3/dashboard")
public class V3DashboardController {

    private final V3CalculationService calcSvc;
    private final V3CacheService       cache;

    public V3DashboardController(V3CalculationService calcSvc, V3CacheService cache) {
        this.calcSvc = calcSvc;
        this.cache   = cache;
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private String key(String tenantId, String endpoint, LocalDate from, LocalDate to) {
        return tenantId + ":" + endpoint + ":" + from + ":" + to;
    }

    private ResponseEntity<?> cached(String tenantId, String endpoint, LocalDate from, LocalDate to,
                                     java.util.function.Supplier<Object> compute) {
        String key = key(tenantId, endpoint, from, to);
        Object hit = cache.get(key);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));
        Object data = compute.get();
        cache.put(key, data);
        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }

    /** Returns cached data or computes+caches it, without wrapping in ResponseEntity. */
    @SuppressWarnings("unchecked")
    private <T> T fetch(String cacheKey, java.util.function.Supplier<T> compute) {
        T hit = cache.get(cacheKey);
        if (hit != null) return hit;
        T data = compute.get();
        cache.put(cacheKey, data);
        return data;
    }

    // ── endpoints ─────────────────────────────────────────────────────────────

    @GetMapping("/overview")
    public ResponseEntity<?> overview(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "overview", from, to,
            () -> calcSvc.getOverviewKpis(tid, from, to));
    }

    @GetMapping("/branch-summary")
    public ResponseEntity<?> branchSummary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "branch-summary", from, to,
            () -> calcSvc.getBranchSummaries(tid, from, to));
    }

    @GetMapping("/employee-performance")
    public ResponseEntity<?> employeePerformance(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0")        int    page,
            @RequestParam(defaultValue = "50")       int    size,
            @RequestParam(defaultValue = "totalSar") String sort) {
        String tid = TenantContext.getTenantId();
        // Cache the FULL branch-grouped list (page-agnostic key)
        List<Map<String,Object>> groups = fetch(key(tid, "employee-performance", from, to),
            () -> calcSvc.getEmployeePerformance(tid, from, to));

        // Flatten all employees from all branches
        List<Map<String,Object>> all = new ArrayList<>();
        for (Map<String,Object> g : groups) {
            @SuppressWarnings("unchecked") List<Map<String,Object>> emps =
                (List<Map<String,Object>>) g.get("employees");
            if (emps != null) all.addAll(emps);
        }

        // Validate sort field to prevent injection; default to totalSar
        Set<String> allowed = Set.of("totalSar","totalWeight","diffRate","profitMargin","avgInvoice","returns");
        final String sortField = allowed.contains(sort) ? sort : "totalSar";

        // Sort descending
        all.sort((a, b) -> {
            double av = a.getOrDefault(sortField, 0) instanceof Number n ? n.doubleValue() : 0;
            double bv = b.getOrDefault(sortField, 0) instanceof Number n ? n.doubleValue() : 0;
            return Double.compare(bv, av);
        });

        int total      = all.size();
        int totalPages = size > 0 ? (int) Math.ceil((double) total / size) : 1;
        int fromIdx    = Math.min(page * size, total);
        int toIdx      = Math.min(fromIdx + size, total);

        Map<String,Object> paginated = new LinkedHashMap<>();
        paginated.put("data",          all.subList(fromIdx, toIdx));
        paginated.put("totalElements", total);
        paginated.put("totalPages",    totalPages);
        paginated.put("page",          page);
        paginated.put("size",          size);
        paginated.put("sort",          sortField);
        return ResponseEntity.ok(Map.of("success", true, "data", paginated));
    }

    @GetMapping("/daily-trend")
    public ResponseEntity<?> dailyTrend(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "daily-trend", from, to,
            () -> calcSvc.getDailyTrend(tid, from, to));
    }

    @GetMapping("/target-achievement")
    public ResponseEntity<?> targetAchievement(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "target-achievement", from, to,
            () -> calcSvc.getTargetAchievement(tid, from, to));
    }

    @GetMapping("/regions")
    public ResponseEntity<?> regions(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "regions", from, to,
            () -> calcSvc.getRegions(tid, from, to));
    }

    @GetMapping("/karat-breakdown")
    public ResponseEntity<?> karatBreakdown(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "karat-breakdown", from, to,
            () -> calcSvc.getKaratBreakdown(tid, from, to));
    }

    @GetMapping("/mothan-detail")
    public ResponseEntity<?> mothanDetail(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "mothan-detail", from, to,
            () -> calcSvc.getMothanDetail(tid, from, to));
    }

    @GetMapping("/comparison")
    public ResponseEntity<?> comparison(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate d1,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate d2) {
        String tid = TenantContext.getTenantId();
        // Comparison uses d1+d2 as the date range key
        String key  = tid + ":comparison:" + d1 + ":" + d2;
        Object hit  = cache.get(key);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));
        Object data = calcSvc.getComparison(tid, d1, d2);
        cache.put(key, data);
        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }

    @GetMapping("/alerts")
    public ResponseEntity<?> alerts(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "alerts", from, to,
            () -> calcSvc.getAlerts(tid, from, to));
    }

    @GetMapping("/premium-analytics")
    public ResponseEntity<?> premiumAnalytics(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "premium", from, to,
            () -> calcSvc.getPremiumAnalytics(tid, from, to));
    }

    @GetMapping("/mothan")
    public ResponseEntity<?> mothan(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size) {
        String tid = TenantContext.getTenantId();
        // Cache per page (each page has different $skip/$limit in the $facet query)
        String pageKey = tid + ":mothan-paged:" + from + ":" + to + ":p" + page + ":s" + size;
        Object hit = cache.get(pageKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));
        Object data = calcSvc.getMothanDetailPaged(tid, from, to, page, size);
        cache.put(pageKey, data);
        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }

    @GetMapping("/heatmap")
    public ResponseEntity<?> heatmap(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "heatmap", from, to,
            () -> calcSvc.getHeatmapData(tid, from, to));
    }

    @GetMapping("/targets")
    public ResponseEntity<?> targets(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "target-achievement", from, to,  // shares key with target-achievement
            () -> calcSvc.getTargetAchievement(tid, from, to));
    }

    @GetMapping("/premium")
    public ResponseEntity<?> premium(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        String premKey = key(tid, "premium", from, to);
        Object hit = cache.get(premKey);
        if (hit != null) return ResponseEntity.ok(Map.of("success", true, "data", hit, "cached", true));

        // Each fetch() returns from cache or computes+caches — zero duplicate MongoDB calls
        List<Map<String,Object>> branches  = fetch(key(tid, "branch-summary",        from, to),
            () -> calcSvc.getBranchSummaries(tid, from, to));
        List<Map<String,Object>> empGroups = fetch(key(tid, "employee-performance",   from, to),
            () -> calcSvc.getEmployeePerformance(tid, from, to));
        List<Map<String,Object>> trend     = fetch(key(tid, "daily-trend",            from, to),
            () -> calcSvc.getDailyTrend(tid, from, to));
        Map<String,Object>       karatData = fetch(key(tid, "karat-breakdown",        from, to),
            () -> calcSvc.getKaratBreakdown(tid, from, to));

        // Pure Java — zero MongoDB queries
        Object data = calcSvc.buildPremiumFromData(branches, empGroups, trend, karatData, from, to);
        cache.put(premKey, data);
        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }
}
