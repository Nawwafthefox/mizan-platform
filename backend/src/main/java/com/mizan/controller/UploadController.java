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
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
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

        byte[] fileBytes;
        try { fileBytes = file.getBytes(); } catch (Exception e) {
            return ResponseEntity.ok(Map.of("success", false, "error", "Cannot read file: " + e.getMessage()));
        }

        // ── Phase 1: parser result ─────────────────────────────────────────────
        try {
            ExcelParserService.ParseResult result = parser.parseForced(
                new java.io.ByteArrayInputStream(fileBytes), file.getOriginalFilename(),
                tenantId, "debug", principal.getUserId(), type);

            debug.put("parseError", result.error());
            debug.put("fileDate", result.fileDate() != null ? result.fileDate().toString() : null);
            debug.put("salesCount", result.sales().size());
            debug.put("purchasesCount", result.purchases().size());
            debug.put("empSalesCount", result.empSales().size());
            debug.put("mothanCount", result.mothan().size());

            if (!result.sales().isEmpty()) {
                List<Map<String, Object>> samples = new ArrayList<>();
                result.sales().stream().limit(3).forEach(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("branchCode", s.getBranchCode()); m.put("date", String.valueOf(s.getSaleDate()));
                    m.put("sar", s.getTotalSarAmount()); m.put("weight", s.getNetWeight());
                    m.put("invoices", s.getInvoiceCount()); m.put("sourceFileName", s.getSourceFileName());
                    samples.add(m);
                });
                debug.put("samples", samples);
                // Dedup check
                Set<String> existingKeys = saleRepo.findByTenantId(tenantId).stream()
                    .map(SourceFileProjection::getSourceFileName).filter(Objects::nonNull)
                    .collect(Collectors.toSet());
                long wouldSkip = result.sales().stream()
                    .filter(s -> existingKeys.contains(s.getSourceFileName())).count();
                debug.put("existingRecordsInDB", existingKeys.size());
                debug.put("wouldBeSkippedByDedup", wouldSkip);
                debug.put("wouldBeInserted", result.sales().size() - wouldSkip);
            }
        } catch (Exception e) {
            debug.put("parseException", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // ── Phase 2: raw sheet inspection (always runs, independent of parser) ─
        try (HSSFWorkbook wb = new HSSFWorkbook(new java.io.ByteArrayInputStream(fileBytes))) {
            Sheet sheet = wb.getSheetAt(0);
            debug.put("totalRows", sheet.getLastRowNum());
            debug.put("physicalRows", sheet.getPhysicalNumberOfRows());

            // isDataRow stats
            int nullRows = 0, c15Null = 0, c15NonNumeric = 0, c15BelowOne = 0, subTotalSkipped = 0, passedFilter = 0;
            for (Row row : sheet) {
                if (row == null) { nullRows++; continue; }
                Cell c15 = row.getCell(15, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                if (c15 == null) { c15Null++; continue; }
                if (c15.getCellType() != CellType.NUMERIC) { c15NonNumeric++; continue; }
                if (c15.getNumericCellValue() < 1) { c15BelowOne++; continue; }
                String desc = "";
                Cell c12 = row.getCell(12, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                if (c12 != null && c12.getCellType() == CellType.STRING) desc = c12.getStringCellValue();
                if (desc.startsWith("Sub Total") || desc.startsWith("Grand Total")) { subTotalSkipped++; continue; }
                passedFilter++;
            }
            Map<String, Object> rowStats = new LinkedHashMap<>();
            rowStats.put("nullRows", nullRows);
            rowStats.put("col15_null", c15Null);
            rowStats.put("col15_nonNumeric", c15NonNumeric);
            rowStats.put("col15_belowOne", c15BelowOne);
            rowStats.put("subTotalSkipped", subTotalSkipped);
            rowStats.put("passedIsDataRow", passedFilter);
            debug.put("isDataRowStats", rowStats);

            // Dump rows 5–30 (skip title rows) showing col12 and col15
            List<Map<String, Object>> rawRows = new ArrayList<>();
            for (int i = 5; i <= Math.min(30, sheet.getLastRowNum()); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                Map<String, Object> rr = new LinkedHashMap<>();
                rr.put("rowIdx", i);
                // Show cols 0, 3, 6, 11, 12, 13, 15 — the key columns
                int[] cols = {0, 3, 6, 11, 12, 13, 15};
                for (int c : cols) {
                    Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                    if (cell == null) { rr.put("c" + c, null); continue; }
                    rr.put("c" + c, switch (cell.getCellType()) {
                        case NUMERIC -> cell.getNumericCellValue();
                        case STRING  -> cell.getStringCellValue();
                        case BOOLEAN -> cell.getBooleanCellValue();
                        default -> cell.getCellType().name();
                    });
                }
                rawRows.add(rr);
            }
            debug.put("rawRows_5to30", rawRows);

        } catch (Exception e) {
            debug.put("sheetInspectException", e.getClass().getSimpleName() + ": " + e.getMessage());
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
