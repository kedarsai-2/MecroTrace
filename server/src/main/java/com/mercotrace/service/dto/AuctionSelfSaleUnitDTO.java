package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mercotrace.domain.enumeration.AuctionSelfSaleUnitStatus;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Quantity-based self-sale unit list/session summary for Sales Pad re-auction.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionSelfSaleUnitDTO implements Serializable {

    @JsonProperty("self_sale_unit_id")
    private Long selfSaleUnitId;

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

    @JsonProperty("self_sale_qty")
    private Integer selfSaleQty;

    @JsonProperty("remaining_qty")
    private Integer remainingQty;

    @JsonProperty("rate")
    private BigDecimal rate;

    @JsonProperty("amount")
    private BigDecimal amount;

    @JsonProperty("status")
    private AuctionSelfSaleUnitStatus status;

    @JsonProperty("created_at")
    private Instant createdAt;

    public Long getSelfSaleUnitId() {
        return selfSaleUnitId;
    }

    public void setSelfSaleUnitId(Long selfSaleUnitId) {
        this.selfSaleUnitId = selfSaleUnitId;
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

    public Integer getSelfSaleQty() {
        return selfSaleQty;
    }

    public void setSelfSaleQty(Integer selfSaleQty) {
        this.selfSaleQty = selfSaleQty;
    }

    public Integer getRemainingQty() {
        return remainingQty;
    }

    public void setRemainingQty(Integer remainingQty) {
        this.remainingQty = remainingQty;
    }

    public BigDecimal getRate() {
        return rate;
    }

    public void setRate(BigDecimal rate) {
        this.rate = rate;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public AuctionSelfSaleUnitStatus getStatus() {
        return status;
    }

    public void setStatus(AuctionSelfSaleUnitStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
