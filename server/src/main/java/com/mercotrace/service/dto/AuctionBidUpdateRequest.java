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

    public BigDecimal getRate() {
        return rate;
    }

    public void setRate(BigDecimal rate) {
        this.rate = rate;
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
}

