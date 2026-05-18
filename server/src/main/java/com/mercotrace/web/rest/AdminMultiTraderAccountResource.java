package com.mercotrace.web.rest;

import com.mercotrace.domain.enumeration.MultiTraderAccountRequestStatus;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.MultiTraderAccountRequestService;
import com.mercotrace.service.dto.MultiTraderAccountRequestDTO;
import com.mercotrace.web.rest.vm.MultiTraderAccountDecisionVM;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;

/**
 * REST API for Admin Multi Trader Account.
 */
@RestController
@RequestMapping("/api/admin/multi-trader-accounts")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminMultiTraderAccountResource {

    private final MultiTraderAccountRequestService multiAccountService;

    public AdminMultiTraderAccountResource(MultiTraderAccountRequestService multiAccountService) {
        this.multiAccountService = multiAccountService;
    }

    @GetMapping("")
    public ResponseEntity<List<MultiTraderAccountRequestDTO>> list(
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "q", required = false) String q,
        Pageable pageable
    ) {
        Page<MultiTraderAccountRequestDTO> page = multiAccountService.searchAdmin(parseStatus(status), q, pageable);
        return ResponseEntity.ok()
            .headers(PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page))
            .body(page.getContent());
    }

    @GetMapping("/{id}")
    public MultiTraderAccountRequestDTO get(@PathVariable Long id) {
        return multiAccountService.findOne(id);
    }

    @PatchMapping("/{id}/approve")
    public MultiTraderAccountRequestDTO approve(
        @PathVariable Long id,
        @Valid @RequestBody(required = false) MultiTraderAccountDecisionVM body
    ) {
        return multiAccountService.approve(id, body != null ? body.getReason() : null);
    }

    @PatchMapping("/{id}/reject")
    public MultiTraderAccountRequestDTO reject(
        @PathVariable Long id,
        @Valid @RequestBody MultiTraderAccountDecisionVM body
    ) {
        return multiAccountService.reject(id, body != null ? body.getReason() : null);
    }

    @PatchMapping("/groups/{requestGroupId}/approve")
    public List<MultiTraderAccountRequestDTO> approveGroup(
        @PathVariable String requestGroupId,
        @Valid @RequestBody(required = false) MultiTraderAccountDecisionVM body
    ) {
        return multiAccountService.approveGroup(requestGroupId, body != null ? body.getReason() : null);
    }

    @PatchMapping("/groups/{requestGroupId}/reject")
    public List<MultiTraderAccountRequestDTO> rejectGroup(
        @PathVariable String requestGroupId,
        @Valid @RequestBody MultiTraderAccountDecisionVM body
    ) {
        return multiAccountService.rejectGroup(requestGroupId, body != null ? body.getReason() : null);
    }

    private MultiTraderAccountRequestStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank() || "ALL".equalsIgnoreCase(raw)) {
            return null;
        }
        try {
            return MultiTraderAccountRequestStatus.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid request status");
        }
    }
}
