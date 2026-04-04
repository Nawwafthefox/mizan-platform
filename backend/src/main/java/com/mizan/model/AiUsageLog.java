package com.mizan.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Persists each Gemini API call (or cache hit) for billing, quota, and audit purposes.
 * Gemini 2.0 Flash pricing: input $0.075/1M tokens, output $0.30/1M tokens.
 */
@Data
@Document("ai_usage_logs")
public class AiUsageLog {
    @Id private String id;

    @Indexed private String tenantId;
    private String userId;
    private String userEmail;

    private String feature;          // "executive", "branches", "chat", …

    private int estimatedInputTokens;
    private int estimatedOutputTokens;
    private double costUsd;          // calculated from token estimates

    private long latencyMs;          // 0 for cache hits
    private boolean cached;          // true = served from in-memory cache
    private boolean success;         // false if Gemini returned an error

    @Indexed private LocalDate usageDate; // UTC date — used for daily aggregation

    private LocalDateTime createdAt = LocalDateTime.now();
}
