package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("employee_transfers")
public class EmployeeTransfer {
    @Id private String id;
    private String tenantId;
    private int empId;
    private String empName;
    private String fromBranchCode;
    private String fromBranchName;
    private String toBranchCode;
    private String toBranchName;
    private LocalDate transferDate;
    private String notes;
    private LocalDateTime createdAt = LocalDateTime.now();
}
