package com.mizan.security;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.security.Key;
import java.util.Date;
import java.util.List;

@Component
public class JwtTokenProvider {
    private final Key key;
    private final long expiration;

    public JwtTokenProvider(
            @Value("${mizan.jwt.secret}") String secret,
            @Value("${mizan.jwt.expiration}") long expiration) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes());
        this.expiration = expiration;
    }

    public String generateToken(MizanUserDetails user) {
        return generateToken(user, expiration);
    }

    public String generateToken(MizanUserDetails user, long customExpiry) {
        return Jwts.builder()
            .setSubject(user.getUserId())
            .claim("tenantId", user.getTenantId())
            .claim("role", user.getRole())
            .claim("email", user.getUsername())
            .claim("allowedBranches", user.getAllowedBranches())
            .claim("allowedRegions", user.getAllowedRegions())
            .claim("linkedEmployeeId", user.getLinkedEmployeeId())
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + customExpiry))
            .signWith(key, SignatureAlgorithm.HS512)
            .compact();
    }

    public boolean validateToken(String token) {
        try { getClaims(token); return true; } catch (Exception e) { return false; }
    }

    public Claims getClaims(String token) {
        return Jwts.parserBuilder().setSigningKey(key).build()
            .parseClaimsJws(token).getBody();
    }
}
