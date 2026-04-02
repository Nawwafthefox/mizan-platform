package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;

@Data @Document("v3_purchase_transactions")
public class V3PurchaseTransaction {
    @Id private String id;
    private LocalDate purchaseDate;
    private String branchCode;
    private double sarAmount;
    private double pureWeightG;
    private double grossWeightG;
    private int pieces;
    private double purity;
    private String karat;
    private String tenantId;
    private String sourceFile;
}
