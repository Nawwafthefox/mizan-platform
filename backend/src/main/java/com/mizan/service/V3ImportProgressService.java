package com.mizan.service;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class V3ImportProgressService {

    private static final long EVICT_AFTER_MS = 30 * 60 * 1000L;
    private final ConcurrentHashMap<String, ImportProgress> progressMap = new ConcurrentHashMap<>();

    @Data
    public static class ImportProgress {
        String importId;
        String overallStatus;       // parsing, discovering, validating, saving, complete, error
        int currentStep;            // 1-8
        int totalSteps = 8;
        int overallPct;             // 0-100
        String currentStepNameAr;

        // Per-file parse results
        Map<String, FileResult> parseResults = new LinkedHashMap<>();

        // Discovery
        int knownBranches, newBranches;
        int knownEmployees, newEmployees;

        // Save progress per collection
        Map<String, SaveProgress> saveProgress = new LinkedHashMap<>();

        // Final results
        int totalAutoSaved;
        int totalStaged;
        int totalParsed;
        double importConfidence;
        String error;
        long startedAt;
        long completedAt;
    }

    @Data
    public static class FileResult {
        int rows;
        String status;  // "parsing", "done", "skipped"
        String fileName;
    }

    @Data
    public static class SaveProgress {
        int saved;
        int total;
        int staged;
        String status; // "pending", "saving", "done"
    }

    public ImportProgress start(String importId) {
        evictOld();
        ImportProgress p = new ImportProgress();
        p.importId = importId;
        p.overallStatus = "parsing";
        p.currentStep = 1;
        p.overallPct = 0;
        p.currentStepNameAr = "تحليل الملفات...";
        p.startedAt = System.currentTimeMillis();
        progressMap.put(importId, p);
        log.info("Import {} started", importId);
        return p;
    }

    public void updateStep(String importId, int step, String stepNameAr, int pct) {
        ImportProgress p = progressMap.get(importId);
        if (p == null) return;
        p.currentStep = step;
        p.currentStepNameAr = stepNameAr;
        p.overallPct = pct;
        p.overallStatus = stepToStatus(step);
    }

    public void updateParseResult(String importId, String fileType, int rows, String fileName) {
        ImportProgress p = progressMap.get(importId);
        if (p == null) return;
        FileResult fr = new FileResult();
        fr.rows = rows;
        fr.status = "done";
        fr.fileName = fileName;
        p.parseResults.put(fileType, fr);
    }

    public void updateDiscovery(String importId, int knownBranches, int newBranches,
                                 int knownEmployees, int newEmployees) {
        ImportProgress p = progressMap.get(importId);
        if (p == null) return;
        p.knownBranches = knownBranches;
        p.newBranches = newBranches;
        p.knownEmployees = knownEmployees;
        p.newEmployees = newEmployees;
    }

    public void updateSaveProgress(String importId, String fileType, int saved, int total, int staged) {
        ImportProgress p = progressMap.get(importId);
        if (p == null) return;
        SaveProgress sp = p.saveProgress.computeIfAbsent(fileType, k -> new SaveProgress());
        sp.saved = saved;
        sp.total = total;
        sp.staged = staged;
        sp.status = saved >= total ? "done" : "saving";
    }

    public void complete(String importId, int totalAutoSaved, int totalStaged, int totalParsed) {
        ImportProgress p = progressMap.get(importId);
        if (p == null) return;
        p.overallStatus = "complete";
        p.currentStep = 8;
        p.overallPct = 100;
        p.currentStepNameAr = "اكتمل";
        p.totalAutoSaved = totalAutoSaved;
        p.totalStaged = totalStaged;
        p.totalParsed = totalParsed;
        p.importConfidence = totalParsed > 0 ? (double) totalAutoSaved / totalParsed : 0.0;
        p.completedAt = System.currentTimeMillis();
        log.info("Import {} complete — {} auto-saved, {} staged, confidence {}",
            importId, totalAutoSaved, totalStaged, Math.round(p.importConfidence * 10000) / 100.0);
    }

    public void error(String importId, String error) {
        ImportProgress p = progressMap.get(importId);
        if (p == null) return;
        p.overallStatus = "error";
        p.error = error;
        p.completedAt = System.currentTimeMillis();
        log.error("Import {} error: {}", importId, error);
    }

    public ImportProgress get(String importId) {
        return progressMap.get(importId);
    }

    private String stepToStatus(int step) {
        return switch (step) {
            case 1 -> "parsing";
            case 2, 3, 4 -> "discovering";
            case 5 -> "validating";
            case 6, 7 -> "saving";
            case 8 -> "complete";
            default -> "unknown";
        };
    }

    private void evictOld() {
        long cutoff = System.currentTimeMillis() - EVICT_AFTER_MS;
        progressMap.entrySet().removeIf(e -> {
            ImportProgress p = e.getValue();
            long ts = p.completedAt > 0 ? p.completedAt : p.startedAt;
            boolean finished = "complete".equals(p.overallStatus) || "error".equals(p.overallStatus);
            return finished && ts < cutoff;
        });
    }
}
