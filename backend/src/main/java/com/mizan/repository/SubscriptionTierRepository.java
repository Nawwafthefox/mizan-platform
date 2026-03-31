package com.mizan.repository;
import com.mizan.model.SubscriptionTier;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface SubscriptionTierRepository extends MongoRepository<SubscriptionTier, String> {
    List<SubscriptionTier> findByActiveTrueOrderByDisplayOrderAsc();
}
