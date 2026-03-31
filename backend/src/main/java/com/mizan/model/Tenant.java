package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data @Document("tenants")
public class Tenant {
    @Id private String tenantId;
    private String companyNameAr;
    private String companyNameEn;
    private String companyLogo;
    private String contactEmail;
    private String contactPhone;
    private String subscriptionTierId;
    private String subscriptionStatus = "TRIAL";
    private LocalDate trialEndsAt;
    private boolean active = true;
    private boolean whiteLabel = false;
    private WhiteLabelConfig whiteLabelConfig;
    private BillingConfig billing = new BillingConfig();
    private TenantLimits limits = new TenantLimits();
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt = LocalDateTime.now();
    private String createdBy;

    @Data public static class WhiteLabelConfig {
        private String subdomain;
        private String customDomain;
        private String brandNameAr;
        private String brandNameEn;
        private String primaryColor = "#0f2d1f";
        private String accentColor = "#c9a84c";
        private String logoUrl;
        private String taglineAr;
        private String taglineEn;
        private boolean hideBuiltBy = false;
    }

    @Data public static class BillingConfig {
        private double baseFeeMonthly = 0;
        private double perBranchFeeMonthly = 0;
        private List<VolumeTier> branchVolumeTiers;
        private List<String> enabledModules;
        private String billingNotes;
        private String currency = "SAR";
    }

    @Data public static class TenantLimits {
        private int maxBranches = -1;
        private int maxEmployees = -1;
        private int maxAdminUsers = -1;
    }

    @Data public static class VolumeTier {
        private int fromBranch;
        private int toBranch;
        private double pricePerBranch;
    }
}
