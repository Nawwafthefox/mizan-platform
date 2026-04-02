package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;

@Data @Document("v3_mothan_transactions")
public class V3MothanTransaction {
    @Id private String id;
    private LocalDate transactionDate;
    private String branchCode;
    private String docReference;
    private String description;
    private double amountSar;
    private double weightDebitG;
    private double weightCreditG;
    private double balanceGoldG;
    private double balanceSar;
    private String tenantId;
    private String sourceFile;
}
