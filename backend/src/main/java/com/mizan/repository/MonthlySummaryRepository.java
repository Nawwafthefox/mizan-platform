package com.mizan.repository;
import com.mizan.model.MonthlySummary;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface MonthlySummaryRepository extends MongoRepository<MonthlySummary, String> {
    List<MonthlySummary> findByTenantIdAndYear(String tenantId, int year);
    List<MonthlySummary> findByTenantIdAndYearAndMonth(String tenantId, int year, int month);
    List<MonthlySummary> findByTenantIdOrderByYearDescMonthDesc(String tenantId);
    void deleteByTenantId(String tenantId);
}
