package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.GlobalPresetMarkSettingService;
import com.mercotrace.service.dto.PresetMarkSettingDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tech.jhipster.web.util.HeaderUtil;

/**
 * Admin CRUD for global (platform-wide) auction margin presets.
 */
@RestController
@RequestMapping("/api/admin/global-preset-marks")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminGlobalPresetMarkSettingResource {

    private static final String ENTITY_NAME = "globalPresetMarkSetting";

    private final GlobalPresetMarkSettingService globalPresetMarkSettingService;

    public AdminGlobalPresetMarkSettingResource(GlobalPresetMarkSettingService globalPresetMarkSettingService) {
        this.globalPresetMarkSettingService = globalPresetMarkSettingService;
    }

    @GetMapping
    public ResponseEntity<List<PresetMarkSettingDTO>> list() {
        return ResponseEntity.ok(globalPresetMarkSettingService.findAll());
    }

    @PostMapping
    public ResponseEntity<PresetMarkSettingDTO> create(@Valid @RequestBody PresetMarkSettingDTO dto) {
        if (dto.getId() != null) {
            throw new BadRequestAlertException("A new preset must not have an id", ENTITY_NAME, "idexists");
        }
        PresetMarkSettingDTO created = globalPresetMarkSettingService.create(dto);
        return ResponseEntity.created(URI.create("/api/admin/global-preset-marks/" + created.getId())).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<PresetMarkSettingDTO> update(@PathVariable Long id, @Valid @RequestBody PresetMarkSettingDTO dto) {
        PresetMarkSettingDTO updated = globalPresetMarkSettingService.update(id, dto);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert("Merco", false, ENTITY_NAME, id.toString()))
            .body(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        globalPresetMarkSettingService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
