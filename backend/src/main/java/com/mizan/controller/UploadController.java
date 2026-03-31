package com.mizan.controller;
import com.mizan.security.MizanUserDetails;
import com.mizan.security.TenantContext;
import com.mizan.service.UploadProgressService;
import com.mizan.service.UploadService;
import com.mizan.repository.UploadLogRepository;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/upload")
public class UploadController {
    private final UploadProgressService progressSvc;
    private final UploadService uploadSvc;
    private final UploadLogRepository logRepo;

    public UploadController(UploadProgressService progressSvc, UploadService uploadSvc,
            UploadLogRepository logRepo) {
        this.progressSvc=progressSvc; this.uploadSvc=uploadSvc; this.logRepo=logRepo;
    }

    @PostMapping("/request-token")
    public ResponseEntity<?> requestToken(@AuthenticationPrincipal MizanUserDetails principal) {
        var pair = progressSvc.createToken();
        return ResponseEntity.ok(Map.of("success",true,"uploadId",pair.uploadId(),"sseToken",pair.sseToken()));
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
        String tenantId = TenantContext.getTenantId();
        uploadSvc.processAsync(files, uploadId, tenantId, principal.getUserId());
        return ResponseEntity.accepted().body(Map.of("success",true,"message","Processing started"));
    }

    @GetMapping("/history")
    public ResponseEntity<?> history(@AuthenticationPrincipal MizanUserDetails principal) {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(Map.of("success",true,"data",List.of()));
        return ResponseEntity.ok(Map.of("success",true,"data",
            logRepo.findByTenantIdOrderByUploadedAtDesc(tenantId)));
    }
}
