package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mercotrace.domain.enumeration.AuctionPresetType;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * DTO for AuctionEntry used in Sales Pad session and results.
 * JSON keys aligned with frontend Sales Pad / mkt_auction_results expectations.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionEntryDTO implements Serializable {

    @JsonProperty("auction_entry_id")
    private Long id;

    @JsonProperty("auction_id")
    private Long auctionId;

    @JsonProperty("buyer_id")
    private Long buyerId;

    @JsonProperty("bid_number")
    private Integer bidNumber;

    @JsonProperty("bid_rate")
    private BigDecimal bidRate;

    @JsonProperty("preset_margin")
    private BigDecimal presetMargin;

    @JsonProperty("preset_type")
    private AuctionPresetType presetType;

    /** Base auction bid (same as bid_rate); not merged with preset — use bid_rate + preset_margin for effective seller rate. */
    @JsonProperty("seller_rate")
    private BigDecimal sellerRate;

    /** Vehicle-ops Summary “new seller rate”; independent from buyer_rate until Sales Pad edits the auction bid. */
    @JsonProperty("summary_seller_rate")
    private BigDecimal summarySellerRate;

    @JsonProperty("buyer_rate")
    private BigDecimal buyerRate;

    @JsonProperty("quantity")
    private Integer quantity;

    @JsonProperty("amount")
    private BigDecimal amount;

    @JsonProperty("is_self_sale")
    private Boolean isSelfSale;

    @JsonProperty("is_scribble")
    private Boolean isScribble;

    @JsonProperty("token_advance")
    private BigDecimal tokenAdvance;

    @JsonProperty("extra_rate")
    private BigDecimal extraRate;

    @JsonProperty("buyer_name")
    private String buyerName;

    @JsonProperty("buyer_mark")
    private String buyerMark;

    @JsonProperty("created_at")
    private Instant createdAt;

    /** Epoch millis of last modification — for optimistic concurrency on bid PATCH. */
    @JsonProperty("last_modified_ms")
    private Long lastModifiedMs;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getAuctionId() {
        return auctionId;
    }

    public void setAuctionId(Long auctionId) {
        this.auctionId = auctionId;
    }

    public Long getBuyerId() {
        return buyerId;
    }

    public void setBuyerId(Long buyerId) {
        this.buyerId = buyerId;
    }

    public Integer getBidNumber() {
        return bidNumber;
    }

    public void setBidNumber(Integer bidNumber) {
        this.bidNumber = bidNumber;
    }

    public BigDecimal getBidRate() {
        return bidRate;
    }

    public void setBidRate(BigDecimal bidRate) {
        this.bidRate = bidRate;
    }

    public BigDecimal getPresetMargin() {
        return presetMargin;
    }

    public void setPresetMargin(BigDecimal presetMargin) {
        this.presetMargin = presetMargin;
    }

    public AuctionPresetType getPresetType() {
        return presetType;
    }

    public void setPresetType(AuctionPresetType presetType) {
        this.presetType = presetType;
    }

    public BigDecimal getSellerRate() {
        return sellerRate;
    }

    public void setSellerRate(BigDecimal sellerRate) {
        this.sellerRate = sellerRate;
    }

    public BigDecimal getSummarySellerRate() {
        return summarySellerRate;
    }

    public void setSummarySellerRate(BigDecimal summarySellerRate) {
        this.summarySellerRate = summarySellerRate;
    }

    public BigDecimal getBuyerRate() {
        return buyerRate;
    }

    public void setBuyerRate(BigDecimal buyerRate) {
        this.buyerRate = buyerRate;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public Boolean getIsSelfSale() {
        return isSelfSale;
    }

    public void setIsSelfSale(Boolean selfSale) {
        isSelfSale = selfSale;
    }

    public Boolean getIsScribble() {
        return isScribble;
    }

    public void setIsScribble(Boolean scribble) {
        isScribble = scribble;
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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Long getLastModifiedMs() {
        return lastModifiedMs;
    }

    public void setLastModifiedMs(Long lastModifiedMs) {
        this.lastModifiedMs = lastModifiedMs;
    }
}

