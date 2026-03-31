package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDateTime;
import java.util.List;

@Data @Document("subscription_tiers")
public class SubscriptionTier {
    @Id private String tierId;
    private String tierNameAr;
    private String tierNameEn;
    private String descriptionAr;
    private String descriptionEn;
    private boolean active = true;
    private int displayOrder;
    private TierPricing pricing = new TierPricing();
    private TierFeatures features = new TierFeatures();
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Data public static class TierPricing {
        private double baseFeeMonthly = 0;
        private double perBranchFeeMonthly = 0;
        private List<Tenant.VolumeTier> branchVolumeTiers;
        private double setupFee = 0;
        private double annualDiscountPct = 0;
        private String currency = "SAR";
    }

    @Data public static class TierFeatures {
        private boolean branchSalesDashboard = true;
        private boolean purchaseDashboard = true;
        private boolean rateDifferenceAnalytics = true;
        private boolean dateRangeFiltering = true;
        private boolean basicAlerts = true;
        private boolean employeeModule = false;
        private boolean targetsModule = false;
        private boolean historicalComparison = false;
        private boolean heatmapModule = false;
        private boolean reportExport = false;
        private boolean mothanModule = false;
        private boolean karatBreakdown = false;
        private boolean regionAnalytics = false;
        private boolean apiAccess = false;
        private boolean whiteLabel = false;
        private int maxBranches = 5;
        private int maxEmployees = 20;
        private int dataRetentionDays = 90;
    }
}
