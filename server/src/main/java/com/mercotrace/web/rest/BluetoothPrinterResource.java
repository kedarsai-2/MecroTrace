package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.security.SecurityUtils;
import com.mercotrace.security.TraderOwnerAccess;
import com.mercotrace.service.BluetoothPrinterService;
import com.mercotrace.service.TraderContextService;
import com.mercotrace.service.dto.BluetoothPrinterAccessCheckDTO;
import com.mercotrace.service.dto.BluetoothPrinterAccessUpdateRequest;
import com.mercotrace.service.dto.BluetoothPrinterDTO;
import com.mercotrace.service.dto.BluetoothPrinterRegisterRequest;
import com.mercotrace.service.impl.BluetoothPrinterServiceImpl;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/trader/bluetooth-printers")
public class BluetoothPrinterResource {

    private final BluetoothPrinterService bluetoothPrinterService;
    private final TraderContextService traderContextService;
    private final TraderOwnerAccess traderOwnerAccess;

    public BluetoothPrinterResource(
        BluetoothPrinterService bluetoothPrinterService,
        TraderContextService traderContextService,
        TraderOwnerAccess traderOwnerAccess
    ) {
        this.bluetoothPrinterService = bluetoothPrinterService;
        this.traderContextService = traderContextService;
        this.traderOwnerAccess = traderOwnerAccess;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<BluetoothPrinterDTO>> list() {
        Long traderId = traderContextService.getCurrentTraderId();
        Long userId = SecurityUtils.getCurrentUserId().orElseThrow();
        boolean owner = traderOwnerAccess.isUserTraderOwner(userId);
        return ResponseEntity.ok(bluetoothPrinterService.listForTrader(traderId, userId, owner));
    }

    @GetMapping("/access-check")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BluetoothPrinterAccessCheckDTO> accessCheck(@RequestParam("mac") String mac) {
        Long traderId = traderContextService.getCurrentTraderId();
        Long userId = SecurityUtils.getCurrentUserId().orElseThrow();
        boolean owner = traderOwnerAccess.isUserTraderOwner(userId);
        String normalized = BluetoothPrinterServiceImpl.normalizeMac(mac);
        boolean allowed = bluetoothPrinterService.isMacPrintAllowed(traderId, userId, owner, normalized);
        return ResponseEntity.ok(new BluetoothPrinterAccessCheckDTO(allowed));
    }

    @PostMapping
    @PreAuthorize(
        "@traderOwnerAccess.isCurrentUserTraderOwner() or " +
        "hasAnyAuthority(\"" +
        AuthoritiesConstants.PRINT_SETTINGS_EDIT +
        "\", \"" +
        AuthoritiesConstants.RBAC_SETTINGS_EDIT +
        "\")"
    )
    public ResponseEntity<BluetoothPrinterDTO> register(@Valid @RequestBody BluetoothPrinterRegisterRequest request) {
        Long traderId = traderContextService.getCurrentTraderId();
        Long userId = SecurityUtils.getCurrentUserId().orElseThrow();
        BluetoothPrinterDTO dto = bluetoothPrinterService.register(traderId, userId, request);
        return ResponseEntity.ok(dto);
    }

    @PutMapping("/{id}/access")
    @PreAuthorize("@traderOwnerAccess.isCurrentUserTraderOwner() or hasAuthority(\"" + AuthoritiesConstants.RBAC_SETTINGS_EDIT + "\")")
    public ResponseEntity<BluetoothPrinterDTO> updateAccess(
        @PathVariable("id") Long id,
        @Valid @RequestBody BluetoothPrinterAccessUpdateRequest request
    ) {
        Long traderId = traderContextService.getCurrentTraderId();
        return ResponseEntity.ok(bluetoothPrinterService.updateAccess(traderId, id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize(
        "@traderOwnerAccess.isCurrentUserTraderOwner() or " +
        "hasAnyAuthority(\"" +
        AuthoritiesConstants.PRINT_SETTINGS_EDIT +
        "\", \"" +
        AuthoritiesConstants.RBAC_SETTINGS_EDIT +
        "\")"
    )
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        Long traderId = traderContextService.getCurrentTraderId();
        bluetoothPrinterService.delete(traderId, id);
        return ResponseEntity.noContent().build();
    }
}
