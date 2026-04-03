package com.mizan.controller;
import com.mizan.model.User;
import com.mizan.repository.UserRepository;
import com.mizan.security.JwtTokenProvider;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final UserRepository userRepo;
    private final PasswordEncoder encoder;
    private final JwtTokenProvider jwt;

    public AuthController(UserRepository userRepo, PasswordEncoder encoder, JwtTokenProvider jwt) {
        this.userRepo=userRepo; this.encoder=encoder; this.jwt=jwt;
    }

    @PostMapping("/bootstrap")
    public ResponseEntity<?> bootstrap(@RequestBody Map<String,String> body) {
        if (userRepo.count() > 0)
            return ResponseEntity.badRequest().body(Map.of("success",false,"message","Already bootstrapped"));
        User u = new User();
        u.setUserId(UUID.randomUUID().toString());
        u.setEmail(body.get("email"));
        u.setPasswordHash(encoder.encode(body.get("password")));
        u.setFullNameAr(body.getOrDefault("fullNameAr","مدير المنصة"));
        u.setRole("SUPER_ADMIN");
        u.setActive(true);
        u.setMustChangePassword(false);
        userRepo.save(u);
        return ResponseEntity.ok(Map.of("success",true,"message","Bootstrap complete"));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String,String> body) {
        String emailOrUser = body.get("usernameOrEmail");
        String password = body.get("password");
        Optional<User> opt = userRepo.findByEmailIgnoreCase(emailOrUser);
        if (opt.isEmpty()) {
            log.warn("LOGIN FAIL — user not found: '{}'", emailOrUser);
            return ResponseEntity.status(401).body(Map.of("success",false,"message","Invalid credentials"));
        }
        User u = opt.get();
        if (!u.isActive()) {
            log.warn("LOGIN FAIL — account disabled: '{}'", emailOrUser);
            return ResponseEntity.status(403).body(Map.of("success",false,"message","Account disabled"));
        }
        boolean pwOk = encoder.matches(password, u.getPasswordHash());
        log.info("LOGIN — email='{}' found=true active={} pwMatch={} hashPrefix='{}'",
            emailOrUser, u.isActive(), pwOk,
            u.getPasswordHash() != null ? u.getPasswordHash().substring(0, 7) : "null");
        if (!pwOk)
            return ResponseEntity.status(401).body(Map.of("success",false,"message","Invalid credentials"));
        u.setLastLoginAt(LocalDateTime.now());
        userRepo.save(u);
        MizanUserDetails details = new MizanUserDetails(u.getUserId(), u.getTenantId(),
            u.getEmail(), u.getPasswordHash(), u.getRole(),
            u.getAllowedBranches(), u.getAllowedRegions(), u.getLinkedEmployeeId(), u.isActive());
        String token = jwt.generateToken(details);
        Map<String,Object> userMap = new java.util.LinkedHashMap<>();
        userMap.put("userId", u.getUserId());
        userMap.put("email", u.getEmail());
        userMap.put("fullNameAr", nvl(u.getFullNameAr()));
        userMap.put("fullNameEn", nvl(u.getFullNameEn()));
        userMap.put("role", u.getRole());
        userMap.put("tenantId", nvl(u.getTenantId()));
        userMap.put("allowedBranches", nvl2(u.getAllowedBranches()));
        userMap.put("allowedRegions", nvl2(u.getAllowedRegions()));
        userMap.put("linkedEmployeeId", nvl(u.getLinkedEmployeeId()));
        userMap.put("preferredLanguage", u.getPreferredLanguage());
        userMap.put("mustChangePassword", u.isMustChangePassword());
        return ResponseEntity.ok(Map.of("success",true,"data",Map.of("accessToken",token,"user",userMap)));
    }

@PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@AuthenticationPrincipal MizanUserDetails principal,
            @RequestBody Map<String,String> body) {
        User u = userRepo.findById(principal.getUserId()).orElseThrow();
        if (!encoder.matches(body.get("currentPassword"), u.getPasswordHash()))
            return ResponseEntity.status(400).body(Map.of("success",false,"message","Current password incorrect"));
        u.setPasswordHash(encoder.encode(body.get("newPassword")));
        u.setMustChangePassword(false);
        userRepo.save(u);
        return ResponseEntity.ok(Map.of("success",true,"message","Password changed"));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal MizanUserDetails principal) {
        return userRepo.findById(principal.getUserId())
            .map(u -> ResponseEntity.ok(Map.of("success",true,"data",u)))
            .orElse(ResponseEntity.status(404).body(Map.of("success",false,"message","Not found")));
    }

    @PutMapping("/me/language")
    public ResponseEntity<?> updateLanguage(@AuthenticationPrincipal MizanUserDetails principal,
            @RequestBody Map<String,String> body) {
        userRepo.findById(principal.getUserId()).ifPresent(u -> {
            u.setPreferredLanguage(body.getOrDefault("language","AR"));
            userRepo.save(u);
        });
        return ResponseEntity.ok(Map.of("success",true));
    }

    private String nvl(String s) { return s != null ? s : ""; }
    @SuppressWarnings("unchecked")
    private Object nvl2(Object o) { return o != null ? o : java.util.List.of(); }
}
