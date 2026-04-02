package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("mothan_transactions")
public class MothanTransaction {
    @Id private String id;
    private String tenantId;
    private LocalDate transactionDate;
    private String branchCode;
    private String branchName;
    private String docReference;
    private String description;
    private double debitSar;
    private double creditSar;
    private double runningBalance;
    private double rateSarPerGram;
    private double goldWeightGrams;
    private LocalDate reportDate;       // report_date (different from transactionDate)
    private double amountSar;           // amount_sar (unified, mirrors PG)
    private double weightCreditG;       // weight_credit_g
    private double weightDebitG;        // weight_debit_g
    private double balanceGoldG;        // balance_gold_g
    private double balanceSar;          // balance_sar
    private String sourceFileName;
    private String uploadBatch;
    private String uploadedBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
