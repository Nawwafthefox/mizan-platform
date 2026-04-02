package com.mizan.repository;
import com.mizan.model.Region;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface RegionRepository extends MongoRepository<Region, String> {
    List<Region> findByTenantIdOrderByPgId(String tenantId);
    void deleteByTenantId(String tenantId);
}
