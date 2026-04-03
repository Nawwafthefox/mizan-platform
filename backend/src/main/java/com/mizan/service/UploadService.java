package com.mizan.service;
import com.mizan.dto.FileBytes;
import com.mizan.model.*;
import com.mizan.repository.*;
import com.mizan.service.ExcelParserService.FileType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class UploadService {
    private final ExcelParserService parser;
    private final UploadProgressService progress;
    private final BranchSaleRepository saleRepo;
    private final BranchPurchaseRepository purchRepo;
    private final EmployeeSaleRepository empRepo;
    private final MothanTransactionRepository mothanRepo;
    private final UploadLogRepository logRepo;
    private final Executor uploadExecutor;
    private final com.mizan.repository.BranchPurchaseRateRepository rateRepo;
    private final MongoTemplate mongoTemplate;
    private final V3CacheService cache;

    public UploadService(ExcelParserService parser, UploadProgressService progress,
            BranchSaleRepository saleRepo, BranchPurchaseRepository purchRepo,
            EmployeeSaleRepository empRepo, MothanTransactionRepository mothanRepo,
            UploadLogRepository logRepo,
            @Qualifier("uploadExecutor") Executor uploadExecutor,
            com.mizan.repository.BranchPurchaseRateRepository rateRepo,
            MongoTemplate mongoTemplate,
            V3CacheService cache) {
        this.parser = parser; this.progress = progress;
        this.saleRepo = saleRepo; this.purchRepo = purchRepo;
        this.empRepo = empRepo; this.mothanRepo = mothanRepo;
        this.logRepo = logRepo; this.uploadExecutor = uploadExecutor;
        this.rateRepo = rateRepo; this.mongoTemplate = mongoTemplate;
        this.cache = cache;
    }

    // ─── Internal data holders ────────────────────────────────────────────────
    private record ParsedFile(String filename, ExcelParserService.ParseResult result, String error) {}
    private record FileResult(String filename, String fileType, int saved, int skipped, String error) {}

    // ─────────────────────────────────────────────────────────────────────────
    //  MAIN ENTRY — runs on a background thread via @Async (SimpleAsyncTaskExecutor)
    //  Inner CompletableFutures use uploadExecutor (bounded pool, no deadlock risk)
    // ─────────────────────────────────────────────────────────────────────────
    @Async
    public void processAsync(List<FileBytes> files, String uploadId,
            String tenantId, String userId) {

        int total = files.size();
        long t0 = System.currentTimeMillis();

        // ── Phase 1 (10%): Parse all files in parallel ──────────────────────
        sendSummary(uploadId, "parsing", "جاري تحليل " + total + " ملفات بالتوازي...", 10);

        List<CompletableFuture<ParsedFile>> futures = files.stream().map(fb ->
            CompletableFuture.supplyAsync(() -> {
                try {
                    var r = parser.parse(new ByteArrayInputStream(fb.bytes()),
                        fb.originalFilename(), tenantId, uploadId, userId);
                    return new ParsedFile(fb.originalFilename(), r, r.error());
                } catch (Exception e) {
                    return new ParsedFile(fb.originalFilename(), null, e.getMessage());
                }
            }, uploadExecutor)
        ).toList();

        List<ParsedFile> parsed = futures.stream()
            .map(f -> { try { return f.get(90, TimeUnit.SECONDS); }
                        catch (Exception e) { return null; } })
            .filter(Objects::nonNull)
            .toList();

        // ── Phase 2 (50%): Fetch existing sourceFileNames ONCE per collection ─
        sendSummary(uploadId, "deduplicate", "اكتمل التحليل — جاري التحقق من التكرار...", 50);

        Set<String> existingSales  = fetchKeys(saleRepo.findByTenantId(tenantId));
        Set<String> existingPurch  = fetchKeys(purchRepo.findByTenantId(tenantId));
        Set<String> existingEmp    = fetchKeys(empRepo.findByTenantId(tenantId));
        Set<String> existingMothan = fetchKeys(mothanRepo.findByTenantId(tenantId));

        // ── Phase 3: Collect new records by type, track per-file counts ──────
        List<BranchSale>          allNewSales  = new ArrayList<>();
        List<BranchPurchase>      allNewPurch  = new ArrayList<>();
        List<EmployeeSale>        allNewEmp    = new ArrayList<>();
        List<MothanTransaction>   allNewMothan = new ArrayList<>();

        List<FileResult> fileResults = new ArrayList<>();

        for (ParsedFile pf : parsed) {
            if (pf.error() != null || pf.result() == null) {
                String msg = pf.error() != null ? pf.error() : "فشل التحليل";
                fileResults.add(new FileResult(pf.filename(), "UNKNOWN", 0, 0, msg));
                continue;
            }
            var r = pf.result();
            int newCount = 0, skipCount = 0;
            switch (r.fileType()) {
                case BRANCH_SALES -> {
                    var newItems = r.sales().stream()
                        .filter(s -> !existingSales.contains(s.getSourceFileName())).toList();
                    newCount = newItems.size();
                    skipCount = r.sales().size() - newCount;
                    allNewSales.addAll(newItems);
                }
                case PURCHASES -> {
                    var newItems = r.purchases().stream()
                        .filter(p -> !existingPurch.contains(p.getSourceFileName())).toList();
                    newCount = newItems.size();
                    skipCount = r.purchases().size() - newCount;
                    allNewPurch.addAll(newItems);
                }
                case EMPLOYEE_SALES -> {
                    var newItems = r.empSales().stream()
                        .filter(e -> !existingEmp.contains(e.getSourceFileName())).toList();
                    newCount = newItems.size();
                    skipCount = r.empSales().size() - newCount;
                    allNewEmp.addAll(newItems);
                }
                case MOTHAN -> {
                    var newItems = r.mothan().stream()
                        .filter(m -> !existingMothan.contains(m.getSourceFileName())).toList();
                    newCount = newItems.size();
                    skipCount = r.mothan().size() - newCount;
                    allNewMothan.addAll(newItems);
                }
                default -> {}
            }
            fileResults.add(new FileResult(pf.filename(), r.fileType().name(), newCount, skipCount, null));
        }

        // ── Phase 4 (70%): Bulk save — one saveAll() per collection ──────────
        sendSummary(uploadId, "saving", "جاري الحفظ في قاعدة البيانات...", 70);

        int savedSales  = bulkSave(saleRepo,   allNewSales);
        int savedPurch  = bulkSave(purchRepo,  allNewPurch);
        int savedEmp    = bulkSave(empRepo,    allNewEmp);
        int savedMothan = bulkSave(mothanRepo, allNewMothan);

        int totalSaved   = savedSales + savedPurch + savedEmp + savedMothan;
        int totalSkipped = fileResults.stream().mapToInt(FileResult::skipped).sum();

        // ── Phase 5 (90%): Save per-file upload logs ─────────────────────────
        sendSummary(uploadId, "complete", "جاري الانتهاء...", 90);

        for (FileResult fr : fileResults) {
            if (fr.error() != null) {
                saveLog(tenantId, uploadId, fr.filename(), fr.fileType(), 0, 0, "ERROR", fr.error(), userId);
            } else {
                saveLog(tenantId, uploadId, fr.filename(), fr.fileType(), fr.saved(), fr.skipped(), "SUCCESS", null, userId);
            }
        }

        long elapsed = System.currentTimeMillis() - t0;
        log.info("Upload {} done in {}ms — saved={}, skipped={}", uploadId, elapsed, totalSaved, totalSkipped);

        cache.invalidate(tenantId);

        // ── Phase 6: Send final SSE "complete" event ─────────────────────────
        progress.send(uploadId, "complete", Map.of(
            "uploadId",      uploadId,
            "totalFiles",    total,
            "totalSaved",    totalSaved,
            "totalSkipped",  totalSkipped,
            "elapsedMs",     elapsed,
            "status",        "complete"
        ));
        progress.complete(uploadId);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** Fetch all existing sourceFileNames for a tenant as a HashSet (O(1) lookup). */
    private Set<String> fetchKeys(List<SourceFileProjection> projections) {
        return projections.stream()
            .map(SourceFileProjection::getSourceFileName)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    }

    /**
     * Bulk save. On DuplicateKeyException (race condition or missed dedup),
     * falls back to individual saves — rescues valid records, skips duplicates.
     */
    private <T> int bulkSave(MongoRepository<T, String> repo, List<T> items) {
        if (items.isEmpty()) return 0;
        try {
            repo.saveAll(items);
            return items.size();
        } catch (DuplicateKeyException e) {
            log.warn("Bulk save duplicate detected — falling back to individual saves ({} items)", items.size());
            int saved = 0;
            for (T item : items) {
                try { repo.save(item); saved++; }
                catch (DuplicateKeyException ignored) {}
            }
            return saved;
        }
    }

    /**
     * Batched insert with SSE progress reporting.
     * Splits items into 200-record batches to avoid MongoDB timeout / OOM on large files.
     * Reports progress from 60% → 90% while saving.
     *
     * IMPORTANT: on any batch failure we log and skip — we do NOT fall back to
     * individual saves. Individual fallback would do N sequential MongoDB operations
     * (one per record) which causes apparent hangs against Atlas when N is large.
     * For typed uploads (delete-then-insert) there should be no duplicates;
     * if a batch fails it's a real error that won't be fixed by retrying individually.
     */
    private <T> int bulkSaveBatched(MongoRepository<T, String> repo, List<T> items, String uploadId) {
        if (items.isEmpty()) return 0;
        final int BATCH = 200;
        int totalSaved = 0;
        int total = items.size();
        int batchNum = 0;
        int totalBatches = (total + BATCH - 1) / BATCH;
        log.info("bulkSaveBatched: {} total records, {} batches of {}", total, totalBatches, BATCH);
        for (int i = 0; i < total; i += BATCH) {
            batchNum++;
            List<T> batch = items.subList(i, Math.min(i + BATCH, total));
            log.info("Saving batch {}/{} ({} items)...", batchNum, totalBatches, batch.size());
            try {
                repo.saveAll(batch);
                totalSaved += batch.size();
                log.info("Batch {}/{} saved OK — total so far: {}/{}", batchNum, totalBatches, totalSaved, total);
            } catch (DuplicateKeyException e) {
                // Duplicate key = unique index conflict; individual retries would all fail too.
                // Log and skip the batch — caller should drop/avoid unique indexes for typed uploads.
                log.error("Batch {}/{} skipped — DuplicateKeyException (check unique indexes): {}",
                    batchNum, totalBatches, e.getMessage());
            } catch (Exception e) {
                log.error("Batch {}/{} failed: {}", batchNum, totalBatches, e.getMessage(), e);
            }
            int pct = 60 + (int)(30.0 * (i + batch.size()) / total);
            try {
                progress.send(uploadId, "progress", Map.of(
                    "uploadId", uploadId,
                    "phase", "saving",
                    "phaseAr", "جاري الحفظ... " + totalSaved + " / " + total,
                    "percentage", pct,
                    "savedRecords", totalSaved,
                    "status", "processing"
                ));
            } catch (Exception ignored) {}
        }
        log.info("bulkSaveBatched: {}/{} records saved", totalSaved, total);
        return totalSaved;
    }

    /** Send a single summary progress event (no per-file detail). */
    private void sendSummary(String uploadId, String phase, String phaseAr, int pct) {
        Map<String, Object> ev = new HashMap<>();
        ev.put("uploadId", uploadId);
        ev.put("phase", phase);
        ev.put("phaseAr", phaseAr);
        ev.put("percentage", pct);
        ev.put("status", "processing");
        ev.put("savedRecords", 0);
        progress.send(uploadId, "progress", ev);
    }

    /** Send a per-file progress event (used internally for error reporting). */
    private void sendProgress(String uploadId, String phase, String phaseAr,
            int current, int total, String fileName, String fileType,
            int pct, int saved, String status, String error) {
        Map<String, Object> ev = new HashMap<>();
        ev.put("uploadId", uploadId);
        ev.put("phase", phase);       ev.put("phaseAr", phaseAr);
        ev.put("currentFile", current); ev.put("totalFiles", total);
        ev.put("currentFileName", fileName); ev.put("fileType", fileType);
        ev.put("percentage", pct);    ev.put("savedRecords", saved);
        ev.put("status", status);     ev.put("errorMessage", error);
        progress.send(uploadId, "progress", ev);
    }

    private void saveLog(String tenantId, String batch, String fileName,
            String fileType, int saved, int skipped, String status, String error, String by) {
        UploadLog ul = new UploadLog();
        ul.setTenantId(tenantId); ul.setUploadBatch(batch);
        ul.setFileName(fileName); ul.setFileType(fileType);
        ul.setRecordsSaved(saved); ul.setRecordsSkipped(skipped);
        ul.setStatus(status); ul.setErrorMessage(error);
        ul.setUploadedBy(by); ul.setUploadedAt(LocalDateTime.now());
        logRepo.save(ul);
    }

    /**
     * Typed upload pipeline — DELETE-then-INSERT, no sourceFileName deduplication.
     * Uses MongoTemplate.remove() for reliable inclusive date-range deletes.
     */
    @Async
    public void processTypedAsync(List<FileBytes> files, String uploadId,
            String tenantId, String userId, FileType fileType, boolean replace) {

        int total = files.size();
        long t0 = System.currentTimeMillis();

        try {
        processTypedAsyncInternal(files, uploadId, tenantId, userId, fileType, replace, total, t0);
        } catch (Exception e) {
            log.error("processTypedAsync uncaught exception for uploadId={} type={}: {}",
                uploadId, fileType, e.getMessage(), e);
            progress.send(uploadId, "complete", Map.of(
                "uploadId",   uploadId,
                "totalSaved", 0,
                "totalFiles", total,
                "status",     "error",
                "error",      e.getMessage() != null ? e.getMessage() : "Upload failed"
            ));
            progress.complete(uploadId);
        }
    }

    private void processTypedAsyncInternal(List<FileBytes> files, String uploadId,
            String tenantId, String userId, FileType fileType, boolean replace,
            int total, long t0) {

        sendSummary(uploadId, "parsing", "جاري تحليل الملفات...", 10);

        // ── Phase 1: Parse all files sequentially with forced type ────────────
        List<ParsedFile> parsed = new ArrayList<>();
        for (FileBytes fb : files) {
            try {
                var r = parser.parseForced(new ByteArrayInputStream(fb.bytes()),
                    fb.originalFilename(), tenantId, uploadId, userId, fileType);
                parsed.add(new ParsedFile(fb.originalFilename(), r, r.error()));
            } catch (Exception e) {
                parsed.add(new ParsedFile(fb.originalFilename(), null, e.getMessage()));
            }
        }

        // ── Phase 2: Determine date range from actual record dates ────────────
        LocalDate minDate = null, maxDate = null;
        for (ParsedFile pf : parsed) {
            if (pf.result() == null) continue;
            var r = pf.result();
            // Use file-level date
            LocalDate fd = r.fileDate();
            if (fd != null) {
                if (minDate == null || fd.isBefore(minDate)) minDate = fd;
                if (maxDate == null || fd.isAfter(maxDate))  maxDate = fd;
            }
            // Also scan actual record dates for accuracy
            for (BranchSale s : r.sales()) {
                if (s.getSaleDate() == null) continue;
                if (minDate == null || s.getSaleDate().isBefore(minDate)) minDate = s.getSaleDate();
                if (maxDate == null || s.getSaleDate().isAfter(maxDate))  maxDate = s.getSaleDate();
            }
            for (EmployeeSale s : r.empSales()) {
                if (s.getSaleDate() == null) continue;
                if (minDate == null || s.getSaleDate().isBefore(minDate)) minDate = s.getSaleDate();
                if (maxDate == null || s.getSaleDate().isAfter(maxDate))  maxDate = s.getSaleDate();
            }
            for (BranchPurchase p : r.purchases()) {
                if (p.getPurchaseDate() == null) continue;
                if (minDate == null || p.getPurchaseDate().isBefore(minDate)) minDate = p.getPurchaseDate();
                if (maxDate == null || p.getPurchaseDate().isAfter(maxDate))  maxDate = p.getPurchaseDate();
            }
            for (MothanTransaction m : r.mothan()) {
                if (m.getTransactionDate() == null) continue;
                if (minDate == null || m.getTransactionDate().isBefore(minDate)) minDate = m.getTransactionDate();
                if (maxDate == null || m.getTransactionDate().isAfter(maxDate))  maxDate = m.getTransactionDate();
            }
        }

        // ── Phase 3: DELETE existing records via MongoTemplate (reliable >=/<= bounds) ─
        sendSummary(uploadId, "deleting", "جاري حذف البيانات القديمة...", 40);
        if (replace && minDate != null && maxDate != null) {
            log.info("Typed upload ({}): deleting tenant={} records from {} to {}", fileType, tenantId, minDate, maxDate);
            try {
                long deleted = 0;
                switch (fileType) {
                    case BRANCH_SALES -> deleted = mongoTemplate.remove(
                        Query.query(Criteria.where("tenantId").is(tenantId).and("saleDate").gte(minDate).lte(maxDate)),
                        BranchSale.class).getDeletedCount();
                    case EMPLOYEE_SALES -> deleted = mongoTemplate.remove(
                        Query.query(Criteria.where("tenantId").is(tenantId).and("saleDate").gte(minDate).lte(maxDate)),
                        EmployeeSale.class).getDeletedCount();
                    case PURCHASES -> deleted = mongoTemplate.remove(
                        Query.query(Criteria.where("tenantId").is(tenantId).and("purchaseDate").gte(minDate).lte(maxDate)),
                        BranchPurchase.class).getDeletedCount();
                    case MOTHAN -> deleted = mongoTemplate.remove(
                        Query.query(Criteria.where("tenantId").is(tenantId).and("transactionDate").gte(minDate).lte(maxDate)),
                        MothanTransaction.class).getDeletedCount();
                    default -> {}
                }
                log.info("Deleted {} existing {} records for tenant={}", deleted, fileType, tenantId);
            } catch (Exception e) {
                log.error("Delete step failed for {} uploadId={}: {} — continuing with insert", fileType, uploadId, e.getMessage(), e);
                // Don't abort — proceed to insert even if delete failed
            }
        } else {
            log.info("Delete skipped: replace={}, minDate={}, maxDate={}", replace, minDate, maxDate);
        }

        // ── Phase 4: INSERT all records in batches ───────────────────────────
        sendSummary(uploadId, "saving", "جاري حفظ البيانات...", 60);

        int totalSaved = 0;
        List<FileResult> fileResults = new ArrayList<>();

        // Collect all records first so we can report progress across files
        List<BranchSale>        allSales   = new ArrayList<>();
        List<EmployeeSale>      allEmp     = new ArrayList<>();
        List<BranchPurchase>    allPurch   = new ArrayList<>();
        List<MothanTransaction> allMothan  = new ArrayList<>();
        List<String>            parseErrors = new ArrayList<>();

        for (ParsedFile pf : parsed) {
            if (pf.error() != null || pf.result() == null) {
                parseErrors.add(pf.filename() + ": " + (pf.error() != null ? pf.error() : "فشل التحليل"));
                continue;
            }
            var r = pf.result();
            allSales.addAll(r.sales());
            allEmp.addAll(r.empSales());
            allPurch.addAll(r.purchases());
            allMothan.addAll(r.mothan());
        }

        int saved = switch (fileType) {
            case BRANCH_SALES   -> bulkSaveBatched(saleRepo,   allSales,   uploadId);
            case EMPLOYEE_SALES -> bulkSaveBatched(empRepo,    allEmp,     uploadId);
            case PURCHASES      -> bulkSaveBatched(purchRepo,  allPurch,   uploadId);
            case MOTHAN         -> bulkSaveBatched(mothanRepo, allMothan,  uploadId);
            default -> 0;
        };
        totalSaved = saved;

        String firstFilename = parsed.isEmpty() ? "" : parsed.get(0).filename();
        if (!parseErrors.isEmpty()) {
            for (String err : parseErrors)
                fileResults.add(new FileResult(err, fileType.name(), 0, 0, err));
        }
        fileResults.add(new FileResult(firstFilename, fileType.name(), saved, 0, null));

        // ── Phase 5: Logs + complete event ───────────────────────────────────
        sendSummary(uploadId, "complete", "جاري الانتهاء...", 90);
        for (FileResult fr : fileResults) {
            saveLog(tenantId, uploadId, fr.filename(), fr.fileType(), fr.saved(), 0,
                fr.error() != null ? "ERROR" : "SUCCESS", fr.error(), userId);
        }

        long elapsed = System.currentTimeMillis() - t0;
        log.info("Typed upload {} ({}) done in {}ms — saved={}", uploadId, fileType, elapsed, totalSaved);

        cache.invalidate(tenantId);

        progress.send(uploadId, "complete", Map.of(
            "uploadId",   uploadId,
            "totalFiles", total,
            "totalSaved", totalSaved,
            "totalSkipped", 0,
            "elapsedMs",  elapsed,
            "status",     "complete"
        ));
        progress.complete(uploadId);
    }

    public int syncEmployeePurchaseRates(String tenantId) {
        List<com.mizan.model.BranchPurchaseRate> rates = rateRepo.findByTenantId(tenantId);
        if (rates.isEmpty()) return 0;
        int count = 0;
        for (com.mizan.model.BranchPurchaseRate rate : rates) {
            if (rate.getPurchaseRate() <= 0) continue;
            List<com.mizan.model.EmployeeSale> emps = empRepo.findByTenantAndBranch(tenantId, rate.getBranchCode());
            for (com.mizan.model.EmployeeSale e : emps) {
                e.setBranchPurchaseAvg(rate.getPurchaseRate());
                double saleRate = e.getNetWeight() != 0 ? e.getTotalSarAmount() / e.getNetWeight() : 0;
                double diff = Math.round((saleRate - rate.getPurchaseRate()) * 10000.0) / 10000.0;
                double profitMargin = rate.getPurchaseRate() > 0
                    ? Math.round(e.getNetWeight() * diff * 100) / 100.0 : 0;
                e.setDiffAvg(diff);
                e.setProfitMargin(profitMargin);
                e.setAchievedTarget(saleRate > rate.getPurchaseRate());
            }
            if (!emps.isEmpty()) {
                empRepo.saveAll(emps);
                count++;
            }
        }
        return count;
    }
}
