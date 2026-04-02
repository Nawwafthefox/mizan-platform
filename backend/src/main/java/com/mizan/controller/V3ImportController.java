package com.mizan.controller;

import com.mizan.security.TenantContext;
import com.mizan.service.V3ExcelImportService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
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
        return startAsync(files, "branch-sales");
    }

    @PostMapping("/employee-sales")
    public ResponseEntity<?> importEmployeeSales(
            @RequestParam("files") List<MultipartFile> files) throws Exception {
        return startAsync(files, "employee-sales");
    }

    @PostMapping("/purchases")
    public ResponseEntity<?> importPurchases(
            @RequestParam("files") List<MultipartFile> files) throws Exception {
        return startAsync(files, "purchases");
    }

    @PostMapping("/mothan")
    public ResponseEntity<?> importMothan(
            @RequestParam("files") List<MultipartFile> files) throws Exception {
        return startAsync(files, "mothan");
    }

    @DeleteMapping("/wipe")
    public ResponseEntity<?> wipeV3Data() {
        String tenantId = TenantContext.getTenantId();
        importSvc.wipeV3Data(tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ── Read bytes eagerly in the request thread, then hand off to background ──
    // This is CRITICAL: TenantContext is a ThreadLocal — capture tenantId before
    // the thread switch, and read file bytes before the HTTP connection closes.
    private ResponseEntity<?> startAsync(List<MultipartFile> files, String type) throws Exception {
        String tenantId = TenantContext.getTenantId();   // capture before async!
        List<byte[]> bytesList = new ArrayList<>();
        List<String> names     = new ArrayList<>();
        for (MultipartFile f : files) {
            bytesList.add(f.getBytes());                 // read into memory now
            names.add(f.getOriginalFilename());
        }

        Thread worker = new Thread(() -> {
            for (int i = 0; i < bytesList.size(); i++) {
                try {
                    int saved = importSvc.importByType(type, bytesList.get(i), names.get(i), tenantId);
                    log.info("V3 {} '{}' → {} records saved", type, names.get(i), saved);
                } catch (Exception e) {
                    log.error("V3 {} import failed for '{}': {}", type, names.get(i), e.getMessage(), e);
                }
            }
        }, "v3-import-" + type);
        worker.setDaemon(true);
        worker.start();

        return ResponseEntity.accepted().body(Map.of(
            "success", true,
            "message", "Import started in background — check /api/v3/debug/counts after 90 seconds"
        ));
    }
}
