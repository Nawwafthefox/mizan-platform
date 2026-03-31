package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("mothan_transactions")
@CompoundIndexes({
    @CompoundIndex(def = "{'tenantId':1,'transactionDate':1,'branchCode':1}"),
    @CompoundIndex(def = "{'tenantId':1,'transactionDate':1,'branchCode':1,'docReference':1}", unique = true)
})
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
    private double goldWeightGrams;
    private String sourceFileName;
    private String uploadBatch;
    private String uploadedBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
