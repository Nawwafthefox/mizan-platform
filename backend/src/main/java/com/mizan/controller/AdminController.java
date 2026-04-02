package com.mizan.controller;
import com.mizan.model.AdminNote;
import com.mizan.repository.*;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import com.mizan.service.PgImportService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final BranchSaleRepository saleRepo;
    private final BranchPurchaseRepository purchRepo;
    private final EmployeeSaleRepository empRepo;
    private final MothanTransactionRepository mothanRepo;
    private final UploadLogRepository logRepo;
    private final AdminNoteRepository adminNoteRepo;
    private final PgImportService pgImportService;

    public AdminController(BranchSaleRepository saleRepo, BranchPurchaseRepository purchRepo,
            EmployeeSaleRepository empRepo, MothanTransactionRepository mothanRepo,
            UploadLogRepository logRepo, AdminNoteRepository adminNoteRepo,
            PgImportService pgImportService) {
        this.saleRepo=saleRepo; this.purchRepo=purchRepo;
        this.empRepo=empRepo; this.mothanRepo=mothanRepo; this.logRepo=logRepo;
        this.adminNoteRepo=adminNoteRepo; this.pgImportService=pgImportService;
    }

    @PostMapping("/wipe-data")
    public ResponseEntity<?> wipe(@AuthenticationPrincipal MizanUserDetails p) {
        String tid = TenantContext.getTenantId();
        if (tid == null) return ResponseEntity.status(403).body(Map.of("success",false));
        long sales = saleRepo.countByTenantId(tid);
        saleRepo.deleteByTenantId(tid);
        purchRepo.deleteByTenantId(tid);
        empRepo.deleteByTenantId(tid);
        mothanRepo.deleteByTenantId(tid);
        return ResponseEntity.ok(Map.of("success",true,"deleted",sales));
    }

    @GetMapping("/notes")
    public ResponseEntity<?> getNotes(
            @RequestParam(required = false) String branchCode,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        String tenantId = com.mizan.security.TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.status(403).body(java.util.Map.of("success", false));
        java.util.List<AdminNote> notes;
        if (branchCode != null && !branchCode.isBlank()) {
            notes = adminNoteRepo.findByTenantIdAndBranchCodeOrderByNoteDateDesc(tenantId, branchCode);
        } else if (from != null && to != null) {
            notes = adminNoteRepo.findByTenantIdAndNoteDateBetweenOrderByNoteDateDesc(tenantId, from, to);
        } else {
            notes = adminNoteRepo.findByTenantIdOrderByNoteDateDesc(tenantId);
        }
        return ResponseEntity.ok(java.util.Map.of("success", true, "data", notes));
    }

    @PostMapping("/notes")
    public ResponseEntity<?> createNote(@RequestBody AdminNote note,
            @org.springframework.security.core.annotation.AuthenticationPrincipal com.mizan.security.MizanUserDetails principal) {
        String tenantId = com.mizan.security.TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.status(403).body(java.util.Map.of("success", false));
        note.setTenantId(tenantId);
        note.setCreatedBy(principal.getUserId());
        note.setCreatedAt(java.time.LocalDateTime.now());
        adminNoteRepo.save(note);
        return ResponseEntity.ok(java.util.Map.of("success", true, "data", note));
    }

    @DeleteMapping("/notes/{id}")
    public ResponseEntity<?> deleteNote(@PathVariable String id) {
        String tenantId = com.mizan.security.TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.status(403).body(java.util.Map.of("success", false));
        adminNoteRepo.deleteById(id);
        return ResponseEntity.ok(java.util.Map.of("success", true));
    }

    @PostMapping(value = "/import-pg-data", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importPgData(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.status(403).body(Map.of("success", false));
        if (file == null || file.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "No file uploaded"));
        try {
            String content = new String(file.getBytes(), StandardCharsets.UTF_8);
            java.util.Map<String, Object> result = pgImportService.importFromContent(content, tenantId);
            return ResponseEntity.ok(Map.of("success", true, "data", result));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("success", false, "error", e.getMessage()));
        }
    }
}
