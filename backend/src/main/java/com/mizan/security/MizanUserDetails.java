package com.mizan.security;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import java.util.Collection;
import java.util.List;

public class MizanUserDetails implements UserDetails {
    private final String userId;
    private final String tenantId;
    private final String email;
    private final String passwordHash;
    private final String role;
    private final List<String> allowedBranches;
    private final List<String> allowedRegions;
    private final String linkedEmployeeId;
    private final boolean active;

    public MizanUserDetails(String userId, String tenantId, String email,
            String passwordHash, String role, List<String> allowedBranches,
            List<String> allowedRegions, String linkedEmployeeId, boolean active) {
        this.userId = userId; this.tenantId = tenantId; this.email = email;
        this.passwordHash = passwordHash; this.role = role;
        this.allowedBranches = allowedBranches; this.allowedRegions = allowedRegions;
        this.linkedEmployeeId = linkedEmployeeId; this.active = active;
    }

    public String getUserId() { return userId; }
    public String getTenantId() { return tenantId; }
    public String getRole() { return role; }
    public List<String> getAllowedBranches() { return allowedBranches; }
    public List<String> getAllowedRegions() { return allowedRegions; }
    public String getLinkedEmployeeId() { return linkedEmployeeId; }

    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }
    @Override public String getPassword() { return passwordHash; }
    @Override public String getUsername() { return email; }
    @Override public boolean isAccountNonExpired() { return true; }
    @Override public boolean isAccountNonLocked() { return true; }
    @Override public boolean isCredentialsNonExpired() { return true; }
    @Override public boolean isEnabled() { return active; }
}
