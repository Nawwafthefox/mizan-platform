package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("branch_purchase_rates")
public class BranchPurchaseRate {
    @Id private String id;
    private String tenantId;
    private String branchCode;
    private String branchName;
    private double purchaseRate;
    private double totalSar;
    private double totalWeight;
    private LocalDate sourceDate;
    private LocalDateTime updatedAt = LocalDateTime.now();
    private String updatedBy;
}
