package com.mizan.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

/**
 * In-process import status tracker for V3 uploads.
 * Key: importId (UUID string). Evicts completed entries after 30 min.
 */
@Slf4j
@Service
public class V3ImportStatusService {

    private static final long EVICT_AFTER_MS = 30 * 60 * 1000L;

    private final ConcurrentHashMap<String, ImportStatus> statuses = new ConcurrentHashMap<>();

    public record ImportStatus(
        String status,      // "parsing" | "deleting" | "saving" | "complete" | "error"
        int    parsed,
        int    saved,
        int    total,
        String error,
        long   startedAt,
        long   completedAt
    ) {}

    public void start(String importId) {
        evictOld();
        statuses.put(importId, new ImportStatus("parsing", 0, 0, 0, null,
            System.currentTimeMillis(), 0));
        log.info("Import {} started", importId);
    }

    public void update(String importId, String status, int parsed, int saved, int total) {
        ImportStatus prev = statuses.get(importId);
        statuses.put(importId, new ImportStatus(status, parsed, saved, total, null,
            prev != null ? prev.startedAt() : System.currentTimeMillis(), 0));
    }

    public void complete(String importId, int saved) {
        ImportStatus prev = statuses.get(importId);
        statuses.put(importId, new ImportStatus("complete", saved, saved, saved, null,
            prev != null ? prev.startedAt() : 0, System.currentTimeMillis()));
        log.info("Import {} complete — {} saved", importId, saved);
    }

    public void error(String importId, String error) {
        ImportStatus prev = statuses.get(importId);
        statuses.put(importId, new ImportStatus("error",
            prev != null ? prev.parsed() : 0,
            prev != null ? prev.saved()  : 0,
            prev != null ? prev.total()  : 0,
            error,
            prev != null ? prev.startedAt() : 0, System.currentTimeMillis()));
        log.error("Import {} error: {}", importId, error);
    }

    public ImportStatus get(String importId) {
        return statuses.get(importId);
    }

    /** Remove completed/errored entries older than 30 minutes. */
    private void evictOld() {
        long cutoff = System.currentTimeMillis() - EVICT_AFTER_MS;
        statuses.entrySet().removeIf(e -> {
            ImportStatus s = e.getValue();
            long ts = s.completedAt() > 0 ? s.completedAt() : s.startedAt();
            boolean finished = "complete".equals(s.status()) || "error".equals(s.status());
            return finished && ts < cutoff;
        });
    }
}
