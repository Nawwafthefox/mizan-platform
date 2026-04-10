package com.mizan.service;

import com.mizan.model.V3Branch;
import com.mizan.repository.V3BranchRepository;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class BranchLookupService {

    private final V3BranchRepository branchRepo;
    private final Map<String, Map<String, V3Branch>> cache = new ConcurrentHashMap<>();

    public BranchLookupService(V3BranchRepository branchRepo) {
        this.branchRepo = branchRepo;
    }

    public String getName(String tenantId, String branchCode) {
        return getBranch(tenantId, branchCode)
            .map(V3Branch::getBranchName).orElse(branchCode);
    }

    public String getRegion(String tenantId, String branchCode) {
        return getBranch(tenantId, branchCode)
            .map(V3Branch::getRegionName).orElse("غير محدد");
    }

    public int getRegionId(String tenantId, String branchCode) {
        return getBranch(tenantId, branchCode)
            .map(V3Branch::getRegionId).orElse(0);
    }

    public Optional<V3Branch> getBranch(String tenantId, String branchCode) {
        return Optional.ofNullable(
            cache.computeIfAbsent(tenantId, tid -> {
                Map<String, V3Branch> m = new HashMap<>();
                branchRepo.findByTenantId(tid)
                    .forEach(b -> m.put(b.getBranchCode(), b));
                return m;
            }).get(branchCode));
    }

    public Map<String, V3Branch> getAll(String tenantId) {
        return cache.computeIfAbsent(tenantId, tid -> {
            Map<String, V3Branch> m = new HashMap<>();
            branchRepo.findByTenantId(tid)
                .forEach(b -> m.put(b.getBranchCode(), b));
            return m;
        });
    }

    public void invalidateCache(String tenantId) {
        cache.remove(tenantId);
    }

    public void invalidateAll() {
        cache.clear();
    }

    /** Guess region from branch code prefix. */
    public static int guessRegionId(String branchCode) {
        if (branchCode == null || branchCode.length() < 2) return 0;
        String prefix = branchCode.substring(0, 2);
        return switch (prefix) {
            case "16" -> 1; // الرياض
            case "14", "17" -> 2; // الغربية
            case "40", "44" -> 3; // المدينة المنورة
            case "34" -> {
                // 3408 and branches starting with 34 could be حفر الباطن
                // but 3408 is العلا in المدينة المنورة region
                if ("3408".equals(branchCode)) yield 3;
                yield 5; // حفر الباطن
            }
            case "54" -> 6; // عسير/جيزان (خميس مشيط)
            case "74" -> 6; // عسير/جيزان (أبو عريش/صبيا)
            default -> 0;
        };
    }

    public static String guessRegionName(int regionId) {
        return switch (regionId) {
            case 1 -> "الرياض";
            case 2 -> "الغربية";
            case 3 -> "المدينة المنورة";
            case 4 -> "حائل";
            case 5 -> "حفر الباطن";
            case 6 -> "عسير/جيزان";
            default -> "غير محدد";
        };
    }
}
