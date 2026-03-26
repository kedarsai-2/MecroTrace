package com.mercotrace.web.rest;

import com.mercotrace.domain.enumeration.ApprovalStatus;
import com.mercotrace.repository.UserTraderRepository;
import com.mercotrace.service.TraderOwnerAuthorityService;
import com.mercotrace.service.TraderQueryService;
import com.mercotrace.service.TraderService;
import com.mercotrace.service.criteria.TraderCriteria;
import com.mercotrace.service.dto.TraderDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import com.mercotrace.web.rest.vm.TraderPresetEnabledVM;
import tech.jhipster.service.filter.BooleanFilter;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import jakarta.validation.Valid;
import java.time.Instant;
import tech.jhipster.web.util.PaginationUtil;
import tech.jhipster.web.util.ResponseUtil;

/**
 * Module 1 spec — admin trader paths: GET/PATCH /api/admin/traders, GET /api/admin/traders/{id}, PATCH /api/admin/traders/{id}/approve.
 */
@RestController
@RequestMapping("/api/admin/traders")
@PreAuthorize("hasAuthority(\"" + com.mercotrace.security.AuthoritiesConstants.ADMIN + "\")")
public class AdminTraderSpecResource {

    private final TraderService traderService;
    private final TraderQueryService traderQueryService;
    private final UserTraderRepository userTraderRepository;
    private final TraderOwnerAuthorityService traderOwnerAuthorityService;

    public AdminTraderSpecResource(
        TraderService traderService,
        TraderQueryService traderQueryService,
        UserTraderRepository userTraderRepository,
        TraderOwnerAuthorityService traderOwnerAuthorityService
    ) {
        this.traderService = traderService;
        this.traderQueryService = traderQueryService;
        this.userTraderRepository = userTraderRepository;
        this.traderOwnerAuthorityService = traderOwnerAuthorityService;
    }

    /** Module 1 spec: GET /admin/traders — List traders. By default returns active only; use includeInactive=true for all. */
    @GetMapping("")
    public ResponseEntity<List<TraderDTO>> listTraders(
        TraderCriteria criteria,
        @RequestParam(name = "includeInactive", defaultValue = "false") boolean includeInactive,
        Pageable pageable
    ) {
        if (!includeInactive && criteria.getActive() == null) {
            BooleanFilter activeFilter = new BooleanFilter();
            activeFilter.setEquals(true);
            criteria.setActive(activeFilter);
        }
        Page<TraderDTO> page = traderQueryService.findByCriteria(criteria, pageable);
        return ResponseEntity.ok().headers(PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page)).body(page.getContent());
    }

    /** GET /admin/traders/inactive — List inactive traders only. */
    @GetMapping("/inactive")
    public ResponseEntity<List<TraderDTO>> listInactiveTraders(Pageable pageable) {
        TraderCriteria criteria = new TraderCriteria();
        BooleanFilter inactiveFilter = new BooleanFilter();
        inactiveFilter.setEquals(false);
        criteria.setActive(inactiveFilter);
        Page<TraderDTO> page = traderQueryService.findByCriteria(criteria, pageable);
        return ResponseEntity.ok().headers(PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page)).body(page.getContent());
    }

    /** Module 1 spec: GET /admin/traders/{id} — Get trader details. */
    @GetMapping("/{id}")
    public ResponseEntity<TraderDTO> getTrader(@PathVariable Long id) {
        return ResponseUtil.wrapOrNotFound(traderService.findOne(id));
    }

    /** PATCH /admin/traders/{id}/activate — Mark trader as active (allows login). */
    @PatchMapping("/{id}/activate")
    public ResponseEntity<Void> activateTrader(@PathVariable Long id) {
        traderService.setActiveDirect(id, true);
        return ResponseEntity.noContent().build();
    }

    /** PATCH /admin/traders/{id}/deactivate — Mark trader as inactive (blocks login for trader and staff). */
    @PatchMapping("/{id}/deactivate")
    public ResponseEntity<Void> deactivateTrader(@PathVariable Long id) {
        traderService.setActiveDirect(id, false);
        return ResponseEntity.noContent().build();
    }

    /** DELETE /admin/traders/{id}/permanent — Permanently delete an inactive trader. Only allowed when trader is inactive. */
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<Void> permanentDeleteTrader(@PathVariable Long id) {
        try {
            traderService.permanentDelete(id);
        } catch (IllegalStateException e) {
            throw new BadRequestAlertException(e.getMessage(), "trader", "traderactive");
        }
        return ResponseEntity.noContent().build();
    }

    /** Module 1 spec: PATCH /admin/traders/{id}/approve — Approve Trader (enables transactional features). */
    @PatchMapping("/{id}/approve")
    public ResponseEntity<TraderDTO> approveTrader(@PathVariable Long id) {
        return traderService
            .findOne(id)
            .map(dto -> {
                dto.setApprovalStatus(ApprovalStatus.APPROVED);
                dto.setApprovalDecisionAt(Instant.now());
                TraderDTO updated = traderService.update(dto);
                userTraderRepository.findAllWithUserByTraderIdAndPrimaryMappingTrue(id).forEach(ut ->
                    traderOwnerAuthorityService.ensureTraderOwnerAuthorities(ut.getUser())
                );
                return ResponseEntity.ok(updated);
            })
            .orElse(ResponseEntity.notFound().build());
    }

    /** PATCH /admin/traders/{id}/preset-enabled — Enable or disable trader-owned preset marks (off = use global presets). */
    @PatchMapping("/{id}/preset-enabled")
    public ResponseEntity<TraderDTO> updatePresetEnabled(@PathVariable Long id, @Valid @RequestBody TraderPresetEnabledVM body) {
        try {
            return ResponseEntity.ok(traderService.setPresetEnabled(id, body.isEnabled()));
        } catch (jakarta.persistence.EntityNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** PATCH /admin/traders/{id}/reject — Reject a pending trader registration. */
    @PatchMapping("/{id}/reject")
    public ResponseEntity<TraderDTO> rejectTrader(@PathVariable Long id) {
        return traderService
            .findOne(id)
            .map(dto -> {
                if (dto.getApprovalStatus() != ApprovalStatus.PENDING) {
                    throw new BadRequestAlertException("Only pending traders can be rejected", "trader", "notpending");
                }
                dto.setApprovalStatus(ApprovalStatus.REJECTED);
                dto.setApprovalDecisionAt(Instant.now());
                TraderDTO updated = traderService.update(dto);
                userTraderRepository.findAllWithUserByTraderIdAndPrimaryMappingTrue(id).forEach(ut ->
                    traderOwnerAuthorityService.ensureTraderOwnerAuthorities(ut.getUser())
                );
                return ResponseEntity.ok(updated);
            })
            .orElse(ResponseEntity.notFound().build());
    }
}
