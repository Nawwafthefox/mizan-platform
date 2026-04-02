package com.mizan.repository;
import com.mizan.model.V3BranchPurchaseRate;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface V3BranchPurchaseRateRepository extends MongoRepository<V3BranchPurchaseRate, String> {
    List<V3BranchPurchaseRate> findByTenantId(String tenantId);
    Optional<V3BranchPurchaseRate> findByTenantIdAndBranchCode(String tenantId, String branchCode);
    void deleteByTenantId(String tenantId);
}
