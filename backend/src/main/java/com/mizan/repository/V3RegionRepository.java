package com.mizan.repository;
import com.mizan.model.V3Region;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface V3RegionRepository extends MongoRepository<V3Region, String> {
    List<V3Region> findByTenantId(String tenantId);
    void deleteByTenantId(String tenantId);
}
