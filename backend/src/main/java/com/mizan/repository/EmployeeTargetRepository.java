package com.mizan.repository;
import com.mizan.model.EmployeeTarget;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.time.LocalDate;
import java.util.List;

public interface EmployeeTargetRepository extends MongoRepository<EmployeeTarget, String> {
    List<EmployeeTarget> findByTenantIdAndBranchCode(String tenantId, String branchCode);
    List<EmployeeTarget> findByTenantIdAndTargetMonth(String tenantId, LocalDate targetMonth);
    List<EmployeeTarget> findByTenantIdAndEmpId(String tenantId, int empId);
    void deleteByTenantId(String tenantId);
}
