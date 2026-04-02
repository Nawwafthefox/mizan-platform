package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;

@Data @Document("v3_sale_transactions")
public class V3SaleTransaction {
    @Id private String id;
    private LocalDate saleDate;
    private String branchCode;
    private double sarAmount;
    private double pureWeightG;
    private double grossWeightG;
    private int pieces;
    private double purity;
    private String karat;
    private double makingCharge;
    private double metalValue;
    private boolean isReturn;
    private String tenantId;
    private String sourceFile;
}
