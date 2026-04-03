package com.mizan.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

/**
 * In-process cache for V3 dashboard endpoints.
 * Key format: "{tenantId}:{endpoint}:{from}:{to}"
 * TTL: 5 minutes. Invalidated on every V3 import for the affected tenant.
 */
@Slf4j
@Service
public class V3CacheService {

    private static final long TTL_MS = 5 * 60 * 1000L; // 5 minutes

    private record CacheEntry(Object data, long timestamp) {}

    private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

    /** Returns cached data if present and not expired, otherwise null. */
    @SuppressWarnings("unchecked")
    public <T> T get(String key) {
        CacheEntry entry = cache.get(key);
        if (entry != null && System.currentTimeMillis() - entry.timestamp < TTL_MS) {
            log.debug("Cache HIT  {}", key);
            return (T) entry.data;
        }
        if (entry != null) {
            cache.remove(key);
            log.debug("Cache MISS (expired) {}", key);
        }
        return null;
    }

    /** Stores data under the given key. */
    public void put(String key, Object data) {
        cache.put(key, new CacheEntry(data, System.currentTimeMillis()));
        log.debug("Cache PUT  {} (total entries: {})", key, cache.size());
    }

    /** Removes all cached entries for a tenant (called after import). */
    public void invalidate(String tenantId) {
        String prefix = tenantId + ":";
        int removed = 0;
        for (String key : cache.keySet()) {
            if (key.startsWith(prefix)) { cache.remove(key); removed++; }
        }
        log.info("Cache invalidated for tenant {} ({} entries removed)", tenantId, removed);
    }

    /** Clears the entire cache. */
    public void invalidateAll() {
        int size = cache.size();
        cache.clear();
        log.info("Cache cleared ({} entries removed)", size);
    }

    public int size() { return cache.size(); }
}
