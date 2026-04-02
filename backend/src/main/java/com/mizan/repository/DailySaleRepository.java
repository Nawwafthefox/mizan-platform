package com.mizan.repository;
import com.mizan.model.DailySale;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.time.LocalDate;
import java.util.List;

public interface DailySaleRepository extends MongoRepository<DailySale, String> {
    @Query("{'tenantId':?0,'saleDate':{$gte:?1,$lte:?2}}")
    List<DailySale> findByTenantAndRange(String tenantId, LocalDate from, LocalDate to);
    List<DailySale> findByTenantIdAndBranchCodeOrderBySaleDateDesc(String tenantId, String branchCode);
    void deleteByTenantId(String tenantId);
}
