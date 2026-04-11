package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.SettlementService;
import com.mercotrace.service.dto.SettlementDTOs.*;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.validation.Valid;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;

/**
 * REST controller for Settlement (Sales Patti).
 * Base path: /api/settlements. Aligned with SettlementPage.tsx.
 */
@RestController
@RequestMapping("/api/settlements")
public class SettlementResource {

    private static final Logger LOG = LoggerFactory.getLogger(SettlementResource.class);
    private static final String ENTITY_NAME = "patti";

    private final SettlementService settlementService;

    public SettlementResource(SettlementService settlementService) {
        this.settlementService = settlementService;
    }

    /**
     * {@code GET  /api/settlements/sellers} : list sellers for settlement (paginated).
     * Built from completed auctions + weighing, trader-scoped.
     */
    @GetMapping("/sellers")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<List<SellerSettlementDTO>> listSellers(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable,
        @RequestParam(required = false) String search
    ) {
        LOG.debug("REST request to get Settlement sellers page: {}", pageable);
        var page = settlementService.listSellers(pageable, search);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /api/settlements/pattis} : list pattis (paginated).
     */
    @GetMapping("/pattis")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<List<PattiDTO>> listPattis(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get Pattis page: {}", pageable);
        var page = settlementService.listPattis(pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /api/settlements/pattis/in-progress} : list in-progress pattis (paginated).
     */
    @GetMapping("/pattis/in-progress")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<List<PattiDTO>> listInProgressPattis(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get in-progress Pattis page: {}", pageable);
        var page = settlementService.listInProgressPattis(pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /api/settlements/sellers/:sellerId/charges} :
     * compute seller-level charges (freight, advance) for a new Patti.
     */
    @GetMapping("/sellers/{sellerId}/charges")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<SellerChargesDTO> getSellerCharges(@PathVariable String sellerId) {
        LOG.debug("REST request to get Settlement seller charges for sellerId : {}", sellerId);
        SellerChargesDTO dto = settlementService.getSellerCharges(sellerId);
        return ResponseEntity.ok(dto);
    }

    /**
     * {@code GET  /api/settlements/sellers/:sellerId/expense-snapshot} :
     * server-computed freight (bag share), unloading/weighing (commodity slabs), cash advance.
     */
    @GetMapping("/sellers/{sellerId}/expense-snapshot")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<SellerExpenseSnapshotDTO> getSellerExpenseSnapshot(@PathVariable String sellerId) {
        LOG.debug("REST request to get Settlement seller expense snapshot for sellerId : {}", sellerId);
        return ResponseEntity.ok(settlementService.getSellerExpenseSnapshot(sellerId));
    }

    /**
     * {@code POST  /api/settlements/quick-expenses/hydrate} :
     * return persisted quick-expense original/current values and initialize missing rows from provided defaults.
     */
    @PostMapping("/quick-expenses/hydrate")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<QuickExpenseStateResponse> hydrateQuickExpenseState(
        @Valid @RequestBody QuickExpenseStateUpsertRequest request
    ) {
        LOG.debug("REST request to hydrate Settlement quick-expense state for {} rows", request.getRows() != null ? request.getRows().size() : 0);
        return ResponseEntity.ok(settlementService.hydrateQuickExpenseState(request));
    }

    /**
     * {@code POST  /api/settlements/quick-expenses/save} :
     * persist quick-expense current values while preserving initial baseline values.
     */
    @PostMapping("/quick-expenses/save")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_EDIT + "\")")
    public ResponseEntity<QuickExpenseStateResponse> saveQuickExpenseState(
        @Valid @RequestBody QuickExpenseStateUpsertRequest request
    ) {
        LOG.debug("REST request to save Settlement quick-expense state for {} rows", request.getRows() != null ? request.getRows().size() : 0);
        return ResponseEntity.ok(settlementService.saveQuickExpenseState(request));
    }

    /**
     * {@code GET  /api/settlements/sellers/:sellerId/amount-summary} :
     * arrival freight, invoiced freight, and invoiced payable for Sales Patti Amount card.
     */
    @GetMapping("/sellers/{sellerId}/amount-summary")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<SettlementAmountSummaryDTO> getSettlementAmountSummary(
        @PathVariable String sellerId,
        @RequestParam(required = false) String invoiceName
    ) {
        LOG.debug("REST request to get Settlement amount summary for sellerId : {}", sellerId);
        SettlementAmountSummaryDTO dto = settlementService.getSettlementAmountSummary(sellerId, invoiceName);
        return ResponseEntity.ok(dto);
    }

    /**
     * {@code PUT  /api/settlements/sellers/:sellerId/contact} :
     * link this settlement seller ({@code seller_in_vehicle} id) to a registered contact.
     */
    @PutMapping("/sellers/{sellerId}/contact")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_EDIT + "\")")
    public ResponseEntity<SellerRegistrationDTO> linkSellerContact(
        @PathVariable String sellerId,
        @Valid @RequestBody LinkSellerContactRequest request
    ) {
        LOG.debug("REST request to link Settlement seller {} to contact {}", sellerId, request.getContactId());
        try {
            SellerRegistrationDTO dto = settlementService.linkSellerContact(sellerId, request);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "linkcontactfailed");
        }
    }

    /**
     * {@code PUT  /api/settlements/sellers/:sellerId/replace} :
     * replace this settlement seller identity from another settlement seller row.
     */
    @PutMapping("/sellers/{sellerId}/replace")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_EDIT + "\")")
    public ResponseEntity<SellerReplacementDTO> replaceSeller(
        @PathVariable String sellerId,
        @Valid @RequestBody ReplaceSellerRequest request
    ) {
        LOG.debug("REST request to replace Settlement seller {} using {}", sellerId, request.getReplacementSellerId());
        try {
            SellerReplacementDTO dto = settlementService.replaceSeller(sellerId, request);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "replacesellerfailed");
        }
    }

    /**
     * {@code POST /api/settlements/sellers/:sellerId/vouchers/temp} :
     * create a temporary settlement voucher row to be migrated later.
     */
    @PostMapping("/sellers/{sellerId}/vouchers/temp")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_EDIT + "\")")
    public ResponseEntity<SettlementVoucherTempDTO> createSettlementVoucherTemp(
        @PathVariable String sellerId,
        @Valid @RequestBody SettlementVoucherTempCreateRequest request
    ) {
        LOG.debug("REST request to create temporary settlement voucher for sellerId : {}", sellerId);
        try {
            return ResponseEntity.ok(settlementService.createSettlementVoucherTemp(sellerId, request));
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "createtempvoucherfailed");
        }
    }

    @GetMapping("/sellers/{sellerId}/vouchers/temp")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<SettlementVoucherTempListResponse> listSettlementVoucherTemps(@PathVariable String sellerId) {
        LOG.debug("REST request to list temporary settlement vouchers for sellerId : {}", sellerId);
        try {
            return ResponseEntity.ok(settlementService.listSettlementVoucherTemps(sellerId));
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "listtempvoucherfailed");
        }
    }

    @PutMapping("/sellers/{sellerId}/vouchers/temp")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_EDIT + "\")")
    public ResponseEntity<SettlementVoucherTempListResponse> saveSettlementVoucherTemps(
        @PathVariable String sellerId,
        @Valid @RequestBody SettlementVoucherTempUpsertRequest request
    ) {
        LOG.debug("REST request to save temporary settlement vouchers for sellerId : {}", sellerId);
        try {
            return ResponseEntity.ok(settlementService.saveSettlementVoucherTemps(sellerId, request));
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "savetempvoucherfailed");
        }
    }

    /**
     * {@code GET /api/settlements/pattis/next-base-number} :
     * reserve next Sales Patti base number (commodity-prefix when available, else numeric).
     */
    @GetMapping("/pattis/next-base-number")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_CREATE + "\")")
    public ResponseEntity<String> reserveNextPattiBaseNumber(@RequestParam(required = false) String sellerId) {
        LOG.debug("REST request to reserve next Sales Patti base number (sellerId={})", sellerId);
        return ResponseEntity.ok(settlementService.reserveNextPattiBaseNumber(sellerId));
    }

    /**
     * {@code POST  /api/settlements/pattis} : create a new patti.
     * Patti ID generated server-side (base-sellerSequence, e.g. 2255-1).
     */
    @PostMapping("/pattis")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_CREATE + "\")")
    public ResponseEntity<PattiDTO> createPatti(@Valid @RequestBody PattiSaveRequest request) {
        LOG.debug("REST request to create Patti for seller : {}", request.getSellerName());
        PattiDTO created = settlementService.createPatti(request);
        return ResponseEntity.ok(created);
    }

    /**
     * {@code GET  /api/settlements/pattis/:id} : get patti by id.
     */
    @GetMapping("/pattis/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<PattiDTO> getPattiById(@PathVariable Long id) {
        LOG.debug("REST request to get Patti : {}", id);
        return settlementService.getPattiById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * {@code GET  /api/settlements/pattis/by-patti-id/:pattiId} : get patti by business key.
     */
    @GetMapping("/pattis/by-patti-id/{pattiId}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_VIEW + "\")")
    public ResponseEntity<PattiDTO> getPattiByPattiId(@PathVariable String pattiId) {
        LOG.debug("REST request to get Patti by pattiId : {}", pattiId);
        return settlementService.getPattiByPattiId(pattiId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * {@code PUT  /api/settlements/pattis/:id} : update patti (e.g. deductions).
     */
    @PutMapping("/pattis/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.SETTLEMENTS_EDIT + "\")")
    public ResponseEntity<PattiDTO> updatePatti(@PathVariable Long id, @Valid @RequestBody PattiSaveRequest request) {
        LOG.debug("REST request to update Patti : {}", id);
        if (id == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        return settlementService.updatePatti(id, request)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }
}
