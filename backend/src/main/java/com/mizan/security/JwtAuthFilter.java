package com.mizan.security;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtTokenProvider jwtProvider;

    public JwtAuthFilter(JwtTokenProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest req,
            @NonNull HttpServletResponse res, @NonNull FilterChain chain)
            throws ServletException, IOException {
        try {
            String token = extractToken(req);
            if (token != null && jwtProvider.validateToken(token)) {
                Claims claims = jwtProvider.getClaims(token);
                String userId = claims.getSubject();
                String tenantId = claims.get("tenantId", String.class);
                String role = claims.get("role", String.class);
                String email = claims.get("email", String.class);
                @SuppressWarnings("unchecked")
                List<String> branches = claims.get("allowedBranches", List.class);
                @SuppressWarnings("unchecked")
                List<String> regions = claims.get("allowedRegions", List.class);
                String linkedEmpId = claims.get("linkedEmployeeId", String.class);

                MizanUserDetails userDetails = new MizanUserDetails(
                    userId, tenantId, email, null, role, branches, regions, linkedEmpId, true);
                UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(auth);
                TenantContext.set(tenantId, role);
            }
        } finally {
            chain.doFilter(req, res);
            TenantContext.clear();
        }
    }

    private String extractToken(HttpServletRequest req) {
        String h = req.getHeader("Authorization");
        return (h != null && h.startsWith("Bearer ")) ? h.substring(7) : null;
    }
}
