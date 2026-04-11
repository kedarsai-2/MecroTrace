package com.mercotrace.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * Commodity configuration: rate, weights, flags, bill prefix, hamali enabled.
 * One row per commodity. Audit: created_by, created_date, last_modified_by, last_modified_date.
 */
@Entity
@Table(name = "commodity_config")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class CommodityConfig extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @Column(name = "commodity_id", nullable = false)
    private Long commodityId;

    @NotNull
    @Column(name = "rate_per_unit", nullable = false)
    private Double ratePerUnit;

    @NotNull
    @Column(name = "min_weight", nullable = false)
    private Double minWeight = 0D;

    @NotNull
    @Column(name = "max_weight", nullable = false)
    private Double maxWeight = 0D;

    @NotNull
    @Column(name = "govt_deduction_enabled", nullable = false)
    private Boolean govtDeductionEnabled = false;

    @NotNull
    @Column(name = "roundoff_enabled", nullable = false)
    private Boolean roundoffEnabled = false;

    @NotNull
    @Column(name = "commission_percent", nullable = false)
    private Double commissionPercent = 0D;

    @NotNull
    @Column(name = "user_fee_percent", nullable = false)
    private Double userFeePercent = 0D;

    @Column(name = "hsn_code", length = 20)
    private String hsnCode;

    @Column(name = "weighing_charge")
    private Double weighingCharge;

    @Column(name = "bill_prefix", length = 10)
    private String billPrefix;

    @NotNull
    @Column(name = "hamali_enabled", nullable = false)
    private Boolean hamaliEnabled = false;

    @Column(name = "gst_rate")
    private Double gstRate;

    @Column(name = "sgst_rate")
    private Double sgstRate;

    @Column(name = "cgst_rate")
    private Double cgstRate;

    @Column(name = "igst_rate")
    private Double igstRate;

    @Column(name = "weighing_threshold")
    private Double weighingThreshold;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getCommodityId() {
        return commodityId;
    }

    public void setCommodityId(Long commodityId) {
        this.commodityId = commodityId;
    }

    public Double getRatePerUnit() {
        return ratePerUnit;
    }

    public void setRatePerUnit(Double ratePerUnit) {
        this.ratePerUnit = ratePerUnit;
    }

    public Double getMinWeight() {
        return minWeight;
    }

    public void setMinWeight(Double minWeight) {
        this.minWeight = minWeight;
    }

    public Double getMaxWeight() {
        return maxWeight;
    }

    public void setMaxWeight(Double maxWeight) {
        this.maxWeight = maxWeight;
    }

    public Boolean getGovtDeductionEnabled() {
        return govtDeductionEnabled;
    }

    public void setGovtDeductionEnabled(Boolean govtDeductionEnabled) {
        this.govtDeductionEnabled = govtDeductionEnabled;
    }

    public Boolean getRoundoffEnabled() {
        return roundoffEnabled;
    }

    public void setRoundoffEnabled(Boolean roundoffEnabled) {
        this.roundoffEnabled = roundoffEnabled;
    }

    public Double getCommissionPercent() {
        return commissionPercent;
    }

    public void setCommissionPercent(Double commissionPercent) {
        this.commissionPercent = commissionPercent;
    }

    public Double getUserFeePercent() {
        return userFeePercent;
    }

    public void setUserFeePercent(Double userFeePercent) {
        this.userFeePercent = userFeePercent;
    }

    public String getHsnCode() {
        return hsnCode;
    }

    public void setHsnCode(String hsnCode) {
        this.hsnCode = hsnCode;
    }

    public Double getWeighingCharge() {
        return weighingCharge;
    }

    public void setWeighingCharge(Double weighingCharge) {
        this.weighingCharge = weighingCharge;
    }

    public String getBillPrefix() {
        return billPrefix;
    }

    public void setBillPrefix(String billPrefix) {
        this.billPrefix = billPrefix;
    }

    public Boolean getHamaliEnabled() {
        return hamaliEnabled;
    }

    public void setHamaliEnabled(Boolean hamaliEnabled) {
        this.hamaliEnabled = hamaliEnabled;
    }

    public Double getGstRate() {
        return gstRate;
    }

    public void setGstRate(Double gstRate) {
        this.gstRate = gstRate;
    }

    public Double getSgstRate() {
        return sgstRate;
    }

    public void setSgstRate(Double sgstRate) {
        this.sgstRate = sgstRate;
    }

    public Double getCgstRate() {
        return cgstRate;
    }

    public void setCgstRate(Double cgstRate) {
        this.cgstRate = cgstRate;
    }

    public Double getIgstRate() {
        return igstRate;
    }

    public void setIgstRate(Double igstRate) {
        this.igstRate = igstRate;
    }

    public Double getWeighingThreshold() {
        return weighingThreshold;
    }

    public void setWeighingThreshold(Double weighingThreshold) {
        this.weighingThreshold = weighingThreshold;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CommodityConfig)) return false;
        return id != null && id.equals(((CommodityConfig) o).getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
