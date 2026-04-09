package com.mizan.controller;

import com.mizan.model.V3StagedRecord;
import com.mizan.repository.V3StagedRecordRepository;
import com.mizan.security.TenantContext;
import com.mizan.service.V3CacheService;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/v3/staged")
public class V3StagedController {

    private final V3StagedRecordRepository stagedRepo;
    private final MongoTemplate            mongo;
    private final V3CacheService           cache;

    public V3StagedController(V3StagedRecordRepository stagedRepo,
                               MongoTemplate mongo,
                               V3CacheService cache) {
        this.stagedRepo = stagedRepo;
        this.mongo      = mongo;
        this.cache      = cache;
    }

    /** List staged records, optionally filtered by status and/or fileType. */
    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fileType) {
        String tenantId = TenantContext.getTenantId();
        List<V3StagedRecord> records;
        if (fileType != null && status != null) {
            records = stagedRepo.findByTenantIdAndFileTypeAndStatus(tenantId, fileType, status);
        } else if (status != null) {
            records = stagedRepo.findByTenantIdAndStatus(tenantId, status);
        } else {
            records = stagedRepo.findByTenantIdOrderByCreatedAtDesc(tenantId);
        }
        return ResponseEntity.ok(Map.of("success", true, "data", records));
    }

    /** Pending counts per file type plus total. */
    @GetMapping("/counts")
    public ResponseEntity<?> counts() {
        String tenantId = TenantContext.getTenantId();
        String pending = "pending";
        long branchSales   = stagedRepo.countByTenantIdAndFileTypeAndStatus(tenantId, "branch-sales",   pending);
        long employeeSales = stagedRepo.countByTenantIdAndFileTypeAndStatus(tenantId, "employee-sales", pending);
        long purchases     = stagedRepo.countByTenantIdAndFileTypeAndStatus(tenantId, "purchases",      pending);
        long mothan        = stagedRepo.countByTenantIdAndFileTypeAndStatus(tenantId, "mothan",         pending);
        long total         = branchSales + employeeSales + purchases + mothan;
        return ResponseEntity.ok(Map.of(
            "success", true,
            "data", Map.of(
                "branch-sales",   branchSales,
                "employee-sales", employeeSales,
                "purchases",      purchases,
                "mothan",         mothan,
                "total",          total
            )
        ));
    }

    /** Save a staged record to the live v3 collection with optional user modifications. */
    @PostMapping("/{id}/save")
    public ResponseEntity<?> save(@PathVariable String id,
                                   @RequestBody(required = false) Map<String, Object> body) {
        String tenantId = TenantContext.getTenantId();
        V3StagedRecord rec = stagedRepo.findById(id).orElse(null);
        if (rec == null || !rec.getTenantId().equals(tenantId))
            return ResponseEntity.notFound().build();
        if (!"pending".equals(rec.getStatus()))
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Record is not pending"));

        Map<String, Object> modifications = body != null
            ? (Map<String, Object>) body.getOrDefault("modifications", Map.of())
            : Map.of();

        String error = insertToV3Collection(rec, modifications, tenantId);
        if (error != null)
            return ResponseEntity.internalServerError().body(Map.of("success", false, "message", error));

        markReviewed(id, tenantId, "saved");
        cache.invalidate(tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /** Accept the system's suggested fixes and save to v3 collection. */
    @PostMapping("/{id}/accept-suggestion")
    public ResponseEntity<?> acceptSuggestion(@PathVariable String id) {
        String tenantId = TenantContext.getTenantId();
        V3StagedRecord rec = stagedRepo.findById(id).orElse(null);
        if (rec == null || !rec.getTenantId().equals(tenantId))
            return ResponseEntity.notFound().build();
        if (!"pending".equals(rec.getStatus()))
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Record is not pending"));

        Map<String, Object> suggested = buildSuggestedFixes(rec);
        String error = insertToV3Collection(rec, suggested, tenantId);
        if (error != null)
            return ResponseEntity.internalServerError().body(Map.of("success", false, "message", error));

        markReviewed(id, tenantId, "saved_with_suggestion");
        cache.invalidate(tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /** Omit — record is not saved. Stays in staging for audit trail. */
    @PostMapping("/{id}/omit")
    public ResponseEntity<?> omit(@PathVariable String id) {
        String tenantId = TenantContext.getTenantId();
        V3StagedRecord rec = stagedRepo.findById(id).orElse(null);
        if (rec == null || !rec.getTenantId().equals(tenantId))
            return ResponseEntity.notFound().build();

        markReviewed(id, tenantId, "omitted");
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * Bulk accept all pending records where every issue has confidence >= minConfidence.
     * Body: { "minConfidence": 0.8, "fileType": "mothan" (optional) }
     */
    @PostMapping("/bulk-accept")
    public ResponseEntity<?> bulkAccept(@RequestBody Map<String, Object> body) {
        String tenantId    = TenantContext.getTenantId();
        double minConf     = body.containsKey("minConfidence")
            ? ((Number) body.get("minConfidence")).doubleValue() : 0.8;
        String fileTypeFilter = (String) body.get("fileType"); // optional

        List<V3StagedRecord> candidates = fileTypeFilter != null
            ? stagedRepo.findByTenantIdAndFileTypeAndStatus(tenantId, fileTypeFilter, "pending")
            : stagedRepo.findByTenantIdAndStatus(tenantId, "pending");

        int accepted = 0;
        int failed   = 0;
        for (V3StagedRecord rec : candidates) {
            // Only accept if ALL issues meet the confidence threshold
            boolean allHighConf = rec.getIssues() == null || rec.getIssues().stream()
                .allMatch(i -> i.getConfidence() >= minConf);
            if (!allHighConf) continue;

            Map<String, Object> suggested = buildSuggestedFixes(rec);
            String error = insertToV3Collection(rec, suggested, tenantId);
            if (error == null) {
                markReviewed(rec.getId(), tenantId, "saved_with_suggestion");
                accepted++;
            } else {
                log.warn("Bulk-accept failed for staged record {}: {}", rec.getId(), error);
                failed++;
            }
        }

        if (accepted > 0) cache.invalidate(tenantId);
        log.info("Bulk-accept: {} accepted, {} failed (minConf={}, fileType={})",
            accepted, failed, minConf, fileTypeFilter);
        return ResponseEntity.ok(Map.of(
            "success", true,
            "data", Map.of("accepted", accepted, "failed", failed)
        ));
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /** Build a field→suggestedValue map from the issues list. */
    private Map<String, Object> buildSuggestedFixes(V3StagedRecord rec) {
        if (rec.getIssues() == null) return Map.of();
        Map<String, Object> fixes = new LinkedHashMap<>();
        for (V3StagedRecord.FieldIssue issue : rec.getIssues()) {
            if (issue.getSuggestedValue() != null && !issue.getSuggestedValue().isBlank()) {
                fixes.put(issue.getField(), issue.getSuggestedValue());
            }
        }
        return fixes;
    }

    /**
     * Inserts the staged record's parsedRecord (with modifications applied) into
     * the appropriate live v3 collection. Returns null on success, error message on failure.
     */
    private String insertToV3Collection(V3StagedRecord rec,
                                         Map<String, Object> modifications,
                                         String tenantId) {
        String collection = collectionName(rec.getFileType());
        if (collection == null)
            return "Unknown fileType: " + rec.getFileType();

        try {
            Map<String, Object> recordMap = rec.getParsedRecord() != null
                ? new LinkedHashMap<>(rec.getParsedRecord())
                : new LinkedHashMap<>();

            // Apply modifications (user edits override parsed values)
            if (modifications != null) {
                modifications.forEach((key, val) -> {
                    if (val != null && !String.valueOf(val).isBlank()) {
                        // Convert numeric strings to appropriate types
                        if ("pieces".equals(key) || "sarAmount".equals(key)
                                || "pureWeightG".equals(key) || "grossWeightG".equals(key)) {
                            try { recordMap.put(key, ((Number) val).doubleValue()); }
                            catch (ClassCastException e) {
                                try { recordMap.put(key, Double.parseDouble(String.valueOf(val))); }
                                catch (NumberFormatException ignored) { recordMap.put(key, val); }
                            }
                        } else {
                            recordMap.put(key, val);
                        }
                    }
                });
            }

            // Strip any existing mongo _id before inserting (let Mongo assign a new one)
            recordMap.remove("id");
            recordMap.remove("_id");

            // Ensure tenantId is set
            recordMap.put("tenantId", tenantId);

            Document doc = new Document(recordMap);
            mongo.insert(doc, collection);
            log.info("Staged record {} inserted into {} (fileType={})", rec.getId(), collection, rec.getFileType());
            return null;
        } catch (Exception e) {
            log.error("Failed to insert staged record {} into {}: {}", rec.getId(), collection, e.getMessage());
            return e.getMessage();
        }
    }

    private void markReviewed(String id, String tenantId, String status) {
        mongo.updateFirst(
            Query.query(Criteria.where("id").is(id).and("tenantId").is(tenantId)),
            new Update()
                .set("status", status)
                .set("reviewedAt", LocalDateTime.now()),
            V3StagedRecord.class
        );
    }

    private static String collectionName(String fileType) {
        return switch (fileType) {
            case "branch-sales"   -> "v3_sale_transactions";
            case "employee-sales" -> "v3_employee_sale_transactions";
            case "purchases"      -> "v3_purchase_transactions";
            case "mothan"         -> "v3_mothan_transactions";
            default               -> null;
        };
    }
}
