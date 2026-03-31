package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;

@Data @Document("audit_logs")
public class AuditLog {
    @Id private String id;
    private String actorUserId;
    private String actorEmail;
    private String tenantId;
    private String action;
    private String details;
    private String ipAddress;
    private LocalDateTime createdAt = LocalDateTime.now();
}
