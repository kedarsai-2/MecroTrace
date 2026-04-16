package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.HighLevelReportsService;
import com.mercotrace.service.dto.AdminDailySummaryDTO;
import com.mercotrace.service.dto.PartyExposureRowDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for high-level analytics used by ReportsPage, PrintsReportsPage, and AdminReportsPage.
 */
@RestController
@RequestMapping
@Tag(name = "HighLevelReports", description = "High-level business analytics (daily sales, party exposure, admin summary)")
public class HighLevelReportsResource {

    private static final Logger LOG = LoggerFactory.getLogger(HighLevelReportsResource.class);

    private final HighLevelReportsService highLevelReportsService;

    public HighLevelReportsResource(HighLevelReportsService highLevelReportsService) {
        this.highLevelReportsService = highLevelReportsService;
    }

    @GetMapping("/api/reports/party-exposure")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.REPORTS_VIEW + "\")")
    @Operation(summary = "Party exposure", description = "Outstanding exposure per party (AR-focused).")
    public ResponseEntity<List<PartyExposureRowDTO>> getPartyExposure(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo
    ) {
        LOG.debug("REST request to get party exposure: dateFrom={}, dateTo={}", dateFrom, dateTo);
        return ResponseEntity.ok(highLevelReportsService.getPartyExposure(dateFrom, dateTo));
    }

    @GetMapping("/api/admin/reports/daily-summary")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @Operation(summary = "Admin daily summary", description = "Admin-facing daily summary metrics.")
    public ResponseEntity<AdminDailySummaryDTO> getAdminDailySummary(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo
    ) {
        LOG.debug("REST request to get admin daily summary: dateFrom={}, dateTo={}", dateFrom, dateTo);
        return ResponseEntity.ok(highLevelReportsService.getAdminDailySummary(dateFrom, dateTo));
    }
}

