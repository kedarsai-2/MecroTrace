package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.Serializable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Canonical Auction Result DTO (replaces mkt_auction_results entry).
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionResultDTO implements Serializable {

    @JsonProperty("auction_id")
    private Long auctionId;

    @JsonProperty("lotId")
    private Long lotId;

    @JsonProperty("lotName")
    private String lotName;

    @JsonProperty("sellerName")
    private String sellerName;

    @JsonProperty("sellerVehicleId")
    private Long sellerVehicleId;

    @JsonProperty("vehicleNumber")
    private String vehicleNumber;

    /** Vehicle mark alias (arrival). With totals, used in printed lot identifier. */
    @JsonProperty("vehicleMark")
    private String vehicleMark;

    /** Seller mark (contact or seller-in-vehicle). */
    @JsonProperty("sellerMark")
    private String sellerMark;

    /** Sum of bag counts for all lots on this vehicle (all sellers). */
    @JsonProperty("vehicleTotalQty")
    private Integer vehicleTotalQty;

    /** Sum of bag counts for all lots of this seller on the vehicle. */
    @JsonProperty("sellerTotalQty")
    private Integer sellerTotalQty;

    @JsonProperty("commodityName")
    private String commodityName;

    @JsonProperty("auctionDatetime")
    private Instant auctionDatetime;

    @JsonProperty("conductedBy")
    private String conductedBy;

    @JsonProperty("completedAt")
    private Instant completedAt;

    @JsonProperty("selfSaleUnitId")
    private Long selfSaleUnitId;

    @JsonProperty("entries")
    private List<AuctionResultEntryDTO> entries = new ArrayList<>();

    public Long getAuctionId() {
        return auctionId;
    }

    public void setAuctionId(Long auctionId) {
        this.auctionId = auctionId;
    }

    public Long getLotId() {
        return lotId;
    }

    public void setLotId(Long lotId) {
        this.lotId = lotId;
    }

    public String getLotName() {
        return lotName;
    }

    public void setLotName(String lotName) {
        this.lotName = lotName;
    }

    public String getSellerName() {
        return sellerName;
    }

    public void setSellerName(String sellerName) {
        this.sellerName = sellerName;
    }

    public Long getSellerVehicleId() {
        return sellerVehicleId;
    }

    public void setSellerVehicleId(Long sellerVehicleId) {
        this.sellerVehicleId = sellerVehicleId;
    }

    public String getVehicleNumber() {
        return vehicleNumber;
    }

    public void setVehicleNumber(String vehicleNumber) {
        this.vehicleNumber = vehicleNumber;
    }

    public String getVehicleMark() {
        return vehicleMark;
    }

    public void setVehicleMark(String vehicleMark) {
        this.vehicleMark = vehicleMark;
    }

    public String getSellerMark() {
        return sellerMark;
    }

    public void setSellerMark(String sellerMark) {
        this.sellerMark = sellerMark;
    }

    public Integer getVehicleTotalQty() {
        return vehicleTotalQty;
    }

    public void setVehicleTotalQty(Integer vehicleTotalQty) {
        this.vehicleTotalQty = vehicleTotalQty;
    }

    public Integer getSellerTotalQty() {
        return sellerTotalQty;
    }

    public void setSellerTotalQty(Integer sellerTotalQty) {
        this.sellerTotalQty = sellerTotalQty;
    }

    public String getCommodityName() {
        return commodityName;
    }

    public void setCommodityName(String commodityName) {
        this.commodityName = commodityName;
    }

    public Instant getAuctionDatetime() {
        return auctionDatetime;
    }

    public void setAuctionDatetime(Instant auctionDatetime) {
        this.auctionDatetime = auctionDatetime;
    }

    public String getConductedBy() {
        return conductedBy;
    }

    public void setConductedBy(String conductedBy) {
        this.conductedBy = conductedBy;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }

    public Long getSelfSaleUnitId() {
        return selfSaleUnitId;
    }

    public void setSelfSaleUnitId(Long selfSaleUnitId) {
        this.selfSaleUnitId = selfSaleUnitId;
    }

    public List<AuctionResultEntryDTO> getEntries() {
        return entries;
    }

    public void setEntries(List<AuctionResultEntryDTO> entries) {
        this.entries = entries;
    }
}

