package com.mizan.model;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data @AllArgsConstructor @NoArgsConstructor
public class KaratRow {
    private String karat;
    private double purity;
    private double sarAmount;
    private double netWeight;
    private double grossWeight;
    private int invoiceCount;
    private double saleRate;
}
