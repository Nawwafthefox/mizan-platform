package com.mizan.controller;

import com.mizan.model.V3Branch;
import com.mizan.model.V3StagedRecord;
import com.mizan.repository.V3BranchRepository;
import com.mizan.repository.V3RegionRepository;
import com.mizan.repository.V3StagedRecordRepository;
import com.mizan.security.TenantContext;
import com.mizan.service.*;
import lombok.extern.slf4j.Slf4j;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/v3/import")
public class V3UnifiedImportController {

    private final V3UnifiedImportService importSvc;
    private final V3ImportProgressService progressSvc;
    private final V3StagedRecordRepository stagedRepo;
    private final V3BranchRepository branchRepo;
    private final V3RegionRepository regionRepo;
    private final BranchLookupService branchLookup;
    private final V3CacheService cache;
    private final MongoTemplate mongo;

    public V3UnifiedImportController(V3UnifiedImportService importSvc,
                                      V3ImportProgressService progressSvc,
                                      V3StagedRecordRepository stagedRepo,
                                      V3BranchRepository branchRepo,
                                      V3RegionRepository regionRepo,
                                      BranchLookupService branchLookup,
                                      V3CacheService cache,
                                      MongoTemplate mongo) {
        this.importSvc = importSvc;
        this.progressSvc = progressSvc;
        this.stagedRepo = stagedRepo;
        this.branchRepo = branchRepo;
        this.regionRepo = regionRepo;
        this.branchLookup = branchLookup;
        this.cache = cache;
        this.mongo = mongo;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED IMPORT
    // ═══════════════════════════════════════════════════════════════════════════

    @PostMapping("/unified")
    public ResponseEntity<?> unifiedImport(
            @RequestParam(value = "branchSales", required = false) MultipartFile branchSales,
            @RequestParam(value = "employeeSales", required = false) MultipartFile employeeSales,
            @RequestParam(value = "purchases", required = false) MultipartFile purchases,
            @RequestParam(value = "mothan", required = false) MultipartFile mothan) throws Exception {

        String tenantId = TenantContext.getTenantId();
        String userId = tenantId; // userId not tracked in TenantContext
        String importId = UUID.randomUUID().toString();

        // Read all bytes eagerly in request thread
        Map<String, byte[]> files = new LinkedHashMap<>();
        Map<String, String> fileNames = new LinkedHashMap<>();

        if (branchSales != null && !branchSales.isEmpty()) {
            files.put("branchSales", branchSales.getBytes());
            fileNames.put("branchSales", branchSales.getOriginalFilename());
        }
        if (employeeSales != null && !employeeSales.isEmpty()) {
            files.put("employeeSales", employeeSales.getBytes());
            fileNames.put("employeeSales", employeeSales.getOriginalFilename());
        }
        if (purchases != null && !purchases.isEmpty()) {
            files.put("purchases", purchases.getBytes());
            fileNames.put("purchases", purchases.getOriginalFilename());
        }
        if (mothan != null && !mothan.isEmpty()) {
            files.put("mothan", mothan.getBytes());
            fileNames.put("mothan", mothan.getOriginalFilename());
        }

        if (files.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false, "message", "يجب رفع ملف واحد على الأقل"));
        }

        progressSvc.start(importId);

        Thread worker = new Thread(() -> {
            importSvc.runUnifiedImport(importId, tenantId, userId, files, fileNames);
        }, "v3-unified-import-" + importId.substring(0, 8));
        worker.setDaemon(true);
        worker.start();

        return ResponseEntity.accepted().body(Map.of(
            "success", true,
            "data", Map.of("importId", importId),
            "message", "Import started — poll /api/v3/import/progress/" + importId
        ));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROGRESS
    // ═══════════════════════════════════════════════════════════════════════════

    @GetMapping("/progress/{importId}")
    public ResponseEntity<?> getProgress(@PathVariable String importId) {
        V3ImportProgressService.ImportProgress p = progressSvc.get(importId);
        if (p == null) return ResponseEntity.notFound().build();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("importId", p.getImportId());
        data.put("overallStatus", p.getOverallStatus());
        data.put("currentStep", p.getCurrentStep());
        data.put("totalSteps", p.getTotalSteps());
        data.put("overallPct", p.getOverallPct());
        data.put("currentStepNameAr", p.getCurrentStepNameAr());
        data.put("parseResults", p.getParseResults());
        data.put("knownBranches", p.getKnownBranches());
        data.put("newBranches", p.getNewBranches());
        data.put("knownEmployees", p.getKnownEmployees());
        data.put("newEmployees", p.getNewEmployees());
        data.put("saveProgress", p.getSaveProgress());
        data.put("totalAutoSaved", p.getTotalAutoSaved());
        data.put("totalStaged", p.getTotalStaged());
        data.put("totalParsed", p.getTotalParsed());
        data.put("importConfidence", p.getImportConfidence());
        data.put("error", p.getError());
        data.put("startedAt", p.getStartedAt());
        data.put("completedAt", p.getCompletedAt());

        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STAGED REVIEW
    // ═══════════════════════════════════════════════════════════════════════════

    @GetMapping("/staged")
    public ResponseEntity<?> listStaged(
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

    @GetMapping("/staged/counts")
    public ResponseEntity<?> stagedCounts() {
        String tenantId = TenantContext.getTenantId();
        String pending = "pending";
        long branchSales = stagedRepo.countByTenantIdAndFileTypeAndStatus(tenantId, "branch-sales", pending);
        long employeeSales = stagedRepo.countByTenantIdAndFileTypeAndStatus(tenantId, "employee-sales", pending);
        long purchasesCount = stagedRepo.countByTenantIdAndFileTypeAndStatus(tenantId, "purchases", pending);
        long mothanCount = stagedRepo.countByTenantIdAndFileTypeAndStatus(tenantId, "mothan", pending);
        long total = branchSales + employeeSales + purchasesCount + mothanCount;
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of(
            "branch-sales", branchSales,
            "employee-sales", employeeSales,
            "purchases", purchasesCount,
            "mothan", mothanCount,
            "total", total
        )));
    }

    @PostMapping("/staged/{id}/save")
    public ResponseEntity<?> saveStaged(@PathVariable String id,
                                         @RequestBody(required = false) Map<String, Object> body) {
        String tenantId = TenantContext.getTenantId();
        V3StagedRecord rec = stagedRepo.findById(id).orElse(null);
        if (rec == null || !rec.getTenantId().equals(tenantId))
            return ResponseEntity.notFound().build();
        if (!"pending".equals(rec.getStatus()))
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Record is not pending"));

        @SuppressWarnings("unchecked")
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

    @PostMapping("/staged/{id}/accept")
    public ResponseEntity<?> acceptSuggestion(@PathVariable String id) {
        String tenantId = TenantContext.getTenantId();
        V3StagedRecord rec = stagedRepo.findById(id).orElse(null);
        if (rec == null || !rec.getTenantId().equals(tenantId))
            return ResponseEntity.notFound().build();
        if (!"pending".equals(rec.getStatus()))
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Record is not pending"));

        Map<String, Object> suggested = rec.getSuggestedFixes() != null ? rec.getSuggestedFixes() : Map.of();
        String error = insertToV3Collection(rec, suggested, tenantId);
        if (error != null)
            return ResponseEntity.internalServerError().body(Map.of("success", false, "message", error));

        markReviewed(id, tenantId, "saved_with_suggestion");
        cache.invalidate(tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/staged/{id}/omit")
    public ResponseEntity<?> omitStaged(@PathVariable String id) {
        String tenantId = TenantContext.getTenantId();
        V3StagedRecord rec = stagedRepo.findById(id).orElse(null);
        if (rec == null || !rec.getTenantId().equals(tenantId))
            return ResponseEntity.notFound().build();

        markReviewed(id, tenantId, "omitted");
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/staged/bulk-accept")
    public ResponseEntity<?> bulkAccept(@RequestBody Map<String, Object> body) {
        String tenantId = TenantContext.getTenantId();
        double minConf = body.containsKey("minConfidence")
            ? ((Number) body.get("minConfidence")).doubleValue() : 0.8;
        String fileTypeFilter = (String) body.get("fileType");

        List<V3StagedRecord> candidates = fileTypeFilter != null
            ? stagedRepo.findByTenantIdAndFileTypeAndStatus(tenantId, fileTypeFilter, "pending")
            : stagedRepo.findByTenantIdAndStatus(tenantId, "pending");

        int accepted = 0, failed = 0;
        for (V3StagedRecord rec : candidates) {
            boolean allHighConf = rec.getIssues() == null || rec.getIssues().stream()
                .allMatch(i -> i.getConfidence() >= minConf);
            if (!allHighConf) continue;

            Map<String, Object> suggested = rec.getSuggestedFixes() != null ? rec.getSuggestedFixes() : Map.of();
            String error = insertToV3Collection(rec, suggested, tenantId);
            if (error == null) {
                markReviewed(rec.getId(), tenantId, "saved_with_suggestion");
                accepted++;
            } else {
                log.warn("Bulk-accept failed for {}: {}", rec.getId(), error);
                failed++;
            }
        }

        if (accepted > 0) cache.invalidate(tenantId);
        return ResponseEntity.ok(Map.of("success", true,
            "data", Map.of("accepted", accepted, "failed", failed)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BRANCH MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    @GetMapping("/branches")
    public ResponseEntity<?> listBranches() {
        String tenantId = TenantContext.getTenantId();
        List<V3Branch> branches = branchRepo.findByTenantIdOrderByBranchCodeAsc(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", branches));
    }

    @PutMapping("/branches/{code}")
    public ResponseEntity<?> updateBranch(@PathVariable String code,
                                           @RequestBody Map<String, Object> body) {
        String tenantId = TenantContext.getTenantId();
        Optional<V3Branch> opt = branchRepo.findByTenantIdAndBranchCode(tenantId, code);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();

        V3Branch branch = opt.get();
        if (body.containsKey("branchName")) branch.setBranchName((String) body.get("branchName"));
        if (body.containsKey("branchNameEn")) branch.setBranchNameEn((String) body.get("branchNameEn"));
        if (body.containsKey("regionId")) {
            int regionId = ((Number) body.get("regionId")).intValue();
            branch.setRegionId(regionId);
            branch.setRegionName(BranchLookupService.guessRegionName(regionId));
        }
        if (body.containsKey("city")) branch.setCity((String) body.get("city"));
        if (body.containsKey("status")) branch.setStatus((String) body.get("status"));

        branch.setUpdatedAt(LocalDateTime.now());
        branch.setUpdatedBy(tenantId);
        // Mark active if name was set and was pending
        if ("pending_name".equals(branch.getStatus()) && branch.getBranchName() != null
                && !branch.getBranchName().equals(branch.getBranchCode())) {
            branch.setStatus("active");
        }
        branchRepo.save(branch);
        branchLookup.invalidateCache(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", branch));
    }

    @PostMapping("/branches")
    public ResponseEntity<?> createBranch(@RequestBody Map<String, Object> body) {
        String tenantId = TenantContext.getTenantId();
        String code = (String) body.get("branchCode");
        if (code == null || code.isBlank())
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "branchCode required"));

        Optional<V3Branch> existing = branchRepo.findByTenantIdAndBranchCode(tenantId, code);
        if (existing.isPresent())
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Branch already exists"));

        V3Branch b = new V3Branch();
        b.setTenantId(tenantId);
        b.setBranchCode(code);
        b.setBranchName((String) body.getOrDefault("branchName", code));
        if (body.containsKey("regionId")) {
            int regionId = ((Number) body.get("regionId")).intValue();
            b.setRegionId(regionId);
            b.setRegionName(BranchLookupService.guessRegionName(regionId));
        }
        b.setCity((String) body.get("city"));
        b.setStatus("active");
        b.setAutoDiscovered(false);
        b.setCreatedAt(LocalDateTime.now());
        branchRepo.save(b);
        branchLookup.invalidateCache(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", b));
    }

    @PostMapping("/branches/seed")
    public ResponseEntity<?> seedBranches() {
        String tenantId = TenantContext.getTenantId();
        int seeded = importSvc.seedKnownBranches(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of("seeded", seeded)));
    }

    @GetMapping("/branches/pending-count")
    public ResponseEntity<?> pendingBranchCount() {
        String tenantId = TenantContext.getTenantId();
        long count = branchRepo.countByTenantIdAndStatus(tenantId, "pending_name");
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of("count", count)));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WIPE
    // ═══════════════════════════════════════════════════════════════════════════

    @DeleteMapping("/wipe")
    public ResponseEntity<?> wipeV3Data() {
        String tenantId = TenantContext.getTenantId();
        importSvc.wipeV3Data(tenantId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    private String insertToV3Collection(V3StagedRecord rec, Map<String, Object> modifications, String tenantId) {
        String collection = collectionName(rec.getFileType());
        if (collection == null) return "Unknown fileType: " + rec.getFileType();

        try {
            Map<String, Object> recordMap = rec.getParsedRecord() != null
                ? new LinkedHashMap<>(rec.getParsedRecord()) : new LinkedHashMap<>();

            if (modifications != null) {
                modifications.forEach((key, val) -> {
                    if (val != null && !String.valueOf(val).isBlank()) {
                        if ("pieces".equals(key) || "sarAmount".equals(key)
                                || "pureWeightG".equals(key) || "grossWeightG".equals(key)
                                || "amountSar".equals(key)) {
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

            recordMap.remove("id");
            recordMap.remove("_id");
            recordMap.put("tenantId", tenantId);

            Document doc = new Document(recordMap);
            mongo.insert(doc, collection);
            log.info("Staged {} inserted into {}", rec.getId(), collection);

            // Recompute rates if mothan or purchase was saved
            if ("mothan".equals(rec.getFileType()) || "purchases".equals(rec.getFileType())) {
                importSvc.recomputePurchaseRates(tenantId);
            }

            return null;
        } catch (Exception e) {
            log.error("Failed to insert staged {} into {}: {}", rec.getId(), collection, e.getMessage());
            return e.getMessage();
        }
    }

    private void markReviewed(String id, String tenantId, String status) {
        mongo.updateFirst(
            Query.query(Criteria.where("id").is(id).and("tenantId").is(tenantId)),
            new Update().set("status", status).set("reviewedAt", LocalDateTime.now()),
            V3StagedRecord.class
        );
    }

    private static String collectionName(String fileType) {
        return switch (fileType) {
            case "branch-sales" -> "v3_sale_transactions";
            case "employee-sales" -> "v3_employee_sale_transactions";
            case "purchases" -> "v3_purchase_transactions";
            case "mothan" -> "v3_mothan_transactions";
            default -> null;
        };
    }
}
