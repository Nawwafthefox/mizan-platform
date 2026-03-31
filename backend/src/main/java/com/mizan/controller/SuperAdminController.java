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

@RestController
@RequestMapping("/api/super-admin")
public class SuperAdminController {
    private final TenantRepository tenantRepo;
    private final UserRepository userRepo;
    private final SubscriptionTierRepository tierRepo;
    private final AuditLogRepository auditRepo;
    private final PasswordEncoder encoder;
    private final JwtTokenProvider jwt;

    public SuperAdminController(TenantRepository tenantRepo, UserRepository userRepo,
            SubscriptionTierRepository tierRepo, AuditLogRepository auditRepo,
            PasswordEncoder encoder, JwtTokenProvider jwt) {
        this.tenantRepo=tenantRepo; this.userRepo=userRepo;
        this.tierRepo=tierRepo; this.auditRepo=auditRepo;
        this.encoder=encoder; this.jwt=jwt;
    }

    private void requireSuperAdmin(MizanUserDetails p) {
        if (!"SUPER_ADMIN".equals(p.getRole())) throw new SecurityException("Access denied");
    }

    @GetMapping("/stats")
    public ResponseEntity<?> stats(@AuthenticationPrincipal MizanUserDetails p) {
        requireSuperAdmin(p);
        List<Tenant> all = tenantRepo.findAll();
        long active = all.stream().filter(t->"ACTIVE".equals(t.getSubscriptionStatus())).count();
        long trial = all.stream().filter(t->"TRIAL".equals(t.getSubscriptionStatus())).count();
        long suspended = all.stream().filter(t->"SUSPENDED".equals(t.getSubscriptionStatus())).count();
        return ResponseEntity.ok(Map.of("success",true,"data",Map.of(
            "tenantCount",all.size(),"activeCount",active,"trialCount",trial,
            "suspendedCount",suspended,"mrr",0)));
    }

    @GetMapping("/tenants")
    public ResponseEntity<?> listTenants(@AuthenticationPrincipal MizanUserDetails p) {
        requireSuperAdmin(p);
        return ResponseEntity.ok(Map.of("success",true,"data",tenantRepo.findAll()));
    }

    @PostMapping("/tenants")
    public ResponseEntity<?> createTenant(@AuthenticationPrincipal MizanUserDetails p,
            @RequestBody Map<String,Object> body) {
        requireSuperAdmin(p);
        String tenantId = UUID.randomUUID().toString();
        Tenant t = new Tenant();
        t.setTenantId(tenantId);
        t.setCompanyNameAr((String) body.get("companyNameAr"));
        t.setCompanyNameEn((String) body.getOrDefault("companyNameEn",""));
        t.setContactEmail((String) body.get("contactEmail"));
        t.setContactPhone((String) body.getOrDefault("contactPhone",""));
        t.setSubscriptionTierId((String) body.getOrDefault("subscriptionTierId","starter"));
        t.setSubscriptionStatus("TRIAL");
        int trialDays = body.containsKey("trialDays") ? (int) body.get("trialDays") : 14;
        t.setTrialEndsAt(LocalDate.now().plusDays(trialDays));
        t.setActive(true);
        t.setCreatedAt(LocalDateTime.now());
        t.setCreatedBy(p.getUserId());
        tenantRepo.save(t);

        // Create admin user
        String adminEmail = (String) body.get("initialAdminEmail");
        String adminPw = (String) body.get("initialAdminPassword");
        User admin = new User();
        admin.setUserId(UUID.randomUUID().toString());
        admin.setTenantId(tenantId);
        admin.setEmail(adminEmail);
        admin.setPasswordHash(encoder.encode(adminPw));
        admin.setFullNameAr((String) body.getOrDefault("initialAdminNameAr","مدير الشركة"));
        admin.setFullNameEn((String) body.getOrDefault("initialAdminNameEn","Company Admin"));
        admin.setRole("COMPANY_ADMIN");
        admin.setActive(true);
        admin.setMustChangePassword(false);
        admin.setCreatedBy(p.getUserId());
        userRepo.save(admin);

        audit(p,"CREATE_TENANT","Created tenant: "+t.getCompanyNameAr(), tenantId);
        return ResponseEntity.ok(Map.of("success",true,
            "message","Company created successfully",
            "data",Map.of("tenantId",tenantId,"adminEmail",adminEmail,"adminUserId",admin.getUserId())));
    }

    @GetMapping("/tenants/{tenantId}")
    public ResponseEntity<?> getTenant(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId) {
        requireSuperAdmin(p);
        return tenantRepo.findById(tenantId)
            .map(t -> ResponseEntity.ok(Map.of("success",true,"data",t)))
            .orElse(ResponseEntity.status(404).body(Map.of("success",false)));
    }

    @PostMapping("/tenants/{tenantId}/suspend")
    public ResponseEntity<?> suspend(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId, @RequestBody(required=false) Map<String,String> body) {
        requireSuperAdmin(p);
        tenantRepo.findById(tenantId).ifPresent(t -> {
            t.setSubscriptionStatus("SUSPENDED"); t.setActive(false);
            tenantRepo.save(t);
        });
        audit(p,"SUSPEND_TENANT",body!=null?body.getOrDefault("reason",""):"",tenantId);
        return ResponseEntity.ok(Map.of("success",true));
    }

    @PostMapping("/tenants/{tenantId}/activate")
    public ResponseEntity<?> activate(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tenantId) {
        requireSuperAdmin(p);
        tenantRepo.findById(tenantId).ifPresent(t -> {
            t.setSubscriptionStatus("ACTIVE"); t.setActive(true);
            tenantRepo.save(t);
        });
        audit(p,"ACTIVATE_TENANT","",tenantId);
        return ResponseEntity.ok(Map.of("success",true));
    }

    @PostMapping("/impersonate")
    public ResponseEntity<?> impersonate(@AuthenticationPrincipal MizanUserDetails p,
            @RequestBody Map<String,String> body) {
        requireSuperAdmin(p);
        String tenantId = body.get("tenantId");
        Tenant tenant = tenantRepo.findById(tenantId).orElseThrow();
        User admin = userRepo.findByTenantId(tenantId).stream()
            .filter(u->"COMPANY_ADMIN".equals(u.getRole())).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("No admin found"));
        MizanUserDetails details = new MizanUserDetails(admin.getUserId(), admin.getTenantId(),
            admin.getEmail(), admin.getPasswordHash(), admin.getRole(),
            admin.getAllowedBranches(), admin.getAllowedRegions(), admin.getLinkedEmployeeId(), true);
        String token = jwt.generateToken(details, 30 * 60 * 1000L); // 30 min
        audit(p,"IMPERSONATE","Impersonating tenant: "+tenant.getCompanyNameAr(), tenantId);
        return ResponseEntity.ok(Map.of("success",true,"data",Map.of(
            "impersonationToken",token,"tenantName",tenant.getCompanyNameAr())));
    }

    @GetMapping("/tiers")
    public ResponseEntity<?> listTiers(@AuthenticationPrincipal MizanUserDetails p) {
        requireSuperAdmin(p);
        return ResponseEntity.ok(Map.of("success",true,"data",tierRepo.findByActiveTrueOrderByDisplayOrderAsc()));
    }

    @PutMapping("/tiers/{tierId}")
    public ResponseEntity<?> updateTier(@AuthenticationPrincipal MizanUserDetails p,
            @PathVariable String tierId, @RequestBody SubscriptionTier body) {
        requireSuperAdmin(p);
        return tierRepo.findById(tierId).map(t -> {
            if (body.getPricing() != null) t.setPricing(body.getPricing());
            if (body.getFeatures() != null) t.setFeatures(body.getFeatures());
            if (body.getTierNameAr() != null) t.setTierNameAr(body.getTierNameAr());
            if (body.getTierNameEn() != null) t.setTierNameEn(body.getTierNameEn());
            t.setUpdatedAt(LocalDateTime.now());
            tierRepo.save(t);
            audit(p,"UPDATE_TIER","Updated tier: "+tierId, null);
            return ResponseEntity.ok(Map.of("success",true,"data",t));
        }).orElse(ResponseEntity.status(404).body(Map.of("success",false)));
    }

    @GetMapping("/audit")
    public ResponseEntity<?> audit(@AuthenticationPrincipal MizanUserDetails p) {
        requireSuperAdmin(p);
        return ResponseEntity.ok(Map.of("success",true,"data",auditRepo.findAllByOrderByCreatedAtDesc()));
    }

    private void audit(MizanUserDetails actor, String action, String details, String tenantId) {
        AuditLog log = new AuditLog();
        log.setActorUserId(actor.getUserId());
        log.setActorEmail(actor.getUsername());
        log.setTenantId(tenantId);
        log.setAction(action);
        log.setDetails(details);
        log.setCreatedAt(LocalDateTime.now());
        auditRepo.save(log);
    }
}
