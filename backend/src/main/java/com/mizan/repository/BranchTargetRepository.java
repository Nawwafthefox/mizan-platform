package com.mizan.repository;
import com.mizan.model.BranchTarget;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface BranchTargetRepository extends MongoRepository<BranchTarget, String> {
    List<BranchTarget> findByTenantId(String tenantId);
    Optional<BranchTarget> findByTenantIdAndBranchCode(String tenantId, String branchCode);
}
