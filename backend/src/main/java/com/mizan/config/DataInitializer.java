package com.mizan.config;
import com.mizan.model.SubscriptionTier;
import com.mizan.model.SubscriptionTier.TierFeatures;
import com.mizan.repository.SubscriptionTierRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;
import java.util.List;

@Component
public class DataInitializer implements CommandLineRunner {
    private final SubscriptionTierRepository tierRepo;
    public DataInitializer(SubscriptionTierRepository tierRepo) { this.tierRepo = tierRepo; }

    @Override
    public void run(String... args) {
        if (tierRepo.count() > 0) return;

        tierRepo.saveAll(List.of(
            makeTier("starter","الأساسي","Starter",1, f -> {}),
            makeTier("business","الأعمال","Business",2, f -> {
                f.setEmployeeModule(true); f.setTargetsModule(true);
                f.setKaratBreakdown(true); f.setRegionAnalytics(true);
                f.setMothanModule(true); f.setMaxBranches(15); f.setMaxEmployees(75);
            }),
            makeTier("enterprise","المؤسسات","Enterprise",3, f -> {
                f.setEmployeeModule(true); f.setTargetsModule(true);
                f.setKaratBreakdown(true); f.setRegionAnalytics(true);
                f.setMothanModule(true); f.setHistoricalComparison(true);
                f.setHeatmapModule(true); f.setReportExport(true);
                f.setMaxBranches(-1); f.setMaxEmployees(-1);
            }),
            makeTier("white_label","الشريك","White Label",4, f -> {
                f.setEmployeeModule(true); f.setTargetsModule(true);
                f.setKaratBreakdown(true); f.setRegionAnalytics(true);
                f.setMothanModule(true); f.setHistoricalComparison(true);
                f.setHeatmapModule(true); f.setReportExport(true);
                f.setWhiteLabel(true); f.setApiAccess(true);
                f.setMaxBranches(-1); f.setMaxEmployees(-1);
            })
        ));
        System.out.println("MIZAN: Seeded 4 default subscription tiers");
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
