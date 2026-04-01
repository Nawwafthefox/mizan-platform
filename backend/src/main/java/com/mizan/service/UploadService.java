package com.mizan.service;
import com.mizan.dto.FileBytes;
import com.mizan.model.*;
import com.mizan.repository.*;
import com.mizan.service.ExcelParserService.FileType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DuplicateKeyException;
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

    public UploadService(ExcelParserService parser, UploadProgressService progress,
            BranchSaleRepository saleRepo, BranchPurchaseRepository purchRepo,
            EmployeeSaleRepository empRepo, MothanTransactionRepository mothanRepo,
            UploadLogRepository logRepo,
            @Qualifier("uploadExecutor") Executor uploadExecutor,
            com.mizan.repository.BranchPurchaseRateRepository rateRepo) {
        this.parser = parser; this.progress = progress;
        this.saleRepo = saleRepo; this.purchRepo = purchRepo;
        this.empRepo = empRepo; this.mothanRepo = mothanRepo;
        this.logRepo = logRepo; this.uploadExecutor = uploadExecutor;
        this.rateRepo = rateRepo;
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
     * Typed upload pipeline — forces a specific FileType, optionally deletes existing data
     * for the file's date range before inserting. Skips sourceFileName deduplication.
     */
    @Async
    public void processTypedAsync(List<FileBytes> files, String uploadId,
            String tenantId, String userId, FileType fileType, boolean replace) {

        int total = files.size();
        long t0 = System.currentTimeMillis();

        sendSummary(uploadId, "parsing", "جاري تحليل " + total + " ملفات...", 10);

        // Parse all files in parallel using forced type
        List<CompletableFuture<ParsedFile>> futures = files.stream().map(fb ->
            CompletableFuture.supplyAsync(() -> {
                try {
                    var r = parser.parseForced(new ByteArrayInputStream(fb.bytes()),
                        fb.originalFilename(), tenantId, uploadId, userId, fileType);
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

        sendSummary(uploadId, "replace", "جاري حذف البيانات القديمة إن وجدت...", 40);

        // Collect all records and determine date ranges for replace
        List<BranchSale>        allSales  = new ArrayList<>();
        List<BranchPurchase>    allPurch  = new ArrayList<>();
        List<EmployeeSale>      allEmp    = new ArrayList<>();
        List<MothanTransaction> allMothan = new ArrayList<>();
        List<FileResult>        fileResults = new ArrayList<>();

        // Collect date range across all parsed files for bulk delete
        LocalDate minDate = null, maxDate = null;

        for (ParsedFile pf : parsed) {
            if (pf.error() != null || pf.result() == null) {
                fileResults.add(new FileResult(pf.filename(), fileType.name(), 0, 0,
                    pf.error() != null ? pf.error() : "فشل التحليل"));
                continue;
            }
            var r = pf.result();
            LocalDate fd = r.fileDate();
            if (fd != null) {
                if (minDate == null || fd.isBefore(minDate)) minDate = fd;
                if (maxDate == null || fd.isAfter(maxDate)) maxDate = fd;
            }
            switch (fileType) {
                case BRANCH_SALES   -> { allSales.addAll(r.sales());       fileResults.add(new FileResult(pf.filename(), fileType.name(), r.sales().size(), 0, null)); }
                case EMPLOYEE_SALES -> { allEmp.addAll(r.empSales());      fileResults.add(new FileResult(pf.filename(), fileType.name(), r.empSales().size(), 0, null)); }
                case PURCHASES      -> { allPurch.addAll(r.purchases());   fileResults.add(new FileResult(pf.filename(), fileType.name(), r.purchases().size(), 0, null)); }
                case MOTHAN         -> { allMothan.addAll(r.mothan());     fileResults.add(new FileResult(pf.filename(), fileType.name(), r.mothan().size(), 0, null)); }
                default             -> fileResults.add(new FileResult(pf.filename(), fileType.name(), 0, 0, "نوع ملف غير معروف"));
            }
        }

        // Delete existing records in the date range before inserting
        if (replace && minDate != null && maxDate != null) {
            switch (fileType) {
                case BRANCH_SALES   -> saleRepo.deleteByTenantIdAndSaleDateBetween(tenantId, minDate, maxDate);
                case EMPLOYEE_SALES -> empRepo.deleteByTenantIdAndSaleDateBetween(tenantId, minDate, maxDate);
                case PURCHASES      -> purchRepo.deleteByTenantIdAndPurchaseDateBetween(tenantId, minDate, maxDate);
                case MOTHAN         -> mothanRepo.deleteByTenantIdAndTransactionDateBetween(tenantId, minDate, maxDate);
                default -> {}
            }
            log.info("Typed upload ({}): deleted records for tenant={} range={} to {}", fileType, tenantId, minDate, maxDate);
        }

        sendSummary(uploadId, "saving", "جاري الحفظ في قاعدة البيانات...", 70);

        int savedSales  = bulkSave(saleRepo,   allSales);
        int savedPurch  = bulkSave(purchRepo,  allPurch);
        int savedEmp    = bulkSave(empRepo,    allEmp);
        int savedMothan = bulkSave(mothanRepo, allMothan);
        int totalSaved  = savedSales + savedPurch + savedEmp + savedMothan;

        sendSummary(uploadId, "complete", "جاري الانتهاء...", 90);

        for (FileResult fr : fileResults) {
            if (fr.error() != null) {
                saveLog(tenantId, uploadId, fr.filename(), fr.fileType(), 0, 0, "ERROR", fr.error(), userId);
            } else {
                saveLog(tenantId, uploadId, fr.filename(), fr.fileType(), fr.saved(), fr.skipped(), "SUCCESS", null, userId);
            }
        }

        long elapsed = System.currentTimeMillis() - t0;
        log.info("Typed upload {} ({}) done in {}ms — saved={}", uploadId, fileType, elapsed, totalSaved);

        progress.send(uploadId, "complete", Map.of(
            "uploadId",   uploadId,
            "totalFiles", total,
            "totalSaved", totalSaved,
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
                double diff = Math.round((saleRate - rate.getPurchaseRate()) * 10) / 10.0;
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
