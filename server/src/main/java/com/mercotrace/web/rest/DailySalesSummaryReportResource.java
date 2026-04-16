package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.DailySalesSummaryReportService;
import com.mercotrace.service.dto.DailySalesSummaryReportDTO;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping
@Tag(name = "DailySalesSummaryReport", description = "Daily sales summary metrics for trader reports")
public class DailySalesSummaryReportResource {

    private static final Logger LOG = LoggerFactory.getLogger(DailySalesSummaryReportResource.class);

    private static final String ENTITY_NAME = "dailySalesSummaryReport";

    private final DailySalesSummaryReportService dailySalesSummaryReportService;

    public DailySalesSummaryReportResource(DailySalesSummaryReportService dailySalesSummaryReportService) {
        this.dailySalesSummaryReportService = dailySalesSummaryReportService;
    }

    @GetMapping("/api/reports/daily-sales-summary")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.REPORTS_VIEW + "\")")
    @Operation(summary = "Daily sales summary", description = "Billing and arrivals aggregates for the selected date range.")
    public ResponseEntity<DailySalesSummaryReportDTO> getDailySalesSummary(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo
    ) {
        LOG.debug("REST request to get daily sales summary report: dateFrom={}, dateTo={}", dateFrom, dateTo);
        try {
            return ResponseEntity.ok(dailySalesSummaryReportService.getSummary(dateFrom, dateTo));
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "invalidrange");
        }
    }
}
