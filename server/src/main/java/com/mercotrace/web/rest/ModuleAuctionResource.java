package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.AuctionService;
import com.mercotrace.service.AuctionService.AuctionConflictException;
import com.mercotrace.service.AuctionService.StaleBidEditException;
import com.mercotrace.service.dto.AuctionBidCreateRequest;
import com.mercotrace.service.dto.AuctionBidUpdateRequest;
import com.mercotrace.service.dto.AuctionResultDTO;
import com.mercotrace.service.dto.AuctionSelfSaleUnitDTO;
import com.mercotrace.service.dto.AuctionSessionDTO;
import com.mercotrace.service.dto.LotSummaryDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * REST controller for the Auctions (Sales Pad) module.
 *
 * Frontend contract is defined by AuctionsPage.tsx and downstream consumers (Billing, Weighing, etc.).
 * Base path: /api/module-auctions. All endpoints require authentication and Auctions RBAC (View/Create/Edit/Delete/Approve).
 */
@RestController
@RequestMapping("/api/module-auctions")
@Tag(name = "Module Auctions", description = "Auctions (Sales Pad) – lots, session, bids, complete, results")
public class ModuleAuctionResource {

    private static final Logger LOG = LoggerFactory.getLogger(ModuleAuctionResource.class);

    private static final String ENTITY_NAME = "auction";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final AuctionService auctionService;

    public ModuleAuctionResource(AuctionService auctionService) {
        this.auctionService = auctionService;
    }

    /**
     * {@code GET  /module-auctions/lots} : list lots with auction-aware status.
     *
     * Query params: page (0-based), size (default 10), sort, status (optional: AVAILABLE, SOLD, PARTIAL, PENDING), q (optional search on lot name).
     */
    @Operation(summary = "List lots with auction status", description = "Paginated list; supports sort, status filter, and search (q)")
    @ApiResponses({ @ApiResponse(responseCode = "200", description = "OK") })
    @GetMapping("/lots")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<List<LotSummaryDTO>> listLots(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String q
    ) {
        LOG.debug("REST request to get Auction lots page: {} status={} q={}", pageable, status, q);
        Sort sort = pageable.getSort();
        Pageable p =
            sort.stream().anyMatch(o -> "lot_id".equalsIgnoreCase(o.getProperty()))
                ? PageRequest.of(
                    pageable.getPageNumber(),
                    pageable.getPageSize(),
                    Sort.by(
                        sort.stream()
                            .map(
                                o ->
                                    new Sort.Order(
                                        o.getDirection(),
                                        "lot_id".equalsIgnoreCase(o.getProperty()) ? "id" : o.getProperty()))
                            .toList()))
                : pageable;
        Page<LotSummaryDTO> page = auctionService.listLotsWithStatus(p, status, q);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET /module-auctions/self-sale-units} : list open/partial self-sale units for re-auction.
     */
    @Operation(summary = "List self-sale units", description = "Paginated list of quantity-based self-sale units for Sales Pad re-auction")
    @ApiResponses({ @ApiResponse(responseCode = "200", description = "OK") })
    @GetMapping("/self-sale-units")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<List<AuctionSelfSaleUnitDTO>> listSelfSaleUnits(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable,
        @RequestParam(required = false) String q
    ) {
        LOG.debug("REST request to get self-sale units page: {} q={}", pageable, q);
        Page<AuctionSelfSaleUnitDTO> page = auctionService.listSelfSaleUnits(pageable, q);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /module-auctions/temporary-buyer-marks/today} : distinct scribble marks for the current trader
     * for the current calendar day (Asia/Kolkata); excludes marks that match registered contacts.
     */
    @Operation(summary = "Temporary buyer marks (today)", description = "Scribble marks from today's bids, trader-scoped")
    @ApiResponses({ @ApiResponse(responseCode = "200", description = "OK") })
    @GetMapping("/temporary-buyer-marks/today")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<List<String>> listTemporaryBuyerMarksToday() {
        LOG.debug("REST request to list temporary buyer marks for today");
        return ResponseEntity.ok(auctionService.listTemporaryBuyerMarksForCurrentCalendarDay());
    }

    /**
     * {@code GET  /module-auctions/lots/:lotId/session} : get or start an auction session for a lot.
     */
    @Operation(summary = "Get or start session", description = "Returns current auction session for the lot or creates one")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Lot not found; body: { message, status, errors }")
    })
    @GetMapping("/lots/{lotId}/session")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<?> getSession(@PathVariable("lotId") Long lotId) {
        LOG.debug("REST request to get Auction session for lot {}", lotId);
        try {
            AuctionSessionDTO session = auctionService.getOrStartSession(lotId);
            return ResponseEntity.ok(session);
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "lotId");
        }
    }

    /**
     * {@code GET  /module-auctions/lots/:lotId/session/current} : read current auction session without creating one.
     */
    @Operation(summary = "Get current session", description = "Returns the current auction session for the lot without creating one")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "204", description = "No session exists"),
        @ApiResponse(responseCode = "404", description = "Lot not found")
    })
    @GetMapping("/lots/{lotId}/session/current")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<?> getCurrentSession(@PathVariable("lotId") Long lotId) {
        LOG.debug("REST request to get current Auction session for lot {}", lotId);
        try {
            Optional<AuctionSessionDTO> session = auctionService.getCurrentSession(lotId);
            return session.<ResponseEntity<?>>map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "lotId");
        }
    }

    /**
     * {@code GET  /module-auctions/self-sale-units/:id/session} : get or start a re-auction session for a self-sale unit.
     */
    @Operation(summary = "Get or start self-sale re-auction session", description = "Returns active session for the self-sale unit or creates a fresh re-auction session while preserving history")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Self-sale unit not found")
    })
    @GetMapping("/self-sale-units/{id}/session")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<?> getSelfSaleSession(@PathVariable("id") Long selfSaleUnitId) {
        LOG.debug("REST request to get Self-Sale Auction session for unit {}", selfSaleUnitId);
        try {
            AuctionSessionDTO session = auctionService.getOrStartSelfSaleSession(selfSaleUnitId);
            return ResponseEntity.ok(session);
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "selfSaleUnitId");
        }
    }

    /**
     * {@code GET  /module-auctions/self-sale-units/:id/session/current} : read active re-auction session without creating one.
     */
    @Operation(summary = "Get current self-sale re-auction session", description = "Returns active self-sale session without creating one")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "204", description = "No active session exists"),
        @ApiResponse(responseCode = "404", description = "Self-sale unit not found")
    })
    @GetMapping("/self-sale-units/{id}/session/current")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<?> getCurrentSelfSaleSession(@PathVariable("id") Long selfSaleUnitId) {
        LOG.debug("REST request to get current Self-Sale Auction session for unit {}", selfSaleUnitId);
        try {
            Optional<AuctionSessionDTO> session = auctionService.getCurrentSelfSaleSession(selfSaleUnitId);
            return session.<ResponseEntity<?>>map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "selfSaleUnitId");
        }
    }

    /**
     * {@code POST /module-auctions/self-sale-units/:id/session/bids} : add a bid to a self-sale re-auction session.
     */
    @Operation(summary = "Add self-sale re-auction bid", description = "Add a bid to the current self-sale unit session; 409 if quantity exceeds remaining self-sale quantity")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "400", description = "Validation error"),
        @ApiResponse(responseCode = "404", description = "Self-sale unit not found"),
        @ApiResponse(responseCode = "409", description = "Quantity conflict")
    })
    @PostMapping("/self-sale-units/{id}/session/bids")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_CREATE + "\")")
    public ResponseEntity<?> addSelfSaleBid(
        @PathVariable("id") Long selfSaleUnitId,
        @Valid @RequestBody AuctionBidCreateRequest request
    ) {
        LOG.debug("REST request to add self-sale bid for unit {}: {}", selfSaleUnitId, request);
        try {
            AuctionSessionDTO session = auctionService.addBidToSelfSaleUnit(selfSaleUnitId, request);
            return ResponseEntity.ok(session);
        } catch (AuctionConflictException conflict) {
            return buildQuantityConflictResponse(conflict);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "validation");
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "selfSaleUnitId");
        }
    }

    /**
     * {@code PATCH /module-auctions/self-sale-units/:id/session/bids/:bidId} : update a bid in self-sale re-auction session.
     */
    @Operation(summary = "Update self-sale re-auction bid", description = "Update rate, quantity, token advance, extra rate, preset on a self-sale re-auction bid")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "400", description = "Validation error"),
        @ApiResponse(responseCode = "404", description = "Self-sale unit or bid not found"),
        @ApiResponse(responseCode = "409", description = "Stale bid or quantity conflict")
    })
    @PatchMapping("/self-sale-units/{id}/session/bids/{bidId}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_EDIT + "\")")
    public ResponseEntity<?> updateSelfSaleBid(
        @PathVariable("id") Long selfSaleUnitId,
        @PathVariable("bidId") Long bidId,
        @RequestBody AuctionBidUpdateRequest request
    ) {
        LOG.debug("REST request to update self-sale bid {} for unit {}: {}", bidId, selfSaleUnitId, request);
        try {
            AuctionSessionDTO session = auctionService.updateBidInSelfSaleUnit(selfSaleUnitId, bidId, request);
            return ResponseEntity.ok(session);
        } catch (StaleBidEditException ex) {
            return buildErrorResponse(HttpStatus.CONFLICT, ex.getMessage(), "stale_bid");
        } catch (AuctionConflictException conflict) {
            return buildQuantityConflictResponse(conflict);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "validation");
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "bidId");
        }
    }

    /**
     * {@code DELETE /module-auctions/self-sale-units/:id/session/bids/:bidId} : delete a bid from self-sale re-auction session.
     */
    @Operation(summary = "Delete self-sale re-auction bid", description = "Remove a bid from the self-sale unit session")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Self-sale unit or bid not found")
    })
    @DeleteMapping("/self-sale-units/{id}/session/bids/{bidId}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_DELETE + "\")")
    public ResponseEntity<?> deleteSelfSaleBid(
        @PathVariable("id") Long selfSaleUnitId,
        @PathVariable("bidId") Long bidId
    ) {
        LOG.debug("REST request to delete self-sale bid {} for unit {}", bidId, selfSaleUnitId);
        try {
            AuctionSessionDTO session = auctionService.deleteBidFromSelfSaleUnit(selfSaleUnitId, bidId);
            return ResponseEntity.ok(session);
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "bidId");
        }
    }

    /**
     * {@code POST /module-auctions/self-sale-units/:id/complete} : complete the re-auction for a self-sale unit.
     */
    @Operation(summary = "Complete self-sale re-auction", description = "Marks self-sale re-auction completed and decrements remaining self-sale quantity")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Self-sale unit or auction not found"),
        @ApiResponse(responseCode = "409", description = "Conflict (e.g. no bids or quantity overflow)")
    })
    @PostMapping("/self-sale-units/{id}/complete")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_APPROVE + "\")")
    public ResponseEntity<?> completeSelfSaleAuction(@PathVariable("id") Long selfSaleUnitId) {
        LOG.debug("REST request to complete self-sale Auction for unit {}", selfSaleUnitId);
        try {
            AuctionResultDTO result = auctionService.completeSelfSaleAuction(selfSaleUnitId);
            return ResponseEntity.ok(result);
        } catch (AuctionConflictException conflict) {
            Map<String, Object> body = standardErrorBody(
                HttpStatus.CONFLICT,
                conflict.getMessage(),
                conflict.getField(),
                conflict.getMessage()
            );
            return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "selfSaleUnitId");
        }
    }

    /**
     * {@code POST  /module-auctions/lots/:lotId/session/bids} : add a bid to the auction session.
     */
    @Operation(summary = "Add bid", description = "Add a bid to the current auction session; 409 if quantity exceeds lot (use allowLotIncrease to confirm)")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "400", description = "Validation error"),
        @ApiResponse(responseCode = "404", description = "Lot not found"),
        @ApiResponse(responseCode = "409", description = "Quantity conflict; body: { message, status, errors }")
    })
    @PostMapping("/lots/{lotId}/session/bids")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_CREATE + "\")")
    public ResponseEntity<?> addBid(
        @PathVariable("lotId") Long lotId,
        @Valid @RequestBody AuctionBidCreateRequest request
    ) {
        LOG.debug("REST request to add Auction bid for lot {}: {}", lotId, request);
        try {
            AuctionSessionDTO session = auctionService.addBid(lotId, request);
            return ResponseEntity.ok(session);
        } catch (AuctionConflictException conflict) {
            return buildQuantityConflictResponse(conflict);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "validation");
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "lotId");
        }
    }

    /**
     * {@code PATCH  /module-auctions/lots/:lotId/session/bids/:bidId} : update editable fields on a bid.
     */
    @Operation(summary = "Update bid", description = "Update rate, quantity, token advance, extra rate, preset on a bid; 409 on stale version or quantity conflict")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "400", description = "Validation error"),
        @ApiResponse(responseCode = "404", description = "Bid or lot not found; body: { message, status, errors }"),
        @ApiResponse(responseCode = "409", description = "Stale bid or quantity conflict; body: { message, status, errors }")
    })
    @PatchMapping("/lots/{lotId}/session/bids/{bidId}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_EDIT + "\")")
    public ResponseEntity<?> updateBid(
        @PathVariable("lotId") Long lotId,
        @PathVariable("bidId") Long bidId,
        @RequestBody AuctionBidUpdateRequest request
    ) {
        LOG.debug("REST request to update Auction bid {} for lot {}: {}", bidId, lotId, request);
        try {
            AuctionSessionDTO session = auctionService.updateBid(lotId, bidId, request);
            return ResponseEntity.ok(session);
        } catch (StaleBidEditException ex) {
            return buildErrorResponse(HttpStatus.CONFLICT, ex.getMessage(), "stale_bid");
        } catch (AuctionConflictException conflict) {
            return buildQuantityConflictResponse(conflict);
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "validation");
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "bidId");
        }
    }

    /**
     * {@code DELETE  /module-auctions/lots/:lotId/session/bids/:bidId} : delete a bid.
     */
    @Operation(summary = "Delete bid", description = "Remove a bid from the auction session")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Bid or lot not found; body: { message, status, errors }")
    })
    @DeleteMapping("/lots/{lotId}/session/bids/{bidId}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_DELETE + "\")")
    public ResponseEntity<?> deleteBid(
        @PathVariable("lotId") Long lotId,
        @PathVariable("bidId") Long bidId
    ) {
        LOG.debug("REST request to delete Auction bid {} for lot {}", bidId, lotId);
        try {
            AuctionSessionDTO session = auctionService.deleteBid(lotId, bidId);
            return ResponseEntity.ok(session);
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "bidId");
        }
    }

    /**
     * {@code POST  /module-auctions/lots/:lotId/complete} : complete the auction for a lot.
     */
    @Operation(summary = "Complete auction", description = "Marks auction completed and returns result DTO; 409 if no bids or quantity conflict")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Lot or auction not found"),
        @ApiResponse(responseCode = "409", description = "Conflict (e.g. no bids); body: { message, status, errors }")
    })
    @PostMapping("/lots/{lotId}/complete")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_APPROVE + "\")")
    public ResponseEntity<?> completeAuction(@PathVariable("lotId") Long lotId) {
        LOG.debug("REST request to complete Auction for lot {}", lotId);
        try {
            AuctionResultDTO result = auctionService.completeAuction(lotId);
            return ResponseEntity.ok(result);
        } catch (AuctionConflictException conflict) {
            Map<String, Object> body = standardErrorBody(
                HttpStatus.CONFLICT,
                conflict.getMessage(),
                conflict.getField(),
                conflict.getMessage()
            );
            return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
        } catch (EntityNotFoundException ex) {
            return buildErrorResponse(HttpStatus.NOT_FOUND, ex.getMessage(), "lotId");
        }
    }

    /**
     * {@code GET  /module-auctions/results} : list auction results (paginated, completed auctions only).
     *
     * Query params: page (0-based), size (default 10), sort.
     */
    @Operation(summary = "List results", description = "Paginated list of completed auction results; supports sort")
    @ApiResponses({ @ApiResponse(responseCode = "200", description = "OK") })
    @GetMapping("/results")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<List<AuctionResultDTO>> listResults(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get Auction results page: {}", pageable);
        Page<AuctionResultDTO> page = auctionService.listResults(pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * {@code GET  /module-auctions/results/lots/:lotId} : get auction result for a lot.
     */
    @Operation(summary = "Get result by lot", description = "Returns completed auction result for the lot or 404")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Not found; body: { message, status, errors }")
    })
    @GetMapping("/results/lots/{lotId}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<?> getResultByLot(@PathVariable("lotId") Long lotId) {
        LOG.debug("REST request to get Auction result for lot {}", lotId);
        Optional<AuctionResultDTO> resultOpt = auctionService.getResultByLot(lotId);
        if (resultOpt.isPresent()) {
            return ResponseEntity.ok(resultOpt.get());
        }
        return buildErrorResponse(HttpStatus.NOT_FOUND, "Auction result not found for lot", "lotId");
    }

    /**
     * {@code GET  /module-auctions/results/bids/:bidNumber} : get auction result for a bid number.
     */
    @Operation(summary = "Get result by bid number", description = "Returns auction result containing the bid or 404")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "OK"),
        @ApiResponse(responseCode = "404", description = "Not found; body: { message, status, errors }")
    })
    @GetMapping("/results/bids/{bidNumber}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.AUCTIONS_VIEW + "\")")
    public ResponseEntity<?> getResultByBidNumber(@PathVariable("bidNumber") Integer bidNumber) {
        LOG.debug("REST request to get Auction result for bidNumber {}", bidNumber);
        Optional<AuctionResultDTO> resultOpt = auctionService.getResultByBidNumber(bidNumber);
        if (resultOpt.isPresent()) {
            return ResponseEntity.ok(resultOpt.get());
        }
        return buildErrorResponse(HttpStatus.NOT_FOUND, "Auction result not found for bid number", "bidNumber");
    }

    private ResponseEntity<?> buildQuantityConflictResponse(AuctionConflictException conflict) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("field", conflict.getField());
        error.put("message", "Adding this bid exceeds lot quantity");
        error.put("currentTotal", conflict.getCurrentTotal());
        error.put("lotTotal", conflict.getLotTotal());
        error.put("attemptedQty", conflict.getAttemptedQty());
        error.put("newTotal", conflict.getNewTotal());
        Map<String, Object> body = standardErrorBody(HttpStatus.CONFLICT, conflict.getMessage(), conflict.getField(), "Adding this bid exceeds lot quantity");
        body.put("errors", List.of(error));
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    /**
     * Standard error body: { "message", "status", "errors": [ { "field", "message" } ] }.
     */
    private Map<String, Object> standardErrorBody(HttpStatus status, String message, String field, String fieldMessage) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        body.put("status", status.value());
        body.put("errors", List.of(Map.of("field", field != null ? field : "error", "message", fieldMessage != null ? fieldMessage : message)));
        return body;
    }

    private ResponseEntity<?> buildErrorResponse(HttpStatus status, String message, String field) {
        Map<String, Object> body = standardErrorBody(status, message, field, message);
        return ResponseEntity.status(status).body(body);
    }
}
