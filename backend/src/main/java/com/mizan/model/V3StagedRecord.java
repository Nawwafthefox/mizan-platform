package com.mizan.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * A row from an Excel import that failed one or more validation checks.
 * Held in staging for human review before being promoted to the live collection.
 */
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

    /** "pending" | "approved" | "rejected" */
    private String status;

    /** The parsed field values as they would be stored (sign-applied) */
    private Map<String, Object> parsedRecord;

    /** One entry per field that triggered a dirty classification */
    private List<FieldIssue> issues;

    /** Branch-level statistics used to compute suggestions */
    private Map<String, Object> branchStats;

    /** Employees available for manual assignment (employee-sales only) */
    private List<Map<String, Object>> availableEmployees;

    private LocalDateTime createdAt;
    private String reviewedBy;
    private LocalDateTime reviewedAt;

    @Data
    public static class FieldIssue {
        /** The document field name the issue relates to */
        private String field;

        /**
         * Issue type:
         * "invalid" | "missing" | "zero_value" | "corrupt_value" | "multiline"
         */
        private String type;

        /** Machine-suggested corrected value (may be null) */
        private String suggestedValue;

        /** 0.0 – 1.0 confidence in the suggestion */
        private double confidence;

        /** How the suggestion was derived, e.g. "branch_median_sar_per_piece" */
        private String method;
    }
}
