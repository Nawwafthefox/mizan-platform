package com.mizan.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Configuration
public class CorsConfig {

    @Value("${cors.allowed-origins:http://localhost:4200}")
    private String allowedOriginsRaw;

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = Arrays.stream(allowedOriginsRaw.split(","))
            .map(String::trim)
            .filter(s -> !s.isBlank())
            .collect(Collectors.toList());
        config.setAllowedOrigins(origins);

        config.setAllowedMethods(Arrays.asList(
            "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"
        ));

        config.setAllowedHeaders(Arrays.asList(
            "Authorization", "Content-Type", "Accept",
            "X-Requested-With", "Origin",
            "Access-Control-Request-Method", "Access-Control-Request-Headers",
            "Cache-Control"
        ));

        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        config.setExposedHeaders(Arrays.asList("Authorization", "Content-Disposition"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return new CorsFilter(source);
    }
}
