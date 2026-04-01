package com.mizan.controller;
import com.mizan.dto.FileBytes;
import com.mizan.repository.BranchSaleRepository;
import com.mizan.repository.SourceFileProjection;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import com.mizan.service.ExcelParserService;
import com.mizan.service.ExcelParserService.FileType;
import com.mizan.service.UploadProgressService;
import com.mizan.service.UploadService;
import com.mizan.repository.UploadLogRepository;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/upload")
public class UploadController {
    private final UploadProgressService progressSvc;
    private final UploadService uploadSvc;
    private final UploadLogRepository logRepo;
    private final ExcelParserService parser;
    private final BranchSaleRepository saleRepo;

    public UploadController(UploadProgressService progressSvc, UploadService uploadSvc,
            UploadLogRepository logRepo, ExcelParserService parser,
            BranchSaleRepository saleRepo) {
        this.progressSvc=progressSvc; this.uploadSvc=uploadSvc; this.logRepo=logRepo;
        this.parser=parser; this.saleRepo=saleRepo;
    }

    @PostMapping("/request-token")
    public ResponseEntity<?> requestToken(@AuthenticationPrincipal MizanUserDetails principal) {
        var pair = progressSvc.createToken();
        return ResponseEntity.ok(Map.of("success",true,"data",
            Map.of("uploadId",pair.uploadId(),"token",pair.sseToken())));
    }

    @GetMapping(value="/progress/{uploadId}", produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter progress(@PathVariable String uploadId, @RequestParam String token) {
        if (!progressSvc.validateToken(uploadId, token))
            throw new SecurityException("Invalid token");
        return progressSvc.createEmitter(uploadId);
    }

    @PostMapping("/files")
    public ResponseEntity<?> upload(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("uploadId") String uploadId,
            @AuthenticationPrincipal MizanUserDetails principal) {

        // READ ALL BYTES NOW — synchronously, while the HTTP request is still alive
        // and Tomcat's temp files still exist. After this method returns, Tomcat will
        // delete the temp files; the async thread only sees our in-memory byte arrays.
        List<FileBytes> fileBytesList = new ArrayList<>();
        List<String> readErrors = new ArrayList<>();

        for (MultipartFile file : files) {
            try {
                fileBytesList.add(new FileBytes(file.getOriginalFilename(), file.getBytes()));
            } catch (Exception e) {
                readErrors.add((file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown")
                    + ": " + e.getMessage());
            }
        }

        if (fileBytesList.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false,
                "message", "تعذّر قراءة الملفات المرفوعة",
                "details", readErrors));
        }

        String tenantId = TenantContext.getTenantId();
        uploadSvc.processAsync(fileBytesList, uploadId, tenantId, principal.getUserId());

        return ResponseEntity.accepted().body(Map.of(
            "success", true,
            "message", "Processing started",
            "filesRead", fileBytesList.size(),
            "readErrors", readErrors));
    }

    @GetMapping("/history")
    public ResponseEntity<?> history(@AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        return ResponseEntity.ok(Map.of("success",true,"data",
            logRepo.findByTenantIdOrderByUploadedAtDesc(tenantId)));
    }

    @PostMapping("/sync-rates")
    public ResponseEntity<?> syncRates(@AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.status(403).body(Map.of("success",false));
        int updated = uploadSvc.syncEmployeePurchaseRates(tenantId);
        return ResponseEntity.ok(Map.of("success",true,"updatedBranches",updated));
    }

    // ── Typed upload endpoints ────────────────────────────────────────────────

    @PostMapping("/branch-sales")
    public ResponseEntity<?> uploadBranchSales(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("uploadId") String uploadId,
            @AuthenticationPrincipal MizanUserDetails principal) {
        return handleTyped(files, uploadId, FileType.BRANCH_SALES, principal);
    }

    @PostMapping("/employee-sales")
    public ResponseEntity<?> uploadEmployeeSales(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("uploadId") String uploadId,
            @AuthenticationPrincipal MizanUserDetails principal) {
        return handleTyped(files, uploadId, FileType.EMPLOYEE_SALES, principal);
    }

    @PostMapping("/purchases")
    public ResponseEntity<?> uploadPurchases(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("uploadId") String uploadId,
            @AuthenticationPrincipal MizanUserDetails principal) {
        return handleTyped(files, uploadId, FileType.PURCHASES, principal);
    }

    @PostMapping("/mothan")
    public ResponseEntity<?> uploadMothan(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam("uploadId") String uploadId,
            @AuthenticationPrincipal MizanUserDetails principal) {
        return handleTyped(files, uploadId, FileType.MOTHAN, principal);
    }

    // ── Debug endpoint — synchronous parse, no save, returns full diagnostic ─

    @PostMapping("/debug-parse")
    public ResponseEntity<?> debugParse(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "type", defaultValue = "BRANCH_SALES") String typeStr,
            @AuthenticationPrincipal MizanUserDetails principal) {

        String tenantId = TenantContext.getTenantId();
        FileType type;
        try { type = FileType.valueOf(typeStr); } catch (Exception e) { type = FileType.BRANCH_SALES; }

        Map<String, Object> debug = new LinkedHashMap<>();
        debug.put("fileName", file.getOriginalFilename());
        debug.put("fileSize", file.getSize());
        debug.put("forcedType", type.name());
        debug.put("tenantId", tenantId);

        try {
            ExcelParserService.ParseResult result = parser.parseForced(
                file.getInputStream(), file.getOriginalFilename(),
                tenantId, "debug", principal.getUserId(), type);

            debug.put("parseError", result.error());
            debug.put("fileDate", result.fileDate() != null ? result.fileDate().toString() : null);
            debug.put("salesCount", result.sales().size());
            debug.put("purchasesCount", result.purchases().size());
            debug.put("empSalesCount", result.empSales().size());
            debug.put("mothanCount", result.mothan().size());

            List<Map<String, Object>> samples = new ArrayList<>();
            result.sales().stream().limit(3).forEach(s -> samples.add(new LinkedHashMap<>(Map.of(
                "type", "BRANCH_SALE",
                "branchCode", s.getBranchCode() != null ? s.getBranchCode() : "null",
                "branchName", s.getBranchName() != null ? s.getBranchName() : "null",
                "date", s.getSaleDate() != null ? s.getSaleDate().toString() : "null",
                "sar", s.getTotalSarAmount(),
                "weight", s.getNetWeight(),
                "invoices", s.getInvoiceCount(),
                "sourceFileName", s.getSourceFileName() != null ? s.getSourceFileName() : "null"
            ))));
            result.empSales().stream().limit(3).forEach(e -> samples.add(new LinkedHashMap<>(Map.of(
                "type", "EMPLOYEE_SALE",
                "empId", e.getEmployeeId() != null ? e.getEmployeeId() : "null",
                "empName", e.getEmployeeName() != null ? e.getEmployeeName() : "null",
                "branchCode", e.getBranchCode() != null ? e.getBranchCode() : "null",
                "date", e.getSaleDate() != null ? e.getSaleDate().toString() : "null",
                "sar", e.getTotalSarAmount(),
                "weight", e.getNetWeight()
            ))));
            result.purchases().stream().limit(3).forEach(p -> samples.add(new LinkedHashMap<>(Map.of(
                "type", "PURCHASE",
                "branchCode", p.getBranchCode() != null ? p.getBranchCode() : "null",
                "date", p.getPurchaseDate() != null ? p.getPurchaseDate().toString() : "null",
                "sar", p.getTotalSarAmount(),
                "weight", p.getNetWeight()
            ))));
            result.mothan().stream().limit(3).forEach(m -> samples.add(new LinkedHashMap<>(Map.of(
                "type", "MOTHAN",
                "branchCode", m.getBranchCode() != null ? m.getBranchCode() : "null",
                "date", m.getTransactionDate() != null ? m.getTransactionDate().toString() : "null",
                "sar", m.getCreditSar(),
                "weight", m.getGoldWeightGrams()
            ))));
            debug.put("samples", samples);

            // Dedup analysis for BRANCH_SALES
            if (type == FileType.BRANCH_SALES && !result.sales().isEmpty()) {
                Set<String> existingKeys = saleRepo.findByTenantId(tenantId).stream()
                    .map(SourceFileProjection::getSourceFileName)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
                long wouldSkip = result.sales().stream()
                    .filter(s -> existingKeys.contains(s.getSourceFileName())).count();
                debug.put("existingRecordsInDB", existingKeys.size());
                debug.put("wouldBeSkippedByDedup", wouldSkip);
                debug.put("wouldBeInserted", result.sales().size() - wouldSkip);
                debug.put("conflictingSampleKeys", result.sales().stream()
                    .filter(s -> existingKeys.contains(s.getSourceFileName()))
                    .limit(5).map(s -> s.getSourceFileName()).collect(Collectors.toList()));
            }

        } catch (Exception e) {
            debug.put("exception", e.getClass().getSimpleName() + ": " + e.getMessage());
            Throwable root = e;
            while (root.getCause() != null) root = root.getCause();
            if (root != e) debug.put("rootCause", root.getClass().getSimpleName() + ": " + root.getMessage());
        }

        return ResponseEntity.ok(Map.of("success", true, "debug", debug));
    }

    private ResponseEntity<?> handleTyped(List<MultipartFile> files, String uploadId,
            FileType fileType, MizanUserDetails principal) {
        List<FileBytes> fileBytesList = new ArrayList<>();
        List<String> readErrors = new ArrayList<>();
        for (MultipartFile file : files) {
            try {
                fileBytesList.add(new FileBytes(file.getOriginalFilename(), file.getBytes()));
            } catch (Exception e) {
                readErrors.add((file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown")
                    + ": " + e.getMessage());
            }
        }
        if (fileBytesList.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                "success", false, "message", "تعذّر قراءة الملفات المرفوعة", "details", readErrors));
        }
        String tenantId = TenantContext.getTenantId();
        uploadSvc.processTypedAsync(fileBytesList, uploadId, tenantId, principal.getUserId(), fileType, true);
        return ResponseEntity.accepted().body(Map.of(
            "success", true, "message", "Processing started",
            "fileType", fileType.name(),
            "filesRead", fileBytesList.size(), "readErrors", readErrors));
    }
}
