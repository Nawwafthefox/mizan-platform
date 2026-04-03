package com.mizan.controller;

import com.mizan.security.TenantContext;
import com.mizan.service.V3CalculationService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/v3/dashboard")
public class V3DashboardController {

    private final V3CalculationService calcSvc;

    public V3DashboardController(V3CalculationService calcSvc) {
        this.calcSvc = calcSvc;
    }

    @GetMapping("/branch-summary")
    public ResponseEntity<?> branchSummary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getBranchSummaries(tenantId, from, to)));
    }

    @GetMapping("/overview")
    public ResponseEntity<?> overview(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getOverviewKpis(tenantId, from, to)));
    }

    @GetMapping("/employee-performance")
    public ResponseEntity<?> employeePerformance(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getEmployeePerformance(tenantId, from, to)));
    }

    @GetMapping("/daily-trend")
    public ResponseEntity<?> dailyTrend(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getDailyTrend(tenantId, from, to)));
    }

    @GetMapping("/target-achievement")
    public ResponseEntity<?> targetAchievement(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getTargetAchievement(tenantId, from, to)));
    }

    @GetMapping("/regions")
    public ResponseEntity<?> regions(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getRegions(TenantContext.getTenantId(), from, to)));
    }

    @GetMapping("/karat-breakdown")
    public ResponseEntity<?> karatBreakdown(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getKaratBreakdown(TenantContext.getTenantId(), from, to)));
    }

    @GetMapping("/mothan-detail")
    public ResponseEntity<?> mothanDetail(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getMothanDetail(TenantContext.getTenantId(), from, to)));
    }

    @GetMapping("/comparison")
    public ResponseEntity<?> comparison(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate d1,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate d2) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getComparison(TenantContext.getTenantId(), d1, d2)));
    }

    @GetMapping("/alerts")
    public ResponseEntity<?> alerts(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getAlerts(TenantContext.getTenantId(), from, to)));
    }

    @GetMapping("/premium-analytics")
    public ResponseEntity<?> premiumAnalytics(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getPremiumAnalytics(TenantContext.getTenantId(), from, to)));
    }

    @GetMapping("/mothan")
    public ResponseEntity<?> mothan(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getMothanDetail(TenantContext.getTenantId(), from, to)));
    }

    @GetMapping("/heatmap")
    public ResponseEntity<?> heatmap(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getHeatmapData(TenantContext.getTenantId(), from, to)));
    }

    @GetMapping("/targets")
    public ResponseEntity<?> targets(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getTargetAchievement(TenantContext.getTenantId(), from, to)));
    }

    @GetMapping("/premium")
    public ResponseEntity<?> premium(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(Map.of("success", true,
            "data", calcSvc.getPremiumDashboard(TenantContext.getTenantId(), from, to)));
    }
}
