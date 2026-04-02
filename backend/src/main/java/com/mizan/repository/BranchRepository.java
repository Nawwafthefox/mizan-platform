package com.mizan.repository;
import com.mizan.model.Branch;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface BranchRepository extends MongoRepository<Branch, String> {
    List<Branch> findByTenantIdOrderByPgId(String tenantId);
    void deleteByTenantId(String tenantId);
}
