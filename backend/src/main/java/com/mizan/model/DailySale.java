package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("daily_sales")
public class DailySale {
    @Id private String id;
    private String tenantId;
    private int branchId;
    private String branchCode;
    private String branchName;
    private LocalDate saleDate;
    private double netSales;
    private double grossSales;
    private double dailyTarget;
    private double purchases;
    private double cash;
    private double bank;
    private double achievementPct;  // computed: (netSales/dailyTarget)*100
    private LocalDateTime createdAt = LocalDateTime.now();
}
