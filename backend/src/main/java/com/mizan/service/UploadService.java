package com.mizan.service;
import com.mizan.model.*;
import com.mizan.repository.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class UploadService {
    private final ExcelParserService parser;
    private final UploadProgressService progress;
    private final BranchSaleRepository saleRepo;
    private final BranchPurchaseRepository purchRepo;
    private final EmployeeSaleRepository empRepo;
    private final MothanTransactionRepository mothanRepo;
    private final UploadLogRepository logRepo;

    public UploadService(ExcelParserService parser, UploadProgressService progress,
            BranchSaleRepository saleRepo, BranchPurchaseRepository purchRepo,
            EmployeeSaleRepository empRepo, MothanTransactionRepository mothanRepo,
            UploadLogRepository logRepo) {
        this.parser = parser; this.progress = progress;
        this.saleRepo = saleRepo; this.purchRepo = purchRepo;
        this.empRepo = empRepo; this.mothanRepo = mothanRepo;
        this.logRepo = logRepo;
    }

    @Async
    public void processAsync(List<MultipartFile> files, String uploadId,
            String tenantId, String userId) {
        int total = files.size();
        int totalSaved = 0;
        for (int i = 0; i < total; i++) {
            MultipartFile file = files.get(i);
            String name = file.getOriginalFilename();
            int base = (i * 100) / total;
            int next = ((i + 1) * 100) / total;
            sendProgress(uploadId, "parsing", "جاري تحليل الملف", i+1, total, name, null, base, 0, "processing", null);
            try {
                ExcelParserService.ParseResult result = parser.parse(file.getInputStream(), name, tenantId, uploadId, userId);
                if (result.error() != null) {
                    sendProgress(uploadId, "error", "حدث خطأ", i+1, total, name, result.fileType()!=null?result.fileType().name():null, next, 0, "error", result.error());
                    saveLog(tenantId, uploadId, name, "UNKNOWN", 0, "ERROR", result.error(), userId);
                    continue;
                }
                sendProgress(uploadId, "saving", "جاري الحفظ في قاعدة البيانات", i+1, total, name, result.fileType().name(), (base+next)/2, 0, "processing", null);
                int saved = 0;
                switch (result.fileType()) {
                    case BRANCH_SALES -> saved = saveSales(result.sales());
                    case PURCHASES    -> saved = savePurchases(result.purchases());
                    case EMPLOYEE_SALES -> saved = saveEmpSales(result.empSales());
                    case MOTHAN       -> saved = saveMothan(result.mothan());
                    default -> {}
                }
                totalSaved += saved;
                sendProgress(uploadId, "complete", "تم بنجاح", i+1, total, name, result.fileType().name(), next, saved, "success", null);
                saveLog(tenantId, uploadId, name, result.fileType().name(), saved, "SUCCESS", null, userId);
            } catch (Exception e) {
                log.error("Upload error: {}", e.getMessage(), e);
                sendProgress(uploadId, "error", "حدث خطأ", i+1, total, name, null, next, 0, "error", e.getMessage());
                saveLog(tenantId, uploadId, name, "UNKNOWN", 0, "ERROR", e.getMessage(), userId);
            }
        }
        Map<String,Object> summary = Map.of("uploadId",uploadId,"totalFiles",total,"totalSaved",totalSaved,"status","complete");
        progress.send(uploadId, "complete", summary);
        progress.complete(uploadId);
    }

    private int saveSales(List<BranchSale> items) {
        List<BranchSale> newItems = items.stream().filter(s ->
            !saleRepo.existsByTenantIdAndSaleDateAndBranchCodeAndSourceFileName(
                s.getTenantId(), s.getSaleDate(), s.getBranchCode(), s.getSourceFileName())
        ).collect(Collectors.toList());
        saleRepo.saveAll(newItems);
        return newItems.size();
    }

    private int savePurchases(List<BranchPurchase> items) {
        List<BranchPurchase> newItems = items.stream().filter(p ->
            !purchRepo.existsByTenantIdAndPurchaseDateAndBranchCodeAndSourceFileName(
                p.getTenantId(), p.getPurchaseDate(), p.getBranchCode(), p.getSourceFileName())
        ).collect(Collectors.toList());
        purchRepo.saveAll(newItems);
        return newItems.size();
    }

    private int saveEmpSales(List<EmployeeSale> items) {
        List<EmployeeSale> newItems = items.stream().filter(e ->
            !empRepo.existsByTenantIdAndSaleDateAndEmployeeIdAndSourceFileName(
                e.getTenantId(), e.getSaleDate(), e.getEmployeeId(), e.getSourceFileName())
        ).collect(Collectors.toList());
        empRepo.saveAll(newItems);
        return newItems.size();
    }

    private int saveMothan(List<MothanTransaction> items) {
        List<MothanTransaction> newItems = items.stream().filter(m ->
            !mothanRepo.existsByTenantIdAndTransactionDateAndBranchCodeAndDocReference(
                m.getTenantId(), m.getTransactionDate(), m.getBranchCode(), m.getDocReference())
        ).collect(Collectors.toList());
        mothanRepo.saveAll(newItems);
        return newItems.size();
    }

    private void sendProgress(String uploadId, String phase, String phaseAr,
            int current, int total, String fileName, String fileType,
            int pct, int saved, String status, String error) {
        Map<String,Object> event = new HashMap<>();
        event.put("uploadId", uploadId);
        event.put("phase", phase); event.put("phaseAr", phaseAr);
        event.put("currentFile", current); event.put("totalFiles", total);
        event.put("currentFileName", fileName); event.put("fileType", fileType);
        event.put("percentage", pct); event.put("savedRecords", saved);
        event.put("status", status); event.put("errorMessage", error);
        progress.send(uploadId, "progress", event);
    }

    private void saveLog(String tenantId, String batch, String fileName,
            String fileType, int saved, String status, String error, String by) {
        UploadLog ul = new UploadLog();
        ul.setTenantId(tenantId); ul.setUploadBatch(batch);
        ul.setFileName(fileName); ul.setFileType(fileType);
        ul.setRecordsSaved(saved); ul.setStatus(status);
        ul.setErrorMessage(error); ul.setUploadedBy(by);
        ul.setUploadedAt(LocalDateTime.now());
        logRepo.save(ul);
    }
}
