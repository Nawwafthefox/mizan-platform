package com.mizan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Calls Gemini 2.0 Flash with aggregated V3 data only — never raw transactions.
 * Internal 10-minute AI response cache to avoid API quota waste.
 */
@Service
@Slf4j
public class GeminiAIService {

    private static final String API_KEY = "AIzaSyDMCW8XFMnnpGXsOJ5vGYyVDdVMIkF13kc";
    private static final String GEMINI_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + API_KEY;
    private static final long AI_TTL_MS = 10 * 60 * 1000L; // 10 minutes

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper  = new ObjectMapper();
    private final V3CalculationService calcService;
    private final ConcurrentHashMap<String, AiEntry> aiCache = new ConcurrentHashMap<>();

    private record AiEntry(Map<String, Object> data, long ts) {}

    public GeminiAIService(V3CalculationService calcService) {
        this.calcService = calcService;
    }

    // ── Public entry point ──────────────────────────────────────────────────────

    public Map<String, Object> processFeature(String feature, String tenantId, LocalDate from, LocalDate to) {
        String key = tenantId + ":ai:" + feature + ":" + from + ":" + to;
        AiEntry hit = aiCache.get(key);
        if (hit != null && System.currentTimeMillis() - hit.ts() < AI_TTL_MS) {
            log.debug("AI cache HIT: {}", key);
            return hit.data();
        }
        Map<String, Object> result = switch (feature) {
            case "executive"        -> analyzeExecutive(tenantId, from, to);
            case "branches"         -> analyzeBranches(tenantId, from, to);
            case "employees"        -> analyzeEmployees(tenantId, from, to);
            case "karat"            -> analyzeKarat(tenantId, from, to);
            case "daily-trend"      -> analyzeDailyTrend(tenantId, from, to);
            case "employee-advisor" -> analyzeEmployeeAdvisor(tenantId, from, to);
            default                 -> errorMap("ميزة غير معروفة: " + feature);
        };
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
                You are an AI financial analyst specializing in Saudi Arabian gold retail.
                قدم ملخصاً تنفيذياً شاملاً وقابلاً للتنفيذ بناءً على البيانات أدناه.
                Provide a comprehensive and actionable executive summary based on the data below.
                أعد JSON صحيح فقط — لا نص خارجه — بهذا الهيكل الدقيق:
                Return valid JSON only — no text outside it — with this exact structure:
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
                You are a branch performance analyst for Saudi gold retail.
                حلل أداء الفروع وحدد الرائدين والمتأخرين والأنماط الإقليمية.
                Analyze branch performance, identify leaders, laggards, and regional patterns.
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
                You are an HR performance analyst for Saudi gold retail.
                حدد نجوم الفريق والموظفين الذين يحتاجون دعماً وتقييم صحة الفريق.
                Identify team stars, employees needing support, and assess overall team health.
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
                You are a gold karat profitability expert for Saudi Arabia.
                حلل بيانات الأعيار وحدد أكثرها ربحية وقدم توصيات المخزون.
                Analyze karat data, identify most profitable, and provide inventory recommendations.
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
                You are a financial trends analyst for Saudi gold retail.
                حلل بيانات المبيعات اليومية وحدد الأنماط وفترات الذروة والركود.
                Analyze daily sales data, identify patterns, peak periods, and slow periods.
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

    // ── Gemini API caller ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> callGemini(String systemPrompt, String dataContext, double temperature) {
        Map<String, Object> body = Map.of(
            "contents", List.of(Map.of(
                "parts", List.of(Map.of("text",
                    systemPrompt + "\n\n--- البيانات / DATA ---\n" + dataContext
                ))
            )),
            "generationConfig", Map.of(
                "temperature",       temperature,
                "maxOutputTokens",   2048,
                "responseMimeType",  "application/json"
            )
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        try {
            ResponseEntity<Map> resp = restTemplate.postForEntity(
                GEMINI_URL, new HttpEntity<>(body, headers), Map.class);

            List<Map<String, Object>> candidates =
                (List<Map<String, Object>>) resp.getBody().get("candidates");
            Map<String, Object> content =
                (Map<String, Object>) candidates.get(0).get("content");
            List<Map<String, Object>> parts =
                (List<Map<String, Object>>) content.get("parts");
            String text = (String) parts.get(0).get("text");

            log.debug("Gemini responded with {} chars", text != null ? text.length() : 0);
            return objectMapper.readValue(text, Map.class);

        } catch (Exception e) {
            log.error("Gemini API call failed: {}", e.getMessage());
            return errorMap("خدمة الذكاء الاصطناعي غير متاحة مؤقتاً — AI service temporarily unavailable");
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
        sb.append("ALL BRANCHES (sorted by sales desc):\n");
        sb.append("Name | Region | Sales(SAR) | Weight(g) | Invoices | Purchases(SAR) | Net(SAR) | SaleRate | PurchRate | DiffRate | Returns(SAR)\n");
        branches.forEach(b -> sb.append(String.format(
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
        sb.append("TOP 30 EMPLOYEES BY SALES:\n");
        sb.append("Name | Branch | Region | Sales(SAR) | Weight(g) | SaleRate | DiffRate | ProfitMargin | Rating\n");
        all.stream().limit(30).forEach(e -> sb.append(String.format(
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
        List<Map<String,Object>> slice = trend.size() > 90
            ? trend.subList(trend.size() - 90, trend.size()) : trend;
        sb.append("DAILY TREND (").append(slice.size()).append(" days):\n");
        sb.append("Date | Sales(SAR) | Weight(g) | Purchases(SAR) | Net(SAR)\n");
        slice.forEach(d -> sb.append(String.format("%s | %.0f | %.1f | %.0f | %.0f\n",
            d.getOrDefault("date",""),
            dbl(d,"totalSar"), dbl(d,"totalWeight"),
            dbl(d,"purchases"), dbl(d,"net"))));
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
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", true);
        m.put("overview", message);
        m.put("recommendations", List.of("يرجى المحاولة مرة أخرى لاحقاً / Please try again later"));
        return m;
    }
}
