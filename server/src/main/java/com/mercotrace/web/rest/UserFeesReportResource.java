package com.mercotrace.web.rest;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.UserFeesReportService;
import com.mercotrace.service.dto.UserFeesDayDetailDTO;
import com.mercotrace.service.dto.UserFeesReportDTO;
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
@Tag(name = "UserFeesReport", description = "User fee and weighman billing aggregates for trader reports")
public class UserFeesReportResource {

    private static final Logger LOG = LoggerFactory.getLogger(UserFeesReportResource.class);

    private static final String ENTITY_NAME = "userFeesReport";

    private final UserFeesReportService userFeesReportService;

    public UserFeesReportResource(UserFeesReportService userFeesReportService) {
        this.userFeesReportService = userFeesReportService;
    }

    @GetMapping("/api/reports/user-fees")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.REPORTS_VIEW + "\")")
    @Operation(summary = "User fees report", description = "Per-day billed bags, sales, user charges, and weighman charges.")
    public ResponseEntity<UserFeesReportDTO> getUserFeesReport(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
        @RequestParam(required = false) String billPrefix
    ) {
        LOG.debug("REST request user-fees report: dateFrom={}, dateTo={}, billPrefix={}", dateFrom, dateTo, billPrefix);
        try {
            return ResponseEntity.ok(userFeesReportService.getReport(dateFrom, dateTo, billPrefix));
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "invalidrange");
        }
    }

    @GetMapping("/api/reports/user-fees/day")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.REPORTS_VIEW + "\")")
    @Operation(summary = "User fees day detail", description = "Per-bill rows for one UTC bill day.")
    public ResponseEntity<UserFeesDayDetailDTO> getUserFeesDay(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
        @RequestParam(required = false) String billPrefix
    ) {
        LOG.debug("REST request user-fees day: date={}, billPrefix={}", date, billPrefix);
        try {
            return ResponseEntity.ok(userFeesReportService.getDayDetail(date, billPrefix));
        } catch (IllegalArgumentException ex) {
            throw new BadRequestAlertException(ex.getMessage(), ENTITY_NAME, "invalidday");
        }
    }
}
