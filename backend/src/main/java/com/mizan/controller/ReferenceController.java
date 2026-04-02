package com.mizan.controller;

import com.mizan.model.Branch;
import com.mizan.model.Region;
import com.mizan.repository.BranchRepository;
import com.mizan.repository.RegionRepository;
import com.mizan.security.TenantContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reference")
public class ReferenceController {
    private final RegionRepository regionRepo;
    private final BranchRepository branchRepo;

    public ReferenceController(RegionRepository regionRepo, BranchRepository branchRepo) {
        this.regionRepo = regionRepo;
        this.branchRepo = branchRepo;
    }

    @GetMapping("/regions")
    public ResponseEntity<?> regions() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success", true, "data", List.of()));
        List<Region> regions = regionRepo.findByTenantIdOrderByPgId(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", regions));
    }

    @GetMapping("/branches")
    public ResponseEntity<?> branches() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success", true, "data", List.of()));
        List<Branch> branches = branchRepo.findByTenantIdOrderByPgId(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", branches));
    }
}
