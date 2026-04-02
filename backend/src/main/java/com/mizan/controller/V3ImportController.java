package com.mizan.controller;

import com.mizan.security.TenantContext;
import com.mizan.service.V3ExcelImportService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v3/import")
public class V3ImportController {

    private final V3ExcelImportService importSvc;

    public V3ImportController(V3ExcelImportService importSvc) {
        this.importSvc = importSvc;
    }

    @PostMapping("/branch-sales")
    public ResponseEntity<?> importBranchSales(
            @RequestParam("files") List<MultipartFile> files) throws Exception {
        String tenantId = TenantContext.getTenantId();
        int total = 0;
        for (MultipartFile f : files) total += importSvc.importBranchSales(f, tenantId);
        return ok(total);
    }

    @PostMapping("/employee-sales")
    public ResponseEntity<?> importEmployeeSales(
            @RequestParam("files") List<MultipartFile> files) throws Exception {
        String tenantId = TenantContext.getTenantId();
        int total = 0;
        for (MultipartFile f : files) total += importSvc.importEmployeeSales(f, tenantId);
        return ok(total);
    }

    @PostMapping("/purchases")
    public ResponseEntity<?> importPurchases(
            @RequestParam("files") List<MultipartFile> files) throws Exception {
        String tenantId = TenantContext.getTenantId();
        int total = 0;
        for (MultipartFile f : files) total += importSvc.importPurchases(f, tenantId);
        return ok(total);
    }

    @PostMapping("/mothan")
    public ResponseEntity<?> importMothan(
            @RequestParam("files") List<MultipartFile> files) throws Exception {
        String tenantId = TenantContext.getTenantId();
        int total = 0;
        for (MultipartFile f : files) total += importSvc.importMothan(f, tenantId);
        return ok(total);
    }

    @DeleteMapping("/wipe")
    public ResponseEntity<?> wipeV3Data() {
        String tenantId = TenantContext.getTenantId();
        importSvc.wipeV3Data(tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    private ResponseEntity<?> ok(int count) {
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of("count", count)));
    }
}
