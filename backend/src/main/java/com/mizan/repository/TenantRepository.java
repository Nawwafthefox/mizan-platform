package com.mizan.repository;
import com.mizan.model.Tenant;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.Optional;

public interface TenantRepository extends MongoRepository<Tenant, String> {
    Optional<Tenant> findByWhiteLabelConfigSubdomain(String subdomain);
}
