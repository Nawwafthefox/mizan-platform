package com.mizan.repository;
import com.mizan.model.BranchSale;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.time.LocalDate;
import java.util.List;

public interface BranchSaleRepository extends MongoRepository<BranchSale, String> {
    @Query("{'tenantId':?0,'saleDate':{$gte:?1,$lte:?2}}")
    List<BranchSale> findByTenantAndRange(String tenantId, LocalDate from, LocalDate to);
    @Query("{'tenantId':?0,'saleDate':{$gte:?1,$lte:?2},'branchCode':{$in:?3}}")
    List<BranchSale> findByTenantAndRangeAndBranches(String tenantId, LocalDate from, LocalDate to, List<String> codes);
    boolean existsByTenantIdAndSaleDateAndBranchCodeAndSourceFileName(String t, LocalDate d, String b, String f);
    void deleteByTenantId(String tenantId);
    long countByTenantId(String tenantId);
}
