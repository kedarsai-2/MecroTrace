package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.time.Instant;

/**
 * DTO for commodity_config. Includes audit fields.
 */
public class CommodityConfigDTO implements Serializable {

    private Long id;

    @NotNull
    @JsonProperty("commodity_id")
    private Long commodityId;

    @NotNull
    @JsonProperty("rate_per_unit")
    private Double ratePerUnit;

    @NotNull
    @JsonProperty("min_weight")
    private Double minWeight = 0D;

    @NotNull
    @JsonProperty("max_weight")
    private Double maxWeight = 0D;

    @NotNull
    @JsonProperty("govt_deduction_enabled")
    private Boolean govtDeductionEnabled = false;

    @NotNull
    @JsonProperty("roundoff_enabled")
    private Boolean roundoffEnabled = false;

    @NotNull
    @JsonProperty("commission_percent")
    private Double commissionPercent = 0D;

    @NotNull
    @JsonProperty("user_fee_percent")
    private Double userFeePercent = 0D;

    @JsonProperty("hsn_code")
    private String hsnCode;

    @JsonProperty("weighing_charge")
    private Double weighingCharge;

    @JsonProperty("bill_prefix")
    private String billPrefix;

    @NotNull
    @JsonProperty("hamali_enabled")
    private Boolean hamaliEnabled = false;

    @JsonProperty("gst_rate")
    private Double gstRate;

    @JsonProperty("sgst_rate")
    private Double sgstRate;

    @JsonProperty("cgst_rate")
    private Double cgstRate;

    @JsonProperty("igst_rate")
    private Double igstRate;

    @JsonProperty("weighing_threshold")
    private Double weighingThreshold;

    @JsonProperty("created_by")
    private String createdBy;

    @JsonProperty("created_date")
    private Instant createdDate;

    @JsonProperty("last_modified_by")
    private String lastModifiedBy;

    @JsonProperty("last_modified_date")
    private Instant lastModifiedDate;

    // getters/setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getCommodityId() { return commodityId; }
    public void setCommodityId(Long commodityId) { this.commodityId = commodityId; }
    public Double getRatePerUnit() { return ratePerUnit; }
    public void setRatePerUnit(Double ratePerUnit) { this.ratePerUnit = ratePerUnit; }
    public Double getMinWeight() { return minWeight; }
    public void setMinWeight(Double minWeight) { this.minWeight = minWeight; }
    public Double getMaxWeight() { return maxWeight; }
    public void setMaxWeight(Double maxWeight) { this.maxWeight = maxWeight; }
    public Boolean getGovtDeductionEnabled() { return govtDeductionEnabled; }
    public void setGovtDeductionEnabled(Boolean govtDeductionEnabled) { this.govtDeductionEnabled = govtDeductionEnabled; }
    public Boolean getRoundoffEnabled() { return roundoffEnabled; }
    public void setRoundoffEnabled(Boolean roundoffEnabled) { this.roundoffEnabled = roundoffEnabled; }
    public Double getCommissionPercent() { return commissionPercent; }
    public void setCommissionPercent(Double commissionPercent) { this.commissionPercent = commissionPercent; }
    public Double getUserFeePercent() { return userFeePercent; }
    public void setUserFeePercent(Double userFeePercent) { this.userFeePercent = userFeePercent; }
    public String getHsnCode() { return hsnCode; }
    public void setHsnCode(String hsnCode) { this.hsnCode = hsnCode; }
    public Double getWeighingCharge() { return weighingCharge; }
    public void setWeighingCharge(Double weighingCharge) { this.weighingCharge = weighingCharge; }
    public String getBillPrefix() { return billPrefix; }
    public void setBillPrefix(String billPrefix) { this.billPrefix = billPrefix; }
    public Boolean getHamaliEnabled() { return hamaliEnabled; }
    public void setHamaliEnabled(Boolean hamaliEnabled) { this.hamaliEnabled = hamaliEnabled; }
    public Double getGstRate() { return gstRate; }
    public void setGstRate(Double gstRate) { this.gstRate = gstRate; }
    public Double getSgstRate() { return sgstRate; }
    public void setSgstRate(Double sgstRate) { this.sgstRate = sgstRate; }
    public Double getCgstRate() { return cgstRate; }
    public void setCgstRate(Double cgstRate) { this.cgstRate = cgstRate; }
    public Double getIgstRate() { return igstRate; }
    public void setIgstRate(Double igstRate) { this.igstRate = igstRate; }
    public Double getWeighingThreshold() { return weighingThreshold; }
    public void setWeighingThreshold(Double weighingThreshold) { this.weighingThreshold = weighingThreshold; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedDate() { return createdDate; }
    public void setCreatedDate(Instant createdDate) { this.createdDate = createdDate; }
    public String getLastModifiedBy() { return lastModifiedBy; }
    public void setLastModifiedBy(String lastModifiedBy) { this.lastModifiedBy = lastModifiedBy; }
    public Instant getLastModifiedDate() { return lastModifiedDate; }
    public void setLastModifiedDate(Instant lastModifiedDate) { this.lastModifiedDate = lastModifiedDate; }
}
