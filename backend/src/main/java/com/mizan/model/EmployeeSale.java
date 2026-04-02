package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("employee_sales")
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
    private double avgInvoiceSar;
    private double totalSarAmount;
    private double netWeight;
    private double grossWeight;
    private long invoiceCount;
    private double saleRate;
    private boolean isReturn = false;
    private double branchPurchaseAvg;
    private double diffAvg;
    private double profitMargin;
    private boolean achievedTarget;
    private LocalDate dateFrom;  // date_from
    private LocalDate dateTo;    // date_to
    private String sourceFileName;
    private String uploadBatch;
    private String uploadedBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
