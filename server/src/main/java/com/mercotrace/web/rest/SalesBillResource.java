package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.SalesBillService;
import com.mercotrace.service.dto.SalesBillDTOs.SalesBillCreateOrUpdateRequest;
import com.mercotrace.service.dto.SalesBillDTOs.SalesBillDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.PaginationUtil;

/**
 * REST controller for Sales Bill (Billing). Frontend: BillingPage.tsx.
 * Paginated list, get by id, create, update. Filters: billNumber, buyerName, dateFrom, dateTo.
 */
@RestController
@RequestMapping("/api/sales-bills")
public class SalesBillResource {

    private static final Logger LOG = LoggerFactory.getLogger(SalesBillResource.class);
    private static final String ENTITY_NAME = "salesBill";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final SalesBillService salesBillService;

    public SalesBillResource(SalesBillService salesBillService) {
        this.salesBillService = salesBillService;
    }

    /**
     * {@code GET  /api/sales-bills} : Paginated list. Optional: billNumber, buyerName, dateFrom, dateTo.
     */
    @GetMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.BILLING_VIEW + "\")")
    public ResponseEntity<Page<SalesBillDTO>> getBills(
        @org.springdoc.core.annotations.ParameterObject
        @PageableDefault(size = 10, sort = "billDate", direction = Sort.Direction.DESC) Pageable pageable,
        @RequestParam(required = false) String billNumber,
        @RequestParam(required = false) String buyerName,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo
    ) {
        LOG.debug("REST request to get sales bills: page={}, billNumber={}, buyerName={}", pageable, billNumber, buyerName);
        Page<SalesBillDTO> page = salesBillService.getBills(pageable, billNumber, buyerName, dateFrom, dateTo);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page);
    }

    /**
     * {@code GET  /api/sales-bills/:id} : Get one bill by id.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.BILLING_VIEW + "\")")
    public ResponseEntity<SalesBillDTO> getBill(@PathVariable Long id) {
        LOG.debug("REST request to get sales bill: {}", id);
        try {
            SalesBillDTO dto = salesBillService.getById(id);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "notfound");
        }
    }

    /**
     * {@code POST  /api/sales-bills} : Create a new bill. Bill number assigned by server.
     */
    @PostMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.BILLING_CREATE + "\")")
    public ResponseEntity<SalesBillDTO> createBill(@Valid @RequestBody SalesBillCreateOrUpdateRequest request) throws java.net.URISyntaxException {
        LOG.debug("REST request to create sales bill: buyerMark={}", request.getBuyerMark());
        try {
            SalesBillDTO result = salesBillService.create(request);
            return ResponseEntity
                .created(new URI("/api/sales-bills/" + result.getBillId()))
                .headers(HeaderUtil.createEntityCreationAlert(applicationName, true, ENTITY_NAME, result.getBillId()))
                .body(result);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "validation");
        }
    }

    /**
     * {@code PUT  /api/sales-bills/:id} : Update existing bill. Version snapshot appended.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.BILLING_EDIT + "\")")
    public ResponseEntity<SalesBillDTO> updateBill(@PathVariable Long id, @Valid @RequestBody SalesBillCreateOrUpdateRequest request) {
        LOG.debug("REST request to update sales bill: {}", id);
        try {
            SalesBillDTO result = salesBillService.update(id, request);
            return ResponseEntity.ok()
                .headers(HeaderUtil.createEntityUpdateAlert(applicationName, true, ENTITY_NAME, id.toString()))
                .body(result);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "validation");
        }
    }

    /**
     * {@code POST /api/sales-bills/:id/assign-number} : Assign a bill number based on commodity prefixes.
     * If the bill already has a number, this is a no-op and returns the current bill.
     */
    @PostMapping("/{id}/assign-number")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.BILLING_EDIT + "\")")
    public ResponseEntity<SalesBillDTO> assignBillNumber(@PathVariable Long id) {
        LOG.debug("REST request to assign bill number for sales bill: {}", id);
        try {
            SalesBillDTO result = salesBillService.assignNumber(id);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "validation");
        }
    }
}
