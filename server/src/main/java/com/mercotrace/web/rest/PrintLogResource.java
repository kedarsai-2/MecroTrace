package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.PrintLogService;
import com.mercotrace.service.dto.PrintLogCreateRequest;
import com.mercotrace.service.dto.PrintLogDTO;
import jakarta.validation.Valid;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tech.jhipster.web.util.PaginationUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * REST controller for print audit log (Print Hub).
 * Base path: /api/print-logs. Used by BillingPage, WeighingPage, SettlementPage, LogisticsPage (API only; no store).
 */
@RestController
@RequestMapping("/api/print-logs")
@Tag(name = "Print Logs", description = "Print event audit log")
public class PrintLogResource {

    private static final Logger LOG = LoggerFactory.getLogger(PrintLogResource.class);

    private final PrintLogService printLogService;

    public PrintLogResource(PrintLogService printLogService) {
        this.printLogService = printLogService;
    }

    @PostMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.PRINT_LOGS_VIEW + "\")")
    @Operation(summary = "Log print event", description = "Record a print event (sales bill, weighing slip, etc.)")
    public ResponseEntity<PrintLogDTO> create(@Valid @RequestBody PrintLogCreateRequest request) {
        LOG.debug("REST request to create PrintLog: {} {}", request.getPrintType(), request.getReferenceType());
        PrintLogDTO dto = printLogService.create(request);
        return ResponseEntity.ok(dto);
    }

    @GetMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.PRINT_LOGS_VIEW + "\")")
    @Operation(summary = "List print logs", description = "Paginated list of print events for current trader")
    public ResponseEntity<List<PrintLogDTO>> list(
        @org.springdoc.core.annotations.ParameterObject Pageable pageable
    ) {
        LOG.debug("REST request to get PrintLog page: {}", pageable);
        Page<PrintLogDTO> page = printLogService.list(pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(ServletUriComponentsBuilder.fromCurrentRequest(), page);
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }
}
