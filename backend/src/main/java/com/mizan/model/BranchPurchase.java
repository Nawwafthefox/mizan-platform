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
    // Flat karat fields (mirror PG branch_purchases columns)
    private double k18Sar;
    private double k18WeightG;
    private double k18WtPure;
    private double k18WtSafe;
    private double k18Rate;
    private double k21Sar;
    private double k21WeightG;
    private double k21WtPure;
    private double k21WtSafe;
    private double k21Rate;
    private double k24Sar;
    private double k24WeightG;
    private double k24WtPure;
    private double k24WtSafe;
    private double k24Rate;
    private double wtPureG;          // wt_pure_g
    private double wtSafeG;          // wt_safe_g
    private double purchaseAvgMkg;   // purchase_avg_mkg
    private String sourceFileName;
    private String uploadBatch;
    private String uploadedBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
