package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data @Document("v3_branches")
public class V3Branch {
    @Id private String id;
    private String branchCode;
    private String branchName;
    private int regionId;
    private String tenantId;
}
