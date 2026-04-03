package com.mizan.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Lightweight health check — no MongoDB hit.
 * Render pings this endpoint to keep the service alive; pointing to /actuator/health
 * would run a MongoDB health indicator on every ping. This endpoint is instant.
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    @GetMapping
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of(
            "status",    "UP",
            "timestamp", System.currentTimeMillis()
        ));
    }
}
