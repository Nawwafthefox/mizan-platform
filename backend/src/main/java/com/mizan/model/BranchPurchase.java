package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data @Document("branch_purchases")
public class BranchPurchase {
    @Id private String id;
    private String tenantId;
    private LocalDate purchaseDate;
    private String branchCode;
    private String branchName;
    private String region;
    private double totalSarAmount;
    private double netWeight;
    private double grossWeight;
    private int invoiceCount;
    private double purchaseRate;
    private List<KaratRow> karatRows;
    private String sourceFileName;
    private String uploadBatch;
    private String uploadedBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
