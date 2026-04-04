package com.mizan.repository;

import com.mizan.model.AiUsageLog;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.LocalDate;
import java.util.List;

public interface AiUsageLogRepository extends MongoRepository<AiUsageLog, String> {

    List<AiUsageLog> findByTenantIdAndUsageDateOrderByCreatedAtDesc(String tenantId, LocalDate date);

    List<AiUsageLog> findByTenantIdAndUsageDateBetweenOrderByCreatedAtDesc(
        String tenantId, LocalDate from, LocalDate to);

    List<AiUsageLog> findByUsageDateOrderByTenantIdAscCreatedAtDesc(LocalDate date);

    List<AiUsageLog> findByUsageDateBetweenOrderByCreatedAtDesc(LocalDate from, LocalDate to);
}
