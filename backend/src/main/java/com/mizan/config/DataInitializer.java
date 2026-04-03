package com.mizan.config;

import com.mizan.model.User;
import com.mizan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * DataInitializer — seeds the 8 fixed demo users on every startup.
 *
 * Strategy: upsert by email (update if exists, create if missing).
 * Never deletes users not in this list; never creates duplicates.
 *
 * Env var DEMO_TENANT_ID must be set in Render (or defaults to "demo-goldco").
 * superadmin@mizan.com is platform-level — tenantId set to null.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepo;

    @Value("${mizan.demo.tenant-id:demo-goldco}")
    private String demoTenantId;

    private static final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @Override
    public void run(String... args) {
        log.info("DataInitializer: seeding demo users (tenantId={}) …", demoTenantId);

        List<DemoUser> users = List.of(
            new DemoUser("admin@goldco.com",      "Mizan@2024",      "COMPANY_ADMIN",   "مدير الشركة",       demoTenantId),
            new DemoUser("ceo@goldco.com",         "Mizan@2024",      "CEO",             "الرئيس التنفيذي",   demoTenantId),
            new DemoUser("headsales@goldco.com",   "Mizan@2024",      "HEAD_OF_SALES",   "مدير المبيعات",     demoTenantId),
            new DemoUser("regionmgr@goldco.com",   "Mizan@2024",      "REGION_MANAGER",  "مدير المنطقة",      demoTenantId),
            new DemoUser("branchmgr@goldco.com",   "Mizan@2024",      "BRANCH_MANAGER",  "مدير الفرع",        demoTenantId),
            new DemoUser("employee@goldco.com",    "Mizan@2024",      "BRANCH_EMPLOYEE", "موظف المبيعات",     demoTenantId),
            new DemoUser("dataentry@goldco.com",   "Mizan@2024",      "DATA_ENTRY",      "مدخل البيانات",     demoTenantId),
            new DemoUser("superadmin@mizan.com",   "SuperAdmin@2024", "SUPER_ADMIN",     "مدير المنصة",       null)
        );

        for (DemoUser spec : users) {
            try {
                upsert(spec);
            } catch (Exception e) {
                log.error("DataInitializer: failed to upsert {} — {}", spec.email, e.getMessage());
            }
        }

        log.info("DataInitializer: done.");
    }

    private void upsert(DemoUser spec) {
        String hash = encoder.encode(spec.password);

        userRepo.findByEmailIgnoreCase(spec.email).ifPresentOrElse(
            existing -> {
                existing.setPasswordHash(hash);
                existing.setRole(spec.role);
                existing.setFullNameAr(spec.nameAr);
                existing.setActive(true);
                if (spec.tenantId != null) existing.setTenantId(spec.tenantId);
                userRepo.save(existing);
                log.info("DataInitializer: updated  {}", spec.email);
            },
            () -> {
                User u = new User();
                u.setEmail(spec.email);
                u.setPasswordHash(hash);
                u.setRole(spec.role);
                u.setFullNameAr(spec.nameAr);
                u.setTenantId(spec.tenantId);
                u.setActive(true);
                u.setMustChangePassword(false);
                u.setCreatedAt(LocalDateTime.now());
                u.setCreatedBy("system");
                userRepo.save(u);
                log.info("DataInitializer: created  {}", spec.email);
            }
        );
    }

    private record DemoUser(String email, String password, String role, String nameAr, String tenantId) {}
}
