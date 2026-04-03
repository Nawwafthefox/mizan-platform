package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;

@Data @Document("announcements")
public class Announcement {
    @Id private String id;
    private String title;
    private String message;
    private String type = "INFO"; // INFO, WARNING, MAINTENANCE, CRITICAL
    private String targetTenantId;  // null = all tenants
    private boolean active = true;
    private LocalDateTime expiresAt;
    private String createdBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
