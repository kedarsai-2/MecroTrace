package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Read-only context shown when a quantity-based self-sale unit is opened from the Sales Pad Self-Sale tab.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionSelfSaleContextDTO implements Serializable {

    @JsonProperty("self_sale_unit_id")
    private Long selfSaleUnitId;

    @JsonProperty("rate")
    private BigDecimal rate;

    @JsonProperty("quantity")
    private Integer quantity;

    @JsonProperty("remaining_qty")
    private Integer remainingQty;

    @JsonProperty("amount")
    private BigDecimal amount;

    @JsonProperty("previous_completed_auction_id")
    private Long previousCompletedAuctionId;

    @JsonProperty("previous_completed_at")
    private Instant previousCompletedAt;

    @JsonProperty("previous_entries")
    private List<AuctionResultEntryDTO> previousEntries = new ArrayList<>();

    @JsonProperty("created_at")
    private Instant createdAt;

    public Long getSelfSaleUnitId() {
        return selfSaleUnitId;
    }

    public void setSelfSaleUnitId(Long selfSaleUnitId) {
        this.selfSaleUnitId = selfSaleUnitId;
    }

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

    public Integer getRemainingQty() {
        return remainingQty;
    }

    public void setRemainingQty(Integer remainingQty) {
        this.remainingQty = remainingQty;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public Long getPreviousCompletedAuctionId() {
        return previousCompletedAuctionId;
    }

    public void setPreviousCompletedAuctionId(Long previousCompletedAuctionId) {
        this.previousCompletedAuctionId = previousCompletedAuctionId;
    }

    public Instant getPreviousCompletedAt() {
        return previousCompletedAt;
    }

    public void setPreviousCompletedAt(Instant previousCompletedAt) {
        this.previousCompletedAt = previousCompletedAt;
    }

    public List<AuctionResultEntryDTO> getPreviousEntries() {
        return previousEntries;
    }

    public void setPreviousEntries(List<AuctionResultEntryDTO> previousEntries) {
        this.previousEntries = previousEntries;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
