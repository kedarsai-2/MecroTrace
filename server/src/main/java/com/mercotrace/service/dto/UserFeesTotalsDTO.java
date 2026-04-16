package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class UserFeesTotalsDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private long totalBags;
    private BigDecimal totalSales;
    private BigDecimal userCharges;
    private BigDecimal weighmanCharge;

    public long getTotalBags() {
        return totalBags;
    }

    public void setTotalBags(long totalBags) {
        this.totalBags = totalBags;
    }

    public BigDecimal getTotalSales() {
        return totalSales;
    }

    public void setTotalSales(BigDecimal totalSales) {
        this.totalSales = totalSales;
    }

    public BigDecimal getUserCharges() {
        return userCharges;
    }

    public void setUserCharges(BigDecimal userCharges) {
        this.userCharges = userCharges;
    }

    public BigDecimal getWeighmanCharge() {
        return weighmanCharge;
    }

    public void setWeighmanCharge(BigDecimal weighmanCharge) {
        this.weighmanCharge = weighmanCharge;
    }
}
