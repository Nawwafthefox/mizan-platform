package com.mizan.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document("v3_branches")
public class V3Branch {
    @Id
    private String id;
    private String tenantId;
    private String branchCode;
    private String branchName;
    private String branchNameEn;
    private int regionId;
    private String regionName;
    private String city;
    private String status;          // "active", "pending_name", "inactive"
    private boolean autoDiscovered;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String updatedBy;
}
