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
}
