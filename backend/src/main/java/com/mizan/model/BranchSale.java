package com.mizan.model;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data @Document("branch_sales")
public class BranchSale {
    @Id private String id;
    private String tenantId;
    private LocalDate saleDate;
    private String branchCode;
    private String branchName;
    private String region;
    private double totalSarAmount;
    private double netWeight;
    private double grossWeight;
    private int invoiceCount;
    private double saleRate;
    private boolean isReturn = false;
    private List<KaratRow> karatRows;
    // Flat karat fields (mirror PG branch_sales columns)
    private double k18Sar;
    private double k18WeightG;
    private int k18Pieces;
    private double k18WtPure;
    private double k18WtSafe;
    private double k18Rate;
    private double k18AvgMkg;
    private double k21Sar;
    private double k21WeightG;
    private int k21Pieces;
    private double k21WtPure;
    private double k21WtSafe;
    private double k21Rate;
    private double k21AvgMkg;
    private double k22Sar;
    private double k22WeightG;
    private int k22Pieces;
    private double k22WtPure;
    private double k22WtSafe;
    private double k22Rate;
    private double k22AvgMkg;
    private double k24Sar;
    private double k24WeightG;
    private int k24Pieces;
    private double k24WtPure;
    private double k24WtSafe;
    private double k24Rate;
    private double k24AvgMkg;
    private double avgInvoiceSar;
    private double wtPureG;      // wt_pure_g (grossWeight is now alias)
    private double wtSafeG;      // wt_safe_g
    private double avgMkgCharge; // avg_mkg_charge
    private String sourceFileName;
    private String uploadBatch;
    private String uploadedBy;
    private LocalDateTime createdAt = LocalDateTime.now();
}
