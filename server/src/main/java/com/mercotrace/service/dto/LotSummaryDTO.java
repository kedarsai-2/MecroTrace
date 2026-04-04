package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * Lightweight Lot summary with auction-aware status for Sales Pad lot selector.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class LotSummaryDTO implements Serializable {

    @JsonProperty("lot_id")
    private Long lotId;

    @JsonProperty("lot_name")
    private String lotName;

    @JsonProperty("bag_count")
    private Integer bagCount;

    @JsonProperty("original_bag_count")
    private Integer originalBagCount;

    @JsonProperty("commodity_name")
    private String commodityName;

    @JsonProperty("seller_name")
    private String sellerName;

    @JsonProperty("seller_mark")
    private String sellerMark;

    @JsonProperty("seller_vehicle_id")
    private Long sellerVehicleId;

    @JsonProperty("vehicle_number")
    private String vehicleNumber;

    @JsonProperty("was_modified")
    private boolean wasModified;

    @JsonProperty("status")
    private String status;

    @JsonProperty("sold_bags")
    private Integer soldBags;

    /** Total bags for the whole vehicle (all sellers on same vehicle). For lot identifier: Vehicle QTY. */
    @JsonProperty("vehicle_total_qty")
    private Integer vehicleTotalQty;

    /** Total bags for this seller (all lots of that seller). For lot identifier: Seller QTY. */
    @JsonProperty("seller_total_qty")
    private Integer sellerTotalQty;

    /**
     * Distinct buyers with bids on the latest auction for this lot (registered contacts and scribble/temp).
     * Excludes self-sale rows. Omitted or empty when there are no qualifying bids.
     */
    @JsonProperty("participating_buyers")
    private List<LotParticipatingBuyerDTO> participatingBuyers = new ArrayList<>();

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

    public Integer getBagCount() {
        return bagCount;
    }

    public void setBagCount(Integer bagCount) {
        this.bagCount = bagCount;
    }

    public Integer getOriginalBagCount() {
        return originalBagCount;
    }

    public void setOriginalBagCount(Integer originalBagCount) {
        this.originalBagCount = originalBagCount;
    }

    public String getCommodityName() {
        return commodityName;
    }

    public void setCommodityName(String commodityName) {
        this.commodityName = commodityName;
    }

    public String getSellerName() {
        return sellerName;
    }

    public void setSellerName(String sellerName) {
        this.sellerName = sellerName;
    }

    public String getSellerMark() {
        return sellerMark;
    }

    public void setSellerMark(String sellerMark) {
        this.sellerMark = sellerMark;
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

    public boolean isWasModified() {
        return wasModified;
    }

    public void setWasModified(boolean wasModified) {
        this.wasModified = wasModified;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getSoldBags() {
        return soldBags;
    }

    public void setSoldBags(Integer soldBags) {
        this.soldBags = soldBags;
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

    public List<LotParticipatingBuyerDTO> getParticipatingBuyers() {
        return participatingBuyers;
    }

    public void setParticipatingBuyers(List<LotParticipatingBuyerDTO> participatingBuyers) {
        this.participatingBuyers = participatingBuyers != null ? participatingBuyers : new ArrayList<>();
    }

}

