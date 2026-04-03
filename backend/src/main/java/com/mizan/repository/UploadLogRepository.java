package com.mizan.repository;
import com.mizan.model.UploadLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface UploadLogRepository extends MongoRepository<UploadLog, String> {
    List<UploadLog> findByTenantIdOrderByUploadedAtDesc(String tenantId);
    List<UploadLog> findAllByOrderByUploadedAtDesc();
}
