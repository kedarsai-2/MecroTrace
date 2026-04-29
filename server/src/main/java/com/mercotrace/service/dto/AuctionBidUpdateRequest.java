package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mercotrace.domain.enumeration.AuctionPresetType;
import java.io.Serializable;
import java.math.BigDecimal;

/**
 * Request DTO for updating editable fields on an existing bid.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionBidUpdateRequest implements Serializable {

    @JsonProperty("rate")
    private BigDecimal rate;

    /** When set without {@code rate}, updates only summary_seller_rate and does not recompute buyer_rate / amount. */
    @JsonProperty("summary_seller_rate")
    private BigDecimal summarySellerRate;

    @JsonProperty("quantity")
    private Integer quantity;

    @JsonProperty("token_advance")
    private BigDecimal tokenAdvance;

    @JsonProperty("extra_rate")
    private BigDecimal extraRate;

    @JsonProperty("preset_applied")
    private BigDecimal presetApplied;

    @JsonProperty("preset_type")
    private AuctionPresetType presetType;

    @JsonProperty("allow_lot_increase")
    private boolean allowLotIncrease;

    /** Client copy of session entry {@code last_modified_ms} when edit started; mismatch → 409. */
    @JsonProperty("expected_last_modified_ms")
    private Long expectedLastModifiedMs;

    /**
     * When true (Billing module), apply {@code buyer_id}, {@code buyer_name}, {@code buyer_mark} on this entry
     * so auction rows match the invoice buyer after cross-buyer bid moves or buyer replacement.
     */
    @JsonProperty("billing_reassign_buyer")
    private Boolean billingReassignBuyer;

    @JsonProperty("buyer_id")
    private Long buyerId;

    @JsonProperty("buyer_name")
    private String buyerName;

    @JsonProperty("buyer_mark")
    private String buyerMark;

    public BigDecimal getRate() {
        return rate;
    }

    public void setRate(BigDecimal rate) {
        this.rate = rate;
    }

    public BigDecimal getSummarySellerRate() {
        return summarySellerRate;
    }

    public void setSummarySellerRate(BigDecimal summarySellerRate) {
        this.summarySellerRate = summarySellerRate;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getTokenAdvance() {
        return tokenAdvance;
    }

    public void setTokenAdvance(BigDecimal tokenAdvance) {
        this.tokenAdvance = tokenAdvance;
    }

    public BigDecimal getExtraRate() {
        return extraRate;
    }

    public void setExtraRate(BigDecimal extraRate) {
        this.extraRate = extraRate;
    }

    public BigDecimal getPresetApplied() {
        return presetApplied;
    }

    public void setPresetApplied(BigDecimal presetApplied) {
        this.presetApplied = presetApplied;
    }

    public AuctionPresetType getPresetType() {
        return presetType;
    }

    public void setPresetType(AuctionPresetType presetType) {
        this.presetType = presetType;
    }

    public boolean isAllowLotIncrease() {
        return allowLotIncrease;
    }

    public void setAllowLotIncrease(boolean allowLotIncrease) {
        this.allowLotIncrease = allowLotIncrease;
    }

    public Long getExpectedLastModifiedMs() {
        return expectedLastModifiedMs;
    }

    public void setExpectedLastModifiedMs(Long expectedLastModifiedMs) {
        this.expectedLastModifiedMs = expectedLastModifiedMs;
    }

    public Boolean getBillingReassignBuyer() {
        return billingReassignBuyer;
    }

    public void setBillingReassignBuyer(Boolean billingReassignBuyer) {
        this.billingReassignBuyer = billingReassignBuyer;
    }

    public Long getBuyerId() {
        return buyerId;
    }

    public void setBuyerId(Long buyerId) {
        this.buyerId = buyerId;
    }

    public String getBuyerName() {
        return buyerName;
    }

    public void setBuyerName(String buyerName) {
        this.buyerName = buyerName;
    }

    public String getBuyerMark() {
        return buyerMark;
    }

    public void setBuyerMark(String buyerMark) {
        this.buyerMark = buyerMark;
    }
}

