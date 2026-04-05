package com.mizan.controller;

import com.mizan.model.V3ImputedRecord;
import com.mizan.repository.V3ImputedRecordRepository;
import com.mizan.security.TenantContext;
import com.mizan.service.V3ExcelImportService;
import com.mizan.service.V3ImportStatusService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/v3/import")
public class V3ImportController {

    private final V3ExcelImportService      importSvc;
    private final V3ImportStatusService     statusSvc;
    private final V3ImputedRecordRepository imputedRepo;
    private final MongoTemplate             mongo;

    public V3ImportController(V3ExcelImportService importSvc,
                               V3ImportStatusService statusSvc,
                               V3ImputedRecordRepository imputedRepo,
                               MongoTemplate mongo) {
        this.importSvc   = importSvc;
        this.statusSvc   = statusSvc;
        this.imputedRepo = imputedRepo;
        this.mongo       = mongo;
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

    // ─── Imputed-record review endpoints ─────────────────────────────────────

    @GetMapping("/imputed-records")
    public ResponseEntity<?> getImputedRecords(@RequestParam(required = false) String status) {
        String tenantId = TenantContext.getTenantId();
        List<V3ImputedRecord> records = status != null
            ? imputedRepo.findByTenantIdAndStatus(tenantId, status)
            : imputedRepo.findByTenantIdOrderByCreatedAtDesc(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", records));
    }

    @GetMapping("/imputed-records/pending-count")
    public ResponseEntity<?> getPendingCount() {
        String tenantId = TenantContext.getTenantId();
        long count = imputedRepo.countByTenantIdAndStatus(tenantId, "pending_review");
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of("count", count)));
    }

    @PutMapping("/imputed-records/{id}/approve")
    public ResponseEntity<?> approveRecord(@PathVariable String id) {
        String tenantId = TenantContext.getTenantId();
        mongo.updateFirst(
            Query.query(Criteria.where("id").is(id).and("tenantId").is(tenantId)),
            new Update().set("status", "approved")
                        .set("reviewedAt", LocalDateTime.now()),
            V3ImputedRecord.class
        );
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PutMapping("/imputed-records/{id}/modify")
    public ResponseEntity<?> modifyRecord(@PathVariable String id,
                                           @RequestBody Map<String, String> body) {
        String tenantId = TenantContext.getTenantId();
        String modifiedValue = body.getOrDefault("modifiedValue", "");
        String reviewedBy    = body.getOrDefault("reviewedBy", "");

        V3ImputedRecord rec = imputedRepo.findById(id).orElse(null);
        if (rec == null || !rec.getTenantId().equals(tenantId))
            return ResponseEntity.notFound().build();

        mongo.updateFirst(
            Query.query(Criteria.where("id").is(id).and("tenantId").is(tenantId)),
            new Update().set("status", "modified")
                        .set("modifiedValue", modifiedValue)
                        .set("reviewedBy", reviewedBy)
                        .set("reviewedAt", LocalDateTime.now()),
            V3ImputedRecord.class
        );

        // Apply the change to the actual transaction collection
        applyImputationChange(rec, modifiedValue, tenantId);

        return ResponseEntity.ok(Map.of("success", true));
    }

    @PutMapping("/imputed-records/{id}/reject")
    public ResponseEntity<?> rejectRecord(@PathVariable String id) {
        String tenantId = TenantContext.getTenantId();
        V3ImputedRecord rec = imputedRepo.findById(id).orElse(null);
        if (rec == null || !rec.getTenantId().equals(tenantId))
            return ResponseEntity.notFound().build();

        mongo.updateFirst(
            Query.query(Criteria.where("id").is(id).and("tenantId").is(tenantId)),
            new Update().set("status", "rejected").set("reviewedAt", LocalDateTime.now()),
            V3ImputedRecord.class
        );
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/imputed-records/bulk-approve")
    public ResponseEntity<?> bulkApprove(@RequestBody Map<String, List<String>> body) {
        String tenantId = TenantContext.getTenantId();
        List<String> ids = body.getOrDefault("ids", List.of());
        if (ids.isEmpty()) return ResponseEntity.badRequest().body(Map.of("success", false, "message", "No ids provided"));

        mongo.updateMulti(
            Query.query(Criteria.where("id").in(ids).and("tenantId").is(tenantId)),
            new Update().set("status", "approved").set("reviewedAt", LocalDateTime.now()),
            V3ImputedRecord.class
        );
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of("approved", ids.size())));
    }

    /** Writes the accepted/modified imputation value back to the source transaction. */
    private void applyImputationChange(V3ImputedRecord rec, String newValue, String tenantId) {
        try {
            String collection = switch (rec.getFileType()) {
                case "branch-sales"    -> "v3_sale_transactions";
                case "employee-sales"  -> "v3_employee_sale_transactions";
                case "mothan"          -> "v3_mothan_transactions";
                default -> null;
            };
            if (collection == null) return;

            Update update = switch (rec.getAnomalyType()) {
                case "corrupt_pieces"  -> new Update().set("pieces", Integer.parseInt(newValue));
                case "missing_employee" -> new Update().set("empId", newValue);
                default -> null;
            };
            if (update == null) return;

            // Match by tenantId + branchCode + recordDate + sourceRow approximation
            // Use importId tag embedded during save as the most reliable filter
            mongo.updateMulti(
                Query.query(Criteria.where("tenantId").is(tenantId)
                    .and("branchCode").is(rec.getBranchCode())
                    .and("sourceFile").regex(rec.getImportId())),
                update, collection
            );
        } catch (Exception e) {
            log.warn("applyImputationChange failed for record {}: {}", rec.getId(), e.getMessage());
        }
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
