package com.mizan.repository;
import com.mizan.model.BranchPurchase;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.time.LocalDate;
import java.util.List;

public interface BranchPurchaseRepository extends MongoRepository<BranchPurchase, String> {
    @Query("{'tenantId':?0,'purchaseDate':{$gte:?1,$lte:?2}}")
    List<BranchPurchase> findByTenantAndRange(String tenantId, LocalDate from, LocalDate to);
    @Query("{'tenantId':?0,'purchaseDate':{$gte:?1,$lte:?2},'branchCode':{$in:?3}}")
    List<BranchPurchase> findByTenantAndRangeAndBranches(String tenantId, LocalDate from, LocalDate to, List<String> codes);
    boolean existsByTenantIdAndPurchaseDateAndBranchCodeAndSourceFileName(String t, LocalDate d, String b, String f);
    void deleteByTenantId(String tenantId);
}
