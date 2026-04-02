package com.mizan.repository;
import com.mizan.model.V3EmployeeSaleTransaction;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.time.LocalDate;
import java.util.List;

public interface V3EmployeeSaleTransactionRepository extends MongoRepository<V3EmployeeSaleTransaction, String> {
    List<V3EmployeeSaleTransaction> findByTenantIdAndSaleDateBetween(String tenantId, LocalDate from, LocalDate to);
    long countByTenantId(String tenantId);
    void deleteByTenantIdAndSaleDateBetween(String tenantId, LocalDate from, LocalDate to);
    void deleteByTenantId(String tenantId);
}
