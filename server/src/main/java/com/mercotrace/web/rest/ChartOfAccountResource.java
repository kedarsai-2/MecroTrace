package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.ChartOfAccountService;
import com.mercotrace.service.dto.ChartOfAccountCreateRequest;
import com.mercotrace.service.dto.ChartOfAccountDTO;
import com.mercotrace.service.dto.ChartOfAccountUpdateRequest;
import com.mercotrace.service.dto.OpeningBalanceResponse;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.net.URI;
import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.HeaderUtil;
import tech.jhipster.web.util.PaginationUtil;

/**
 * REST controller for Chart of Accounts. Frontend: AccountingPage.tsx.
 * Paginated list (page, size, sort, search, accountingClass, classification), get by id, create, update, delete.
 */
@RestController
@RequestMapping("/api/chart-of-accounts")
public class ChartOfAccountResource {

    private static final Logger LOG = LoggerFactory.getLogger(ChartOfAccountResource.class);
    private static final String ENTITY_NAME = "chartOfAccount";

    @Value("${jhipster.clientApp.name}")
    private String applicationName;

    private final ChartOfAccountService chartOfAccountService;

    public ChartOfAccountResource(ChartOfAccountService chartOfAccountService) {
        this.chartOfAccountService = chartOfAccountService;
    }

    @GetMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CHART_OF_ACCOUNTS_VIEW + "\")")
    public ResponseEntity<Page<ChartOfAccountDTO>> getAll(
        @org.springdoc.core.annotations.ParameterObject
        @PageableDefault(size = 10, sort = "ledgerName", direction = Sort.Direction.ASC) Pageable pageable,
        @RequestParam(required = false) String search,
        @RequestParam(required = false) String accountingClass,
        @RequestParam(required = false) String classification
    ) {
        LOG.debug("REST request to get chart of accounts: page={}, search={}", pageable, search);
        Page<ChartOfAccountDTO> page = chartOfAccountService.getPage(pageable, search, accountingClass, classification);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CHART_OF_ACCOUNTS_VIEW + "\")")
    public ResponseEntity<ChartOfAccountDTO> getById(@PathVariable Long id) {
        LOG.debug("REST request to get chart of account: {}", id);
        try {
            ChartOfAccountDTO dto = chartOfAccountService.getById(id);
            return ResponseEntity.ok(dto);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "notfound");
        }
    }

    /**
     * GET /api/chart-of-accounts/{id}/opening-balance?asOfDate=yyyy-MM-dd
     * Returns opening balance. If asOfDate is provided, computes dynamically from historical transactions.
     * If omitted, returns stored opening balance.
     */
    @GetMapping("/{id}/opening-balance")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CHART_OF_ACCOUNTS_VIEW + "\")")
    public ResponseEntity<OpeningBalanceResponse> getOpeningBalance(
        @PathVariable Long id,
        @RequestParam(required = false) LocalDate asOfDate
    ) {
        LOG.debug("REST request to get opening balance for chart of account: {}, asOfDate={}", id, asOfDate);
        try {
            BigDecimal balance = chartOfAccountService.getOpeningBalance(id, asOfDate);
            return ResponseEntity.ok(new OpeningBalanceResponse(balance));
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "notfound");
        }
    }

    @PostMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CHART_OF_ACCOUNTS_CREATE + "\")")
    public ResponseEntity<ChartOfAccountDTO> create(@Valid @RequestBody ChartOfAccountCreateRequest request) throws java.net.URISyntaxException {
        LOG.debug("REST request to create chart of account: {}", request.getLedgerName());
        try {
            ChartOfAccountDTO result = chartOfAccountService.create(request);
            return ResponseEntity
                .created(new URI("/api/chart-of-accounts/" + result.getId()))
                .headers(HeaderUtil.createEntityCreationAlert(applicationName, true, ENTITY_NAME, result.getId().toString()))
                .body(result);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "validation");
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CHART_OF_ACCOUNTS_EDIT + "\")")
    public ResponseEntity<ChartOfAccountDTO> update(@PathVariable Long id, @Valid @RequestBody ChartOfAccountUpdateRequest request) {
        LOG.debug("REST request to update chart of account: {}", id);
        try {
            ChartOfAccountDTO result = chartOfAccountService.update(id, request);
            return ResponseEntity.ok()
                .headers(HeaderUtil.createEntityUpdateAlert(applicationName, true, ENTITY_NAME, id.toString()))
                .body(result);
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "validation");
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.CHART_OF_ACCOUNTS_DELETE + "\")")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        LOG.debug("REST request to delete chart of account: {}", id);
        try {
            chartOfAccountService.delete(id);
            return ResponseEntity.noContent()
                .headers(HeaderUtil.createEntityDeletionAlert(applicationName, true, ENTITY_NAME, id.toString()))
                .build();
        } catch (IllegalArgumentException e) {
            throw new BadRequestAlertException(e.getMessage(), ENTITY_NAME, "validation");
        }
    }
}
