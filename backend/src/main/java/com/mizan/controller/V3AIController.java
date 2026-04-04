package com.mizan.controller;

import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import com.mizan.service.AiUsageService;
import com.mizan.service.GeminiAIService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI-powered analytics endpoints for Dashboard 3.0.
 * Access restricted to: COMPANY_ADMIN, CEO, HEAD_OF_SALES, SUPER_ADMIN.
 * Usage is logged and daily budget enforced per tenant.
 */
@RestController
@RequestMapping("/api/v3/ai")
@Slf4j
public class V3AIController {

    private static final Set<String> AI_ALLOWED_ROLES = Set.of(
        "COMPANY_ADMIN", "CEO", "HEAD_OF_SALES", "SUPER_ADMIN"
    );

    private final GeminiAIService aiService;
    private final AiUsageService  usageService;

    public V3AIController(GeminiAIService aiService, AiUsageService usageService) {
        this.aiService    = aiService;
        this.usageService = usageService;
    }

    // ── Role check helper ────────────────────────────────────────────────────────

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of(
            "success", false,
            "error",   "access_denied",
            "message", "ميزة الذكاء الاصطناعي متاحة فقط لـ: مسؤول الشركة، المدير التنفيذي، ورئيس المبيعات."
        ));
    }

    // ── AI Feature ───────────────────────────────────────────────────────────────

    @GetMapping("/{feature}")
    public ResponseEntity<?> aiFeature(
            @AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String feature,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        if (!AI_ALLOWED_ROLES.contains(p.getRole())) return forbidden();

        String tenantId = TenantContext.getTenantId();
        log.info("AI request — feature={} tenant={} user={} from={} to={}", feature, tenantId, p.getUsername(), from, to);

        Map<String, Object> result = aiService.processFeature(feature, tenantId, from, to,
            p.getUserId(), p.getUsername());
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    // ── AI Chat ──────────────────────────────────────────────────────────────────

    @PostMapping("/chat")
    public ResponseEntity<?> chat(
            @AuthenticationPrincipal MizanUserDetails p,
            @RequestBody Map<String, String> body,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        if (!AI_ALLOWED_ROLES.contains(p.getRole())) return forbidden();

        String question = body.get("question");
        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest()
                .body(Map.of("success", false, "error", "question is required"));
        }

        String tenantId = TenantContext.getTenantId();

        // Budget check for chat (not cached, always uses quota)
        if (usageService.exceedsDailyBudget(tenantId)) {
            return ResponseEntity.ok(Map.of("success", true, "data", Map.of(
                "error",         true,
                "budgetExceeded", true,
                "resetAt",       usageService.nextResetEpochMs(),
                "answer",        "وصلت إلى الحد اليومي لاستخدام الذكاء الاصطناعي. يرجى ترقية الباقة أو الانتظار حتى إعادة التعيين.\n\nميزان AI ⚖️",
                "relatedMetrics", List.of(),
                "suggestedFollowUps", List.of()
            )));
        }

        log.info("AI chat — tenant={} user={} from={} to={} q='{}'", tenantId, p.getUsername(), from, to,
            question.length() > 80 ? question.substring(0, 80) + "…" : question);

        long start = System.currentTimeMillis();
        Map<String, Object> result = aiService.chat(question, tenantId, from, to);
        long latencyMs = System.currentTimeMillis() - start;

        // Log chat usage (input = question + context estimate, output = answer estimate)
        int inTokens  = AiUsageService.estimateTokens(question) + 3000; // context estimate
        int outTokens = AiUsageService.estimateTokens(result.getOrDefault("answer", "").toString());
        boolean ok    = !Boolean.TRUE.equals(result.get("error"));
        usageService.logUsage(tenantId, p.getUserId(), p.getUsername(), "chat",
            inTokens, outTokens, latencyMs, false, ok);

        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    // ── Usage endpoints (COMPANY_ADMIN, CEO, SUPER_ADMIN) ───────────────────────

    @GetMapping("/usage/today")
    public ResponseEntity<?> usageToday(@AuthenticationPrincipal MizanUserDetails p) {
        if (!Set.of("COMPANY_ADMIN", "CEO", "HEAD_OF_SALES", "SUPER_ADMIN").contains(p.getRole())) return forbidden();
        String tenantId = TenantContext.getTenantId();
        Map<String, Object> stats = usageService.getTodayStats(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", stats));
    }

    @GetMapping("/usage/range")
    public ResponseEntity<?> usageRange(
            @AuthenticationPrincipal MizanUserDetails p,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (!Set.of("COMPANY_ADMIN", "CEO", "HEAD_OF_SALES", "SUPER_ADMIN").contains(p.getRole())) return forbidden();
        String tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(Map.of("success", true, "data",
            usageService.getRangeStats(tenantId, from, to)));
    }

    @GetMapping("/usage/logs")
    public ResponseEntity<?> usageLogs(
            @AuthenticationPrincipal MizanUserDetails p,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (!Set.of("COMPANY_ADMIN", "CEO", "HEAD_OF_SALES", "SUPER_ADMIN").contains(p.getRole())) return forbidden();
        String tenantId = TenantContext.getTenantId();
        return ResponseEntity.ok(Map.of("success", true, "data",
            usageService.getLogs(tenantId, from, to)));
    }
}
