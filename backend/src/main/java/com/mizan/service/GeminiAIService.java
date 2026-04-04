package com.mizan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Calls Gemini 2.0 Flash with aggregated V3 data only — never raw transactions.
 * Internal 30-minute AI response cache to avoid API quota waste.
 * Every Gemini call is logged via AiUsageService; daily budget is enforced per tenant.
 */
@Service
@Slf4j
public class GeminiAIService {

    private static final String GEMINI_BASE_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=";
    private static final long AI_TTL_MS = 30 * 60 * 1000L; // 30 minutes — free-tier friendly

    /** ThreadLocal written by callGemini, read by processFeature to capture per-call metrics. */
    private static final ThreadLocal<long[]> CALL_STATS = new ThreadLocal<>();
    // [0]=inputTokens, [1]=outputTokens, [2]=latencyMs, [3]=1 if success else 0

    @Value("${mizan.gemini.api-key}")
    private String apiKey;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper  = new ObjectMapper();
    private final V3CalculationService calcService;
    private final AiUsageService       usageService;
    private final ConcurrentHashMap<String, AiEntry> aiCache = new ConcurrentHashMap<>();

    private record AiEntry(Map<String, Object> data, long ts) {}

    public GeminiAIService(V3CalculationService calcService, AiUsageService usageService) {
        this.calcService  = calcService;
        this.usageService = usageService;
    }

    // ── Public entry point ──────────────────────────────────────────────────────

    public Map<String, Object> processFeature(String feature, String tenantId, LocalDate from, LocalDate to,
                                               String userId, String userEmail) {
        String key = tenantId + ":ai:" + feature + ":" + from + ":" + to;
        AiEntry hit = aiCache.get(key);
        if (hit != null && System.currentTimeMillis() - hit.ts() < AI_TTL_MS) {
            log.debug("AI cache HIT: {}", key);
            usageService.logUsage(tenantId, userId, userEmail, feature, 0, 0, 0, true, true);
            return hit.data();
        }

        // ── Daily budget check ───────────────────────────────────────────────
        if (usageService.exceedsDailyBudget(tenantId)) {
            log.info("AI budget exceeded — tenant={} feature={}", tenantId, feature);
            Map<String, Object> blocked = new LinkedHashMap<>();
            blocked.put("error", true);
            blocked.put("budgetExceeded", true);
            blocked.put("resetAt", usageService.nextResetEpochMs());
            blocked.put("overview",
                "وصلت إلى الحد اليومي لاستخدام الذكاء الاصطناعي. يرجى ترقية الباقة أو الانتظار حتى إعادة التعيين.");
            blocked.put("recommendations",
                List.of("تواصل مع الإدارة لرفع الحد", "انتظر إعادة التعيين اليومية"));
            usageService.logUsage(tenantId, userId, userEmail, feature, 0, 0, 0, false, false);
            return blocked;
        }

        // ── Execute ──────────────────────────────────────────────────────────
        CALL_STATS.remove(); // clear any stale value from previous request on this thread
        Map<String, Object> result = switch (feature) {
            case "executive"              -> analyzeExecutive(tenantId, from, to);
            case "branches"               -> analyzeBranches(tenantId, from, to);
            case "employees"              -> analyzeEmployees(tenantId, from, to);
            case "karat"                  -> analyzeKarat(tenantId, from, to);
            case "daily-trend"            -> analyzeDailyTrend(tenantId, from, to);
            case "employee-advisor"       -> analyzeEmployeeAdvisor(tenantId, from, to);
            case "transfer-optimizer"     -> analyzeTransferOpportunities(tenantId, from, to);
            case "branch-strategy"        -> analyzeBranchStrategy(tenantId, from, to);
            case "anomaly-detection"      -> analyzeAnomalies(tenantId, from, to);
            case "purchase-intelligence"  -> analyzePurchaseIntelligence(tenantId, from, to);
            case "risk-assessment"        -> analyzeRiskAssessment(tenantId, from, to);
            case "executive-briefing"     -> analyzeExecutiveBriefing(tenantId, from, to);
            case "smart-actions"          -> analyzeSmartActions(tenantId, from, to);
            default                       -> errorMap("ميزة غير معروفة: " + feature);
        };

        // ── Log usage ────────────────────────────────────────────────────────
        long[] stats = CALL_STATS.get();
        CALL_STATS.remove();
        if (stats != null) {
            boolean success = !(result.containsKey("budgetExceeded")) &&
                              !(Boolean.TRUE.equals(result.get("error")) && stats[3] == 0);
            usageService.logUsage(tenantId, userId, userEmail, feature,
                (int) stats[0], (int) stats[1], stats[2], false, success);
        }

        aiCache.put(key, new AiEntry(result, System.currentTimeMillis()));
        return result;
    }

    // ── Feature analyzers ───────────────────────────────────────────────────────

    private Map<String, Object> analyzeExecutive(String tenantId, LocalDate from, LocalDate to) {
        try {
            Map<String, Object> kpis     = calcService.getOverviewKpis(tenantId, from, to);
            List<Map<String, Object>> br = calcService.getBranchSummaries(tenantId, from, to);
            String ctx = buildExecutiveContext(kpis, br, from, to);
            String prompt = """
                أنت محلل مالي ذكاء اصطناعي متخصص في تجارة الذهب بالمملكة العربية السعودية.
                قدم ملخصاً تنفيذياً شاملاً وقابلاً للتنفيذ بناءً على البيانات أدناه.
                أعد JSON صحيح فقط — لا نص خارجه — بهذا الهيكل الدقيق:
                {
                  "headline": "جملة قصيرة تلخص الوضع العام",
                  "overview": "فقرتان أو ثلاث بالعربية تحلل الأداء الكلي بعمق",
                  "strengths": ["نقطة قوة 1", "نقطة قوة 2", "نقطة قوة 3"],
                  "risks": ["خطر 1", "خطر 2"],
                  "recommendations": ["توصية 1", "توصية 2", "توصية 3"],
                  "sentiment": "positive أو neutral أو negative",
                  "performanceScore": رقم من 1 إلى 10
                }
                """;
            return callGemini(prompt, ctx, 0.3);
        } catch (Exception e) {
            log.error("Executive analysis error: {}", e.getMessage());
            return errorMap("فشل تحليل الملخص التنفيذي");
        }
    }

    private Map<String, Object> analyzeBranches(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> branches = calcService.getBranchSummaries(tenantId, from, to);
            String ctx = buildBranchContext(branches, from, to);
            String prompt = """
                أنت محلل أداء فروع تجارة الذهب بالمملكة العربية السعودية.
                حلل أداء الفروع وحدد الرائدين والمتأخرين والأنماط الإقليمية.
                أعد JSON صحيح فقط بهذا الهيكل:
                {
                  "overview": "تحليل شامل لأداء جميع الفروع بالعربية",
                  "topPerformers": [{"name":"اسم الفرع","region":"المنطقة","reason":"سبب التميز"}],
                  "underperformers": [{"name":"اسم الفرع","region":"المنطقة","issue":"المشكلة","action":"الإجراء المقترح"}],
                  "regionalInsights": "تحليل الأنماط الإقليمية",
                  "recommendations": ["توصية 1", "توصية 2", "توصية 3"]
                }
                """;
            return callGemini(prompt, ctx, 0.3);
        } catch (Exception e) {
            log.error("Branch analysis error: {}", e.getMessage());
            return errorMap("فشل تحليل الفروع");
        }
    }

    private Map<String, Object> analyzeEmployees(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> groups = calcService.getEmployeePerformance(tenantId, from, to);
            String ctx = buildEmployeeContext(groups, from, to);
            String prompt = """
                أنت محلل أداء بشري متخصص في تجارة الذهب بالمملكة العربية السعودية.
                حدد نجوم الفريق والموظفين الذين يحتاجون دعماً وتقييم صحة الفريق.
                أعد JSON صحيح فقط بهذا الهيكل:
                {
                  "overview": "تقييم شامل لأداء الفريق بالعربية",
                  "stars": [{"name":"اسم الموظف","branch":"الفرع","highlight":"سبب التميز"}],
                  "needsSupport": [{"name":"اسم الموظف","branch":"الفرع","suggestion":"اقتراح للتحسين"}],
                  "teamHealth": "وصف صحة الفريق العام",
                  "recommendations": ["توصية 1", "توصية 2", "توصية 3"]
                }
                """;
            return callGemini(prompt, ctx, 0.3);
        } catch (Exception e) {
            log.error("Employee analysis error: {}", e.getMessage());
            return errorMap("فشل تحليل الموظفين");
        }
    }

    private Map<String, Object> analyzeKarat(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> branches = calcService.getBranchSummaries(tenantId, from, to);
            String ctx = buildKaratContext(branches, from, to);
            String prompt = """
                أنت خبير ربحية الذهب وتحليل الأعيار بالمملكة العربية السعودية.
                حلل بيانات الأعيار وحدد أكثرها ربحية وقدم توصيات المخزون.
                أعد JSON صحيح فقط بهذا الهيكل:
                {
                  "overview": "تحليل شامل لأداء الأعيار بالعربية",
                  "bestKarat": "العيار الأفضل مثال 21K",
                  "bestKaratReason": "سبب تميز هذا العيار",
                  "karatInsights": [{"karat":"18K","insight":"تحليل هذا العيار","action":"push أو reduce أو maintain"}],
                  "recommendations": ["توصية 1", "توصية 2", "توصية 3"]
                }
                """;
            return callGemini(prompt, ctx, 0.3);
        } catch (Exception e) {
            log.error("Karat analysis error: {}", e.getMessage());
            return errorMap("فشل تحليل الأعيار");
        }
    }

    private Map<String, Object> analyzeDailyTrend(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> trend = calcService.getDailyTrend(tenantId, from, to);
            String ctx = buildDailyTrendContext(trend, from, to);
            String prompt = """
                أنت محلل اتجاهات مالية متخصص في تجارة الذهب بالمملكة العربية السعودية.
                حلل بيانات المبيعات اليومية وحدد الأنماط وفترات الذروة والركود.
                أعد JSON صحيح فقط بهذا الهيكل:
                {
                  "overview": "تحليل شامل للاتجاه اليومي بالعربية",
                  "peakPeriod": "وصف فترة أو أيام الذروة",
                  "slowPeriod": "وصف الفترة الهادئة أو أيام الركود",
                  "trendDirection": "up أو down أو stable",
                  "pattern": "وصف النمط العام للمبيعات",
                  "recommendations": ["توصية 1", "توصية 2", "توصية 3"]
                }
                """;
            return callGemini(prompt, ctx, 0.3);
        } catch (Exception e) {
            log.error("Daily trend analysis error: {}", e.getMessage());
            return errorMap("فشل تحليل الاتجاه اليومي");
        }
    }

    private Map<String, Object> analyzeEmployeeAdvisor(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> groups   = calcService.getEmployeePerformance(tenantId, from, to);
            List<Map<String, Object>> branches = calcService.getBranchSummaries(tenantId, from, to);
            String ctx = buildEmployeeContext(groups, from, to) + "\n" + buildBranchContext(branches, from, to);
            String prompt = """
                You are a Saudi gold retail HR analytics expert with 15+ years experience.
                Analyze employee performance data and return JSON with these exact sections.
                Return valid JSON only — no text outside it.

                {
                  "needsTraining": [
                    { "empId": "...", "empName": "...", "branch": "...",
                      "reason": "Arabic reason why training is needed",
                      "saleRate": 580, "branchAvg": 670, "gap": 90,
                      "suggestedTraining": "Arabic training suggestion",
                      "urgency": "high or medium or low" }
                  ],
                  "topPerformers": [
                    { "empId": "...", "empName": "...", "branch": "...",
                      "reason": "Arabic reason why they excel",
                      "profitMargin": 50000, "recommendation": "ترقية أو مكافأة" }
                  ],
                  "watchList": [
                    { "empId": "...", "empName": "...", "branch": "...",
                      "concern": "Arabic concern description",
                      "metric": "low weight or negative diff or high returns",
                      "actionNeeded": "Arabic action",
                      "deadline": "خلال أسبوعين" }
                  ],
                  "hiringNeeded": [
                    { "branch": "...", "reason": "Arabic reason",
                      "currentEmployees": 5, "suggestedHires": 2,
                      "justification": "Arabic justification with numbers" }
                  ],
                  "terminationRisk": [
                    { "empId": "...", "empName": "...", "branch": "...",
                      "reason": "Arabic reason — consistently underperforming",
                      "monthsUnderperforming": 3,
                      "lastChanceAction": "Arabic suggestion before termination" }
                  ],
                  "summary": "Arabic executive summary paragraph covering all findings"
                }

                Rules:
                - Rating weak (saleRate < 500) with > 30 days active = training needed
                - Rating weak consistently = termination risk (consider Saudi labor law: إنذار أول then إنذار ثاني before termination)
                - DiffRate > branch average by 20%+ = top performer
                - Branch with fewer than 3 employees and high sales = hiring needed
                - Returns > 5% of employee sales = watch list
                - Always give actionable Arabic recommendations
                """;
            return callGemini(prompt, ctx, 0.3);
        } catch (Exception e) {
            log.error("Employee advisor error: {}", e.getMessage());
            return errorMap("فشل تحليل مستشار الموظفين");
        }
    }

    private Map<String, Object> analyzeTransferOpportunities(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> groups   = calcService.getEmployeePerformance(tenantId, from, to);
            List<Map<String, Object>> branches = calcService.getBranchSummaries(tenantId, from, to);
            String ctx = buildTransferContext(groups, branches, from, to);
            String prompt = """
                You are a Saudi gold retail HR optimization expert.
                Analyze employee performance relative to their branch averages and identify optimal transfer opportunities.
                Consider: employee saleRate vs branch average, branch staffing levels (salesPerEmployee), region proximity.
                Return valid JSON only — no text outside it — with this exact structure:

                {
                  "suggestedTransfers": [
                    {
                      "empId": "...",
                      "empName": "...",
                      "currentBranch": "...",
                      "currentPerformance": "Arabic description — e.g. أقل من المتوسط بـ 520 ريال/غ مقابل متوسط الفرع 680",
                      "suggestedBranch": "...",
                      "reason": "Arabic reason why this branch suits them better",
                      "expectedImprovement": "Arabic — e.g. تحسن متوقع 15-20% في الأداء النسبي",
                      "confidence": "high or medium or low"
                    }
                  ],
                  "overstaffedBranches": [
                    {
                      "branch": "...",
                      "employees": 15,
                      "salesPerEmp": 500000,
                      "suggestion": "Arabic suggestion for this branch"
                    }
                  ],
                  "understaffedBranches": [
                    {
                      "branch": "...",
                      "employees": 3,
                      "salesPerEmp": 2000000,
                      "suggestion": "Arabic suggestion for this branch"
                    }
                  ],
                  "balancingPlan": "Arabic executive paragraph — overall workforce rebalancing strategy with specific actions and expected outcomes"
                }

                Rules:
                - Overstaffed = branch has high employee count but low salesPerEmployee (< overall median)
                - Understaffed = branch has few employees but very high salesPerEmployee (> 2x overall median)
                - Transfer candidate = employee saleRate < 80% of their current branch average AND their profile fits an understaffed branch
                - Consider karat specialization if evident from data
                - Confidence: high = clear data signal, medium = moderate signal, low = speculative
                - Always use Arabic for all descriptive fields
                - Limit suggestedTransfers to top 8 most impactful candidates
                """;
            return callGemini(prompt, ctx, 0.3);
        } catch (Exception e) {
            log.error("Transfer optimizer error: {}", e.getMessage());
            return errorMap("فشل تحليل محسّن النقل");
        }
    }

    private Map<String, Object> analyzeBranchStrategy(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> branches = calcService.getBranchSummaries(tenantId, from, to);
            Map<String, Object> kpis = calcService.getOverviewKpis(tenantId, from, to);
            String ctx = buildBranchStrategyContext(branches, kpis, from, to);
            String prompt = """
                You are a strategic management consultant specializing in Saudi gold retail.
                Classify each branch using the BCG Growth-Share Matrix adapted for gold retail:
                - "star":      High sales (above median) + High margin/diffRate (above median) → Invest heavily
                - "cash_cow":  High sales (above median) + Low margin/diffRate (below median) → Optimize efficiency
                - "question":  Low sales (below median)  + High margin/diffRate (above median) → Grow aggressively
                - "dog":       Low sales (below median)  + Low margin/diffRate (below median)  → Fix or consider closing

                Use totalSar for the sales axis and diffRate (SAR/g) for the margin axis.
                Compute medians from the provided data.
                Return valid JSON only — no text outside it — with this exact structure:

                {
                  "branchStrategies": [
                    {
                      "branchCode": "...",
                      "branchName": "...",
                      "region": "...",
                      "classification": "star or cash_cow or question or dog",
                      "classificationAr": "نجمة or بقرة نقدية or علامة استفهام or ضعيف",
                      "totalSar": 0,
                      "diffRate": 0.0,
                      "strengths": ["نقطة قوة 1", "نقطة قوة 2"],
                      "weaknesses": ["نقطة ضعف 1"],
                      "strategy": "Arabic one-line strategic directive",
                      "actionItems": ["إجراء 1", "إجراء 2", "إجراء 3"],
                      "revenueImpact": "Arabic — quantified upside potential",
                      "priority": 1
                    }
                  ],
                  "regionalInsights": [
                    {
                      "region": "...",
                      "totalBranches": 0,
                      "overallHealth": "strong or moderate or weak",
                      "recommendation": "Arabic regional strategy"
                    }
                  ],
                  "urgentActions": ["Arabic immediate action 1", "Arabic immediate action 2"],
                  "quarterlyForecast": "Arabic paragraph — what to expect next quarter based on current trends"
                }

                Rules:
                - Sort branchStrategies by priority (1 = most impactful action needed)
                - Stars get priority 1-N first, then question marks, then cash cows, then dogs
                - actionItems must be specific and measurable (include numbers/timelines where possible)
                - revenueImpact must reference actual numbers from the data
                - urgentActions: only dogs and severely underperforming branches
                - Always write Arabic for all descriptive fields
                """;
            return callGemini(prompt, ctx, 0.25);
        } catch (Exception e) {
            log.error("Branch strategy error: {}", e.getMessage());
            return errorMap("فشل تحليل استراتيجية الفروع");
        }
    }

    private String buildBranchStrategyContext(List<Map<String, Object>> branches,
                                               Map<String, Object> kpis,
                                               LocalDate from, LocalDate to) {
        // Compute medians for the two axes
        List<Double> sales = branches.stream().map(b -> dbl(b, "totalSar")).sorted().toList();
        List<Double> rates = branches.stream().map(b -> dbl(b, "diffRate")).sorted().toList();
        double salesMedian = sales.isEmpty() ? 0 : sales.get(sales.size() / 2);
        double rateMedian  = rates.isEmpty() ? 0 : rates.get(rates.size() / 2);

        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");
        sb.append(String.format("FLEET MEDIANS — Sales Median: %.0f SAR | DiffRate Median: %.2f SAR/g\n\n",
            salesMedian, rateMedian));
        sb.append(String.format("OVERALL KPIs — Total Sales: %.0f SAR | Branches: %.0f | Net: %.0f SAR\n\n",
            dbl(kpis, "totalSales"), dbl(kpis, "branchCount"), dbl(kpis, "net")));

        sb.append("ALL BRANCHES (for BCG classification):\n");
        sb.append("Code | Name | Region | Sales(SAR) | Weight(g) | Invoices | Net(SAR) | SaleRate | DiffRate | Returns(SAR) | ReturnPct\n");
        branches.forEach(b -> {
            double bSales   = dbl(b, "totalSar");
            double bReturns = dbl(b, "returns");
            double retPct   = bSales > 0 ? (bReturns / bSales) * 100 : 0;
            sb.append(String.format("%s | %s | %s | %.0f | %.1f | %.0f | %.0f | %.2f | %.2f | %.0f | %.1f%%\n",
                b.getOrDefault("branchCode", b.getOrDefault("branchName", "")),
                b.getOrDefault("branchName", ""), b.getOrDefault("region", ""),
                bSales, dbl(b, "totalWeight"), dbl(b, "totalPieces"),
                dbl(b, "net"), dbl(b, "saleRate"), dbl(b, "diffRate"),
                bReturns, retPct));
        });
        return sb.toString();
    }

    private Map<String, Object> analyzeAnomalies(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> trend    = calcService.getDailyTrend(tenantId, from, to);
            List<Map<String, Object>> branches = calcService.getBranchSummaries(tenantId, from, to);
            List<Map<String, Object>> empGroups = calcService.getEmployeePerformance(tenantId, from, to);
            String ctx = buildDailyPatternContext(trend, branches, empGroups, from, to);
            String prompt = """
                You are a forensic data analyst and fraud detection expert for Saudi gold retail.
                Your job is to identify genuine anomalies, suspicious patterns, and data quality issues
                in gold retail operations data. Be precise and data-driven.

                Analyze the provided data and return valid JSON only — no text outside it:

                {
                  "anomalies": [
                    {
                      "type": "spike or zero_days or return_pattern or purchase_spike or rate_anomaly or self_dealing or other",
                      "severity": "critical or high or medium or low",
                      "branch": "...",
                      "employee": "... or null",
                      "date": "YYYY-MM-DD or null",
                      "description": "Arabic — specific description with actual numbers from the data",
                      "action": "Arabic — concrete recommended action",
                      "confidence": 0.95
                    }
                  ],
                  "patterns": [
                    {
                      "type": "seasonal or weekly or behavioral or structural",
                      "scope": "fleet-wide or regional or branch-specific",
                      "description": "Arabic — pattern description with evidence",
                      "recommendation": "Arabic — actionable recommendation"
                    }
                  ],
                  "dataQualityIssues": [
                    {
                      "issue": "Arabic — issue type",
                      "details": "Arabic — specific details with branch names and numbers",
                      "action": "Arabic — correction action"
                    }
                  ],
                  "riskScore": 0,
                  "riskSummary": "Arabic — overall risk assessment paragraph"
                }

                Detection rules:
                1. SPIKE: Day with sales > 3× the rolling daily average → flag as possible data error or fraud
                2. ZERO_DAYS: Branch with more than 3 consecutive zero-sale days in the period → investigate closure/issue
                3. RETURN_PATTERN: Employee whose returns exceed 15% of their own sales SAR → possible self-dealing
                4. PURCHASE_SPIKE: Day where purchase rate (purchRate) > 110% of period average → poor buying decision
                5. RATE_ANOMALY: Branch where saleRate / purchRate ratio < 1.02 → selling at near cost or loss
                6. WEIGHT_SAR_MISMATCH: Day or branch where implied rate (SAR/weight) deviates > 30% from fleet avg
                7. SELF_DEALING: Employee with high returns AND low net diffRate in same period → suspicious
                8. DATA_QUALITY: Missing data gaps, implausible invoice counts (0 invoices but positive SAR), etc.
                - riskScore: 0-100 (0=clean, 100=critical fraud risk)
                - Only flag real anomalies with data evidence — do not invent issues
                - Sort anomalies by severity (critical first)
                - Limit to top 15 most significant anomalies
                """;
            return callGemini(prompt, ctx, 0.2);
        } catch (Exception e) {
            log.error("Anomaly detection error: {}", e.getMessage());
            return errorMap("فشل تحليل الشذوذات");
        }
    }

    public String buildDailyPatternContext(List<Map<String, Object>> trend,
                                            List<Map<String, Object>> branches,
                                            List<Map<String, Object>> empGroups,
                                            LocalDate from, LocalDate to) {
        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");

        // ── 1. Fleet-level daily trend with anomaly flags ────────────────────
        int days = trend.size();
        double totalSar  = trend.stream().mapToDouble(d -> dbl(d, "totalSar")).sum();
        double avgDaySar = days > 0 ? totalSar / days : 0;
        double avgDayWt  = days > 0
            ? trend.stream().mapToDouble(d -> dbl(d, "totalWeight")).sum() / days : 0;
        double fleetAvgRate = avgDayWt > 0 ? (totalSar / avgDayWt) : 0;

        sb.append(String.format("FLEET DAILY AVERAGES: AvgSalesPerDay=%.0f SAR | AvgWeightPerDay=%.1f g | AvgRate=%.2f SAR/g | Days=%d\n\n",
            avgDaySar, avgDayWt, fleetAvgRate, days));

        sb.append("DAILY SALES (flagged days marked with ⚠ spike or ⬛ zero):\n");
        sb.append("Date | Sales(SAR) | Weight(g) | Purchases(SAR) | Net(SAR) | ImpliedRate | Flag\n");
        for (Map<String, Object> d : trend) {
            double sar = dbl(d, "totalSar");
            double wt  = dbl(d, "totalWeight");
            double implied = wt > 0 ? sar / wt : 0;
            String flag = "";
            if (sar == 0)              flag = "⬛ ZERO";
            else if (sar > avgDaySar * 3) flag = "⚠ SPIKE";
            else if (sar < avgDaySar * 0.2 && avgDaySar > 0) flag = "↓ LOW";
            if (implied > 0 && fleetAvgRate > 0) {
                double rateDev = Math.abs(implied - fleetAvgRate) / fleetAvgRate;
                if (rateDev > 0.30) flag += " RATE⚠";
            }
            sb.append(String.format("%s | %.0f | %.1f | %.0f | %.0f | %.2f | %s\n",
                d.getOrDefault("date", ""), sar, wt,
                dbl(d, "purchases"), dbl(d, "net"), implied, flag));
        }

        // ── 2. Branch-level anomaly indicators ───────────────────────────────
        double fleetAvgSar  = branches.stream().mapToDouble(b -> dbl(b, "totalSar")).average().orElse(0);
        double fleetAvgRate2 = branches.stream().mapToDouble(b -> dbl(b, "saleRate")).average().orElse(0);
        double fleetAvgPurch = branches.stream().mapToDouble(b -> dbl(b, "purchRate")).average().orElse(0);

        sb.append(String.format("\nFLEET BRANCH AVERAGES: AvgSales=%.0f | AvgSaleRate=%.2f | AvgPurchRate=%.2f\n\n",
            fleetAvgSar, fleetAvgRate2, fleetAvgPurch));

        sb.append("BRANCH ANOMALY SCAN:\n");
        sb.append("Branch | Region | Sales(SAR) | SaleRate | PurchRate | SalePurchRatio | Returns(SAR) | ReturnPct | DiffRate | Flag\n");
        for (Map<String, Object> b : branches) {
            double sar   = dbl(b, "totalSar");
            double sr    = dbl(b, "saleRate");
            double pr    = dbl(b, "purchRate");
            double ret   = dbl(b, "returns");
            double dr    = dbl(b, "diffRate");
            double ratio = pr > 0 ? sr / pr : 0;
            double retPct = sar > 0 ? (ret / sar) * 100 : 0;
            List<String> flags = new ArrayList<>();
            if (ratio > 0 && ratio < 1.02)           flags.add("RATE_MARGIN⚠");
            if (retPct > 10)                          flags.add("HIGH_RETURNS⚠");
            if (pr > 0 && pr > fleetAvgPurch * 1.15) flags.add("PURCHASE_SPIKE⚠");
            if (sar > 0 && sr > 0 && fleetAvgRate2 > 0) {
                double dev = Math.abs(sr - fleetAvgRate2) / fleetAvgRate2;
                if (dev > 0.25) flags.add("RATE_OUTLIER");
            }
            if (sar < fleetAvgSar * 0.1 && fleetAvgSar > 0) flags.add("VERY_LOW_SALES");
            sb.append(String.format("%s | %s | %.0f | %.2f | %.2f | %.3f | %.0f | %.1f%% | %.2f | %s\n",
                b.getOrDefault("branchName", ""), b.getOrDefault("region", ""),
                sar, sr, pr, ratio, ret, retPct, dr,
                flags.isEmpty() ? "OK" : String.join(",", flags)));
        }

        // ── 3. Employee return patterns (self-dealing risk) ───────────────────
        sb.append("\nEMPLOYEE RETURN RISK SCAN (top concerns):\n");
        sb.append("EmpName | EmpId | Branch | Sales(SAR) | Returns(SAR) | ReturnPct | DiffRate | Rating\n");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> allEmps = new ArrayList<>();
        for (Map<String, Object> g : empGroups) {
            List<Map<String, Object>> emps = (List<Map<String, Object>>) g.get("employees");
            if (emps != null) allEmps.addAll(emps);
        }
        allEmps.stream()
            .filter(e -> {
                double sar = dbl(e, "totalSar");
                double ret = dbl(e, "returns");
                double retPct = sar > 0 ? (ret / sar) * 100 : 0;
                double dr = dbl(e, "diffRate");
                // Flag: high returns OR negative/zero diffRate
                return retPct > 8 || dr <= 0;
            })
            .sorted((a, b2) -> {
                double retA = dbl(a, "totalSar") > 0 ? dbl(a, "returns") / dbl(a, "totalSar") : 0;
                double retB = dbl(b2, "totalSar") > 0 ? dbl(b2, "returns") / dbl(b2, "totalSar") : 0;
                return Double.compare(retB, retA);
            })
            .limit(20)
            .forEach(e -> {
                double sar = dbl(e, "totalSar");
                double ret = dbl(e, "returns");
                double retPct = sar > 0 ? (ret / sar) * 100 : 0;
                sb.append(String.format("%s | %s | %s | %.0f | %.0f | %.1f%% | %.2f | %s\n",
                    e.getOrDefault("empName", ""), e.getOrDefault("empId", ""),
                    e.getOrDefault("branchName", ""),
                    sar, ret, retPct, dbl(e, "diffRate"),
                    e.getOrDefault("rating", "")));
            });

        return sb.toString();
    }

    private Map<String, Object> analyzePurchaseIntelligence(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> branches = calcService.getBranchSummaries(tenantId, from, to);
            List<Map<String, Object>> trend    = calcService.getDailyTrend(tenantId, from, to);
            Map<String, Object>       kpis     = calcService.getOverviewKpis(tenantId, from, to);
            String ctx = buildPurchaseContext(branches, trend, kpis, from, to);
            String prompt = """
                You are a gold procurement intelligence expert for Saudi retail.
                Analyze purchase efficiency, mothan vs branch purchase split, karat buying strategy,
                and day-of-week purchase timing patterns. All monetary values in SAR, weight in grams.

                Return valid JSON only — no text outside it:

                {
                  "purchaseTimingScore": 0,
                  "interpretation": "Arabic — interpretation of the score (0=poor, 100=excellent)",
                  "bestPurchaseDays": ["Arabic day name"],
                  "worstPurchaseDays": ["Arabic day name"],
                  "spreadTrend": "improving or stable or deteriorating",
                  "spreadTrendReason": "Arabic — why the spread is moving this direction",
                  "branchPurchaseEfficiency": [
                    {
                      "branch": "...",
                      "region": "...",
                      "avgPurchRate": 0.0,
                      "companyAvg": 0.0,
                      "delta": 0.0,
                      "verdict": "Arabic — better/worse than average by X SAR/g",
                      "savingsEstimate": "Arabic — estimated SAR saved or lost vs average"
                    }
                  ],
                  "mothanVsBranchPurchase": {
                    "mothanAvgRate": 0.0,
                    "branchPurchAvgRate": 0.0,
                    "mothanPct": 0.0,
                    "recommendation": "Arabic — which channel is cheaper and by how much",
                    "potentialSavings": "Arabic — quantified potential if mix is optimized"
                  },
                  "karatPurchaseAdvice": [
                    {
                      "karat": "21",
                      "currentPurchRate": 0.0,
                      "currentSaleRate": 0.0,
                      "marginPerGram": 0.0,
                      "demandSignal": "high or medium or low",
                      "advice": "Arabic — specific buying advice for this karat"
                    }
                  ],
                  "weeklyBudgetSuggestion": "Arabic paragraph — recommended weekly purchase budget and strategy",
                  "topOpportunity": "Arabic — single most impactful purchase optimization to act on now"
                }

                Rules:
                - purchaseTimingScore: 0-100 based on spread consistency, mothan mix, and per-branch efficiency
                - bestPurchaseDays: days where purchase rates were historically lower (good to buy more)
                - worstPurchaseDays: days where purchase rates were higher (buy less)
                - branchPurchaseEfficiency: include ALL branches, sorted from best (most efficient) to worst
                - delta = companyAvg - avgPurchRate (positive = branch buys cheaper than average)
                - savingsEstimate = delta × branch combinedWeight (estimate of money saved/lost)
                - mothanVsBranchPurchase: compare mothan average rate vs branch purchase average rate
                - karatPurchaseAdvice: only include karats with actual purchase data
                - All Arabic text must be specific and reference actual numbers from the data
                """;
            return callGemini(prompt, ctx, 0.25);
        } catch (Exception e) {
            log.error("Purchase intelligence error: {}", e.getMessage());
            return errorMap("فشل تحليل ذكاء المشتريات");
        }
    }

    private String buildPurchaseContext(List<Map<String, Object>> branches,
                                         List<Map<String, Object>> trend,
                                         Map<String, Object> kpis,
                                         LocalDate from, LocalDate to) {
        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");

        // ── 1. Fleet-level purchase summary ─────────────────────────────────
        double totalSales    = dbl(kpis, "totalSales");
        double totalPurch    = branches.stream().mapToDouble(b -> dbl(b, "purchCombined")).sum();
        double totalPurchWt  = branches.stream().mapToDouble(b -> dbl(b, "combinedWt")).sum();
        double totalMotharSar = branches.stream().mapToDouble(b -> dbl(b, "mothanSar")).sum();
        double totalMothanWt  = branches.stream().mapToDouble(b -> dbl(b, "mothanWt")).sum();
        double branchPurchSar = totalPurch - totalMotharSar;
        double branchPurchWt  = totalPurchWt - totalMothanWt;
        double fleetPurchRate = totalPurchWt > 0 ? totalPurch / totalPurchWt : 0;
        double mothanRate     = totalMothanWt > 0 ? totalMotharSar / totalMothanWt : 0;
        double brPurchRate    = branchPurchWt > 0 ? branchPurchSar / branchPurchWt : 0;
        double fleetSaleRate  = dbl(kpis, "saleRate");
        double fleetSpread    = fleetSaleRate - fleetPurchRate;
        double mothanPct      = totalPurch > 0 ? (totalMotharSar / totalPurch) * 100 : 0;

        sb.append("FLEET PURCHASE SUMMARY:\n");
        sb.append(String.format("Total Sales: %.0f SAR | Total Purchases: %.0f SAR | Net Spread: %.0f SAR\n",
            totalSales, totalPurch, totalSales - totalPurch));
        sb.append(String.format("Fleet Sale Rate: %.2f SAR/g | Fleet Purchase Rate: %.2f SAR/g | Spread: %.2f SAR/g\n",
            fleetSaleRate, fleetPurchRate, fleetSpread));
        sb.append(String.format("Mothan: %.0f SAR (%.1fg) at %.2f SAR/g — %.1f%% of total purchases\n",
            totalMotharSar, totalMothanWt, mothanRate, mothanPct));
        sb.append(String.format("Branch Direct Purchase: %.0f SAR (%.1fg) at %.2f SAR/g\n\n",
            branchPurchSar, branchPurchWt, brPurchRate));

        // ── 2. Branch purchase efficiency ────────────────────────────────────
        sb.append("BRANCH PURCHASE EFFICIENCY (fleetAvgPurchRate=").append(String.format("%.2f", fleetPurchRate)).append("):\n");
        sb.append("Branch | Region | PurchSAR | PurchWt(g) | PurchRate | SaleRate | Spread | MothanSAR | MothanWt | Delta\n");
        branches.stream()
            .filter(b -> dbl(b, "purchCombined") > 0)
            .sorted((a, b2) -> Double.compare(dbl(a, "purchRate"), dbl(b2, "purchRate")))
            .forEach(b -> {
                double pr    = dbl(b, "purchRate");
                double sr    = dbl(b, "saleRate");
                double delta = fleetPurchRate - pr; // positive = branch buys cheaper
                sb.append(String.format("%s | %s | %.0f | %.1f | %.2f | %.2f | %.2f | %.0f | %.1f | %+.2f\n",
                    b.getOrDefault("branchName", ""), b.getOrDefault("region", ""),
                    dbl(b, "purchCombined"), dbl(b, "combinedWt"),
                    pr, sr, sr - pr,
                    dbl(b, "mothanSar"), dbl(b, "mothanWt"), delta));
            });

        // ── 3. Karat purchase breakdown ──────────────────────────────────────
        sb.append("\nKARAT PURCHASE DATA:\n");
        sb.append("Karat | SaleSAR | SaleWt(g) | SaleRate | PurchSAR | PurchWt(g) | PurchRate | MarginPerGram | %Revenue\n");
        // Use branch karat data aggregated across fleet
        Map<String, double[]> karatTotals = new LinkedHashMap<>();
        // k18/k21/k22/k24 from branch summaries
        for (Map<String, Object> b : branches) {
            accumKarat(karatTotals, "18K", dbl(b,"k18Sar"), dbl(b,"k18Wt"), 0, 0);
            accumKarat(karatTotals, "21K", dbl(b,"k21Sar"), dbl(b,"k21Wt"), 0, 0);
            accumKarat(karatTotals, "22K", dbl(b,"k22Sar"), dbl(b,"k22Wt"), 0, 0);
            accumKarat(karatTotals, "24K", dbl(b,"k24Sar"), dbl(b,"k24Wt"), 0, 0);
        }
        double grandSaleSar = karatTotals.values().stream().mapToDouble(a -> a[0]).sum();
        karatTotals.forEach((karat, v) -> {
            double sr2 = v[1] > 0 ? v[0] / v[1] : 0;
            double pct = grandSaleSar > 0 ? (v[0] / grandSaleSar) * 100 : 0;
            // purchase rate not available per-karat in branch summary — note it
            sb.append(String.format("%s | %.0f | %.1f | %.2f | n/a | n/a | n/a | n/a | %.1f%%\n",
                karat, v[0], v[1], sr2, pct));
        });

        // ── 4. Daily spread trend (last 90 days, showing purchase vs sale) ──
        sb.append("\nDAILY PURCHASE/SALE SPREAD TREND (last 60 days):\n");
        sb.append("Date | DayOfWeek | SalesSAR | Purchases(SAR) | Net | ImpliedSaleRate | Flag\n");
        List<Map<String, Object>> slice = trend.size() > 60
            ? trend.subList(trend.size() - 60, trend.size()) : trend;
        for (Map<String, Object> d : slice) {
            String date = (String) d.getOrDefault("date", "");
            double sar  = dbl(d, "totalSar");
            double wt   = dbl(d, "totalWeight");
            double purch = dbl(d, "purchases");
            double net   = dbl(d, "net");
            double impliedSR = wt > 0 ? sar / wt : 0;
            // Day of week from date string
            String dow = "";
            try {
                java.time.DayOfWeek day = java.time.LocalDate.parse(date).getDayOfWeek();
                dow = switch (day) {
                    case SUNDAY -> "الأحد"; case MONDAY -> "الاثنين"; case TUESDAY -> "الثلاثاء";
                    case WEDNESDAY -> "الأربعاء"; case THURSDAY -> "الخميس";
                    case FRIDAY -> "الجمعة"; case SATURDAY -> "السبت";
                };
            } catch (Exception ignored) {}
            String flag = purch > sar * 0.95 ? "⚠HIGH_PURCH" : "";
            sb.append(String.format("%s | %s | %.0f | %.0f | %.0f | %.2f | %s\n",
                date, dow, sar, purch, net, impliedSR, flag));
        }

        return sb.toString();
    }

    private void accumKarat(Map<String, double[]> map, String key, double sar, double wt, double pSar, double pWt) {
        double[] v = map.computeIfAbsent(key, k -> new double[4]);
        v[0] += sar; v[1] += wt; v[2] += pSar; v[3] += pWt;
    }

    private Map<String, Object> analyzeRiskAssessment(String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> branches  = calcService.getBranchSummaries(tenantId, from, to);
            List<Map<String, Object>> empGroups = calcService.getEmployeePerformance(tenantId, from, to);
            List<Map<String, Object>> trend     = calcService.getDailyTrend(tenantId, from, to);
            Map<String, Object>       kpis      = calcService.getOverviewKpis(tenantId, from, to);
            String ctx = buildRiskContext(branches, empGroups, trend, kpis, from, to);
            String prompt = """
                You are a risk management specialist for Saudi gold retail with expertise in
                financial fraud detection, operational risk, and regulatory compliance.

                Score each branch's risk from 0 (safest) to 100 (critical risk) using these weighted factors:
                - Return rate risk     (25%): returnPct > 5% = risk, > 10% = high risk
                - Negative diff rate   (25%): selling below purchase price = critical financial risk
                - Employee dependency  (20%): one employee > 70% of branch sales = concentration risk
                - Purchase channel     (15%): 0 purchases in period = supply risk; extreme purchRate = overpay risk
                - Sales trend          (15%): declining sales over the period = business risk

                Company risk score = weighted average of all branch scores.
                riskLevel: "low" (0-30) | "medium" (31-55) | "high" (56-75) | "critical" (76-100)

                Return valid JSON only — no text outside it:

                {
                  "companyRiskScore": 0,
                  "companyRiskLevel": "low or medium or high or critical",
                  "branchRisks": [
                    {
                      "branchCode": "...",
                      "branchName": "...",
                      "region": "...",
                      "riskScore": 0,
                      "riskLevel": "low or medium or high or critical",
                      "factors": [
                        {
                          "factor": "Arabic factor name",
                          "weight": 25,
                          "score": 0,
                          "detail": "Arabic — specific numbers from data"
                        }
                      ],
                      "mitigationPlan": "Arabic — 3 numbered specific actions",
                      "estimatedImpact": "Arabic — quantified expected improvement"
                    }
                  ],
                  "topRisks": ["Arabic — top 5 company-level risks with branch names and numbers"],
                  "positiveIndicators": ["Arabic — top 3 things the company is doing well risk-wise"]
                }

                Rules:
                - Include ALL branches in branchRisks, sorted by riskScore descending (highest risk first)
                - factors array must include all 5 risk dimensions for every branch
                - mitigationPlan must reference actual data (e.g. specific employee names, actual return amounts)
                - topRisks: reference the specific branches and employees causing each risk
                - Do not invent risks — only flag what is evidenced in the data
                """;
            return callGemini(prompt, ctx, 0.2);
        } catch (Exception e) {
            log.error("Risk assessment error: {}", e.getMessage());
            return errorMap("فشل تقييم المخاطر");
        }
    }

    @SuppressWarnings("unchecked")
    private String buildRiskContext(List<Map<String, Object>> branches,
                                     List<Map<String, Object>> empGroups,
                                     List<Map<String, Object>> trend,
                                     Map<String, Object> kpis,
                                     LocalDate from, LocalDate to) {
        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");

        // ── Fleet overview ────────────────────────────────────────────────────
        sb.append(String.format(
            "FLEET KPIs: Sales=%.0f SAR | Purchases=%.0f | Net=%.0f | SaleRate=%.2f | PurchRate=%.2f | DiffRate=%.2f\n",
            dbl(kpis,"totalSales"), dbl(kpis,"totalPurchases"), dbl(kpis,"net"),
            dbl(kpis,"saleRate"), dbl(kpis,"purchRate"), dbl(kpis,"rateDiff")));
        sb.append(String.format(
            "TotalReturns=%.0f SAR (%.1f%% of sales) | LossBranches=%.0f | ProfitableBranches=%.0f\n\n",
            dbl(kpis,"totalReturns"), dbl(kpis,"returnPctOfSales"),
            dbl(kpis,"lossBranches"), dbl(kpis,"profitableBranches")));

        // ── Branch risk factors ───────────────────────────────────────────────
        sb.append("BRANCH RISK DATA (all branches):\n");
        sb.append("Code | Branch | Region | Sales | Purch | Net | SaleRate | PurchRate | DiffRate | Returns | ReturnPct | DiffRateRisk\n");
        for (Map<String, Object> b : branches) {
            double sar    = dbl(b, "totalSar");
            double purch  = dbl(b, "purchCombined");
            double ret    = dbl(b, "returns");
            double dr     = dbl(b, "diffRate");
            double retPct = sar > 0 ? (ret / sar) * 100 : 0;
            String risk   = dr < 0 ? "CRITICAL_NEG" : dr < 5 ? "LOW_MARGIN" : "OK";
            sb.append(String.format("%s | %s | %s | %.0f | %.0f | %.0f | %.2f | %.2f | %.2f | %.0f | %.1f%% | %s\n",
                b.getOrDefault("branchCode",""), b.getOrDefault("branchName",""), b.getOrDefault("region",""),
                sar, purch, dbl(b,"net"), dbl(b,"saleRate"), dbl(b,"purchRate"),
                dr, ret, retPct, risk));
        }

        // ── Employee concentration per branch ─────────────────────────────────
        sb.append("\nEMPLOYEE CONCENTRATION RISK:\n");
        sb.append("Branch | TopEmp | TopEmpSales | BranchTotal | TopEmpPct | DependencyRisk\n");
        // Group employees by branch, find top contributor %
        Map<String, List<Map<String, Object>>> byBranch = new java.util.LinkedHashMap<>();
        for (Map<String, Object> g : empGroups) {
            List<Map<String, Object>> emps = (List<Map<String, Object>>) g.get("employees");
            if (emps == null) continue;
            for (Map<String, Object> e : emps) {
                String bn = (String) e.getOrDefault("branchName", "");
                byBranch.computeIfAbsent(bn, k -> new ArrayList<>()).add(e);
            }
        }
        byBranch.forEach((branchName, emps) -> {
            emps.sort((a, b2) -> Double.compare(dbl(b2,"totalSar"), dbl(a,"totalSar")));
            double branchTotal = emps.stream().mapToDouble(e -> dbl(e,"totalSar")).sum();
            if (branchTotal <= 0) return;
            Map<String, Object> top = emps.get(0);
            double topSar = dbl(top, "totalSar");
            double pct    = (topSar / branchTotal) * 100;
            String risk2  = pct >= 80 ? "CRITICAL" : pct >= 60 ? "HIGH" : pct >= 40 ? "MEDIUM" : "LOW";
            sb.append(String.format("%s | %s | %.0f | %.0f | %.1f%% | %s\n",
                branchName, top.getOrDefault("empName",""), topSar, branchTotal, pct, risk2));
        });

        // ── Sales trend direction per branch (first-half vs second-half) ─────
        sb.append("\nFLEET TREND DIRECTION (first half vs second half of period):\n");
        if (trend.size() >= 4) {
            int half = trend.size() / 2;
            double h1 = trend.subList(0, half).stream().mapToDouble(d -> dbl(d,"totalSar")).sum();
            double h2 = trend.subList(half, trend.size()).stream().mapToDouble(d -> dbl(d,"totalSar")).sum();
            double chg = h1 > 0 ? ((h2 - h1) / h1) * 100 : 0;
            sb.append(String.format("FirstHalfSales=%.0f | SecondHalfSales=%.0f | Change=%.1f%% | Direction=%s\n",
                h1, h2, chg, chg >= 5 ? "GROWING" : chg <= -5 ? "DECLINING" : "STABLE"));
        }

        return sb.toString();
    }

    private Map<String, Object> analyzeExecutiveBriefing(String tenantId, LocalDate from, LocalDate to) {
        try {
            Map<String, Object>       kpis     = calcService.getOverviewKpis(tenantId, from, to);
            List<Map<String, Object>> branches = calcService.getBranchSummaries(tenantId, from, to);
            List<Map<String, Object>> empGroups = calcService.getEmployeePerformance(tenantId, from, to);
            List<Map<String, Object>> trend    = calcService.getDailyTrend(tenantId, from, to);
            String ctx = buildBriefingContext(kpis, branches, empGroups, trend, from, to);
            String nowIso = java.time.LocalDateTime.now().toString();
            String prompt = String.format("""
                أنت كاتب تقارير تنفيذية متخصص في صناعة الذهب بالمملكة العربية السعودية.
                اكتب إحاطة تنفيذية باللغة العربية الفصحى، موجزة، دقيقة، وقابلة للتنفيذ.

                Return valid JSON only — no text outside it:

                {
                  "title": "إحاطة تنفيذية — [month range in Arabic from the data]",
                  "headline": "Arabic — single compelling sentence summarizing the period (include actual % growth or decline)",
                  "performanceSentiment": "positive or neutral or negative",
                  "sections": [
                    {
                      "title": "📊 الأداء العام",
                      "bullets": ["bullet with actual numbers from data", "..."]
                    },
                    {
                      "title": "🏆 أبرز الإنجازات",
                      "bullets": ["achievement with branch name and SAR amount", "..."]
                    },
                    {
                      "title": "⚠️ نقاط تحتاج اهتمام",
                      "bullets": ["concern with branch name and specific metric", "..."]
                    },
                    {
                      "title": "👥 أبرز الموظفين",
                      "bullets": ["top performer: name, branch, amount", "..."]
                    },
                    {
                      "title": "🎯 توصيات فورية",
                      "bullets": ["1. numbered specific action with timeline", "..."]
                    }
                  ],
                  "closingNote": "Arabic — one forward-looking sentence about next period expectations",
                  "generatedAt": "%s"
                }

                Writing rules:
                - Every bullet must contain actual numbers from the data (SAR, %%, grams, employee names)
                - Bullets must be 1-2 lines maximum — concise and scannable
                - Sections must have 3-5 bullets each — no more
                - 📊 section: total sales, net, invoice count, avg invoice, sale/purch rates
                - 🏆 section: top 3 branches by sales, best diffRate, highest invoice branch
                - ⚠️ section: negative diffRate branches, high return branches, loss branches
                - 👥 section: top 3 employees by sales SAR from the data
                - 🎯 section: 3-4 numbered action items, specific and time-bound
                - closingNote: optimistic but realistic, referencing one specific growth opportunity
                - Use formal Arabic — avoid colloquial or overly casual language
                """, nowIso);
            Map<String, Object> result = callGemini(prompt, ctx, 0.5);
            // Ensure generatedAt is set even if Gemini omits it
            result.putIfAbsent("generatedAt", nowIso);
            return result;
        } catch (Exception e) {
            log.error("Executive briefing error: {}", e.getMessage());
            return errorMap("فشل إنشاء الإحاطة التنفيذية");
        }
    }

    @SuppressWarnings("unchecked")
    private String buildBriefingContext(Map<String, Object> kpis,
                                         List<Map<String, Object>> branches,
                                         List<Map<String, Object>> empGroups,
                                         List<Map<String, Object>> trend,
                                         LocalDate from, LocalDate to) {
        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");

        // ── KPIs ────────────────────────────────────────────────────────────
        sb.append("KEY PERFORMANCE INDICATORS:\n");
        sb.append(String.format("Total Sales: %.0f SAR | Total Purchases: %.0f SAR | Net: %.0f SAR\n",
            dbl(kpis,"totalSales"), dbl(kpis,"totalPurchases"), dbl(kpis,"net")));
        sb.append(String.format("Weight Sold: %.1f g | Invoices: %.0f | Avg Invoice: %.0f SAR\n",
            dbl(kpis,"totalWeight"), dbl(kpis,"totalInvoices"), dbl(kpis,"avgInvoice")));
        sb.append(String.format("Sale Rate: %.2f SAR/g | Purchase Rate: %.2f SAR/g | Net Spread: %.2f SAR/g\n",
            dbl(kpis,"saleRate"), dbl(kpis,"purchRate"), dbl(kpis,"rateDiff")));
        sb.append(String.format("Profitable Branches: %.0f | Loss Branches: %.0f | Total: %.0f\n",
            dbl(kpis,"profitableBranches"), dbl(kpis,"lossBranches"), dbl(kpis,"branchCount")));
        sb.append(String.format("Returns: %.0f SAR (%.1f%% of sales)\n\n",
            dbl(kpis,"totalReturns"), dbl(kpis,"returnPctOfSales")));

        // ── Top/bottom branches ──────────────────────────────────────────────
        sb.append("TOP 5 BRANCHES BY SALES:\n");
        sb.append("Rank | Branch | Region | Sales(SAR) | Net(SAR) | DiffRate | Returns\n");
        branches.stream().limit(5).forEach((b) -> sb.append(String.format(
            "| %s | %s | %.0f | %.0f | %.2f | %.0f\n",
            b.getOrDefault("branchName",""), b.getOrDefault("region",""),
            dbl(b,"totalSar"), dbl(b,"net"), dbl(b,"diffRate"), dbl(b,"returns"))));

        sb.append("\nBOTTOM 5 BRANCHES (by diffRate — lowest margin):\n");
        sb.append("Branch | Region | DiffRate | Sales(SAR) | Net(SAR)\n");
        branches.stream()
            .filter(b -> dbl(b,"purchRate") > 0)
            .sorted((a, b2) -> Double.compare(dbl(a,"diffRate"), dbl(b2,"diffRate")))
            .limit(5)
            .forEach(b -> sb.append(String.format(
                "%s | %s | %.2f | %.0f | %.0f\n",
                b.getOrDefault("branchName",""), b.getOrDefault("region",""),
                dbl(b,"diffRate"), dbl(b,"totalSar"), dbl(b,"net"))));

        // ── Top employees ────────────────────────────────────────────────────
        List<Map<String, Object>> allEmps = new ArrayList<>();
        for (Map<String, Object> g : empGroups) {
            List<Map<String, Object>> emps = (List<Map<String, Object>>) g.get("employees");
            if (emps != null) allEmps.addAll(emps);
        }
        allEmps.sort((a, b) -> Double.compare(dbl(b,"totalSar"), dbl(a,"totalSar")));

        sb.append("\nTOP 5 EMPLOYEES BY SALES:\n");
        sb.append("Name | Branch | Sales(SAR) | SaleRate | DiffRate | Rating\n");
        allEmps.stream().limit(5).forEach(e -> sb.append(String.format(
            "%s | %s | %.0f | %.2f | %.2f | %s\n",
            e.getOrDefault("empName",""), e.getOrDefault("branchName",""),
            dbl(e,"totalSar"), dbl(e,"saleRate"), dbl(e,"diffRate"),
            e.getOrDefault("rating",""))));

        // ── Trend summary ────────────────────────────────────────────────────
        if (trend.size() >= 4) {
            int half = trend.size() / 2;
            double h1 = trend.subList(0, half).stream().mapToDouble(d -> dbl(d,"totalSar")).sum();
            double h2 = trend.subList(half, trend.size()).stream().mapToDouble(d -> dbl(d,"totalSar")).sum();
            double chg = h1 > 0 ? ((h2 - h1) / h1) * 100 : 0;
            sb.append(String.format("\nTREND: H1=%.0f SAR → H2=%.0f SAR | Change=%.1f%% (%s)\n",
                h1, h2, chg, chg >= 3 ? "GROWING" : chg <= -3 ? "DECLINING" : "STABLE"));
        }

        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> analyzeSmartActions(String tenantId, LocalDate from, LocalDate to) {
        try {
            Map<String, Object>       kpis      = calcService.getOverviewKpis(tenantId, from, to);
            List<Map<String, Object>> branches  = calcService.getBranchSummaries(tenantId, from, to);
            List<Map<String, Object>> empGroups = calcService.getEmployeePerformance(tenantId, from, to);
            List<Map<String, Object>> trend     = calcService.getDailyTrend(tenantId, from, to);
            String ctx = buildSmartActionsContext(kpis, branches, empGroups, trend, from, to);
            String prompt = """
                You are a gold retail operations manager with a mandate to drive results.
                Analyze ALL dimensions of the business and generate a prioritized action list.
                Every action must be SPECIFIC (name the branch/employee), have a DEADLINE,
                an OWNER (role title), and a quantified EXPECTED IMPACT in SAR.

                Categories to cover:
                - "hr":         staffing, training, transfers, terminations, hiring
                - "operations": branch efficiency, purchase timing, stock management
                - "finance":    margin improvement, return reduction, cost control
                - "risk":       fraud signals, negative rates, concentration risk
                - "growth":     expansion opportunities, top branch investment
                - "compliance": data quality issues, missing transactions, process gaps

                Return valid JSON only — no text outside it:

                {
                  "actions": [
                    {
                      "id": 1,
                      "priority": "critical or high or medium or low",
                      "category": "hr or operations or finance or risk or growth or compliance",
                      "categoryAr": "Arabic category name",
                      "title": "Arabic — concise action title (max 8 words)",
                      "description": "Arabic — 1-2 sentences with specific branch/employee names and numbers",
                      "owner": "Arabic — role title (e.g. مدير منطقة حائل, مدير المشتريات)",
                      "deadline": "Arabic — specific timeframe (e.g. خلال أسبوعين, نهاية الشهر)",
                      "expectedImpact": "Arabic — quantified SAR impact (e.g. +180,000 ريال/شهر)",
                      "effort": "low or medium or high",
                      "status": "pending"
                    }
                  ],
                  "impactSummary": {
                    "totalPotentialImpact": "Arabic — total SAR across all actions",
                    "criticalItems": 0,
                    "highItems": 0,
                    "mediumItems": 0,
                    "lowItems": 0
                  }
                }

                Rules:
                - Generate 15-20 actions covering ALL categories
                - Sort by priority: critical first, then high, medium, low
                - Number id sequentially starting from 1
                - Critical: must fix within 2 weeks — financial loss or fraud risk
                - High: fix this month — significant revenue impact
                - Medium: fix this quarter — efficiency improvement
                - Low: backlog — nice to have
                - Every action must name a SPECIFIC branch or employee from the data
                - expectedImpact must be a realistic SAR estimate based on the actual data
                - effort: low = 1-2 days, medium = 1-2 weeks, high = 1+ months
                - Do not repeat the same action — each must be distinct
                - status is always "pending" (the user will update it)
                """;
            return callGemini(prompt, ctx, 0.3);
        } catch (Exception e) {
            log.error("Smart actions error: {}", e.getMessage());
            return errorMap("فشل إنشاء قائمة الإجراءات الذكية");
        }
    }

    @SuppressWarnings("unchecked")
    private String buildSmartActionsContext(Map<String, Object> kpis,
                                             List<Map<String, Object>> branches,
                                             List<Map<String, Object>> empGroups,
                                             List<Map<String, Object>> trend,
                                             LocalDate from, LocalDate to) {
        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");

        // ── 1. Fleet KPIs ────────────────────────────────────────────────────
        sb.append(String.format(
            "FLEET: Sales=%.0f | Purch=%.0f | Net=%.0f | SaleRate=%.2f | PurchRate=%.2f | Spread=%.2f\n",
            dbl(kpis,"totalSales"), dbl(kpis,"totalPurchases"), dbl(kpis,"net"),
            dbl(kpis,"saleRate"), dbl(kpis,"purchRate"), dbl(kpis,"rateDiff")));
        sb.append(String.format(
            "Branches=%.0f | LossBranches=%.0f | Returns=%.0f SAR (%.1f%%) | Invoices=%.0f | AvgInvoice=%.0f\n\n",
            dbl(kpis,"branchCount"), dbl(kpis,"lossBranches"),
            dbl(kpis,"totalReturns"), dbl(kpis,"returnPctOfSales"),
            dbl(kpis,"totalInvoices"), dbl(kpis,"avgInvoice")));

        // ── 2. Branch signals (full table) ───────────────────────────────────
        double fleetAvgSar  = branches.stream().mapToDouble(b -> dbl(b,"totalSar")).average().orElse(0);
        double fleetMothan  = branches.stream().mapToDouble(b -> dbl(b,"mothanSar")).sum();
        double fleetPurch   = branches.stream().mapToDouble(b -> dbl(b,"purchCombined")).sum();
        double mothanPct    = fleetPurch > 0 ? (fleetMothan / fleetPurch) * 100 : 0;

        sb.append(String.format("MOTHAN%%=%.1f%% of total purchases | FleetAvgBranchSales=%.0f SAR\n\n",
            mothanPct, fleetAvgSar));

        sb.append("BRANCH SIGNALS (all):\n");
        sb.append("Branch | Region | Sales | Net | SaleRate | PurchRate | DiffRate | Returns | ReturnPct | Mothan | PurchComb | Pieces\n");
        for (Map<String, Object> b : branches) {
            double sar    = dbl(b,"totalSar");
            double ret    = dbl(b,"returns");
            double retPct = sar > 0 ? (ret / sar) * 100 : 0;
            sb.append(String.format("%s | %s | %.0f | %.0f | %.2f | %.2f | %.2f | %.0f | %.1f%% | %.0f | %.0f | %.0f\n",
                b.getOrDefault("branchName",""), b.getOrDefault("region",""),
                sar, dbl(b,"net"), dbl(b,"saleRate"), dbl(b,"purchRate"),
                dbl(b,"diffRate"), ret, retPct,
                dbl(b,"mothanSar"), dbl(b,"purchCombined"), dbl(b,"totalPieces")));
        }

        // ── 3. Employee signals ──────────────────────────────────────────────
        List<Map<String, Object>> allEmps = new ArrayList<>();
        for (Map<String, Object> g : empGroups) {
            List<Map<String, Object>> emps = (List<Map<String, Object>>) g.get("employees");
            if (emps != null) allEmps.addAll(emps);
        }
        allEmps.sort((a, b) -> Double.compare(dbl(b,"totalSar"), dbl(a,"totalSar")));
        double fleetAvgEmpSar = allEmps.stream().mapToDouble(e -> dbl(e,"totalSar")).average().orElse(0);

        sb.append(String.format("\nEMPLOYEE SIGNALS (FleetAvgEmpSales=%.0f SAR):\n", fleetAvgEmpSar));
        sb.append("Name | Branch | Region | Sales | SaleRate | DiffRate | Returns | ReturnPct | Rating\n");
        allEmps.stream().limit(40).forEach(e -> {
            double sar    = dbl(e,"totalSar");
            double ret    = dbl(e,"returns");
            double retPct = sar > 0 ? (ret / sar) * 100 : 0;
            sb.append(String.format("%s | %s | %s | %.0f | %.2f | %.2f | %.0f | %.1f%% | %s\n",
                e.getOrDefault("empName",""), e.getOrDefault("branchName",""),
                e.getOrDefault("region",""), sar,
                dbl(e,"saleRate"), dbl(e,"diffRate"),
                ret, retPct, e.getOrDefault("rating","")));
        });

        // ── 4. Employee concentration per branch ─────────────────────────────
        sb.append("\nEMPLOYEE CONCENTRATION:\n");
        sb.append("Branch | TopEmp | TopPct | DependencyRisk\n");
        Map<String, List<Map<String, Object>>> byBranch = new java.util.LinkedHashMap<>();
        for (Map<String, Object> e : allEmps) {
            String bn = (String) e.getOrDefault("branchName","");
            byBranch.computeIfAbsent(bn, k -> new ArrayList<>()).add(e);
        }
        byBranch.forEach((bn, emps) -> {
            double total = emps.stream().mapToDouble(e -> dbl(e,"totalSar")).sum();
            if (total <= 0 || emps.isEmpty()) return;
            double topSar = dbl(emps.get(0), "totalSar");
            double pct    = (topSar / total) * 100;
            sb.append(String.format("%s | %s | %.1f%% | %s\n",
                bn, emps.get(0).getOrDefault("empName",""), pct,
                pct >= 75 ? "CRITICAL" : pct >= 55 ? "HIGH" : "OK"));
        });

        // ── 5. Trend direction ───────────────────────────────────────────────
        if (trend.size() >= 4) {
            int half = trend.size() / 2;
            double h1 = trend.subList(0, half).stream().mapToDouble(d -> dbl(d,"totalSar")).sum();
            double h2 = trend.subList(half, trend.size()).stream().mapToDouble(d -> dbl(d,"totalSar")).sum();
            double chg = h1 > 0 ? ((h2 - h1) / h1) * 100 : 0;
            sb.append(String.format("\nTREND: H1=%.0f → H2=%.0f | Δ=%.1f%% | %s\n",
                h1, h2, chg, chg >= 3 ? "GROWING" : chg <= -3 ? "DECLINING" : "STABLE"));
        }

        return sb.toString();
    }

    /**
     * Free-form chat — NOT cached. Each question gets a fresh Gemini call.
     */
    public Map<String, Object> chat(String question, String tenantId, LocalDate from, LocalDate to) {
        try {
            List<Map<String, Object>> branches  = calcService.getBranchSummaries(tenantId, from, to);
            List<Map<String, Object>> empGroups = calcService.getEmployeePerformance(tenantId, from, to);
            List<Map<String, Object>> trend     = calcService.getDailyTrend(tenantId, from, to);
            Map<String, Object>       kpis      = calcService.getOverviewKpis(tenantId, from, to);

            String ctx = buildBriefingContext(kpis, branches, empGroups, trend, from, to);

            String systemPrompt = """
                أنت "ميزان AI ⚖️"، مساعد ذكاء اصطناعي لشركة ذهب بالتجزئة في المملكة العربية السعودية.
                لديك بيانات مبيعات ومشتريات وموظفين معالجة للفترة المطلوبة.

                قواعد الإجابة:
                1. أجب باللغة العربية الفصحى الودودة دائماً
                2. استشهد بأرقام محددة من البيانات في كل إجابة
                3. إذا سُئلت عن شيء غير موجود في البيانات، قل ذلك بصراحة
                4. قدّم توصيات قابلة للتنفيذ، ليس مجرد ملاحظات
                5. نظّم إجابتك بعناوين عربية واضحة عند الحاجة
                6. للمقارنات، استخدم جداول نصية
                7. لا تختلق بيانات — استخدم فقط ما هو موجود
                8. وقّع كل رد بـ "ميزان AI ⚖️"

                أعد JSON صحيح فقط بهذا الهيكل:
                {
                  "answer": "الإجابة المنسقة بالعربية مع الأرقام والتوصيات",
                  "relatedMetrics": [
                    { "label": "اسم المؤشر", "value": "القيمة المنسقة" }
                  ],
                  "suggestedFollowUps": [
                    "سؤال متابعة مقترح 1",
                    "سؤال متابعة مقترح 2",
                    "سؤال متابعة مقترح 3"
                  ]
                }

                relatedMetrics: 3-5 key numbers directly relevant to the answer (KPIs, branch names+values, etc.)
                suggestedFollowUps: 3 natural Arabic follow-up questions the user might want to ask next
                """;

            // Build the full prompt: system + data context + user question
            String fullPrompt = systemPrompt
                + "\n\n--- البيانات / DATA ---\n" + ctx
                + "\n\n--- سؤال المستخدم / USER QUESTION ---\n" + question;

            // Call Gemini directly (bypasses the usual data-context split)
            Map<String, Object> body = Map.of(
                "contents", List.of(Map.of(
                    "parts", List.of(Map.of("text", fullPrompt))
                )),
                "generationConfig", Map.of(
                    "temperature",      0.5,
                    "maxOutputTokens",  2048,
                    "responseMimeType", "application/json"
                )
            );
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);

            org.springframework.http.ResponseEntity<java.util.Map> resp = restTemplate.postForEntity(
                GEMINI_BASE_URL + apiKey,
                new org.springframework.http.HttpEntity<>(body, headers),
                java.util.Map.class);

            @SuppressWarnings("unchecked")
            List<java.util.Map<String, Object>> candidates =
                (List<java.util.Map<String, Object>>) resp.getBody().get("candidates");
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> content =
                (java.util.Map<String, Object>) candidates.get(0).get("content");
            @SuppressWarnings("unchecked")
            List<java.util.Map<String, Object>> parts =
                (List<java.util.Map<String, Object>>) content.get("parts");
            String text = (String) parts.get(0).get("text");

            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> parsed = objectMapper.readValue(text, java.util.Map.class);
            return parsed;

        } catch (HttpClientErrorException e) {
            int    status = e.getStatusCode().value();
            String detail = extractGeminiError(e.getResponseBodyAsString());
            String reason = switch (status) {
                case 401 -> "مفتاح API غير صالح (401) — تأكد من ضبط GEMINI_API_KEY";
                case 429 -> "تجاوز حد الطلبات (429) — انتهت الحصة";
                default  -> "Gemini HTTP " + status + ": " + detail;
            };
            log.error("Chat Gemini client error {}: {}", status, e.getResponseBodyAsString());
            java.util.Map<String, Object> err = new java.util.LinkedHashMap<>();
            err.put("answer", "⚠️ " + reason + "\n\nميزان AI ⚖️");
            err.put("errorDetail", "HTTP " + status + ": " + detail);
            err.put("relatedMetrics", List.of());
            err.put("suggestedFollowUps", List.of());
            return err;
        } catch (Exception e) {
            log.error("Chat error [{}]: {}", e.getClass().getSimpleName(), e.getMessage());
            java.util.Map<String, Object> err = new java.util.LinkedHashMap<>();
            err.put("answer", "⚠️ " + e.getClass().getSimpleName() + ": " + e.getMessage() + "\n\nميزان AI ⚖️");
            err.put("errorDetail", e.getClass().getName() + ": " + e.getMessage());
            err.put("relatedMetrics", List.of());
            err.put("suggestedFollowUps", List.of());
            return err;
        }
    }

    // ── Gemini API caller ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> callGemini(String systemPrompt, String dataContext, double temperature) {
        int estimatedIn = AiUsageService.estimateTokens(systemPrompt) + AiUsageService.estimateTokens(dataContext);
        long start = System.currentTimeMillis();

        Map<String, Object> body = Map.of(
            "contents", List.of(Map.of(
                "parts", List.of(Map.of("text",
                    systemPrompt + "\n\n--- البيانات / DATA ---\n" + dataContext
                ))
            )),
            "generationConfig", Map.of(
                "temperature",       temperature,
                "maxOutputTokens",   1024,
                "responseMimeType",  "application/json"
            )
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        String url = GEMINI_BASE_URL + apiKey;
        try {
            ResponseEntity<Map> resp = restTemplate.postForEntity(
                url, new HttpEntity<>(body, headers), Map.class);

            List<Map<String, Object>> candidates =
                (List<Map<String, Object>>) resp.getBody().get("candidates");
            Map<String, Object> content =
                (Map<String, Object>) candidates.get(0).get("content");
            List<Map<String, Object>> parts =
                (List<Map<String, Object>>) content.get("parts");
            String text = (String) parts.get(0).get("text");

            long latencyMs = System.currentTimeMillis() - start;
            int estimatedOut = AiUsageService.estimateTokens(text);
            CALL_STATS.set(new long[]{estimatedIn, estimatedOut, latencyMs, 1});

            log.debug("Gemini responded with {} chars in {}ms", text != null ? text.length() : 0, latencyMs);
            return objectMapper.readValue(text, Map.class);

        } catch (HttpClientErrorException e) {
            int    status  = e.getStatusCode().value();
            String errBody = e.getResponseBodyAsString();
            String detail  = extractGeminiError(errBody);
            String reason  = switch (status) {
                case 400 -> "طلب غير صحيح (400) — " + detail;
                case 401 -> "مفتاح API غير صالح (401) — تأكد من ضبط GEMINI_API_KEY في Render";
                case 403 -> "صلاحيات غير كافية (403) — المفتاح لا يملك وصولاً لهذا النموذج";
                case 429 -> "تجاوز حد الطلبات (429) — انتهى حصة API، حاول بعد قليل";
                default  -> "خطأ من Gemini (" + status + ") — " + detail;
            };
            long latencyMs = System.currentTimeMillis() - start;
            CALL_STATS.set(new long[]{estimatedIn, 0, latencyMs, 0});
            log.error("Gemini client error {}: {}", status, errBody);
            return errorMap(reason, "HTTP " + status + ": " + detail);

        } catch (HttpServerErrorException e) {
            int    status  = e.getStatusCode().value();
            String errBody = e.getResponseBodyAsString();
            String detail  = extractGeminiError(errBody);
            long latencyMs = System.currentTimeMillis() - start;
            CALL_STATS.set(new long[]{estimatedIn, 0, latencyMs, 0});
            log.error("Gemini server error {}: {}", status, errBody);
            return errorMap("خطأ في خوادم Gemini (" + status + ") — حاول مرة أخرى",
                            "HTTP " + status + ": " + detail);

        } catch (org.springframework.web.client.ResourceAccessException e) {
            CALL_STATS.set(new long[]{estimatedIn, 0, System.currentTimeMillis() - start, 0});
            log.error("Gemini network error: {}", e.getMessage());
            return errorMap("تعذّر الوصول لـ Gemini — تحقق من اتصال الشبكة",
                            "Network: " + e.getMessage());

        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            CALL_STATS.set(new long[]{estimatedIn, 0, System.currentTimeMillis() - start, 0});
            log.error("Gemini JSON parse error: {}", e.getMessage());
            return errorMap("استجابة Gemini غير صالحة (JSON) — النموذج أعاد نصاً غير منظم",
                            "JSON parse: " + e.getMessage());

        } catch (Exception e) {
            CALL_STATS.set(new long[]{estimatedIn, 0, System.currentTimeMillis() - start, 0});
            log.error("Gemini unexpected error [{}]: {}", e.getClass().getSimpleName(), e.getMessage());
            return errorMap("خطأ غير متوقع — " + e.getClass().getSimpleName(),
                            e.getMessage());
        }
    }

    // ── Context builders (aggregated data only — never raw transactions) ─────────

    private String buildExecutiveContext(Map<String, Object> kpis,
                                          List<Map<String, Object>> branches,
                                          LocalDate from, LocalDate to) {
        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR (Saudi Riyal) | Weight Unit: grams | Industry: Gold Retail KSA\n\n");
        sb.append("OVERALL KPIs:\n");
        sb.append(String.format(
            "Total Sales: %.0f SAR | Total Purchases: %.0f SAR | Net: %.0f SAR\n",
            dbl(kpis,"totalSales"), dbl(kpis,"totalPurchases"), dbl(kpis,"net")));
        sb.append(String.format(
            "Weight Sold: %.1f g | Invoices: %.0f | Avg Invoice: %.0f SAR\n",
            dbl(kpis,"totalWeight"), dbl(kpis,"totalInvoices"), dbl(kpis,"avgInvoice")));
        sb.append(String.format(
            "Sale Rate: %.2f SAR/g | Purchase Rate: %.2f SAR/g | Rate Diff: %.2f SAR/g\n",
            dbl(kpis,"saleRate"), dbl(kpis,"purchRate"), dbl(kpis,"rateDiff")));
        sb.append(String.format(
            "Profitable Branches: %.0f | Loss Branches: %.0f | Total: %.0f\n",
            dbl(kpis,"profitableBranches"), dbl(kpis,"lossBranches"), dbl(kpis,"branchCount")));
        sb.append(String.format(
            "Total Returns: %.0f SAR (%.1f%% of sales)\n",
            dbl(kpis,"totalReturns"), dbl(kpis,"returnPctOfSales")));
        sb.append(String.format(
            "Top Branch: %s (%.0f SAR)\n\n",
            kpis.getOrDefault("topBranchName","-"), dbl(kpis,"topBranchSar")));

        sb.append("TOP 10 BRANCHES (by sales):\n");
        sb.append("Name | Region | Sales(SAR) | Net(SAR) | DiffRate(SAR/g) | Returns(SAR)\n");
        branches.stream().limit(10).forEach(b -> sb.append(String.format(
            "%s | %s | %.0f | %.0f | %.2f | %.0f\n",
            b.getOrDefault("branchName",""), b.getOrDefault("region",""),
            dbl(b,"totalSar"), dbl(b,"net"), dbl(b,"diffRate"), dbl(b,"returns"))));
        return sb.toString();
    }

    private String buildBranchContext(List<Map<String, Object>> branches, LocalDate from, LocalDate to) {
        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");
        sb.append("TOP 15 BRANCHES (sorted by sales desc):\n");
        sb.append("Name | Region | Sales(SAR) | Weight(g) | Invoices | Purchases(SAR) | Net(SAR) | SaleRate | PurchRate | DiffRate | Returns(SAR)\n");
        branches.stream().limit(15).forEach(b -> sb.append(String.format(
            "%s | %s | %.0f | %.1f | %.0f | %.0f | %.0f | %.2f | %.2f | %.2f | %.0f\n",
            b.getOrDefault("branchName",""), b.getOrDefault("region",""),
            dbl(b,"totalSar"), dbl(b,"totalWeight"), dbl(b,"totalPieces"),
            dbl(b,"purchCombined"), dbl(b,"net"),
            dbl(b,"saleRate"), dbl(b,"purchRate"), dbl(b,"diffRate"), dbl(b,"returns"))));
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private String buildEmployeeContext(List<Map<String, Object>> groups, LocalDate from, LocalDate to) {
        List<Map<String, Object>> all = new ArrayList<>();
        for (Map<String, Object> g : groups) {
            List<Map<String, Object>> emps = (List<Map<String, Object>>) g.get("employees");
            if (emps != null) all.addAll(emps);
        }
        all.sort((a, b) -> Double.compare(dbl(b, "totalSar"), dbl(a, "totalSar")));

        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");
        sb.append("TOP 15 EMPLOYEES BY SALES:\n");
        sb.append("Name | Branch | Region | Sales(SAR) | Weight(g) | SaleRate | DiffRate | ProfitMargin | Rating\n");
        all.stream().limit(15).forEach(e -> sb.append(String.format(
            "%s | %s | %s | %.0f | %.1f | %.2f | %.2f | %.0f | %s\n",
            e.getOrDefault("empName",""), e.getOrDefault("branchName",""), e.getOrDefault("region",""),
            dbl(e,"totalSar"), dbl(e,"totalWeight"),
            dbl(e,"saleRate"), dbl(e,"diffRate"), dbl(e,"profitMargin"),
            e.getOrDefault("rating",""))));
        return sb.toString();
    }

    private String buildKaratContext(List<Map<String, Object>> branches, LocalDate from, LocalDate to) {
        double k18S=0,k18W=0, k21S=0,k21W=0, k22S=0,k22W=0, k24S=0,k24W=0;
        for (Map<String,Object> b : branches) {
            k18S+=dbl(b,"k18Sar"); k18W+=dbl(b,"k18Wt");
            k21S+=dbl(b,"k21Sar"); k21W+=dbl(b,"k21Wt");
            k22S+=dbl(b,"k22Sar"); k22W+=dbl(b,"k22Wt");
            k24S+=dbl(b,"k24Sar"); k24W+=dbl(b,"k24Wt");
        }
        double total = k18S + k21S + k22S + k24S;

        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");
        sb.append("KARAT AGGREGATED SUMMARY:\n");
        sb.append("Karat | Total Sales(SAR) | Weight(g) | Avg Rate(SAR/g) | % of Revenue\n");
        karatRow(sb, "18K", k18S, k18W, total);
        karatRow(sb, "21K", k21S, k21W, total);
        karatRow(sb, "22K", k22S, k22W, total);
        karatRow(sb, "24K", k24S, k24W, total);
        sb.append("\nContext: Higher SAR/g = better profitability per gram. ");
        sb.append("Saudi market: 21K is most common for jewelry, 24K for investment, ");
        sb.append("18K growing in modern designs.\n");
        return sb.toString();
    }

    private void karatRow(StringBuilder sb, String label, double sar, double wt, double total) {
        double rate = wt > 0 ? sar / wt : 0;
        double pct  = total > 0 ? (sar / total) * 100 : 0;
        sb.append(String.format("%s | %.0f | %.1f | %.2f | %.1f%%\n", label, sar, wt, rate, pct));
    }

    private String buildDailyTrendContext(List<Map<String, Object>> trend, LocalDate from, LocalDate to) {
        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Industry: Gold Retail KSA\n\n");
        List<Map<String,Object>> slice = trend.size() > 30
            ? trend.subList(trend.size() - 30, trend.size()) : trend;
        sb.append("DAILY TREND (").append(slice.size()).append(" days):\n");
        sb.append("Date | Sales(SAR) | Weight(g) | Purchases(SAR) | Net(SAR)\n");
        slice.forEach(d -> sb.append(String.format("%s | %.0f | %.1f | %.0f | %.0f\n",
            d.getOrDefault("date",""),
            dbl(d,"totalSar"), dbl(d,"totalWeight"),
            dbl(d,"purchases"), dbl(d,"net"))));
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private String buildTransferContext(List<Map<String, Object>> groups,
                                         List<Map<String, Object>> branches,
                                         LocalDate from, LocalDate to) {
        // Compute branch metrics: employee count + salesPerEmployee
        Map<String, Integer> branchEmpCount = new LinkedHashMap<>();
        List<Map<String, Object>> allEmps = new ArrayList<>();
        for (Map<String, Object> g : groups) {
            List<Map<String, Object>> emps = (List<Map<String, Object>>) g.get("employees");
            if (emps != null) {
                allEmps.addAll(emps);
                for (Map<String, Object> e : emps) {
                    String bn = (String) e.getOrDefault("branchName", "");
                    branchEmpCount.merge(bn, 1, Integer::sum);
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("Period: ").append(from).append(" to ").append(to).append("\n");
        sb.append("Currency: SAR | Weight: grams | Industry: Gold Retail KSA\n\n");

        // Branch staffing summary
        sb.append("BRANCH STAFFING ANALYSIS (top 15):\n");
        sb.append("Branch | Region | Sales(SAR) | Employees | SalesPerEmployee(SAR) | AvgSaleRate(SAR/g) | DiffRate\n");
        branches.stream().limit(15).forEach(b -> {
            String name = (String) b.getOrDefault("branchName", "");
            int empCount = branchEmpCount.getOrDefault(name, 0);
            double sales = dbl(b, "totalSar");
            double salesPerEmp = empCount > 0 ? sales / empCount : 0;
            sb.append(String.format("%s | %s | %.0f | %d | %.0f | %.2f | %.2f\n",
                name, b.getOrDefault("region", ""),
                sales, empCount, salesPerEmp,
                dbl(b, "saleRate"), dbl(b, "diffRate")));
        });

        // Employee performance vs branch average
        sb.append("\nEMPLOYEE vs BRANCH COMPARISON (top 20 by sales):\n");
        sb.append("EmpName | EmpId | Branch | Region | SaleRate | BranchAvgRate | RateDelta | Rating | ProfitMargin\n");
        // Build branch avg sale rate map
        Map<String, Double> branchAvgRate = new LinkedHashMap<>();
        branches.forEach(b -> branchAvgRate.put(
            (String) b.getOrDefault("branchName", ""), dbl(b, "saleRate")));

        allEmps.stream()
            .sorted((a, b) -> Double.compare(dbl(b, "totalSar"), dbl(a, "totalSar")))
            .limit(20)
            .forEach(e -> {
                String bn = (String) e.getOrDefault("branchName", "");
                double empRate = dbl(e, "saleRate");
                double brAvg = branchAvgRate.getOrDefault(bn, 0.0);
                double delta = empRate - brAvg;
                sb.append(String.format("%s | %s | %s | %s | %.2f | %.2f | %+.2f | %s | %.0f\n",
                    e.getOrDefault("empName", ""), e.getOrDefault("empId", ""),
                    bn, e.getOrDefault("region", ""),
                    empRate, brAvg, delta,
                    e.getOrDefault("rating", ""), dbl(e, "profitMargin")));
            });

        return sb.toString();
    }

    // ── Utilities ───────────────────────────────────────────────────────────────

    private double dbl(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return 0.0;
        if (v instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return 0.0; }
    }

    private Map<String, Object> errorMap(String message) {
        return errorMap(message, null);
    }

    private Map<String, Object> errorMap(String message, String detail) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", true);
        m.put("overview", message);
        if (detail != null) m.put("errorDetail", detail);
        m.put("recommendations", List.of("يرجى المحاولة مرة أخرى لاحقاً / Please try again later"));
        return m;
    }

    /** Extracts the human-readable message from a Gemini error response body. */
    private String extractGeminiError(String body) {
        if (body == null || body.isBlank()) return "no details";
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(body, Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> error = (Map<String, Object>) parsed.get("error");
            if (error != null) {
                Object msg    = error.get("message");
                Object status = error.get("status");
                return (status != null ? status + " — " : "") + (msg != null ? msg : body);
            }
        } catch (Exception ignored) {}
        // Return first 200 chars of raw body as fallback
        return body.length() > 200 ? body.substring(0, 200) + "…" : body;
    }
}
