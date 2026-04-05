package com.mizan.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Document("v3_imputed_records")
public class V3ImputedRecord {
    @Id private String id;
    private String tenantId;
    private String importId;
    private String fileType;
    private int    sourceRow;
    private String branchCode;
    private String branchName;
    private LocalDate recordDate;

    // What was wrong
    private String anomalyType;        // "corrupt_pieces" | "missing_employee" | "multiline_date"
    private String fieldName;
    private String originalValue;
    private String imputedValue;
    private String imputationMethod;
    private double confidence;

    // Context for the review UI
    private Map<String, Object> recordSnapshot;
    private Map<String, Object> branchStats;
    private List<String>        availableOptions;

    // Review status
    private String        status;          // "pending_review" | "approved" | "modified" | "rejected"
    private String        reviewedBy;
    private LocalDateTime reviewedAt;
    private String        modifiedValue;

    private LocalDateTime createdAt;
}
