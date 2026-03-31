package com.mizan.controller;
import com.mizan.model.Tenant;
import com.mizan.repository.TenantRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/public")
public class PublicController {
    private final TenantRepository tenantRepo;
    public PublicController(TenantRepository tenantRepo) { this.tenantRepo=tenantRepo; }

    @GetMapping("/branding")
    public ResponseEntity<?> branding(HttpServletRequest req) {
        String host = req.getHeader("Host");
        if (host != null) {
            String subdomain = host.split("\\.")[0];
            Optional<Tenant> opt = tenantRepo.findByWhiteLabelConfigSubdomain(subdomain);
            if (opt.isPresent() && opt.get().isWhiteLabel()) {
                Tenant.WhiteLabelConfig wl = opt.get().getWhiteLabelConfig();
                return ResponseEntity.ok(Map.of(
                    "platformName", nvl(wl.getBrandNameEn(),"MIZAN"),
                    "platformNameAr", nvl(wl.getBrandNameAr(),"ميزان"),
                    "taglineEn", nvl(wl.getTaglineEn(),"Weigh Every Decision"),
                    "taglineAr", nvl(wl.getTaglineAr(),"دقة في كل ميزان"),
                    "primaryColor", nvl(wl.getPrimaryColor(),"#0f2d1f"),
                    "accentColor", nvl(wl.getAccentColor(),"#c9a84c"),
                    "isWhiteLabel", true,
                    "hideBuiltBy", wl.isHideBuiltBy()
                ));
            }
        }
        return ResponseEntity.ok(Map.of(
            "platformName","MIZAN","platformNameAr","ميزان",
            "taglineEn","Weigh Every Decision","taglineAr","دقة في كل ميزان",
            "primaryColor","#0f2d1f","accentColor","#c9a84c",
            "isWhiteLabel",false,"hideBuiltBy",false
        ));
    }

    private String nvl(String s, String def) { return (s!=null&&!s.isEmpty()) ? s : def; }
}
