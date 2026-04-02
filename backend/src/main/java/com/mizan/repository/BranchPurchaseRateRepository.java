package com.mizan.repository;
import com.mizan.model.BranchPurchaseRate;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface BranchPurchaseRateRepository extends MongoRepository<BranchPurchaseRate, String> {
    List<BranchPurchaseRate> findByTenantId(String tenantId);
    Optional<BranchPurchaseRate> findByTenantIdAndBranchCode(String tenantId, String branchCode);
    void deleteByTenantId(String tenantId);
}
