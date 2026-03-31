package com.mizan.config;
import com.mizan.model.SubscriptionTier;
import com.mizan.model.SubscriptionTier.TierFeatures;
import com.mizan.repository.SubscriptionTierRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
public class DataInitializer implements CommandLineRunner {
    private final SubscriptionTierRepository tierRepo;
    private final MongoTemplate mongoTemplate;

    public DataInitializer(SubscriptionTierRepository tierRepo, MongoTemplate mongoTemplate) {
        this.tierRepo = tierRepo;
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void run(String... args) {
        ensureIndexes();
        seedTiers();
    }

    // ── Ensure all performance + uniqueness indexes are in place ─────────────
    private void ensureIndexes() {
        String[][] collections = {
            {"branch_sales"},
            {"branch_purchases"},
            {"employee_sales"},
            {"mothan_transactions"}
        };
        for (String[] c : collections) {
            String col = c[0];
            try {
                // Query index: tenantId first for all tenant-scoped queries
                mongoTemplate.indexOps(col).ensureIndex(
                    new Index().on("tenantId", Sort.Direction.ASC).named("idx_tenantId_" + col));
                // Unique deduplication index: tenantId + sourceFileName
                mongoTemplate.indexOps(col).ensureIndex(
                    new Index()
                        .on("tenantId", Sort.Direction.ASC)
                        .on("sourceFileName", Sort.Direction.ASC)
                        .unique()
                        .named("unique_tenantId_sourceFileName_" + col));
                log.info("Indexes ensured for {}", col);
            } catch (Exception e) {
                // Index may already exist with different options (e.g. existing data with dupes)
                log.warn("Could not ensure index for {}: {}", col, e.getMessage());
            }
        }
    }

    // ── Seed default subscription tiers (once) ───────────────────────────────
    private void seedTiers() {
        if (tierRepo.count() > 0) return;

        tierRepo.saveAll(List.of(
            makeTier("starter", "الأساسي", "Starter", 1, f -> {}),
            makeTier("business", "الأعمال", "Business", 2, f -> {
                f.setEmployeeModule(true); f.setTargetsModule(true);
                f.setKaratBreakdown(true); f.setRegionAnalytics(true);
                f.setMothanModule(true); f.setMaxBranches(15); f.setMaxEmployees(75);
            }),
            makeTier("enterprise", "المؤسسات", "Enterprise", 3, f -> {
                f.setEmployeeModule(true); f.setTargetsModule(true);
                f.setKaratBreakdown(true); f.setRegionAnalytics(true);
                f.setMothanModule(true); f.setHistoricalComparison(true);
                f.setHeatmapModule(true); f.setReportExport(true);
                f.setMaxBranches(-1); f.setMaxEmployees(-1);
            }),
            makeTier("white_label", "الشريك", "White Label", 4, f -> {
                f.setEmployeeModule(true); f.setTargetsModule(true);
                f.setKaratBreakdown(true); f.setRegionAnalytics(true);
                f.setMothanModule(true); f.setHistoricalComparison(true);
                f.setHeatmapModule(true); f.setReportExport(true);
                f.setWhiteLabel(true); f.setApiAccess(true);
                f.setMaxBranches(-1); f.setMaxEmployees(-1);
            })
        ));
        log.info("MIZAN: Seeded 4 default subscription tiers");
    }

    private SubscriptionTier makeTier(String id, String nameAr, String nameEn,
            int order, java.util.function.Consumer<TierFeatures> featureCustomizer) {
        SubscriptionTier t = new SubscriptionTier();
        t.setTierId(id); t.setTierNameAr(nameAr); t.setTierNameEn(nameEn);
        t.setDisplayOrder(order); t.setActive(true);
        t.setCreatedAt(LocalDateTime.now()); t.setUpdatedAt(LocalDateTime.now());
        TierFeatures f = new TierFeatures();
        featureCustomizer.accept(f);
        t.setFeatures(f);
        return t;
    }
}
