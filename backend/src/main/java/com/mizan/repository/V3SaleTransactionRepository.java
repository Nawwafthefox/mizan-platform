package com.mizan.repository;
import com.mizan.model.V3SaleTransaction;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.time.LocalDate;
import java.util.List;

public interface V3SaleTransactionRepository extends MongoRepository<V3SaleTransaction, String> {
    List<V3SaleTransaction> findByTenantIdAndSaleDateBetween(String tenantId, LocalDate from, LocalDate to);
    List<V3SaleTransaction> findByTenantId(String tenantId);
    long countByTenantId(String tenantId);
    void deleteByTenantIdAndSaleDateBetween(String tenantId, LocalDate from, LocalDate to);
    void deleteByTenantId(String tenantId);
}
