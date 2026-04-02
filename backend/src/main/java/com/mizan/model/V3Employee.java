package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data @Document("v3_employees")
public class V3Employee {
    @Id private String id;
    private String empId;
    private String empName;
    private String currentBranchCode;
    private String tenantId;
}
