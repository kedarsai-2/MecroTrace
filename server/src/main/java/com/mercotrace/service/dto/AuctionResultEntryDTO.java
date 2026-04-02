package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mercotrace.domain.enumeration.AuctionPresetType;
import java.io.Serializable;
import java.math.BigDecimal;

/**
 * Entry DTO for Auction results, aligned with mkt_auction_results entry shape.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionResultEntryDTO implements Serializable {

    @JsonProperty("bidNumber")
    private Integer bidNumber;

    /** Primary key of {@code auction_entry}; used by Billing to sync buyer changes. */
    @JsonProperty("auctionEntryId")
    private Long auctionEntryId;

    @JsonProperty("buyerId")
    private Long buyerId;

    @JsonProperty("buyerMark")
    private String buyerMark;

    @JsonProperty("buyerName")
    private String buyerName;

    @JsonProperty("rate")
    private BigDecimal rate;

    @JsonProperty("quantity")
    private Integer quantity;

    @JsonProperty("amount")
    private BigDecimal amount;

    @JsonProperty("isSelfSale")
    private Boolean isSelfSale;

    @JsonProperty("isScribble")
    private Boolean isScribble;

    @JsonProperty("presetApplied")
    private BigDecimal presetApplied;

    @JsonProperty("presetType")
    private AuctionPresetType presetType;

    @JsonProperty("tokenAdvance")
    private BigDecimal tokenAdvance;

    public Integer getBidNumber() {
        return bidNumber;
    }

    public void setBidNumber(Integer bidNumber) {
        this.bidNumber = bidNumber;
    }

    public Long getAuctionEntryId() {
        return auctionEntryId;
    }

    public void setAuctionEntryId(Long auctionEntryId) {
        this.auctionEntryId = auctionEntryId;
    }

    public Long getBuyerId() {
        return buyerId;
    }

    public void setBuyerId(Long buyerId) {
        this.buyerId = buyerId;
    }

    public String getBuyerMark() {
        return buyerMark;
    }

    public void setBuyerMark(String buyerMark) {
        this.buyerMark = buyerMark;
    }

    public String getBuyerName() {
        return buyerName;
    }

    public void setBuyerName(String buyerName) {
        this.buyerName = buyerName;
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

    public BigDecimal getTokenAdvance() {
        return tokenAdvance;
    }

    public void setTokenAdvance(BigDecimal tokenAdvance) {
        this.tokenAdvance = tokenAdvance;
    }
}

