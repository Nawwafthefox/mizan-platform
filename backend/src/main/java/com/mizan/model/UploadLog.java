package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;

@Data @Document("upload_logs")
public class UploadLog {
    @Id private String id;
    private String tenantId;
    private String uploadBatch;
    private String fileName;
    private String fileType;
    private int recordsSaved;
    private int recordsSkipped;
    private String status;
    private String errorMessage;
    private String uploadedBy;
    private LocalDateTime uploadedAt = LocalDateTime.now();
}
