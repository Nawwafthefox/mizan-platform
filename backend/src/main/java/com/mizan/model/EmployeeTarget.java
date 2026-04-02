package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("employee_targets")
public class EmployeeTarget {
    @Id private String id;
    private String tenantId;
    private int empId;
    private String empName;
    private String branchCode;
    private LocalDate targetMonth;
    private double targetWeightG;
    private double targetDiffAvg;
    private int targetPieces;
    private double targetSalesSar;
    private String createdBy;
    private LocalDateTime updatedAt = LocalDateTime.now();
}
