package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class UserFeesDayDetailDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private LocalDate date;
    private String billPrefixApplied;
    private List<UserFeesBillRowDTO> bills = new ArrayList<>();
    /** Sum of {@code bills} (footer row). */
    private UserFeesTotalsDTO totals;

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public String getBillPrefixApplied() {
        return billPrefixApplied;
    }

    public void setBillPrefixApplied(String billPrefixApplied) {
        this.billPrefixApplied = billPrefixApplied;
    }

    public List<UserFeesBillRowDTO> getBills() {
        return bills;
    }

    public void setBills(List<UserFeesBillRowDTO> bills) {
        this.bills = bills;
    }

    public UserFeesTotalsDTO getTotals() {
        return totals;
    }

    public void setTotals(UserFeesTotalsDTO totals) {
        this.totals = totals;
    }
}
