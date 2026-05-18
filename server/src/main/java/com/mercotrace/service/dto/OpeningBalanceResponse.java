package com.mercotrace.service.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

/** Response for GET /api/chart-of-accounts/{id}/opening-balance */
@Schema(description = "Ledger opening balance for the requested as-of date")
public class OpeningBalanceResponse {

    private BigDecimal openingBalance;

    public OpeningBalanceResponse() {}

    public OpeningBalanceResponse(BigDecimal openingBalance) {
        this.openingBalance = openingBalance;
    }

    public BigDecimal getOpeningBalance() {
        return openingBalance;
    }

    public void setOpeningBalance(BigDecimal openingBalance) {
        this.openingBalance = openingBalance;
    }
}
