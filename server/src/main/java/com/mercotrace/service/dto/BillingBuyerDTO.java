package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Lightweight buyer + bid projection for Billing Create/Search.
 * Keeps Billing off the heavy AuctionResultDTO graph while preserving all bill line fields.
 */
public class BillingBuyerDTO implements Serializable {

    @JsonProperty("buyerMark")
    private String buyerMark;

    @JsonProperty("buyerName")
    private String buyerName;

    @JsonProperty("buyerContactId")
    private String buyerContactId;

    @JsonProperty("entries")
    private List<BillingBuyerEntryDTO> entries = new ArrayList<>();

    @JsonProperty("tokenAdvanceTotal")
    private BigDecimal tokenAdvanceTotal = BigDecimal.ZERO;

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

    public String getBuyerContactId() {
        return buyerContactId;
    }

    public void setBuyerContactId(String buyerContactId) {
        this.buyerContactId = buyerContactId;
    }

    public List<BillingBuyerEntryDTO> getEntries() {
        return entries;
    }

    public void setEntries(List<BillingBuyerEntryDTO> entries) {
        this.entries = entries;
    }

    public BigDecimal getTokenAdvanceTotal() {
        return tokenAdvanceTotal;
    }

    public void setTokenAdvanceTotal(BigDecimal tokenAdvanceTotal) {
        this.tokenAdvanceTotal = tokenAdvanceTotal;
    }

    public static class BillingBuyerEntryDTO implements Serializable {

        @JsonProperty("bidNumber")
        private Integer bidNumber;

        @JsonProperty("lotId")
        private String lotId;

        @JsonProperty("lotName")
        private String lotName;

        @JsonProperty("auctionEntryId")
        private Long auctionEntryId;

        @JsonProperty("selfSaleUnitId")
        private Long selfSaleUnitId;

        @JsonProperty("lotTotalQty")
        private Integer lotTotalQty;

        @JsonProperty("sellerName")
        private String sellerName;

        @JsonProperty("commodityName")
        private String commodityName;

        @JsonProperty("rate")
        private BigDecimal rate;

        @JsonProperty("quantity")
        private Integer quantity;

        @JsonProperty("weight")
        private BigDecimal weight = BigDecimal.ZERO;

        @JsonProperty("vehicleTotalQty")
        private Integer vehicleTotalQty;

        @JsonProperty("sellerVehicleQty")
        private Integer sellerVehicleQty;

        @JsonProperty("vehicleMark")
        private String vehicleMark;

        @JsonProperty("sellerMark")
        private String sellerMark;

        @JsonProperty("presetApplied")
        private BigDecimal presetApplied = BigDecimal.ZERO;

        @JsonProperty("isSelfSale")
        private Boolean isSelfSale = Boolean.FALSE;

        @JsonProperty("tokenAdvance")
        private BigDecimal tokenAdvance = BigDecimal.ZERO;

        public Integer getBidNumber() {
            return bidNumber;
        }

        public void setBidNumber(Integer bidNumber) {
            this.bidNumber = bidNumber;
        }

        public String getLotId() {
            return lotId;
        }

        public void setLotId(String lotId) {
            this.lotId = lotId;
        }

        public String getLotName() {
            return lotName;
        }

        public void setLotName(String lotName) {
            this.lotName = lotName;
        }

        public Long getAuctionEntryId() {
            return auctionEntryId;
        }

        public void setAuctionEntryId(Long auctionEntryId) {
            this.auctionEntryId = auctionEntryId;
        }

        public Long getSelfSaleUnitId() {
            return selfSaleUnitId;
        }

        public void setSelfSaleUnitId(Long selfSaleUnitId) {
            this.selfSaleUnitId = selfSaleUnitId;
        }

        public Integer getLotTotalQty() {
            return lotTotalQty;
        }

        public void setLotTotalQty(Integer lotTotalQty) {
            this.lotTotalQty = lotTotalQty;
        }

        public String getSellerName() {
            return sellerName;
        }

        public void setSellerName(String sellerName) {
            this.sellerName = sellerName;
        }

        public String getCommodityName() {
            return commodityName;
        }

        public void setCommodityName(String commodityName) {
            this.commodityName = commodityName;
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

        public BigDecimal getWeight() {
            return weight;
        }

        public void setWeight(BigDecimal weight) {
            this.weight = weight;
        }

        public Integer getVehicleTotalQty() {
            return vehicleTotalQty;
        }

        public void setVehicleTotalQty(Integer vehicleTotalQty) {
            this.vehicleTotalQty = vehicleTotalQty;
        }

        public Integer getSellerVehicleQty() {
            return sellerVehicleQty;
        }

        public void setSellerVehicleQty(Integer sellerVehicleQty) {
            this.sellerVehicleQty = sellerVehicleQty;
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

        public BigDecimal getPresetApplied() {
            return presetApplied;
        }

        public void setPresetApplied(BigDecimal presetApplied) {
            this.presetApplied = presetApplied;
        }

        public Boolean getIsSelfSale() {
            return isSelfSale;
        }

        public void setIsSelfSale(Boolean selfSale) {
            isSelfSale = selfSale;
        }

        public BigDecimal getTokenAdvance() {
            return tokenAdvance;
        }

        public void setTokenAdvance(BigDecimal tokenAdvance) {
            this.tokenAdvance = tokenAdvance;
        }
    }
}
