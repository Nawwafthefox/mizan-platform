package com.mizan.repository;
import com.mizan.model.MothanTransaction;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.time.LocalDate;
import java.util.List;

public interface MothanTransactionRepository extends MongoRepository<MothanTransaction, String> {
    @Query("{'tenantId':?0,'transactionDate':{$gte:?1,$lte:?2}}")
    List<MothanTransaction> findByTenantAndRange(String tenantId, LocalDate from, LocalDate to);
    @Query(value = "{'tenantId':?0,'transactionDate':{$gte:?1,$lte:?2}}", count = true)
    long countByTenantAndRange(String tenantId, LocalDate from, LocalDate to);
    boolean existsByTenantIdAndTransactionDateAndBranchCodeAndDocReference(String t, LocalDate d, String b, String r);
    List<SourceFileProjection> findByTenantId(String tenantId);
    void deleteByTenantId(String tenantId);
    @Query(value = "{'tenantId':?0,'transactionDate':{$gte:?1,$lte:?2}}", delete = true)
    void deleteByTenantIdAndTransactionDateBetween(String tenantId, LocalDate from, LocalDate to);
}
