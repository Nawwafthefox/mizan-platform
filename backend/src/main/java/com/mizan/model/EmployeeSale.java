package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("employee_sales")
@CompoundIndexes({
    @CompoundIndex(def = "{'tenantId':1,'saleDate':1,'employeeId':1}"),
    @CompoundIndex(def = "{'tenantId':1,'saleDate':1,'employeeId':1,'sourceFileName':1}", unique = true)
})
public class EmployeeSale {
    @Id private String id;
    private String tenantId;
    private LocalDate saleDate;
    private String branchCode;
    private String branchName;
    private String region;
    private String employeeId;
    private String employeeName;
    private double avgMakingCharge;
    private double totalSarAmount;
    private double netWeight;
    private double grossWeight;
    private int invoiceCount;
    private double saleRate;
    private boolean isReturn = false;
    private String sourceFileName;
    private String uploadBatch;
    private String uploadedBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
