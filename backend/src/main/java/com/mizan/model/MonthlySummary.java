package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data @Document("monthly_summaries")
public class MonthlySummary {
    @Id private String id;
    private String tenantId;
    private int branchId;
    private String branchCode;
    private String branchName;
    private int year;
    private int month;
    private double totalSales;
    private double totalTarget;
    private double achievementPct;  // computed: (totalSales/totalTarget)*100
}
