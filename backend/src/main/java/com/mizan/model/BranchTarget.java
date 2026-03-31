package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("branch_targets")
public class BranchTarget {
    @Id private String id;
    private String tenantId;
    private String branchCode;
    private String branchName;
    private LocalDate targetDate;
    private double targetNetWeightDaily;
    private double targetRateDifference;
    private LocalDateTime updatedAt = LocalDateTime.now();
    private String updatedBy;
}
