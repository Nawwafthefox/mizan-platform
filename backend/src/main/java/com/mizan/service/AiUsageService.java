package com.mizan.service;

import com.mizan.model.AiUsageLog;
import com.mizan.model.Tenant;
import com.mizan.repository.AiUsageLogRepository;
import com.mizan.repository.TenantRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Tracks Groq API usage per tenant.
 *
 * Pricing model (Groq llama-3.3-70b-versatile):
 *   Input  tokens: $0.59 / 1,000,000 tokens
 *   Output tokens: $0.79 / 1,000,000 tokens
 *
 * Token counts come from the real Groq usage field (prompt_tokens / completion_tokens).
 * estimateTokens() is kept as a fallback only.
 */
@Service
@Slf4j
public class AiUsageService {

    // Groq llama-3.3-70b-versatile pricing
    private static final double INPUT_COST_PER_TOKEN  = 0.59 / 1_000_000.0;
    private static final double OUTPUT_COST_PER_TOKEN = 0.79 / 1_000_000.0;

    private final AiUsageLogRepository logRepo;
    private final TenantRepository     tenantRepo;

    public AiUsageService(AiUsageLogRepository logRepo, TenantRepository tenantRepo) {
        this.logRepo    = logRepo;
        this.tenantRepo = tenantRepo;
    }

    // ── Cost helpers ────────────────────────────────────────────────────────────

    public static int estimateTokens(String text) {
        return text == null ? 0 : text.length() / 4;
    }

    public static double calcCost(int inputTokens, int outputTokens) {
        return inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
    }

    // ── Budget check ────────────────────────────────────────────────────────────

    /**
     * Returns true if the tenant has exceeded their daily AI budget.
     */
    public boolean exceedsDailyBudget(String tenantId) {
        Optional<Tenant> opt = tenantRepo.findById(tenantId);
        if (opt.isEmpty()) return false;
        Tenant t = opt.get();
        if (t.getAiConfig() == null || !t.getAiConfig().isAiEnabled()) return true; // disabled = blocked
        double budget = t.getAiConfig().getDailyBudgetUsd();

        List<AiUsageLog> todayLogs = logRepo.findByTenantIdAndUsageDateOrderByCreatedAtDesc(
            tenantId, LocalDate.now(ZoneOffset.UTC));
        double spent = todayLogs.stream()
            .filter(l -> !l.isCached())
            .mapToDouble(AiUsageLog::getCostUsd)
            .sum();
        return spent >= budget;
    }

    /**
     * Returns the epoch-ms of next midnight UTC (when the daily budget resets).
     */
    public long nextResetEpochMs() {
        return LocalDate.now(ZoneOffset.UTC)
            .plusDays(1)
            .atStartOfDay(ZoneOffset.UTC)
            .toInstant()
            .toEpochMilli();
    }

    // ── Logging ─────────────────────────────────────────────────────────────────

    public void logUsage(String tenantId, String userId, String userEmail, String feature,
                         int inputTokens, int outputTokens, long latencyMs,
                         boolean cached, boolean success) {
        try {
            AiUsageLog entry = new AiUsageLog();
            entry.setTenantId(tenantId);
            entry.setUserId(userId);
            entry.setUserEmail(userEmail);
            entry.setFeature(feature);
            entry.setEstimatedInputTokens(inputTokens);
            entry.setEstimatedOutputTokens(outputTokens);
            entry.setCostUsd(cached ? 0.0 : calcCost(inputTokens, outputTokens));
            entry.setLatencyMs(latencyMs);
            entry.setCached(cached);
            entry.setSuccess(success);
            entry.setUsageDate(LocalDate.now(ZoneOffset.UTC));
            logRepo.save(entry);
        } catch (Exception e) {
            log.warn("Failed to save AI usage log: {}", e.getMessage());
        }
    }

    // ── Stats queries ────────────────────────────────────────────────────────────

    /** Today's stats for a single tenant. */
    public Map<String, Object> getTodayStats(String tenantId) {
        return getDayStats(tenantId, LocalDate.now(ZoneOffset.UTC));
    }

    public Map<String, Object> getDayStats(String tenantId, LocalDate date) {
        List<AiUsageLog> logs = logRepo.findByTenantIdAndUsageDateOrderByCreatedAtDesc(tenantId, date);
        return buildStats(logs, date.toString());
    }

    /** Per-day aggregated stats for a date range. */
    public List<Map<String, Object>> getRangeStats(String tenantId, LocalDate from, LocalDate to) {
        List<AiUsageLog> all = logRepo.findByTenantIdAndUsageDateBetweenOrderByCreatedAtDesc(tenantId, from, to);
        Map<LocalDate, List<AiUsageLog>> byDay = all.stream()
            .collect(Collectors.groupingBy(AiUsageLog::getUsageDate));
        return byDay.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .map(e -> buildStats(e.getValue(), e.getKey().toString()))
            .collect(Collectors.toList());
    }

    /** Recent individual call records for a tenant. */
    public List<Map<String, Object>> getLogs(String tenantId, LocalDate from, LocalDate to) {
        return logRepo.findByTenantIdAndUsageDateBetweenOrderByCreatedAtDesc(tenantId, from, to)
            .stream().map(this::logToMap).collect(Collectors.toList());
    }

    /** Summary of all tenants' usage today — for super admin. */
    public List<Map<String, Object>> getAllTenantsToday(List<Tenant> tenants) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<AiUsageLog> todayLogs = logRepo.findByUsageDateOrderByTenantIdAscCreatedAtDesc(today);
        Map<String, List<AiUsageLog>> byTenant = todayLogs.stream()
            .collect(Collectors.groupingBy(AiUsageLog::getTenantId));

        return tenants.stream().map(t -> {
            List<AiUsageLog> tLogs = byTenant.getOrDefault(t.getTenantId(), List.of());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("tenantId",      t.getTenantId());
            row.put("companyNameAr", t.getCompanyNameAr());
            row.put("companyNameEn", t.getCompanyNameEn());
            row.put("dailyBudgetUsd", t.getAiConfig() != null ? t.getAiConfig().getDailyBudgetUsd() : 1.0);
            row.put("aiEnabled",     t.getAiConfig() == null || t.getAiConfig().isAiEnabled());
            double spent = tLogs.stream().filter(l -> !l.isCached()).mapToDouble(AiUsageLog::getCostUsd).sum();
            row.put("todaySpentUsd", round4(spent));
            row.put("todayRequests", tLogs.size());
            row.put("todayCacheHits", tLogs.stream().filter(AiUsageLog::isCached).count());
            row.put("budgetUsedPct", t.getAiConfig() != null && t.getAiConfig().getDailyBudgetUsd() > 0
                ? round2(spent / t.getAiConfig().getDailyBudgetUsd() * 100) : 0);
            row.put("budgetExceeded", t.getAiConfig() != null && spent >= t.getAiConfig().getDailyBudgetUsd());
            return row;
        }).collect(Collectors.toList());
    }

    // ── Private helpers ──────────────────────────────────────────────────────────

    private Map<String, Object> buildStats(List<AiUsageLog> logs, String label) {
        long total      = logs.size();
        long cacheHits  = logs.stream().filter(AiUsageLog::isCached).count();
        long apiCalls   = total - cacheHits;
        long errors     = logs.stream().filter(l -> !l.isSuccess()).count();
        double totalCost= logs.stream().mapToDouble(AiUsageLog::getCostUsd).sum();
        long totalIn    = logs.stream().mapToLong(AiUsageLog::getEstimatedInputTokens).sum();
        long totalOut   = logs.stream().mapToLong(AiUsageLog::getEstimatedOutputTokens).sum();
        double avgMs    = logs.stream().filter(l -> !l.isCached()).mapToLong(AiUsageLog::getLatencyMs).average().orElse(0);

        // Per-feature breakdown
        Map<String, Long> byFeature = logs.stream()
            .collect(Collectors.groupingBy(AiUsageLog::getFeature, Collectors.counting()));
        Map<String, Double> costByFeature = logs.stream()
            .collect(Collectors.groupingBy(AiUsageLog::getFeature,
                     Collectors.summingDouble(AiUsageLog::getCostUsd)));

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label",         label);
        m.put("totalRequests", total);
        m.put("apiCalls",      apiCalls);
        m.put("cacheHits",     cacheHits);
        m.put("errors",        errors);
        m.put("totalCostUsd",  round4(totalCost));
        m.put("inputTokens",   totalIn);
        m.put("outputTokens",  totalOut);
        m.put("avgLatencyMs",  (long) avgMs);
        m.put("byFeature",     byFeature);
        m.put("costByFeature", costByFeature.entrySet().stream()
            .collect(Collectors.toMap(Map.Entry::getKey, e -> round4(e.getValue()))));
        return m;
    }

    private Map<String, Object> logToMap(AiUsageLog l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",            l.getId());
        m.put("feature",       l.getFeature());
        m.put("userId",        l.getUserId());
        m.put("userEmail",     l.getUserEmail());
        m.put("cached",        l.isCached());
        m.put("success",       l.isSuccess());
        m.put("inputTokens",   l.getEstimatedInputTokens());   // actual from Groq usage field
        m.put("outputTokens",  l.getEstimatedOutputTokens()); // actual from Groq usage field
        m.put("costUsd",       round4(l.getCostUsd()));
        m.put("latencyMs",     l.getLatencyMs());
        m.put("createdAt",     l.getCreatedAt());
        return m;
    }

    private static double round4(double v) { return Math.round(v * 10000.0) / 10000.0; }
    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }
}
