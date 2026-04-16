package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Daily sales summary: one row per calendar day (UTC) in descending date order, plus range totals.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class DailySalesSummaryReportDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private LocalDate periodStart;
    private LocalDate periodEnd;
    private List<DailySalesSummaryDayRowDTO> days = new ArrayList<>();
    private DailySalesSummaryTotalsDTO totals;

    public LocalDate getPeriodStart() {
        return periodStart;
    }

    public void setPeriodStart(LocalDate periodStart) {
        this.periodStart = periodStart;
    }

    public LocalDate getPeriodEnd() {
        return periodEnd;
    }

    public void setPeriodEnd(LocalDate periodEnd) {
        this.periodEnd = periodEnd;
    }

    public List<DailySalesSummaryDayRowDTO> getDays() {
        return days;
    }

    public void setDays(List<DailySalesSummaryDayRowDTO> days) {
        this.days = days;
    }

    public DailySalesSummaryTotalsDTO getTotals() {
        return totals;
    }

    public void setTotals(DailySalesSummaryTotalsDTO totals) {
        this.totals = totals;
    }
}
