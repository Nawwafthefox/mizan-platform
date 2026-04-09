package com.mizan.repository;

import com.mizan.model.V3StagedRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface V3StagedRecordRepository extends MongoRepository<V3StagedRecord, String> {

    List<V3StagedRecord> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    List<V3StagedRecord> findByTenantIdAndStatus(String tenantId, String status);

    List<V3StagedRecord> findByTenantIdAndFileTypeAndStatus(String tenantId, String fileType, String status);

    List<V3StagedRecord> findByTenantIdAndImportId(String tenantId, String importId);

    long countByTenantIdAndStatus(String tenantId, String status);

    long countByTenantIdAndFileTypeAndStatus(String tenantId, String fileType, String status);

    void deleteByTenantId(String tenantId);

    void deleteByTenantIdAndFileTypeAndStatus(String tenantId, String fileType, String status);
}
