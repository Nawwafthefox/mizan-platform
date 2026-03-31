package com.mizan.repository;
import com.mizan.model.EmployeeSale;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.time.LocalDate;
import java.util.List;

public interface EmployeeSaleRepository extends MongoRepository<EmployeeSale, String> {
    @Query("{'tenantId':?0,'saleDate':{$gte:?1,$lte:?2}}")
    List<EmployeeSale> findByTenantAndRange(String tenantId, LocalDate from, LocalDate to);
    @Query("{'tenantId':?0,'saleDate':{$gte:?1,$lte:?2},'branchCode':{$in:?3}}")
    List<EmployeeSale> findByTenantAndRangeAndBranches(String tenantId, LocalDate from, LocalDate to, List<String> codes);
    @Query("{'tenantId':?0,'saleDate':{$gte:?1,$lte:?2},'employeeId':?3}")
    List<EmployeeSale> findByTenantAndRangeAndEmployee(String tenantId, LocalDate from, LocalDate to, String empId);
    boolean existsByTenantIdAndSaleDateAndEmployeeIdAndSourceFileName(String t, LocalDate d, String e, String f);
    void deleteByTenantId(String tenantId);
}
