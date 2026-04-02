package com.mizan.repository;
import com.mizan.model.V3PurchaseTransaction;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.time.LocalDate;
import java.util.List;

public interface V3PurchaseTransactionRepository extends MongoRepository<V3PurchaseTransaction, String> {
    List<V3PurchaseTransaction> findByTenantIdAndPurchaseDateBetween(String tenantId, LocalDate from, LocalDate to);
    long countByTenantId(String tenantId);
    void deleteByTenantIdAndPurchaseDateBetween(String tenantId, LocalDate from, LocalDate to);
    void deleteByTenantId(String tenantId);
}
