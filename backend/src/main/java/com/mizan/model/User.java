package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;
import java.util.List;

@Data @Document("users")
public class User {
    @Id private String userId;
    private String tenantId;
    @Indexed(unique = true) private String email;
    private String passwordHash;
    private String fullNameAr;
    private String fullNameEn;
    private String phone;
    private String role;
    private List<String> allowedBranches;
    private List<String> allowedRegions;
    private String linkedEmployeeId;
    private String linkedBranchCode;
    private String preferredLanguage = "AR";
    private boolean active = true;
    private boolean mustChangePassword = true;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt = LocalDateTime.now();
    private String createdBy;
}
