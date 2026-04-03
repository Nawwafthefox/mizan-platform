package com.mizan.config;

import com.mizan.model.User;
import com.mizan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * DataInitializer — seeds / updates the 8 fixed demo users.
 *
 * Fires on ApplicationReadyEvent (after Atlas TLS handshake completes),
 * not CommandLineRunner (which fires too early on Render and causes
 * MongoTimeoutException before the connection pool is established).
 *
 * Strategy: upsert by email — update if exists, create if missing.
 * Never deletes other users; never creates duplicates.
 *
 * Env var DEMO_TENANT_ID must be set in Render dashboard.
 * superadmin@mizan.com is platform-level (tenantId = null).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer {

    private final UserRepository userRepo;

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
        String hash = encoder.encode(spec.password());

        List<User> all = userRepo.findAllByEmailIgnoreCase(spec.email());

        if (all.size() > 1) {
            // Delete all duplicates, keep only the first
            log.warn("DataInitializer: found {} duplicates for {} — deleting extras", all.size(), spec.email());
            all.subList(1, all.size()).forEach(userRepo::delete);
        }

        if (all.isEmpty()) {
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
            User existing = all.get(0);
            existing.setPasswordHash(hash);
            existing.setRole(spec.role());
            existing.setFullNameAr(spec.nameAr());
            existing.setActive(true);
            existing.setMustChangePassword(false);
            if (spec.tenantId() != null) existing.setTenantId(spec.tenantId());
            userRepo.save(existing);
            // Read back to confirm the write actually persisted
            userRepo.findById(existing.getUserId()).ifPresent(reloaded -> {
                boolean ok = encoder.matches(spec.password(), reloaded.getPasswordHash());
                log.info("DataInitializer: updated {} — verify={}", spec.email(), ok ? "OK" : "FAIL");
            });
        }
    }

    private record DemoUser(String email, String password, String role, String nameAr, String tenantId) {}
}
