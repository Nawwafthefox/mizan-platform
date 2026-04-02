package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data @Document("admin_notes")
public class AdminNote {
    @Id private String id;
    private String tenantId;
    private String branchCode;
    private LocalDate noteDate;
    private String noteText;
    private String createdBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
