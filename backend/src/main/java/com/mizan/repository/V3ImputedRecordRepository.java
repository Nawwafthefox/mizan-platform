package com.mizan.repository;

import com.mizan.model.V3ImputedRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface V3ImputedRecordRepository extends MongoRepository<V3ImputedRecord, String> {
    List<V3ImputedRecord> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<V3ImputedRecord> findByTenantIdAndStatus(String tenantId, String status);
    long countByTenantIdAndStatus(String tenantId, String status);
    void deleteByTenantIdAndImportId(String tenantId, String importId);
}
