package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.PrintSettingService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.PrintSettingDTO;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/trader/print-settings")
public class PrintSettingResource {

    private final PrintSettingService printSettingService;
    private final TraderContextService traderContextService;

    public PrintSettingResource(PrintSettingService printSettingService, TraderContextService traderContextService) {
        this.printSettingService = printSettingService;
        this.traderContextService = traderContextService;
    }

    @GetMapping
    @PreAuthorize("@traderOwnerAccess.isCurrentUserTraderOwner() or hasAuthority(\"" + AuthoritiesConstants.PRINT_SETTINGS_VIEW + "\")")
    public ResponseEntity<List<PrintSettingDTO>> list() {
        Long traderId = traderContextService.getCurrentTraderId();
        return ResponseEntity.ok(printSettingService.listByTrader(traderId));
    }

    @PutMapping
    @PreAuthorize("@traderOwnerAccess.isCurrentUserTraderOwner() or hasAuthority(\"" + AuthoritiesConstants.PRINT_SETTINGS_EDIT + "\")")
    public ResponseEntity<PrintSettingDTO> upsert(@Valid @RequestBody PrintSettingDTO dto) {
        Long traderId = traderContextService.getCurrentTraderId();
        return ResponseEntity.ok(printSettingService.upsert(traderId, dto));
    }
}
