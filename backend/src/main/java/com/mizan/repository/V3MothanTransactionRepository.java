package com.mizan.repository;
import com.mizan.model.V3MothanTransaction;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.time.LocalDate;
import java.util.List;

public interface V3MothanTransactionRepository extends MongoRepository<V3MothanTransaction, String> {
    List<V3MothanTransaction> findByTenantIdAndTransactionDateBetween(String tenantId, LocalDate from, LocalDate to);
    List<V3MothanTransaction> findByTenantId(String tenantId);
    long countByTenantId(String tenantId);
    void deleteByTenantIdAndTransactionDateBetween(String tenantId, LocalDate from, LocalDate to);
    void deleteByTenantId(String tenantId);
}
