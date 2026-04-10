package com.mizan.repository;
import com.mizan.model.V3Employee;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface V3EmployeeRepository extends MongoRepository<V3Employee, String> {
    List<V3Employee> findByTenantId(String tenantId);
    Optional<V3Employee> findByTenantIdAndEmpId(String tenantId, String empId);
    List<V3Employee> findByTenantIdAndEmpIdIn(String tenantId, Collection<String> empIds);
    List<V3Employee> findByTenantIdAndCurrentBranchCode(String tenantId, String branchCode);
    void deleteByTenantId(String tenantId);
}
