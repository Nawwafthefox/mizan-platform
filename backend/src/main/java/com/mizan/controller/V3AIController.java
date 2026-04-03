package com.mizan.controller;

import com.mizan.security.TenantContext;
import com.mizan.service.GeminiAIService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

/**
 * AI-powered analytics endpoints for Dashboard 3.0.
 * All responses are Gemini-generated JSON, cached for 10 minutes per tenant+feature+period.
 * RULE: Only aggregated summaries are ever sent to Gemini — never raw transactions.
 */
@RestController
@RequestMapping("/api/v3/ai")
@Slf4j
public class V3AIController {

    private final GeminiAIService aiService;

    public V3AIController(GeminiAIService aiService) {
        this.aiService = aiService;
    }

    /**
     * Supported features: executive | branches | employees | karat | daily-trend
     */
    @GetMapping("/{feature}")
    public ResponseEntity<?> aiFeature(
            @PathVariable String feature,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        String tenantId = TenantContext.getTenantId();
        log.info("AI request — feature={} tenant={} from={} to={}", feature, tenantId, from, to);

        Map<String, Object> result = aiService.processFeature(feature, tenantId, from, to);
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }
}
