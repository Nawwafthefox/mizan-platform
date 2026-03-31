package com.mizan.controller;
import com.mizan.model.User;
import com.mizan.repository.UserRepository;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserRepository userRepo;
    private final PasswordEncoder encoder;
    public UserController(UserRepository userRepo, PasswordEncoder encoder) {
        this.userRepo=userRepo; this.encoder=encoder;
    }

    @GetMapping
    public ResponseEntity<?> list(@AuthenticationPrincipal MizanUserDetails p) {
        if (!p.getRole().equals("COMPANY_ADMIN") && !p.getRole().equals("SUPER_ADMIN"))
            return ResponseEntity.status(403).body(Map.of("success",false));
        String tid = TenantContext.getTenantId();
        return ResponseEntity.ok(Map.of("success",true,"data",userRepo.findByTenantId(tid)));
    }

    @PostMapping
    public ResponseEntity<?> create(@AuthenticationPrincipal MizanUserDetails p,
            @RequestBody Map<String,Object> body) {
        if (!p.getRole().equals("COMPANY_ADMIN") && !p.getRole().equals("SUPER_ADMIN"))
            return ResponseEntity.status(403).body(Map.of("success",false));
        String email = (String) body.get("email");
        if (userRepo.existsByEmail(email))
            return ResponseEntity.badRequest().body(Map.of("success",false,"message","Email exists"));
        User u = new User();
        u.setUserId(UUID.randomUUID().toString());
        u.setTenantId(TenantContext.getTenantId());
        u.setEmail(email);
        u.setPasswordHash(encoder.encode((String) body.get("temporaryPassword")));
        u.setFullNameAr((String) body.getOrDefault("fullNameAr",""));
        u.setFullNameEn((String) body.getOrDefault("fullNameEn",""));
        u.setRole((String) body.getOrDefault("role","BRANCH_EMPLOYEE"));
        u.setMustChangePassword(true);
        u.setCreatedAt(LocalDateTime.now());
        u.setCreatedBy(p.getUserId());
        @SuppressWarnings("unchecked")
        java.util.List<String> branches = (java.util.List<String>) body.get("allowedBranches");
        u.setAllowedBranches(branches);
        u.setLinkedEmployeeId((String) body.get("linkedEmployeeId"));
        u.setLinkedBranchCode((String) body.get("linkedBranchCode"));
        userRepo.save(u);
        u.setPasswordHash(null);
        return ResponseEntity.ok(Map.of("success",true,"data",u));
    }

    @PutMapping("/{id}/activate")
    public ResponseEntity<?> activate(@PathVariable String id) {
        return userRepo.findById(id).map(u -> { u.setActive(true); userRepo.save(u);
            return ResponseEntity.ok(Map.of("success",true)); })
            .orElse(ResponseEntity.status(404).body(Map.of("success",false)));
    }

    @PutMapping("/{id}/deactivate")
    public ResponseEntity<?> deactivate(@PathVariable String id) {
        return userRepo.findById(id).map(u -> { u.setActive(false); userRepo.save(u);
            return ResponseEntity.ok(Map.of("success",true)); })
            .orElse(ResponseEntity.status(404).body(Map.of("success",false)));
    }

    @PostMapping("/{id}/reset-password")
    public ResponseEntity<?> resetPassword(@PathVariable String id, @RequestBody Map<String,String> body) {
        return userRepo.findById(id).map(u -> {
            u.setPasswordHash(encoder.encode(body.get("newPassword")));
            u.setMustChangePassword(true);
            userRepo.save(u);
            return ResponseEntity.ok(Map.of("success",true));
        }).orElse(ResponseEntity.status(404).body(Map.of("success",false)));
    }
}
