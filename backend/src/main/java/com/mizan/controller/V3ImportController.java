package com.mizan.controller;

import com.mizan.security.TenantContext;
import com.mizan.service.V3ExcelImportService;
import com.mizan.service.V3ImportStatusService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v3/import")
public class V3ImportController {

    private final V3ExcelImportService    importSvc;
    private final V3ImportStatusService   statusSvc;

    public V3ImportController(V3ExcelImportService importSvc, V3ImportStatusService statusSvc) {
        this.importSvc = importSvc;
        this.statusSvc = statusSvc;
    }

    @PostMapping("/branch-sales")
    public ResponseEntity<?> importBranchSales(@RequestParam("files") List<MultipartFile> files) throws Exception {
        return startAsync(files, "branch-sales");
    }

    @PostMapping("/employee-sales")
    public ResponseEntity<?> importEmployeeSales(@RequestParam("files") List<MultipartFile> files) throws Exception {
        return startAsync(files, "employee-sales");
    }

    @PostMapping("/purchases")
    public ResponseEntity<?> importPurchases(@RequestParam("files") List<MultipartFile> files) throws Exception {
        return startAsync(files, "purchases");
    }

    @PostMapping("/mothan")
    public ResponseEntity<?> importMothan(@RequestParam("files") List<MultipartFile> files) throws Exception {
        return startAsync(files, "mothan");
    }

    @GetMapping("/status/{importId}")
    public ResponseEntity<?> getStatus(@PathVariable String importId) {
        V3ImportStatusService.ImportStatus s = statusSvc.get(importId);
        if (s == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of(
            "success", true,
            "data", Map.of(
                "status",      s.status(),
                "parsed",      s.parsed(),
                "saved",       s.saved(),
                "total",       s.total(),
                "error",       s.error() != null ? s.error() : "",
                "startedAt",   s.startedAt(),
                "completedAt", s.completedAt()
            )
        ));
    }

    @DeleteMapping("/wipe")
    public ResponseEntity<?> wipeV3Data() {
        String tenantId = TenantContext.getTenantId();
        importSvc.wipeV3Data(tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ── Read bytes eagerly in the request thread, then hand off to background ──
    // TenantContext is a ThreadLocal — capture tenantId before the thread switch.
    // File bytes are read into memory before the HTTP connection closes.
    private ResponseEntity<?> startAsync(List<MultipartFile> files, String type) throws Exception {
        String tenantId = TenantContext.getTenantId();   // capture before async!
        String importId = UUID.randomUUID().toString();

        List<byte[]> bytesList = new ArrayList<>();
        List<String> names     = new ArrayList<>();
        for (MultipartFile f : files) {
            bytesList.add(f.getBytes());
            names.add(f.getOriginalFilename());
        }

        statusSvc.start(importId);

        Thread worker = new Thread(() -> {
            int totalSaved = 0;
            try {
                for (int i = 0; i < bytesList.size(); i++) {
                    int saved = importSvc.importByType(type, bytesList.get(i), names.get(i), tenantId, importId);
                    totalSaved += saved;
                    log.info("V3 {} '{}' → {} records saved", type, names.get(i), saved);
                }
                statusSvc.complete(importId, totalSaved);
            } catch (Exception e) {
                log.error("V3 {} import failed: {}", type, e.getMessage(), e);
                statusSvc.error(importId, e.getMessage());
            }
        }, "v3-import-" + type);
        worker.setDaemon(true);
        worker.start();

        return ResponseEntity.accepted().body(Map.of(
            "success",  true,
            "data",     Map.of("importId", importId),
            "message",  "Import started — poll /api/v3/import/status/" + importId
        ));
    }
}
