package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * Full Sales Pad session DTO for a lot:
 * Auction header + entries + aggregates.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionSessionDTO implements Serializable {

    @JsonProperty("auction_id")
    private Long auctionId;

    @JsonProperty("lot")
    private LotSummaryDTO lot;

    @JsonProperty("entries")
    private List<AuctionEntryDTO> entries = new ArrayList<>();

    @JsonProperty("total_sold_bags")
    private Integer totalSoldBags;

    @JsonProperty("remaining_bags")
    private Integer remainingBags;

    @JsonProperty("highest_bid_rate")
    private Integer highestBidRate;

    @JsonProperty("status")
    private String status;

    @JsonProperty("self_sale_context")
    private AuctionSelfSaleContextDTO selfSaleContext;

    public Long getAuctionId() {
        return auctionId;
    }

    public void setAuctionId(Long auctionId) {
        this.auctionId = auctionId;
    }

    public LotSummaryDTO getLot() {
        return lot;
    }

    public void setLot(LotSummaryDTO lot) {
        this.lot = lot;
    }

    public List<AuctionEntryDTO> getEntries() {
        return entries;
    }

    public void setEntries(List<AuctionEntryDTO> entries) {
        this.entries = entries;
    }

    public Integer getTotalSoldBags() {
        return totalSoldBags;
    }

    public void setTotalSoldBags(Integer totalSoldBags) {
        this.totalSoldBags = totalSoldBags;
    }

    public Integer getRemainingBags() {
        return remainingBags;
    }

    public void setRemainingBags(Integer remainingBags) {
        this.remainingBags = remainingBags;
    }

    public Integer getHighestBidRate() {
        return highestBidRate;
    }

    public void setHighestBidRate(Integer highestBidRate) {
        this.highestBidRate = highestBidRate;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public AuctionSelfSaleContextDTO getSelfSaleContext() {
        return selfSaleContext;
    }

    public void setSelfSaleContext(AuctionSelfSaleContextDTO selfSaleContext) {
        this.selfSaleContext = selfSaleContext;
    }
}

