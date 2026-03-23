package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * DTOs for Settlement (Sales Patti). Aligned with SettlementPage.tsx types.
 */
public final class SettlementDTOs {

    private SettlementDTOs() {}

    /** Rate cluster (REQ-PUT-001). Amount = totalWeight * rate. */
    public static class RateClusterDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private BigDecimal rate;
        private Integer totalQuantity;
        private BigDecimal totalWeight;
        private BigDecimal amount;

        public BigDecimal getRate() { return rate; }
        public void setRate(BigDecimal rate) { this.rate = rate; }
        public Integer getTotalQuantity() { return totalQuantity; }
        public void setTotalQuantity(Integer totalQuantity) { this.totalQuantity = totalQuantity; }
        public BigDecimal getTotalWeight() { return totalWeight; }
        public void setTotalWeight(BigDecimal totalWeight) { this.totalWeight = totalWeight; }
        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
    }

    /** Deduction line (freight, coolie, weighing, advance, gunnies, manual). */
    public static class DeductionItemDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private String key;
        private String label;
        private BigDecimal amount;
        private Boolean editable;
        private Boolean autoPulled;

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
        public Boolean getEditable() { return editable; }
        public void setEditable(Boolean editable) { this.editable = editable; }
        public Boolean getAutoPulled() { return autoPulled; }
        public void setAutoPulled(Boolean autoPulled) { this.autoPulled = autoPulled; }
    }

    /** Sales Patti response (matches frontend PattiData). */
    public static class PattiDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private Long id;
        @JsonProperty("pattiId")
        private String pattiId;
        private String sellerId;
        private String sellerName;
        private List<RateClusterDTO> rateClusters = new ArrayList<>();
        private BigDecimal grossAmount;
        private List<DeductionItemDTO> deductions = new ArrayList<>();
        private BigDecimal totalDeductions;
        private BigDecimal netPayable;
        private Instant createdAt;
        private Boolean useAverageWeight;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getPattiId() { return pattiId; }
        public void setPattiId(String pattiId) { this.pattiId = pattiId; }
        public String getSellerId() { return sellerId; }
        public void setSellerId(String sellerId) { this.sellerId = sellerId; }
        public String getSellerName() { return sellerName; }
        public void setSellerName(String sellerName) { this.sellerName = sellerName; }
        public List<RateClusterDTO> getRateClusters() { return rateClusters; }
        public void setRateClusters(List<RateClusterDTO> rateClusters) { this.rateClusters = rateClusters; }
        public BigDecimal getGrossAmount() { return grossAmount; }
        public void setGrossAmount(BigDecimal grossAmount) { this.grossAmount = grossAmount; }
        public List<DeductionItemDTO> getDeductions() { return deductions; }
        public void setDeductions(List<DeductionItemDTO> deductions) { this.deductions = deductions; }
        public BigDecimal getTotalDeductions() { return totalDeductions; }
        public void setTotalDeductions(BigDecimal totalDeductions) { this.totalDeductions = totalDeductions; }
        public BigDecimal getNetPayable() { return netPayable; }
        public void setNetPayable(BigDecimal netPayable) { this.netPayable = netPayable; }
        public Instant getCreatedAt() { return createdAt; }
        public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
        public Boolean getUseAverageWeight() { return useAverageWeight; }
        public void setUseAverageWeight(Boolean useAverageWeight) { this.useAverageWeight = useAverageWeight; }
    }

    /** Request to create or update a patti (frontend sends full PattiData-like payload). */
    public static class PattiSaveRequest implements Serializable {

        private static final long serialVersionUID = 1L;

        private String sellerId;
        @NotBlank
        private String sellerName;
        @NotNull
        @Valid
        private List<RateClusterDTO> rateClusters = new ArrayList<>();
        @NotNull
        private BigDecimal grossAmount;
        @NotNull
        @Valid
        private List<DeductionItemDTO> deductions = new ArrayList<>();
        @NotNull
        private BigDecimal totalDeductions;
        @NotNull
        private BigDecimal netPayable;
        private Boolean useAverageWeight;

        public String getSellerId() { return sellerId; }
        public void setSellerId(String sellerId) { this.sellerId = sellerId; }
        public String getSellerName() { return sellerName; }
        public void setSellerName(String sellerName) { this.sellerName = sellerName; }
        public List<RateClusterDTO> getRateClusters() { return rateClusters; }
        public void setRateClusters(List<RateClusterDTO> rateClusters) { this.rateClusters = rateClusters; }
        public BigDecimal getGrossAmount() { return grossAmount; }
        public void setGrossAmount(BigDecimal grossAmount) { this.grossAmount = grossAmount; }
        public List<DeductionItemDTO> getDeductions() { return deductions; }
        public void setDeductions(List<DeductionItemDTO> deductions) { this.deductions = deductions; }
        public BigDecimal getTotalDeductions() { return totalDeductions; }
        public void setTotalDeductions(BigDecimal totalDeductions) { this.totalDeductions = totalDeductions; }
        public BigDecimal getNetPayable() { return netPayable; }
        public void setNetPayable(BigDecimal netPayable) { this.netPayable = netPayable; }
        public Boolean getUseAverageWeight() { return useAverageWeight; }
        public void setUseAverageWeight(Boolean useAverageWeight) { this.useAverageWeight = useAverageWeight; }
    }

    /** Seller entry for settlement list (one per seller with lots/entries summary). */
    public static class SettlementEntryDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private Integer bidNumber;
        private String buyerMark;
        private String buyerName;
        /** Auction floor bid (base) per bag — same as completed-auction result rate. */
        private BigDecimal rate;
        /** Signed preset margin from auction; effective seller rate for settlement = rate + presetMargin. */
        @JsonProperty("presetMargin")
        private BigDecimal presetMargin;
        private Integer quantity;
        private BigDecimal weight;

        public Integer getBidNumber() { return bidNumber; }
        public void setBidNumber(Integer bidNumber) { this.bidNumber = bidNumber; }
        public String getBuyerMark() { return buyerMark; }
        public void setBuyerMark(String buyerMark) { this.buyerMark = buyerMark; }
        public String getBuyerName() { return buyerName; }
        public void setBuyerName(String buyerName) { this.buyerName = buyerName; }
        public BigDecimal getRate() { return rate; }
        public void setRate(BigDecimal rate) { this.rate = rate; }
        public BigDecimal getPresetMargin() { return presetMargin; }
        public void setPresetMargin(BigDecimal presetMargin) { this.presetMargin = presetMargin; }
        public Integer getQuantity() { return quantity; }
        public void setQuantity(Integer quantity) { this.quantity = quantity; }
        public BigDecimal getWeight() { return weight; }
        public void setWeight(BigDecimal weight) { this.weight = weight; }
    }

    public static class SettlementLotDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private String lotId;
        private String lotName;
        private String commodityName;
        private List<SettlementEntryDTO> entries = new ArrayList<>();

        public String getLotId() { return lotId; }
        public void setLotId(String lotId) { this.lotId = lotId; }
        public String getLotName() { return lotName; }
        public void setLotName(String lotName) { this.lotName = lotName; }
        public String getCommodityName() { return commodityName; }
        public void setCommodityName(String commodityName) { this.commodityName = commodityName; }
        public List<SettlementEntryDTO> getEntries() { return entries; }
        public void setEntries(List<SettlementEntryDTO> entries) { this.entries = entries; }
    }

    /** Seller for settlement list (matches frontend SellerSettlement). */
    public static class SellerSettlementDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private String sellerId;
        private String sellerName;
        private String sellerMark;
        private String vehicleNumber;
        private List<SettlementLotDTO> lots = new ArrayList<>();

        public String getSellerId() { return sellerId; }
        public void setSellerId(String sellerId) { this.sellerId = sellerId; }
        public String getSellerName() { return sellerName; }
        public void setSellerName(String sellerName) { this.sellerName = sellerName; }
        public String getSellerMark() { return sellerMark; }
        public void setSellerMark(String sellerMark) { this.sellerMark = sellerMark; }
        public String getVehicleNumber() { return vehicleNumber; }
        public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }
        public List<SettlementLotDTO> getLots() { return lots; }
        public void setLots(List<SettlementLotDTO> lots) { this.lots = lots; }
    }

    /**
     * Aggregated seller charges for Settlement (e.g. freight, advance).
     * Values are computed server-side so the frontend does not rely on local state.
     */
    public static class SellerChargesDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private java.math.BigDecimal freight;
        private java.math.BigDecimal advance;
        private Boolean freightAutoPulled;
        private Boolean advanceAutoPulled;

        public java.math.BigDecimal getFreight() { return freight; }
        public void setFreight(java.math.BigDecimal freight) { this.freight = freight; }
        public java.math.BigDecimal getAdvance() { return advance; }
        public void setAdvance(java.math.BigDecimal advance) { this.advance = advance; }
        public Boolean getFreightAutoPulled() { return freightAutoPulled; }
        public void setFreightAutoPulled(Boolean freightAutoPulled) { this.freightAutoPulled = freightAutoPulled; }
        public Boolean getAdvanceAutoPulled() { return advanceAutoPulled; }
        public void setAdvanceAutoPulled(Boolean advanceAutoPulled) { this.advanceAutoPulled = advanceAutoPulled; }
    }
}
