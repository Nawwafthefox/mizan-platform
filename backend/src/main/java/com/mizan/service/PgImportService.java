package com.mizan.service;

import com.mizan.model.*;
import com.mizan.repository.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.util.*;

@Slf4j
@Service
public class PgImportService {

    private final AdminNoteRepository adminNoteRepo;
    private final RegionRepository regionRepo;
    private final BranchRepository branchRepo;
    private final EmployeeTargetRepository empTargetRepo;
    private final EmployeeTransferRepository empTransferRepo;
    private final DailySaleRepository dailySaleRepo;
    private final MonthlySummaryRepository monthlySummaryRepo;
    private final BranchTargetRepository branchTargetRepo;

    public PgImportService(AdminNoteRepository adminNoteRepo, RegionRepository regionRepo,
            BranchRepository branchRepo, EmployeeTargetRepository empTargetRepo,
            EmployeeTransferRepository empTransferRepo, DailySaleRepository dailySaleRepo,
            MonthlySummaryRepository monthlySummaryRepo, BranchTargetRepository branchTargetRepo) {
        this.adminNoteRepo = adminNoteRepo;
        this.regionRepo = regionRepo;
        this.branchRepo = branchRepo;
        this.empTargetRepo = empTargetRepo;
        this.empTransferRepo = empTransferRepo;
        this.dailySaleRepo = dailySaleRepo;
        this.monthlySummaryRepo = monthlySummaryRepo;
        this.branchTargetRepo = branchTargetRepo;
    }

    public Map<String, Object> importFromSqlFile(String filePath, String tenantId) throws IOException {
        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, List<String[]>> tables = parseSqlFile(filePath);

        // Import regions
        List<String[]> regionsData = tables.getOrDefault("regions", List.of());
        regionRepo.deleteByTenantId(tenantId);
        List<Region> regions = new ArrayList<>();
        Map<Integer, Region> regionMap = new LinkedHashMap<>();
        for (String[] row : regionsData) {
            Region r = new Region();
            r.setTenantId(tenantId);
            r.setPgId(parseInt(row[0]));
            r.setName(row[1]);
            r.setColor(row.length > 2 ? row[2] : "#2563eb");
            regions.add(r);
            regionMap.put(r.getPgId(), r);
        }
        regionRepo.saveAll(regions);
        result.put("regions", regions.size());
        log.info("Imported {} regions", regions.size());

        // Import branches
        List<String[]> branchesData = tables.getOrDefault("branches", List.of());
        branchRepo.deleteByTenantId(tenantId);
        List<Branch> branches = new ArrayList<>();
        for (String[] row : branchesData) {
            Branch b = new Branch();
            b.setTenantId(tenantId);
            b.setPgId(parseInt(row[0]));
            b.setName(row[1]);
            b.setRegionId(parseInt(row[2]));
            Region reg = regionMap.get(b.getRegionId());
            if (reg != null) {
                b.setRegionName(reg.getName());
                b.setRegionColor(reg.getColor());
            }
            branches.add(b);
        }
        branchRepo.saveAll(branches);
        result.put("branches", branches.size());
        log.info("Imported {} branches", branches.size());

        // Import admin_notes
        List<String[]> notesData = tables.getOrDefault("admin_notes", List.of());
        adminNoteRepo.deleteByTenantId(tenantId);
        List<AdminNote> notes = new ArrayList<>();
        for (String[] row : notesData) {
            AdminNote n = new AdminNote();
            n.setTenantId(tenantId);
            n.setBranchCode(nullOrValue(row[1]));
            n.setNoteDate(parseDate(row[2]));
            n.setNoteText(row[3]);
            n.setCreatedBy(nullOrValue(row[4]));
            n.setCreatedAt(parseDateTime(row[5]));
            notes.add(n);
        }
        adminNoteRepo.saveAll(notes);
        result.put("admin_notes", notes.size());
        log.info("Imported {} admin_notes", notes.size());

        // Import employee_targets
        List<String[]> empTargetsData = tables.getOrDefault("employee_targets", List.of());
        empTargetRepo.deleteByTenantId(tenantId);
        List<EmployeeTarget> empTargets = new ArrayList<>();
        for (String[] row : empTargetsData) {
            EmployeeTarget et = new EmployeeTarget();
            et.setTenantId(tenantId);
            et.setEmpId(parseInt(row[1]));
            et.setEmpName(nullOrValue(row[2]));
            et.setBranchCode(nullOrValue(row[3]));
            et.setTargetMonth(parseDate(row[4]));
            et.setTargetWeightG(parseDouble(row[5]));
            et.setTargetDiffAvg(parseDouble(row[6]));
            et.setTargetPieces(parseInt(row[7]));
            et.setTargetSalesSar(parseDouble(row[8]));
            et.setCreatedBy(nullOrValue(row[9]));
            et.setUpdatedAt(parseDateTime(row[10]));
            empTargets.add(et);
        }
        empTargetRepo.saveAll(empTargets);
        result.put("employee_targets", empTargets.size());

        // Import employee_transfers
        List<String[]> transfersData = tables.getOrDefault("employee_transfers", List.of());
        empTransferRepo.deleteByTenantId(tenantId);
        List<EmployeeTransfer> transfers = new ArrayList<>();
        for (String[] row : transfersData) {
            EmployeeTransfer et = new EmployeeTransfer();
            et.setTenantId(tenantId);
            et.setEmpId(parseInt(row[1]));
            et.setEmpName(nullOrValue(row[2]));
            et.setFromBranchCode(nullOrValue(row[3]));
            et.setFromBranchName(nullOrValue(row[4]));
            et.setToBranchCode(nullOrValue(row[5]));
            et.setToBranchName(nullOrValue(row[6]));
            et.setTransferDate(parseDate(row[7]));
            et.setNotes(nullOrValue(row[8]));
            et.setCreatedAt(parseDateTime(row[9]));
            transfers.add(et);
        }
        empTransferRepo.saveAll(transfers);
        result.put("employee_transfers", transfers.size());

        // Import daily_sales
        // Build branchId -> branchCode/name lookup from already-imported branches
        Map<Integer, Branch> branchById = new LinkedHashMap<>();
        for (Branch b : branches) branchById.put(b.getPgId(), b);

        List<String[]> dailySalesData = tables.getOrDefault("daily_sales", List.of());
        dailySaleRepo.deleteByTenantId(tenantId);
        List<DailySale> dailySales = new ArrayList<>();
        for (String[] row : dailySalesData) {
            DailySale ds = new DailySale();
            ds.setTenantId(tenantId);
            ds.setBranchId(parseInt(row[1]));
            ds.setSaleDate(parseDate(row[2]));
            ds.setNetSales(parseDouble(row[3]));
            ds.setGrossSales(parseDouble(row[4]));
            ds.setDailyTarget(parseDouble(row[5]));
            ds.setPurchases(parseDouble(row[6]));
            ds.setCash(parseDouble(row[7]));
            ds.setBank(parseDouble(row[8]));
            // achievement_pct is GENERATED in PG - compute here
            double tgt = ds.getDailyTarget();
            ds.setAchievementPct(tgt > 0 ? Math.round(ds.getNetSales() / tgt * 10000.0) / 100.0 : 0);
            ds.setCreatedAt(parseDateTime(row[9]));
            Branch b = branchById.get(ds.getBranchId());
            if (b != null) { ds.setBranchCode(String.valueOf(b.getPgId())); ds.setBranchName(b.getName()); }
            dailySales.add(ds);
        }
        dailySaleRepo.saveAll(dailySales);
        result.put("daily_sales", dailySales.size());
        log.info("Imported {} daily_sales", dailySales.size());

        // Import monthly_summaries (may be empty in dump)
        List<String[]> summariesData = tables.getOrDefault("monthly_summaries", List.of());
        monthlySummaryRepo.deleteByTenantId(tenantId);
        List<MonthlySummary> summaries = new ArrayList<>();
        for (String[] row : summariesData) {
            MonthlySummary ms = new MonthlySummary();
            ms.setTenantId(tenantId);
            ms.setBranchId(parseInt(row[1]));
            ms.setYear(parseInt(row[2]));
            ms.setMonth(parseInt(row[3]));
            ms.setTotalSales(parseDouble(row[4]));
            ms.setTotalTarget(parseDouble(row[5]));
            double tgt = ms.getTotalTarget();
            ms.setAchievementPct(tgt > 0 ? Math.round(ms.getTotalSales() / tgt * 10000.0) / 100.0 : 0);
            Branch b = branchById.get(ms.getBranchId());
            if (b != null) { ms.setBranchCode(String.valueOf(b.getPgId())); ms.setBranchName(b.getName()); }
            summaries.add(ms);
        }
        monthlySummaryRepo.saveAll(summaries);
        result.put("monthly_summaries", summaries.size());

        result.put("status", "ok");
        result.put("tenantId", tenantId);
        return result;
    }

    /** Parse a PostgreSQL dump file, return Map of tableName -> list of column-value arrays */
    private Map<String, List<String[]>> parseSqlFile(String filePath) throws IOException {
        Map<String, List<String[]>> result = new LinkedHashMap<>();
        String currentTable = null;
        List<String[]> currentRows = null;
        boolean inCopy = false;

        try (BufferedReader reader = new BufferedReader(new FileReader(filePath))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("COPY public.")) {
                    // e.g.: COPY public.regions (id, name, color) FROM stdin;
                    int dotIdx = line.indexOf('.') + 1;
                    int spaceIdx = line.indexOf(' ', dotIdx);
                    currentTable = line.substring(dotIdx, spaceIdx);
                    currentRows = new ArrayList<>();
                    result.put(currentTable, currentRows);
                    inCopy = true;
                    continue;
                }
                if (inCopy) {
                    if (line.equals("\\.")) {
                        inCopy = false;
                        currentTable = null;
                        currentRows = null;
                    } else if (!line.isEmpty()) {
                        currentRows.add(line.split("\t", -1));
                    }
                }
            }
        }
        return result;
    }

    private LocalDate parseDate(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return null;
        try { return LocalDate.parse(s.trim()); } catch (Exception e) { return null; }
    }

    private LocalDateTime parseDateTime(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return LocalDateTime.now();
        try {
            // PG format: 2026-03-31 21:48:22.773423+00
            String cleaned = s.trim().replace(" ", "T");
            if (cleaned.contains("+")) cleaned = cleaned.substring(0, cleaned.lastIndexOf('+')) + "+00:00";
            return ZonedDateTime.parse(cleaned).toLocalDateTime();
        } catch (Exception e) {
            return LocalDateTime.now();
        }
    }

    private double parseDouble(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return 0;
        try { return Double.parseDouble(s.trim()); } catch (Exception e) { return 0; }
    }

    private int parseInt(String s) {
        if (s == null || s.equals("\\N") || s.isBlank()) return 0;
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return 0; }
    }

    private String nullOrValue(String s) {
        if (s == null || s.equals("\\N")) return null;
        return s;
    }
}
