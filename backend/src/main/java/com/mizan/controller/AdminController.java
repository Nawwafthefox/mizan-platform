package com.mizan.controller;
import com.mizan.repository.*;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final BranchSaleRepository saleRepo;
    private final BranchPurchaseRepository purchRepo;
    private final EmployeeSaleRepository empRepo;
    private final MothanTransactionRepository mothanRepo;
    private final UploadLogRepository logRepo;

    public AdminController(BranchSaleRepository saleRepo, BranchPurchaseRepository purchRepo,
            EmployeeSaleRepository empRepo, MothanTransactionRepository mothanRepo,
            UploadLogRepository logRepo) {
        this.saleRepo=saleRepo; this.purchRepo=purchRepo;
        this.empRepo=empRepo; this.mothanRepo=mothanRepo; this.logRepo=logRepo;
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
}
