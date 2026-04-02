package com.mizan.repository;
import com.mizan.model.AdminNote;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.time.LocalDate;
import java.util.List;

public interface AdminNoteRepository extends MongoRepository<AdminNote, String> {
    List<AdminNote> findByTenantIdOrderByNoteDateDesc(String tenantId);
    List<AdminNote> findByTenantIdAndBranchCodeOrderByNoteDateDesc(String tenantId, String branchCode);
    List<AdminNote> findByTenantIdAndNoteDateBetweenOrderByNoteDateDesc(String tenantId, LocalDate from, LocalDate to);
    void deleteByTenantId(String tenantId);
}
