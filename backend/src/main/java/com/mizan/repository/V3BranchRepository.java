package com.mizan.repository;
import com.mizan.model.V3Branch;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface V3BranchRepository extends MongoRepository<V3Branch, String> {
    List<V3Branch> findByTenantId(String tenantId);
    Optional<V3Branch> findByTenantIdAndBranchCode(String tenantId, String branchCode);
    void deleteByTenantId(String tenantId);
}
