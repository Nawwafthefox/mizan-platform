package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;

@Data @Document("v3_branch_purchase_rates")
public class V3BranchPurchaseRate {
    @Id private String id;
    private String branchCode;
    private double totalPurchSar;
    private double totalPurchWeightG;
    private double totalMothanSar;
    private double totalMothanWeightG;
    private double combinedSar;
    private double combinedWeightG;
    private double purchaseRate;
    private LocalDateTime computedAt;
    private String tenantId;
}
