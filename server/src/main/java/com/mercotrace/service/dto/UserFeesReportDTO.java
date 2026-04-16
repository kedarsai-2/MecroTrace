package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class UserFeesReportDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private LocalDate periodStart;
    private LocalDate periodEnd;
    /** Normalized prefix used for filtering (empty = all). */
    private String billPrefixApplied;
    private List<UserFeesDayRowDTO> days = new ArrayList<>();
    private UserFeesTotalsDTO totals;

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

    public String getBillPrefixApplied() {
        return billPrefixApplied;
    }

    public void setBillPrefixApplied(String billPrefixApplied) {
        this.billPrefixApplied = billPrefixApplied;
    }

    public List<UserFeesDayRowDTO> getDays() {
        return days;
    }

    public void setDays(List<UserFeesDayRowDTO> days) {
        this.days = days;
    }

    public UserFeesTotalsDTO getTotals() {
        return totals;
    }

    public void setTotals(UserFeesTotalsDTO totals) {
        this.totals = totals;
    }
}
