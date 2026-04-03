package com.mizan.repository;
import com.mizan.model.User;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByEmailIgnoreCase(String email);
    List<User> findAllByEmailIgnoreCase(String email);
    boolean existsByEmail(String email);
    List<User> findByTenantId(String tenantId);
    long countByTenantId(String tenantId);
}
