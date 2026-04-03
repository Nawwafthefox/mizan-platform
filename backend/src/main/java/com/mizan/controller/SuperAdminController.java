package com.mizan.controller;
import com.mizan.model.*;
import com.mizan.repository.*;
import com.mizan.security.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/super-admin")
public class SuperAdminController {

    private final TenantRepository         tenantRepo;
    private final UserRepository           userRepo;
    private final SubscriptionTierRepository tierRepo;
    private final AuditLogRepository       auditRepo;
    private final UploadLogRepository      uploadLogRepo;
    private final AnnouncementRepository   announcementRepo;
    private final BranchSaleRepository     saleRepo;
    private final BranchPurchaseRepository purchRepo;
    private final EmployeeSaleRepository   empRepo;
    private final MothanTransactionRepository mothanRepo;
    private final PasswordEncoder encoder;
    private final JwtTokenProvider jwt;

    public SuperAdminController(TenantRepository tenantRepo, UserRepository userRepo,
            SubscriptionTierRepository tierRepo, AuditLogRepository auditRepo,
            UploadLogRepository uploadLogRepo, AnnouncementRepository announcementRepo,
            BranchSaleRepository saleRepo, BranchPurchaseRepository purchRepo,
            EmployeeSaleRepository empRepo, MothanTransactionRepository mothanRepo,
            PasswordEncoder encoder, JwtTokenProvider jwt) {
        this.tenantRepo = tenantRepo; this.userRepo = userRepo;
        this.tierRepo = tierRepo; this.auditRepo = auditRepo;
        this.uploadLogRepo = uploadLogRepo; this.announcementRepo = announcementRepo;
        this.saleRepo = saleRepo; this.purchRepo = purchRepo;
        this.empRepo = empRepo; this.mothanRepo = mothanRepo;
        this.encoder = encoder; this.jwt = jwt;
    }

    private void requireSuperAdmin(MizanUserDetails p) {
        if (!"SUPER_ADMIN".equals(p.getRole())) throw new SecurityException("Access denied");
    }

    private void logAudit(MizanUserDetails actor, String action, String details, String tenantId) {
        AuditLog log = new AuditLog();
        log.setActorUserId(actor.getUserId());
        log.setActorEmail(actor.getUsername());
        log.setTenantId(tenantId);
        log.setAction(action);
        log.setDetails(details);
        log.setCreatedAt(LocalDateTime.now());
        auditRepo.save(log);
    }

    // ─────────────────────────────────────────────
    // STATS
    // ─────────────────────────────────────────────

    @GetMapping("/stats")
    public ResponseEntity<?> stats(@AuthenticationPrincipal MizanUserDetails p) {
        requireSuperAdmin(p);
        List<Tenant> all = tenantRepo.findAll();
        long active    = all.stream().filter(t -> "ACTIVE".equals(t.getSubscriptionStatus())).count();
        long trial     = all.stream().filter(t -> "TRIAL".equals(t.getSubscriptionStatus())).count();
        long suspended = all.stream().filter(t -> "SUSPENDED".equals(t.getSubscriptionStatus())).count();
        long totalUsers   = userRepo.count();
        long totalUploads = uploadLogRepo.count();
        long activeAnnouncements = announcementRepo.findByActiveTrueOrderByCreatedAtDesc().size();
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of(
            "totalTenants", all.size(),
            "activeTenants", active + trial,
            "trialTenants", trial,
            "suspendedTenants", suspended,
            "totalUsers", totalUsers,
            "totalUploads", totalUploads,
            "activeAnnouncements", activeAnnouncements
        )));
    }

    // ─────────────────────────────────────────────
    // TENANTS
    // ─────────────────────────────────────────────

    @GetMapping("/tenants")
    public ResponseEntity<?> listTenants(@AuthenticationPrincipal MizanUserDetails p) {
        requireSuperAdmin(p);
        return ResponseEntity.ok(Map.of("success", true, "data", tenantRepo.findAll()));
    }

    @PostMapping("/tenants")
    public ResponseEntity<?> createTenant(@AuthenticationPrincipal MizanUserDetails p,
            @RequestBody Map<String, Object> body) {
        requireSuperAdmin(p);
        String tenantId = UUID.randomUUID().toString();
        Tenant t = new Tenant();
        t.setTenantId(tenantId);
        t.setCompanyNameAr((String) body.get("companyNameAr"));
        t.setCompanyNameEn((String) body.getOrDefault("companyNameEn", ""));
        t.setContactEmail((String) body.get("contactEmail"));
        t.setContactPhone((String) body.getOrDefault("contactPhone", ""));
        t.setSubscriptionTierId((String) body.getOrDefault("subscriptionTierId", "starter"));
        t.setSubscriptionStatus("TRIAL");
        int trialDays = body.containsKey("trialDays") ? (int) body.get("trialDays") : 14;
        t.setTrialEndsAt(LocalDate.now().plusDays(trialDays));
        t.setActive(true);
        t.setCreatedAt(LocalDateTime.now());
        t.setCreatedBy(p.getUserId());
        tenantRepo.save(t);

        String adminEmail = (String) body.get("initialAdminEmail");
        String adminPw    = (String) body.get("initialAdminPassword");
        User admin = new User();
        admin.setUserId(UUID.randomUUID().toString());
        admin.setTenantId(tenantId);
        admin.setEmail(adminEmail);
        admin.setPasswordHash(encoder.encode(adminPw));
        admin.setFullNameAr((String) body.getOrDefault("initialAdminNameAr", "مدير الشركة"));
        admin.setFullNameEn((String) body.getOrDefault("initialAdminNameEn", "Company Admin"));
        admin.setRole("COMPANY_ADMIN");
        admin.setActive(true);
        admin.setMustChangePassword(false);
        admin.setCreatedBy(p.getUserId());
        userRepo.save(admin);

        logAudit(p, "CREATE_TENANT", "Created tenant: " + t.getCompanyNameAr(), tenantId);
        return ResponseEntity.ok(Map.of("success", true,
            "message", "Company created successfully",
            "data", Map.of("tenantId", tenantId, "adminEmail", adminEmail, "adminUserId", admin.getUserId())));
    }

    @GetMapping("/tenants/{tenantId}")
    public ResponseEntity<?> getTenant(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId) {
        requireSuperAdmin(p);
        return tenantRepo.findById(tenantId)
            .map(t -> ResponseEntity.ok(Map.of("success", true, "data", t)))
            .orElse(ResponseEntity.status(404).body(Map.of("success", false)));
    }

    @PutMapping("/tenants/{tenantId}")
    public ResponseEntity<?> updateTenant(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId, @RequestBody Map<String, Object> body) {
        requireSuperAdmin(p);
        return tenantRepo.findById(tenantId).map(t -> {
            if (body.containsKey("companyNameAr"))    t.setCompanyNameAr((String) body.get("companyNameAr"));
            if (body.containsKey("companyNameEn"))    t.setCompanyNameEn((String) body.get("companyNameEn"));
            if (body.containsKey("contactEmail"))     t.setContactEmail((String) body.get("contactEmail"));
            if (body.containsKey("contactPhone"))     t.setContactPhone((String) body.get("contactPhone"));
            if (body.containsKey("subscriptionTierId")) t.setSubscriptionTierId((String) body.get("subscriptionTierId"));
            t.setUpdatedAt(LocalDateTime.now());
            tenantRepo.save(t);
            logAudit(p, "UPDATE_TENANT", "Updated tenant: " + tenantId, tenantId);
            return ResponseEntity.ok(Map.of("success", true, "data", t));
        }).orElse(ResponseEntity.status(404).body(Map.of("success", false)));
    }

    @PostMapping("/tenants/{tenantId}/suspend")
    public ResponseEntity<?> suspend(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId, @RequestBody(required = false) Map<String, String> body) {
        requireSuperAdmin(p);
        tenantRepo.findById(tenantId).ifPresent(t -> {
            t.setSubscriptionStatus("SUSPENDED"); t.setActive(false);
            tenantRepo.save(t);
        });
        String reason = body != null ? body.getOrDefault("reason", "") : "";
        logAudit(p, "SUSPEND_TENANT", reason, tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/tenants/{tenantId}/activate")
    public ResponseEntity<?> activate(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId) {
        requireSuperAdmin(p);
        tenantRepo.findById(tenantId).ifPresent(t -> {
            t.setSubscriptionStatus("ACTIVE"); t.setActive(true);
            tenantRepo.save(t);
        });
        logAudit(p, "ACTIVATE_TENANT", "", tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/tenants/{tenantId}/add-admin")
    public ResponseEntity<?> addAdmin(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId, @RequestBody Map<String, String> body) {
        requireSuperAdmin(p);
        tenantRepo.findById(tenantId).orElseThrow(() -> new IllegalArgumentException("Tenant not found"));
        String email    = body.get("email");
        String password = body.get("password");
        if (email == null || password == null) throw new IllegalArgumentException("email and password required");
        User admin = new User();
        admin.setUserId(UUID.randomUUID().toString());
        admin.setTenantId(tenantId);
        admin.setEmail(email);
        admin.setPasswordHash(encoder.encode(password));
        admin.setFullNameAr(body.getOrDefault("fullNameAr", "مدير الشركة"));
        admin.setFullNameEn(body.getOrDefault("fullNameEn", "Company Admin"));
        admin.setRole("COMPANY_ADMIN");
        admin.setActive(true);
        admin.setMustChangePassword(false);
        admin.setCreatedBy(p.getUserId());
        userRepo.save(admin);
        logAudit(p, "ADD_ADMIN", "Added admin to tenant: " + tenantId, tenantId);
        return ResponseEntity.ok(Map.of("success", true, "message", "Admin created",
            "data", Map.of("email", email, "tenantId", tenantId)));
    }

    @PutMapping("/tenants/{tenantId}/features")
    public ResponseEntity<?> updateFeatures(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId, @RequestBody Map<String, Object> body) {
        requireSuperAdmin(p);
        return tenantRepo.findById(tenantId).map(t -> {
            Tenant.BillingConfig billing = t.getBilling() != null ? t.getBilling() : new Tenant.BillingConfig();
            Tenant.TenantLimits limits   = t.getLimits()  != null ? t.getLimits()  : new Tenant.TenantLimits();
            if (body.containsKey("enabledModules")) {
                @SuppressWarnings("unchecked")
                List<String> modules = (List<String>) body.get("enabledModules");
                billing.setEnabledModules(modules);
            }
            if (body.containsKey("billingNotes"))    billing.setBillingNotes((String) body.get("billingNotes"));
            if (body.containsKey("maxBranches"))     limits.setMaxBranches(((Number) body.get("maxBranches")).intValue());
            if (body.containsKey("maxEmployees"))    limits.setMaxEmployees(((Number) body.get("maxEmployees")).intValue());
            if (body.containsKey("maxAdminUsers"))   limits.setMaxAdminUsers(((Number) body.get("maxAdminUsers")).intValue());
            t.setBilling(billing); t.setLimits(limits);
            t.setUpdatedAt(LocalDateTime.now());
            tenantRepo.save(t);
            logAudit(p, "UPDATE_FEATURES", "Updated features/limits for tenant: " + tenantId, tenantId);
            return ResponseEntity.ok(Map.of("success", true, "data", t));
        }).orElse(ResponseEntity.status(404).body(Map.of("success", false)));
    }

    @PostMapping("/tenants/{tenantId}/wipe")
    public ResponseEntity<?> wipeTenantData(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId,
            @RequestBody(required = false) Map<String, String> body) {
        requireSuperAdmin(p);
        if (!tenantRepo.existsById(tenantId))
            return ResponseEntity.status(404).body(Map.of("success", false, "message", "Tenant not found"));
        long sales = saleRepo.countByTenantId(tenantId);
        saleRepo.deleteByTenantId(tenantId);
        purchRepo.deleteByTenantId(tenantId);
        empRepo.deleteByTenantId(tenantId);
        mothanRepo.deleteByTenantId(tenantId);
        String reason = body != null ? body.getOrDefault("reason", "") : "";
        logAudit(p, "WIPE_DATA", "Wiped all data for tenant: " + tenantId + (reason.isBlank() ? "" : " | " + reason), tenantId);
        return ResponseEntity.ok(Map.of("success", true, "deleted", sales));
    }

    // ─────────────────────────────────────────────
    // IMPERSONATION
    // ─────────────────────────────────────────────

    @PostMapping("/impersonate")
    public ResponseEntity<?> impersonate(@AuthenticationPrincipal MizanUserDetails p,
            @RequestBody Map<String, String> body) {
        requireSuperAdmin(p);
        String tenantId = body.get("tenantId");
        Tenant tenant = tenantRepo.findById(tenantId).orElseThrow();
        User admin = userRepo.findByTenantId(tenantId).stream()
            .filter(u -> "COMPANY_ADMIN".equals(u.getRole())).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("No admin found"));
        MizanUserDetails details = new MizanUserDetails(admin.getUserId(), admin.getTenantId(),
            admin.getEmail(), admin.getPasswordHash(), admin.getRole(),
            admin.getAllowedBranches(), admin.getAllowedRegions(), admin.getLinkedEmployeeId(), true);
        String token = jwt.generateToken(details, 30 * 60 * 1000L);
        logAudit(p, "IMPERSONATE", "Impersonating tenant: " + tenant.getCompanyNameAr(), tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of(
            "impersonationToken", token, "tenantName", tenant.getCompanyNameAr())));
    }

    // ─────────────────────────────────────────────
    // USERS (PLATFORM-WIDE)
    // ─────────────────────────────────────────────

    @GetMapping("/users")
    public ResponseEntity<?> listUsers(@AuthenticationPrincipal MizanUserDetails p,
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String role) {
        requireSuperAdmin(p);
        List<User> users = (tenantId != null && !tenantId.isBlank())
            ? userRepo.findByTenantId(tenantId)
            : userRepo.findAll();
        if (search != null && !search.isBlank()) {
            String s = search.toLowerCase();
            users = users.stream().filter(u ->
                (u.getEmail()       != null && u.getEmail().toLowerCase().contains(s)) ||
                (u.getFullNameAr()  != null && u.getFullNameAr().contains(s)) ||
                (u.getFullNameEn()  != null && u.getFullNameEn().toLowerCase().contains(s))
            ).collect(Collectors.toList());
        }
        if (role != null && !role.isBlank()) {
            users = users.stream().filter(u -> role.equals(u.getRole())).collect(Collectors.toList());
        }
        Map<String, String> tenantNames = tenantRepo.findAll().stream()
            .collect(Collectors.toMap(Tenant::getTenantId, t -> t.getCompanyNameAr() != null ? t.getCompanyNameAr() : t.getTenantId()));
        List<Map<String, Object>> result = users.stream().map(u -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId",      u.getUserId());
            m.put("email",       u.getEmail());
            m.put("fullNameAr",  u.getFullNameAr());
            m.put("fullNameEn",  u.getFullNameEn());
            m.put("role",        u.getRole());
            m.put("active",      u.isActive());
            m.put("tenantId",    u.getTenantId());
            m.put("tenantName",  tenantNames.getOrDefault(u.getTenantId(), u.getTenantId()));
            m.put("lastLoginAt", u.getLastLoginAt());
            m.put("createdAt",   u.getCreatedAt());
            m.put("mustChangePassword", u.isMustChangePassword());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @GetMapping("/tenants/{tenantId}/users")
    public ResponseEntity<?> getTenantUsers(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId) {
        requireSuperAdmin(p);
        List<User> users = userRepo.findByTenantId(tenantId);
        List<Map<String, Object>> result = users.stream().map(u -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId",    u.getUserId());
            m.put("email",     u.getEmail());
            m.put("fullNameAr", u.getFullNameAr());
            m.put("fullNameEn", u.getFullNameEn());
            m.put("role",      u.getRole());
            m.put("active",    u.isActive());
            m.put("lastLoginAt", u.getLastLoginAt());
            return m;
        }).toList();
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    @PostMapping("/users/{userId}/deactivate")
    public ResponseEntity<?> deactivateUser(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String userId) {
        requireSuperAdmin(p);
        return userRepo.findById(userId).map(u -> {
            u.setActive(false);
            userRepo.save(u);
            logAudit(p, "DEACTIVATE_USER", "Deactivated user: " + u.getEmail(), u.getTenantId());
            return ResponseEntity.ok(Map.of("success", true));
        }).orElse(ResponseEntity.status(404).body(Map.of("success", false)));
    }

    @PostMapping("/users/{userId}/activate")
    public ResponseEntity<?> activateUser(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String userId) {
        requireSuperAdmin(p);
        return userRepo.findById(userId).map(u -> {
            u.setActive(true);
            userRepo.save(u);
            logAudit(p, "ACTIVATE_USER", "Activated user: " + u.getEmail(), u.getTenantId());
            return ResponseEntity.ok(Map.of("success", true));
        }).orElse(ResponseEntity.status(404).body(Map.of("success", false)));
    }

    @PostMapping("/users/{userId}/reset-password")
    public ResponseEntity<?> resetPassword(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String userId, @RequestBody Map<String, String> body) {
        requireSuperAdmin(p);
        String newPassword = body.get("newPassword");
        if (newPassword == null || newPassword.length() < 6)
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "كلمة المرور يجب أن تكون 6 أحرف على الأقل"));
        return userRepo.findById(userId).map(u -> {
            u.setPasswordHash(encoder.encode(newPassword));
            u.setMustChangePassword(true);
            userRepo.save(u);
            logAudit(p, "RESET_PASSWORD", "Reset password for: " + u.getEmail(), u.getTenantId());
            return ResponseEntity.ok(Map.of("success", true));
        }).orElse(ResponseEntity.status(404).body(Map.of("success", false)));
    }

    // ─────────────────────────────────────────────
    // AUDIT LOGS
    // ─────────────────────────────────────────────

    @GetMapping("/audit")
    public ResponseEntity<?> auditLogs(@AuthenticationPrincipal MizanUserDetails p,
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false, defaultValue = "500") int limit) {
        requireSuperAdmin(p);
        List<AuditLog> logs = (tenantId != null && !tenantId.isBlank())
            ? auditRepo.findByTenantIdOrderByCreatedAtDesc(tenantId)
            : auditRepo.findAllByOrderByCreatedAtDesc();
        if (action != null && !action.isBlank()) {
            String a = action.toUpperCase();
            logs = logs.stream().filter(l -> a.equals(l.getAction())).collect(Collectors.toList());
        }
        if (logs.size() > limit) logs = logs.subList(0, limit);
        return ResponseEntity.ok(Map.of("success", true, "data", logs));
    }

    // ─────────────────────────────────────────────
    // UPLOAD LOGS
    // ─────────────────────────────────────────────

    @GetMapping("/upload-logs")
    public ResponseEntity<?> uploadLogs(@AuthenticationPrincipal MizanUserDetails p,
            @RequestParam(required = false) String tenantId) {
        requireSuperAdmin(p);
        List<UploadLog> logs = (tenantId != null && !tenantId.isBlank())
            ? uploadLogRepo.findByTenantIdOrderByUploadedAtDesc(tenantId)
            : uploadLogRepo.findAllByOrderByUploadedAtDesc();
        Map<String, String> tenantNames = tenantRepo.findAll().stream()
            .collect(Collectors.toMap(Tenant::getTenantId, t -> t.getCompanyNameAr() != null ? t.getCompanyNameAr() : t.getTenantId()));
        List<Map<String, Object>> result = logs.stream().map(l -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",             l.getId());
            m.put("tenantId",       l.getTenantId());
            m.put("tenantName",     tenantNames.getOrDefault(l.getTenantId(), l.getTenantId()));
            m.put("uploadBatch",    l.getUploadBatch());
            m.put("fileName",       l.getFileName());
            m.put("fileType",       l.getFileType());
            m.put("recordsSaved",   l.getRecordsSaved());
            m.put("recordsSkipped", l.getRecordsSkipped());
            m.put("status",         l.getStatus());
            m.put("errorMessage",   l.getErrorMessage());
            m.put("uploadedBy",     l.getUploadedBy());
            m.put("uploadedAt",     l.getUploadedAt());
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("success", true, "data", result));
    }

    // ─────────────────────────────────────────────
    // SUBSCRIPTION TIERS
    // ─────────────────────────────────────────────

    @GetMapping("/tiers")
    public ResponseEntity<?> listTiers(@AuthenticationPrincipal MizanUserDetails p) {
        requireSuperAdmin(p);
        return ResponseEntity.ok(Map.of("success", true, "data", tierRepo.findByActiveTrueOrderByDisplayOrderAsc()));
    }

    @PutMapping("/tiers/{tierId}")
    public ResponseEntity<?> updateTier(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tierId, @RequestBody SubscriptionTier body) {
        requireSuperAdmin(p);
        return tierRepo.findById(tierId).map(t -> {
            if (body.getPricing()  != null) t.setPricing(body.getPricing());
            if (body.getFeatures() != null) t.setFeatures(body.getFeatures());
            if (body.getTierNameAr() != null) t.setTierNameAr(body.getTierNameAr());
            if (body.getTierNameEn() != null) t.setTierNameEn(body.getTierNameEn());
            t.setUpdatedAt(LocalDateTime.now());
            tierRepo.save(t);
            logAudit(p, "UPDATE_TIER", "Updated tier: " + tierId, null);
            return ResponseEntity.ok(Map.of("success", true, "data", t));
        }).orElse(ResponseEntity.status(404).body(Map.of("success", false)));
    }

    // ─────────────────────────────────────────────
    // ANNOUNCEMENTS
    // ─────────────────────────────────────────────

    @GetMapping("/announcements")
    public ResponseEntity<?> listAnnouncements(@AuthenticationPrincipal MizanUserDetails p,
            @RequestParam(required = false, defaultValue = "false") boolean activeOnly) {
        requireSuperAdmin(p);
        List<Announcement> list = activeOnly
            ? announcementRepo.findByActiveTrueOrderByCreatedAtDesc()
            : announcementRepo.findAllByOrderByCreatedAtDesc();
        return ResponseEntity.ok(Map.of("success", true, "data", list));
    }

    @PostMapping("/announcements")
    public ResponseEntity<?> createAnnouncement(@AuthenticationPrincipal MizanUserDetails p,
            @RequestBody Announcement body) {
        requireSuperAdmin(p);
        body.setId(null);
        body.setCreatedBy(p.getUserId());
        body.setCreatedAt(LocalDateTime.now());
        Announcement saved = announcementRepo.save(body);
        logAudit(p, "CREATE_ANNOUNCEMENT", "Created announcement: " + body.getTitle(), body.getTargetTenantId());
        return ResponseEntity.ok(Map.of("success", true, "data", saved));
    }

    @PutMapping("/announcements/{id}")
    public ResponseEntity<?> updateAnnouncement(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String id, @RequestBody Map<String, Object> body) {
        requireSuperAdmin(p);
        return announcementRepo.findById(id).map(a -> {
            if (body.containsKey("title"))    a.setTitle((String) body.get("title"));
            if (body.containsKey("message"))  a.setMessage((String) body.get("message"));
            if (body.containsKey("type"))     a.setType((String) body.get("type"));
            if (body.containsKey("active"))   a.setActive((Boolean) body.get("active"));
            announcementRepo.save(a);
            logAudit(p, "UPDATE_ANNOUNCEMENT", "Updated announcement: " + a.getTitle(), a.getTargetTenantId());
            return ResponseEntity.ok(Map.of("success", true, "data", a));
        }).orElse(ResponseEntity.status(404).body(Map.of("success", false)));
    }

    @DeleteMapping("/announcements/{id}")
    public ResponseEntity<?> deleteAnnouncement(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String id) {
        requireSuperAdmin(p);
        announcementRepo.findById(id).ifPresent(a -> {
            announcementRepo.deleteById(id);
            logAudit(p, "DELETE_ANNOUNCEMENT", "Deleted announcement: " + a.getTitle(), null);
        });
        return ResponseEntity.ok(Map.of("success", true));
    }
}
