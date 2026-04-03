package com.mizan.repository;
import com.mizan.model.Announcement;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface AnnouncementRepository extends MongoRepository<Announcement, String> {
    List<Announcement> findAllByOrderByCreatedAtDesc();
    List<Announcement> findByActiveTrueOrderByCreatedAtDesc();
}
