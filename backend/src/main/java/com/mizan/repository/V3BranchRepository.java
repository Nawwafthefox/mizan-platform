package com.mizan.repository;

import com.mizan.model.V3Branch;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface V3BranchRepository extends MongoRepository<V3Branch, String> {
    List<V3Branch> findByTenantId(String tenantId);
    List<V3Branch> findByTenantIdOrderByBranchCodeAsc(String tenantId);
    Optional<V3Branch> findByTenantIdAndBranchCode(String tenantId, String branchCode);
    List<V3Branch> findByTenantIdAndBranchCodeIn(String tenantId, Collection<String> branchCodes);
    List<V3Branch> findByTenantIdAndStatus(String tenantId, String status);
    long countByTenantIdAndStatus(String tenantId, String status);
    void deleteByTenantId(String tenantId);
}
