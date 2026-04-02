package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * DTOs for Billing (Sales Bill) module. Aligned with BillingPage.tsx BillData, CommodityGroup, BillLineItem.
 */
public final class SalesBillDTOs {

    private SalesBillDTOs() {}

    /** Line item (BillLineItem). */
    public static class BillLineItemDTO implements Serializable {
        private Long id;
        private Integer bidNumber;
        private String lotName;
        @Size(max = 64)
        private String lotId;
        private Long auctionEntryId;
        private Long selfSaleUnitId;
        private String sellerName;
        private Integer quantity;
        private BigDecimal weight;
        private BigDecimal baseRate;
        private BigDecimal brokerage;
        private BigDecimal otherCharges;
        private BigDecimal newRate;
        private BigDecimal amount;
        /** Token advance from auction for this bid/lot (₹). */
        private BigDecimal tokenAdvance = BigDecimal.ZERO;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public Integer getBidNumber() { return bidNumber; }
        public void setBidNumber(Integer bidNumber) { this.bidNumber = bidNumber; }
        public String getLotName() { return lotName; }
        public void setLotName(String lotName) { this.lotName = lotName; }
        public String getLotId() { return lotId; }
        public void setLotId(String lotId) { this.lotId = lotId; }
        public Long getAuctionEntryId() { return auctionEntryId; }
        public void setAuctionEntryId(Long auctionEntryId) { this.auctionEntryId = auctionEntryId; }
        public Long getSelfSaleUnitId() { return selfSaleUnitId; }
        public void setSelfSaleUnitId(Long selfSaleUnitId) { this.selfSaleUnitId = selfSaleUnitId; }
        public String getSellerName() { return sellerName; }
        public void setSellerName(String sellerName) { this.sellerName = sellerName; }
        public Integer getQuantity() { return quantity; }
        public void setQuantity(Integer quantity) { this.quantity = quantity; }
        public BigDecimal getWeight() { return weight; }
        public void setWeight(BigDecimal weight) { this.weight = weight; }
        public BigDecimal getBaseRate() { return baseRate; }
        public void setBaseRate(BigDecimal baseRate) { this.baseRate = baseRate; }
        public BigDecimal getBrokerage() { return brokerage; }
        public void setBrokerage(BigDecimal brokerage) { this.brokerage = brokerage; }
        public BigDecimal getOtherCharges() { return otherCharges; }
        public void setOtherCharges(BigDecimal otherCharges) { this.otherCharges = otherCharges; }
        public BigDecimal getNewRate() { return newRate; }
        public void setNewRate(BigDecimal newRate) { this.newRate = newRate; }
        public BigDecimal getAmount() { return amount; }
        public void setAmount(BigDecimal amount) { this.amount = amount; }
        public BigDecimal getTokenAdvance() { return tokenAdvance; }
        public void setTokenAdvance(BigDecimal tokenAdvance) { this.tokenAdvance = tokenAdvance; }
    }

    /** Commodity group (CommodityGroup). */
    public static class CommodityGroupDTO implements Serializable {
        private Long id;
        private String commodityName;
        private String hsnCode;
        private BigDecimal commissionPercent;
        private BigDecimal userFeePercent;
        private BigDecimal coolieRate;
        private BigDecimal coolieAmount;
        private BigDecimal weighmanChargeRate;
        private BigDecimal weighmanChargeAmount;
        private BigDecimal discount;
        private String discountType; // PERCENT | AMOUNT
        private BigDecimal manualRoundOff;
        @Valid
        private List<BillLineItemDTO> items = new ArrayList<>();
        private BigDecimal subtotal;
        private BigDecimal commissionAmount;
        private BigDecimal userFeeAmount;
        private BigDecimal totalCharges;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getCommodityName() { return commodityName; }
        public void setCommodityName(String commodityName) { this.commodityName = commodityName; }
        public String getHsnCode() { return hsnCode; }
        public void setHsnCode(String hsnCode) { this.hsnCode = hsnCode; }
        public BigDecimal getCommissionPercent() { return commissionPercent; }
        public void setCommissionPercent(BigDecimal commissionPercent) { this.commissionPercent = commissionPercent; }
        public BigDecimal getUserFeePercent() { return userFeePercent; }
        public void setUserFeePercent(BigDecimal userFeePercent) { this.userFeePercent = userFeePercent; }
        public BigDecimal getCoolieRate() { return coolieRate; }
        public void setCoolieRate(BigDecimal coolieRate) { this.coolieRate = coolieRate; }
        public BigDecimal getCoolieAmount() { return coolieAmount; }
        public void setCoolieAmount(BigDecimal coolieAmount) { this.coolieAmount = coolieAmount; }
        public BigDecimal getWeighmanChargeRate() { return weighmanChargeRate; }
        public void setWeighmanChargeRate(BigDecimal weighmanChargeRate) { this.weighmanChargeRate = weighmanChargeRate; }
        public BigDecimal getWeighmanChargeAmount() { return weighmanChargeAmount; }
        public void setWeighmanChargeAmount(BigDecimal weighmanChargeAmount) { this.weighmanChargeAmount = weighmanChargeAmount; }
        public BigDecimal getDiscount() { return discount; }
        public void setDiscount(BigDecimal discount) { this.discount = discount; }
        public String getDiscountType() { return discountType; }
        public void setDiscountType(String discountType) { this.discountType = discountType; }
        public BigDecimal getManualRoundOff() { return manualRoundOff; }
        public void setManualRoundOff(BigDecimal manualRoundOff) { this.manualRoundOff = manualRoundOff; }
        public List<BillLineItemDTO> getItems() { return items; }
        public void setItems(List<BillLineItemDTO> items) { this.items = items != null ? items : new ArrayList<>(); }
        public BigDecimal getSubtotal() { return subtotal; }
        public void setSubtotal(BigDecimal subtotal) { this.subtotal = subtotal; }
        public BigDecimal getCommissionAmount() { return commissionAmount; }
        public void setCommissionAmount(BigDecimal commissionAmount) { this.commissionAmount = commissionAmount; }
        public BigDecimal getUserFeeAmount() { return userFeeAmount; }
        public void setUserFeeAmount(BigDecimal userFeeAmount) { this.userFeeAmount = userFeeAmount; }
        public BigDecimal getTotalCharges() { return totalCharges; }
        public void setTotalCharges(BigDecimal totalCharges) { this.totalCharges = totalCharges; }
    }

    /** Version entry for audit. */
    public static class BillVersionDTO implements Serializable {
        private Integer version;
        private String savedAt;
        private Object data;

        public Integer getVersion() { return version; }
        public void setVersion(Integer version) { this.version = version; }
        public String getSavedAt() { return savedAt; }
        public void setSavedAt(String savedAt) { this.savedAt = savedAt; }
        public Object getData() { return data; }
        public void setData(Object data) { this.data = data; }
    }

    /** Full bill (BillData). Frontend expects billId as string (we use id). */
    public static class SalesBillDTO implements Serializable {
        @JsonProperty("billId")
        private String billId; // string for frontend: id as string
        private String billNumber;
        private String buyerName;
        private String buyerMark;
        private String buyerContactId;
        private String buyerPhone;
        private String buyerAddress;
        private Boolean buyerAsBroker;
        private String brokerName;
        private String brokerMark;
        private String brokerContactId;
        private String brokerPhone;
        private String brokerAddress;
        private String billingName;
        private String billDate; // ISO-8601
        @Valid
        private List<CommodityGroupDTO> commodityGroups = new ArrayList<>();
        private BigDecimal outboundFreight;
        private String outboundVehicle;
        private BigDecimal tokenAdvance;
        private BigDecimal grandTotal;
        private String brokerageType; // PERCENT | AMOUNT
        private BigDecimal brokerageValue;
        private BigDecimal globalOtherCharges;
        private BigDecimal pendingBalance;
        private List<BillVersionDTO> versions = new ArrayList<>();

        public String getBillId() { return billId; }
        public void setBillId(String billId) { this.billId = billId; }
        public String getBillNumber() { return billNumber; }
        public void setBillNumber(String billNumber) { this.billNumber = billNumber; }
        public String getBuyerName() { return buyerName; }
        public void setBuyerName(String buyerName) { this.buyerName = buyerName; }
        public String getBuyerMark() { return buyerMark; }
        public void setBuyerMark(String buyerMark) { this.buyerMark = buyerMark; }
        public String getBuyerContactId() { return buyerContactId; }
        public void setBuyerContactId(String buyerContactId) { this.buyerContactId = buyerContactId; }
        public String getBuyerPhone() { return buyerPhone; }
        public void setBuyerPhone(String buyerPhone) { this.buyerPhone = buyerPhone; }
        public String getBuyerAddress() { return buyerAddress; }
        public void setBuyerAddress(String buyerAddress) { this.buyerAddress = buyerAddress; }
        public Boolean getBuyerAsBroker() { return buyerAsBroker; }
        public void setBuyerAsBroker(Boolean buyerAsBroker) { this.buyerAsBroker = buyerAsBroker; }
        public String getBrokerName() { return brokerName; }
        public void setBrokerName(String brokerName) { this.brokerName = brokerName; }
        public String getBrokerMark() { return brokerMark; }
        public void setBrokerMark(String brokerMark) { this.brokerMark = brokerMark; }
        public String getBrokerContactId() { return brokerContactId; }
        public void setBrokerContactId(String brokerContactId) { this.brokerContactId = brokerContactId; }
        public String getBrokerPhone() { return brokerPhone; }
        public void setBrokerPhone(String brokerPhone) { this.brokerPhone = brokerPhone; }
        public String getBrokerAddress() { return brokerAddress; }
        public void setBrokerAddress(String brokerAddress) { this.brokerAddress = brokerAddress; }
        public String getBillingName() { return billingName; }
        public void setBillingName(String billingName) { this.billingName = billingName; }
        public String getBillDate() { return billDate; }
        public void setBillDate(String billDate) { this.billDate = billDate; }
        public List<CommodityGroupDTO> getCommodityGroups() { return commodityGroups; }
        public void setCommodityGroups(List<CommodityGroupDTO> commodityGroups) { this.commodityGroups = commodityGroups != null ? commodityGroups : new ArrayList<>(); }
        public BigDecimal getOutboundFreight() { return outboundFreight; }
        public void setOutboundFreight(BigDecimal outboundFreight) { this.outboundFreight = outboundFreight; }
        public String getOutboundVehicle() { return outboundVehicle; }
        public void setOutboundVehicle(String outboundVehicle) { this.outboundVehicle = outboundVehicle; }
        public BigDecimal getTokenAdvance() { return tokenAdvance; }
        public void setTokenAdvance(BigDecimal tokenAdvance) { this.tokenAdvance = tokenAdvance; }
        public BigDecimal getGrandTotal() { return grandTotal; }
        public void setGrandTotal(BigDecimal grandTotal) { this.grandTotal = grandTotal; }
        public String getBrokerageType() { return brokerageType; }
        public void setBrokerageType(String brokerageType) { this.brokerageType = brokerageType; }
        public BigDecimal getBrokerageValue() { return brokerageValue; }
        public void setBrokerageValue(BigDecimal brokerageValue) { this.brokerageValue = brokerageValue; }
        public BigDecimal getGlobalOtherCharges() { return globalOtherCharges; }
        public void setGlobalOtherCharges(BigDecimal globalOtherCharges) { this.globalOtherCharges = globalOtherCharges; }
        public BigDecimal getPendingBalance() { return pendingBalance; }
        public void setPendingBalance(BigDecimal pendingBalance) { this.pendingBalance = pendingBalance; }
        public List<BillVersionDTO> getVersions() { return versions; }
        public void setVersions(List<BillVersionDTO> versions) { this.versions = versions != null ? versions : new ArrayList<>(); }
    }

    /** Create/Update request: same shape as SalesBillDTO but billId/billNumber optional on create. */
    public static class SalesBillCreateOrUpdateRequest implements Serializable {
        private String billId; // optional on create; required on update (path id used)
        private String billNumber; // optional on create (server generates)
        @NotBlank(message = "buyerName is required")
        @Size(max = 255)
        private String buyerName;
        @NotBlank(message = "buyerMark is required")
        @Size(max = 100)
        private String buyerMark;
        private String buyerContactId;
        @Size(max = 20)
        private String buyerPhone;
        @Size(max = 500)
        private String buyerAddress;
        private Boolean buyerAsBroker = false;
        @Size(max = 255)
        private String brokerName;
        @Size(max = 100)
        private String brokerMark;
        private String brokerContactId;
        @Size(max = 20)
        private String brokerPhone;
        @Size(max = 500)
        private String brokerAddress;
        @NotBlank(message = "billingName is required")
        @Size(max = 255)
        private String billingName;
        @NotNull(message = "billDate is required")
        private String billDate;
        @Valid
        @NotEmpty(message = "at least one commodity group required")
        private List<CommodityGroupDTO> commodityGroups = new ArrayList<>();
        private BigDecimal outboundFreight = BigDecimal.ZERO;
        @Size(max = 50)
        private String outboundVehicle;
        private BigDecimal tokenAdvance = BigDecimal.ZERO;
        @NotNull(message = "grandTotal is required")
        private BigDecimal grandTotal;
        @Pattern(regexp = "PERCENT|AMOUNT", message = "brokerageType must be PERCENT or AMOUNT")
        private String brokerageType = "AMOUNT";
        private BigDecimal brokerageValue = BigDecimal.ZERO;
        private BigDecimal globalOtherCharges = BigDecimal.ZERO;
        private BigDecimal pendingBalance = BigDecimal.ZERO;

        public String getBillId() { return billId; }
        public void setBillId(String billId) { this.billId = billId; }
        public String getBillNumber() { return billNumber; }
        public void setBillNumber(String billNumber) { this.billNumber = billNumber; }
        public String getBuyerName() { return buyerName; }
        public void setBuyerName(String buyerName) { this.buyerName = buyerName; }
        public String getBuyerMark() { return buyerMark; }
        public void setBuyerMark(String buyerMark) { this.buyerMark = buyerMark; }
        public String getBuyerContactId() { return buyerContactId; }
        public void setBuyerContactId(String buyerContactId) { this.buyerContactId = buyerContactId; }
        public String getBuyerPhone() { return buyerPhone; }
        public void setBuyerPhone(String buyerPhone) { this.buyerPhone = buyerPhone; }
        public String getBuyerAddress() { return buyerAddress; }
        public void setBuyerAddress(String buyerAddress) { this.buyerAddress = buyerAddress; }
        public Boolean getBuyerAsBroker() { return buyerAsBroker; }
        public void setBuyerAsBroker(Boolean buyerAsBroker) { this.buyerAsBroker = buyerAsBroker; }
        public String getBrokerName() { return brokerName; }
        public void setBrokerName(String brokerName) { this.brokerName = brokerName; }
        public String getBrokerMark() { return brokerMark; }
        public void setBrokerMark(String brokerMark) { this.brokerMark = brokerMark; }
        public String getBrokerContactId() { return brokerContactId; }
        public void setBrokerContactId(String brokerContactId) { this.brokerContactId = brokerContactId; }
        public String getBrokerPhone() { return brokerPhone; }
        public void setBrokerPhone(String brokerPhone) { this.brokerPhone = brokerPhone; }
        public String getBrokerAddress() { return brokerAddress; }
        public void setBrokerAddress(String brokerAddress) { this.brokerAddress = brokerAddress; }
        public String getBillingName() { return billingName; }
        public void setBillingName(String billingName) { this.billingName = billingName; }
        public String getBillDate() { return billDate; }
        public void setBillDate(String billDate) { this.billDate = billDate; }
        public List<CommodityGroupDTO> getCommodityGroups() { return commodityGroups; }
        public void setCommodityGroups(List<CommodityGroupDTO> commodityGroups) { this.commodityGroups = commodityGroups != null ? commodityGroups : new ArrayList<>(); }
        public BigDecimal getOutboundFreight() { return outboundFreight; }
        public void setOutboundFreight(BigDecimal outboundFreight) { this.outboundFreight = outboundFreight; }
        public String getOutboundVehicle() { return outboundVehicle; }
        public void setOutboundVehicle(String outboundVehicle) { this.outboundVehicle = outboundVehicle; }
        public BigDecimal getTokenAdvance() { return tokenAdvance; }
        public void setTokenAdvance(BigDecimal tokenAdvance) { this.tokenAdvance = tokenAdvance; }
        public BigDecimal getGrandTotal() { return grandTotal; }
        public void setGrandTotal(BigDecimal grandTotal) { this.grandTotal = grandTotal; }
        public String getBrokerageType() { return brokerageType; }
        public void setBrokerageType(String brokerageType) { this.brokerageType = brokerageType; }
        public BigDecimal getBrokerageValue() { return brokerageValue; }
        public void setBrokerageValue(BigDecimal brokerageValue) { this.brokerageValue = brokerageValue; }
        public BigDecimal getGlobalOtherCharges() { return globalOtherCharges; }
        public void setGlobalOtherCharges(BigDecimal globalOtherCharges) { this.globalOtherCharges = globalOtherCharges; }
        public BigDecimal getPendingBalance() { return pendingBalance; }
        public void setPendingBalance(BigDecimal pendingBalance) { this.pendingBalance = pendingBalance; }
    }
}
