package com.mizan.repository;
import com.mizan.model.EmployeeTransfer;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.time.LocalDate;
import java.util.List;

public interface EmployeeTransferRepository extends MongoRepository<EmployeeTransfer, String> {
    List<EmployeeTransfer> findByTenantIdAndEmpId(String tenantId, int empId);
    List<EmployeeTransfer> findByTenantIdAndTransferDateBetween(String tenantId, LocalDate from, LocalDate to);
    List<EmployeeTransfer> findByTenantId(String tenantId);
    void deleteByTenantId(String tenantId);
}
