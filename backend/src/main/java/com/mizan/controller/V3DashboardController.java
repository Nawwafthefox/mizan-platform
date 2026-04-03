package com.mizan.controller;

import com.mizan.security.TenantContext;
import com.mizan.service.V3CacheService;
import com.mizan.service.V3CalculationService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

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
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "employee-performance", from, to,
            () -> calcSvc.getEmployeePerformance(tid, from, to));
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
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tid = TenantContext.getTenantId();
        return cached(tid, "mothan-detail", from, to,   // shares key with mothan-detail
            () -> calcSvc.getMothanDetail(tid, from, to));
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
