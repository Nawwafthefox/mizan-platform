package com.mizan.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Document("v3_staged_records")
public class V3StagedRecord {

    @Id
    private String id;

    private String tenantId;
    private String importId;

    /** "branch-sales" | "employee-sales" | "purchases" | "mothan" */
    private String fileType;

    private int sourceRow;
    private String branchCode;

    /** "pending" | "saved" | "saved_with_suggestion" | "omitted" */
    private String status;

    /** The parsed field values as they would be stored (sign-applied) */
    private Map<String, Object> parsedRecord;

    /** One entry per field that triggered a dirty classification */
    private List<FieldIssue> issues;

    /** System's best guess fixes per bad field */
    private Map<String, Object> suggestedFixes;

    /** Context for the review UI: branch stats, employee list, etc. */
    private Map<String, Object> context;

    private LocalDateTime createdAt;
    private String reviewedBy;
    private LocalDateTime reviewedAt;

    @Data
    public static class FieldIssue {
        private String field;
        private String issueType;
        private String originalValue;
        private String suggestedValue;
        private double confidence;
        private String method;
    }
}
