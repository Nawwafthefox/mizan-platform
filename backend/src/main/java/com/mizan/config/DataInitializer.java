package com.mizan.config;

import com.mizan.model.User;
import com.mizan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.regex.Pattern;

/**
 * DataInitializer — seeds / resets the 8 fixed demo users on every startup.
 *
 * Uses MongoTemplate.updateFirst() keyed on email (case-insensitive regex)
 * so the same document that AuthController's findByEmailIgnoreCase reads is
 * always the one whose passwordHash we write. No _id mapping involved.
 *
 * If no document exists for an email, a fresh User is inserted via the repo.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer {

    private final UserRepository  userRepo;
    private final MongoTemplate   mongo;

    @Value("${mizan.demo.tenant-id:demo-goldco}")
    private String demoTenantId;

    private static final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        log.info("DataInitializer: seeding demo users (tenantId={}) …", demoTenantId);

        List<DemoUser> users = List.of(
            new DemoUser("admin@goldco.com",     "Mizan@2024",      "COMPANY_ADMIN",   "مدير الشركة",       demoTenantId),
            new DemoUser("ceo@goldco.com",        "Mizan@2024",      "CEO",             "الرئيس التنفيذي",   demoTenantId),
            new DemoUser("headsales@goldco.com",  "Mizan@2024",      "HEAD_OF_SALES",   "مدير المبيعات",     demoTenantId),
            new DemoUser("regionmgr@goldco.com",  "Mizan@2024",      "REGION_MANAGER",  "مدير المنطقة",      demoTenantId),
            new DemoUser("branchmgr@goldco.com",  "Mizan@2024",      "BRANCH_MANAGER",  "مدير الفرع",        demoTenantId),
            new DemoUser("employee@goldco.com",   "Mizan@2024",      "BRANCH_EMPLOYEE", "موظف المبيعات",     demoTenantId),
            new DemoUser("dataentry@goldco.com",  "Mizan@2024",      "DATA_ENTRY",      "مدخل البيانات",     demoTenantId),
            new DemoUser("superadmin@mizan.com",  "SuperAdmin@2024", "SUPER_ADMIN",     "مدير المنصة",       null)
        );

        int ok = 0;
        for (DemoUser spec : users) {
            for (int attempt = 1; attempt <= 3; attempt++) {
                try {
                    upsert(spec);
                    ok++;
                    break;
                } catch (Exception e) {
                    log.warn("DataInitializer: attempt {}/3 failed for {} — {}", attempt, spec.email(), e.getMessage());
                    if (attempt < 3) {
                        try { Thread.sleep(2000L * attempt); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                    } else {
                        log.error("DataInitializer: gave up on {}", spec.email());
                    }
                }
            }
        }

        log.info("DataInitializer: done — {}/{} users seeded.", ok, users.size());
    }

    private void upsert(DemoUser spec) {
        String hash  = encoder.encode(spec.password());
        // Case-insensitive regex anchored to full email — same as findByEmailIgnoreCase
        Query  query = Query.query(
            Criteria.where("email").regex("^" + Pattern.quote(spec.email()) + "$", "i")
        );
        long count = mongo.count(query, User.class);

        if (count == 0) {
            // No document exists — create a fresh one
            User u = new User();
            u.setEmail(spec.email());
            u.setPasswordHash(hash);
            u.setRole(spec.role());
            u.setFullNameAr(spec.nameAr());
            u.setTenantId(spec.tenantId());
            u.setActive(true);
            u.setMustChangePassword(false);
            u.setCreatedAt(LocalDateTime.now());
            u.setCreatedBy("system");
            userRepo.save(u);
            log.info("DataInitializer: created  {}", spec.email());
        } else {
            if (count > 1) {
                // Delete all but the first duplicate
                log.warn("DataInitializer: {} duplicates for {} — removing extras", count, spec.email());
                List<User> all = mongo.find(query, User.class);
                all.subList(1, all.size()).forEach(dup -> mongo.remove(dup));
            }
            // Update the remaining document in-place using the same query
            Update update = new Update()
                .set("passwordHash",       hash)
                .set("role",               spec.role())
                .set("fullNameAr",         spec.nameAr())
                .set("active",             true)
                .set("mustChangePassword", false);
            if (spec.tenantId() != null) update.set("tenantId", spec.tenantId());

            mongo.updateFirst(query, update, User.class);
            log.info("DataInitializer: updated  {}", spec.email());
        }
    }

    private record DemoUser(String email, String password, String role, String nameAr, String tenantId) {}
}
