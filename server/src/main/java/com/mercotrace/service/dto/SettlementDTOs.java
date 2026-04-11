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
        private String pattiBaseNumber;
        private Integer sellerSequenceNumber;
        private String sellerId;
        private String sellerName;
        private String vehicleNumber;
        private String fromLocation;
        private Integer sellerSerialNo;
        private Instant date;
        private List<RateClusterDTO> rateClusters = new ArrayList<>();
        private BigDecimal grossAmount;
        private List<DeductionItemDTO> deductions = new ArrayList<>();
        private BigDecimal totalDeductions;
        private BigDecimal netPayable;
        private Instant createdAt;
        private Boolean useAverageWeight;
        private Boolean inProgress;
        /** Optional JSON blob (per-lot overrides, removed lots) — see frontend schema. */
        @JsonProperty("extensionJson")
        private String extensionJson;
        /** Parsed from original_snapshot_json (immutable first-open snapshot). */
        private Object originalData;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getPattiId() { return pattiId; }
        public void setPattiId(String pattiId) { this.pattiId = pattiId; }
        public String getPattiBaseNumber() { return pattiBaseNumber; }
        public void setPattiBaseNumber(String pattiBaseNumber) { this.pattiBaseNumber = pattiBaseNumber; }
        public Integer getSellerSequenceNumber() { return sellerSequenceNumber; }
        public void setSellerSequenceNumber(Integer sellerSequenceNumber) { this.sellerSequenceNumber = sellerSequenceNumber; }
        public String getSellerId() { return sellerId; }
        public void setSellerId(String sellerId) { this.sellerId = sellerId; }
        public String getSellerName() { return sellerName; }
        public void setSellerName(String sellerName) { this.sellerName = sellerName; }
        public String getVehicleNumber() { return vehicleNumber; }
        public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }
        public String getFromLocation() { return fromLocation; }
        public void setFromLocation(String fromLocation) { this.fromLocation = fromLocation; }
        public Integer getSellerSerialNo() { return sellerSerialNo; }
        public void setSellerSerialNo(Integer sellerSerialNo) { this.sellerSerialNo = sellerSerialNo; }
        public Instant getDate() { return date; }
        public void setDate(Instant date) { this.date = date; }
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
        public Boolean getInProgress() { return inProgress; }
        public void setInProgress(Boolean inProgress) { this.inProgress = inProgress; }
        public String getExtensionJson() { return extensionJson; }
        public void setExtensionJson(String extensionJson) { this.extensionJson = extensionJson; }
        public Object getOriginalData() { return originalData; }
        public void setOriginalData(Object originalData) { this.originalData = originalData; }
    }

    /** Request to create or update a patti (frontend sends full PattiData-like payload). */
    public static class PattiSaveRequest implements Serializable {

        private static final long serialVersionUID = 1L;

        private String sellerId;
        private String pattiBaseNumber;
        private Integer sellerSequenceNumber;
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
        private Boolean inProgress;
        @JsonProperty("extensionJson")
        private String extensionJson;
        /** When DB original_snapshot_json is null, set once from this JSON string (create or first update). */
        @JsonProperty("originalSnapshotJson")
        private String originalSnapshotJson;

        public String getSellerId() { return sellerId; }
        public void setSellerId(String sellerId) { this.sellerId = sellerId; }
        public String getPattiBaseNumber() { return pattiBaseNumber; }
        public void setPattiBaseNumber(String pattiBaseNumber) { this.pattiBaseNumber = pattiBaseNumber; }
        public Integer getSellerSequenceNumber() { return sellerSequenceNumber; }
        public void setSellerSequenceNumber(Integer sellerSequenceNumber) { this.sellerSequenceNumber = sellerSequenceNumber; }
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
        public Boolean getInProgress() { return inProgress; }
        public void setInProgress(Boolean inProgress) { this.inProgress = inProgress; }
        public String getExtensionJson() { return extensionJson; }
        public void setExtensionJson(String extensionJson) { this.extensionJson = extensionJson; }
        public String getOriginalSnapshotJson() { return originalSnapshotJson; }
        public void setOriginalSnapshotJson(String originalSnapshotJson) { this.originalSnapshotJson = originalSnapshotJson; }
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
        /** Bags recorded on the lot in Arrivals ({@code lot.bag_count}). */
        private Integer arrivalBagCount;
        private List<SettlementEntryDTO> entries = new ArrayList<>();
        /**
         * Σ persisted billing line weights for this lot ({@code sales_bill_line_item.weight}), when invoiced.
         * Drives Sales Patti default weight when present.
         */
        private BigDecimal billingWeightKg;

        public String getLotId() { return lotId; }
        public void setLotId(String lotId) { this.lotId = lotId; }
        public String getLotName() { return lotName; }
        public void setLotName(String lotName) { this.lotName = lotName; }
        public String getCommodityName() { return commodityName; }
        public void setCommodityName(String commodityName) { this.commodityName = commodityName; }
        public Integer getArrivalBagCount() { return arrivalBagCount; }
        public void setArrivalBagCount(Integer arrivalBagCount) { this.arrivalBagCount = arrivalBagCount; }
        public List<SettlementEntryDTO> getEntries() { return entries; }
        public void setEntries(List<SettlementEntryDTO> entries) { this.entries = entries; }
        public BigDecimal getBillingWeightKg() { return billingWeightKg; }
        public void setBillingWeightKg(BigDecimal billingWeightKg) { this.billingWeightKg = billingWeightKg; }
    }

    /** Seller for settlement list (matches frontend SellerSettlement). */
    public static class SellerSettlementDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private String sellerId;
        private String sellerName;
        private String sellerMark;
        /** Arrivals vehicle PK; used to load freight without scanning the arrivals list. */
        private Long vehicleId;
        private String vehicleNumber;
        /** Sum of {@link Lot#getBagCount()} for this seller's lots (Arrivals). */
        private Integer arrivalTotalBags;
        /**
         * Vehicle net billable kg from Arrivals weighing: max(0, netWeight − deductedWeight) on {@code vehicle_weight}.
         * Same value for all sellers sharing a vehicle.
         */
        private BigDecimal vehicleArrivalNetBillableKg;
        /** Σ billing line weights ({@code sales_bill_line_item.weight}) for this seller's lots. */
        private BigDecimal billingNetWeightKg;
        /** When set, seller is linked to a registry contact ({@code seller_in_vehicle.contact_id}). */
        private String contactId;
        /**
         * Phone for display: contact phone when linked, else free-text {@code seller_in_vehicle.seller_phone}.
         */
        private String sellerPhone;
        private String fromLocation;
        private Integer sellerSerialNo;
        private Instant date;
        private List<SettlementLotDTO> lots = new ArrayList<>();

        public String getSellerId() { return sellerId; }
        public void setSellerId(String sellerId) { this.sellerId = sellerId; }
        public String getSellerName() { return sellerName; }
        public void setSellerName(String sellerName) { this.sellerName = sellerName; }
        public String getSellerMark() { return sellerMark; }
        public void setSellerMark(String sellerMark) { this.sellerMark = sellerMark; }
        public Long getVehicleId() { return vehicleId; }
        public void setVehicleId(Long vehicleId) { this.vehicleId = vehicleId; }
        public String getVehicleNumber() { return vehicleNumber; }
        public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }
        public Integer getArrivalTotalBags() { return arrivalTotalBags; }
        public void setArrivalTotalBags(Integer arrivalTotalBags) { this.arrivalTotalBags = arrivalTotalBags; }
        public BigDecimal getVehicleArrivalNetBillableKg() { return vehicleArrivalNetBillableKg; }
        public void setVehicleArrivalNetBillableKg(BigDecimal vehicleArrivalNetBillableKg) {
            this.vehicleArrivalNetBillableKg = vehicleArrivalNetBillableKg;
        }
        public BigDecimal getBillingNetWeightKg() { return billingNetWeightKg; }
        public void setBillingNetWeightKg(BigDecimal billingNetWeightKg) { this.billingNetWeightKg = billingNetWeightKg; }
        public String getContactId() { return contactId; }
        public void setContactId(String contactId) { this.contactId = contactId; }
        public String getSellerPhone() { return sellerPhone; }
        public void setSellerPhone(String sellerPhone) { this.sellerPhone = sellerPhone; }
        public String getFromLocation() { return fromLocation; }
        public void setFromLocation(String fromLocation) { this.fromLocation = fromLocation; }
        public Integer getSellerSerialNo() { return sellerSerialNo; }
        public void setSellerSerialNo(Integer sellerSerialNo) { this.sellerSerialNo = sellerSerialNo; }
        public Instant getDate() { return date; }
        public void setDate(Instant date) { this.date = date; }
        public List<SettlementLotDTO> getLots() { return lots; }
        public void setLots(List<SettlementLotDTO> lots) { this.lots = lots; }
    }

    /** Response after linking a settlement seller row to a contact (Sales Patti registration). */
    public static class SellerRegistrationDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private String sellerId;
        private String contactId;
        private String sellerName;
        private String sellerMark;
        private String sellerPhone;

        public String getSellerId() { return sellerId; }
        public void setSellerId(String sellerId) { this.sellerId = sellerId; }
        public String getContactId() { return contactId; }
        public void setContactId(String contactId) { this.contactId = contactId; }
        public String getSellerName() { return sellerName; }
        public void setSellerName(String sellerName) { this.sellerName = sellerName; }
        public String getSellerMark() { return sellerMark; }
        public void setSellerMark(String sellerMark) { this.sellerMark = sellerMark; }
        public String getSellerPhone() { return sellerPhone; }
        public void setSellerPhone(String sellerPhone) { this.sellerPhone = sellerPhone; }
    }

    /** Link settlement seller (seller_in_vehicle id) to an existing contact. */
    public static class LinkSellerContactRequest implements Serializable {

        private static final long serialVersionUID = 1L;

        @NotNull
        private Long contactId;

        public Long getContactId() { return contactId; }
        public void setContactId(Long contactId) { this.contactId = contactId; }
    }

    /** Request to replace one settlement seller using another settlement seller identity. */
    public static class ReplaceSellerRequest implements Serializable {

        private static final long serialVersionUID = 1L;

        @NotBlank
        private String replacementSellerId;

        public String getReplacementSellerId() {
            return replacementSellerId;
        }

        public void setReplacementSellerId(String replacementSellerId) {
            this.replacementSellerId = replacementSellerId;
        }
    }

    /** Result after replacing seller identity for a settlement seller row. */
    public static class SellerReplacementDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private String sellerId;
        private String contactId;
        private String sellerName;
        private String sellerMark;
        private String sellerPhone;

        public String getSellerId() {
            return sellerId;
        }

        public void setSellerId(String sellerId) {
            this.sellerId = sellerId;
        }

        public String getContactId() {
            return contactId;
        }

        public void setContactId(String contactId) {
            this.contactId = contactId;
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

        public String getSellerPhone() {
            return sellerPhone;
        }

        public void setSellerPhone(String sellerPhone) {
            this.sellerPhone = sellerPhone;
        }
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

    /**
     * Freight / payable snapshot for the Sales Patti Amount card: arrival freight from Arrivals,
     * invoiced freight and payable from billing (sales bills) for this seller's lots.
     */
    /**
     * Server-computed expense lines for Sales Patti (Arrivals freight share + commodity unloading/weighing).
     * Frontend must not recompute these for display; manual fields (gunnies, others) stay client-side.
     */
    public static class SellerExpenseSnapshotDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private BigDecimal freight;
        private BigDecimal unloading;
        private BigDecimal weighing;
        private BigDecimal cashAdvance;
        private Boolean freightAutoPulled;
        private Boolean unloadingAutoPulled;
        private Boolean weighingAutoPulled;
        /** When true, UI may show that full Journal-module cash advance flows are not wired yet. */
        private Boolean cashAdvanceJournalPending;

        public BigDecimal getFreight() {
            return freight;
        }

        public void setFreight(BigDecimal freight) {
            this.freight = freight;
        }

        public BigDecimal getUnloading() {
            return unloading;
        }

        public void setUnloading(BigDecimal unloading) {
            this.unloading = unloading;
        }

        public BigDecimal getWeighing() {
            return weighing;
        }

        public void setWeighing(BigDecimal weighing) {
            this.weighing = weighing;
        }

        public BigDecimal getCashAdvance() {
            return cashAdvance;
        }

        public void setCashAdvance(BigDecimal cashAdvance) {
            this.cashAdvance = cashAdvance;
        }

        public Boolean getFreightAutoPulled() {
            return freightAutoPulled;
        }

        public void setFreightAutoPulled(Boolean freightAutoPulled) {
            this.freightAutoPulled = freightAutoPulled;
        }

        public Boolean getUnloadingAutoPulled() {
            return unloadingAutoPulled;
        }

        public void setUnloadingAutoPulled(Boolean unloadingAutoPulled) {
            this.unloadingAutoPulled = unloadingAutoPulled;
        }

        public Boolean getWeighingAutoPulled() {
            return weighingAutoPulled;
        }

        public void setWeighingAutoPulled(Boolean weighingAutoPulled) {
            this.weighingAutoPulled = weighingAutoPulled;
        }

        public Boolean getCashAdvanceJournalPending() {
            return cashAdvanceJournalPending;
        }

        public void setCashAdvanceJournalPending(Boolean cashAdvanceJournalPending) {
            this.cashAdvanceJournalPending = cashAdvanceJournalPending;
        }
    }

    /** Request row for quick-expense state hydration/save. */
    public static class QuickExpenseStateUpsertRowDTO implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotBlank
        private String sellerId;
        @NotNull
        private BigDecimal freight;
        @NotNull
        private BigDecimal unloading;
        @NotNull
        private BigDecimal weighing;
        @NotNull
        private BigDecimal gunnies;

        public String getSellerId() {
            return sellerId;
        }

        public void setSellerId(String sellerId) {
            this.sellerId = sellerId;
        }

        public BigDecimal getFreight() {
            return freight;
        }

        public void setFreight(BigDecimal freight) {
            this.freight = freight;
        }

        public BigDecimal getUnloading() {
            return unloading;
        }

        public void setUnloading(BigDecimal unloading) {
            this.unloading = unloading;
        }

        public BigDecimal getWeighing() {
            return weighing;
        }

        public void setWeighing(BigDecimal weighing) {
            this.weighing = weighing;
        }

        public BigDecimal getGunnies() {
            return gunnies;
        }

        public void setGunnies(BigDecimal gunnies) {
            this.gunnies = gunnies;
        }
    }

    public static class QuickExpenseStateUpsertRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotNull
        private List<QuickExpenseStateUpsertRowDTO> rows;

        public List<QuickExpenseStateUpsertRowDTO> getRows() {
            return rows;
        }

        public void setRows(List<QuickExpenseStateUpsertRowDTO> rows) {
            this.rows = rows;
        }
    }

    /** Persisted quick-expense state (initial/original + current values). */
    public static class QuickExpenseStateRowDTO implements Serializable {
        private static final long serialVersionUID = 1L;

        private String sellerId;
        private BigDecimal freightOriginal;
        private BigDecimal unloadingOriginal;
        private BigDecimal weighingOriginal;
        private BigDecimal gunniesOriginal;
        private BigDecimal freightCurrent;
        private BigDecimal unloadingCurrent;
        private BigDecimal weighingCurrent;
        private BigDecimal gunniesCurrent;

        public String getSellerId() {
            return sellerId;
        }

        public void setSellerId(String sellerId) {
            this.sellerId = sellerId;
        }

        public BigDecimal getFreightOriginal() {
            return freightOriginal;
        }

        public void setFreightOriginal(BigDecimal freightOriginal) {
            this.freightOriginal = freightOriginal;
        }

        public BigDecimal getUnloadingOriginal() {
            return unloadingOriginal;
        }

        public void setUnloadingOriginal(BigDecimal unloadingOriginal) {
            this.unloadingOriginal = unloadingOriginal;
        }

        public BigDecimal getWeighingOriginal() {
            return weighingOriginal;
        }

        public void setWeighingOriginal(BigDecimal weighingOriginal) {
            this.weighingOriginal = weighingOriginal;
        }

        public BigDecimal getGunniesOriginal() {
            return gunniesOriginal;
        }

        public void setGunniesOriginal(BigDecimal gunniesOriginal) {
            this.gunniesOriginal = gunniesOriginal;
        }

        public BigDecimal getFreightCurrent() {
            return freightCurrent;
        }

        public void setFreightCurrent(BigDecimal freightCurrent) {
            this.freightCurrent = freightCurrent;
        }

        public BigDecimal getUnloadingCurrent() {
            return unloadingCurrent;
        }

        public void setUnloadingCurrent(BigDecimal unloadingCurrent) {
            this.unloadingCurrent = unloadingCurrent;
        }

        public BigDecimal getWeighingCurrent() {
            return weighingCurrent;
        }

        public void setWeighingCurrent(BigDecimal weighingCurrent) {
            this.weighingCurrent = weighingCurrent;
        }

        public BigDecimal getGunniesCurrent() {
            return gunniesCurrent;
        }

        public void setGunniesCurrent(BigDecimal gunniesCurrent) {
            this.gunniesCurrent = gunniesCurrent;
        }
    }

    public static class QuickExpenseStateResponse implements Serializable {
        private static final long serialVersionUID = 1L;

        private List<QuickExpenseStateRowDTO> rows;

        public List<QuickExpenseStateRowDTO> getRows() {
            return rows;
        }

        public void setRows(List<QuickExpenseStateRowDTO> rows) {
            this.rows = rows;
        }
    }

    public static class SettlementAmountSummaryDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private BigDecimal arrivalFreightAmount;
        private BigDecimal freightInvoiced;
        private BigDecimal payableInvoiced;

        public BigDecimal getArrivalFreightAmount() {
            return arrivalFreightAmount;
        }

        public void setArrivalFreightAmount(BigDecimal arrivalFreightAmount) {
            this.arrivalFreightAmount = arrivalFreightAmount;
        }

        public BigDecimal getFreightInvoiced() {
            return freightInvoiced;
        }

        public void setFreightInvoiced(BigDecimal freightInvoiced) {
            this.freightInvoiced = freightInvoiced;
        }

        public BigDecimal getPayableInvoiced() {
            return payableInvoiced;
        }

        public void setPayableInvoiced(BigDecimal payableInvoiced) {
            this.payableInvoiced = payableInvoiced;
        }
    }

    /** Create a temporary settlement voucher row (no fetch/list flow yet). */
    public static class SettlementVoucherTempCreateRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotBlank
        private String voucherName;

        private String forWhoName;

        private String description;

        @NotNull
        private BigDecimal expenseAmount;

        public String getVoucherName() {
            return voucherName;
        }

        public void setVoucherName(String voucherName) {
            this.voucherName = voucherName;
        }

        public String getForWhoName() {
            return forWhoName;
        }

        public void setForWhoName(String forWhoName) {
            this.forWhoName = forWhoName;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public BigDecimal getExpenseAmount() {
            return expenseAmount;
        }

        public void setExpenseAmount(BigDecimal expenseAmount) {
            this.expenseAmount = expenseAmount;
        }
    }

    public static class SettlementVoucherTempDTO implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long id;
        private String sellerId;
        private String voucherName;
        private String forWhoName;
        private String description;
        private BigDecimal expenseAmount;
        private Instant createdAt;

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
        }

        public String getSellerId() {
            return sellerId;
        }

        public void setSellerId(String sellerId) {
            this.sellerId = sellerId;
        }

        public String getVoucherName() {
            return voucherName;
        }

        public void setVoucherName(String voucherName) {
            this.voucherName = voucherName;
        }

        public String getForWhoName() {
            return forWhoName;
        }

        public void setForWhoName(String forWhoName) {
            this.forWhoName = forWhoName;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public BigDecimal getExpenseAmount() {
            return expenseAmount;
        }

        public void setExpenseAmount(BigDecimal expenseAmount) {
            this.expenseAmount = expenseAmount;
        }

        public Instant getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(Instant createdAt) {
            this.createdAt = createdAt;
        }
    }

    public static class SettlementVoucherTempUpsertRowDTO implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long id;
        @NotBlank
        private String voucherName;
        private String forWhoName;
        private String description;
        @NotNull
        private BigDecimal expenseAmount;

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
        }

        public String getVoucherName() {
            return voucherName;
        }

        public void setVoucherName(String voucherName) {
            this.voucherName = voucherName;
        }

        public String getForWhoName() {
            return forWhoName;
        }

        public void setForWhoName(String forWhoName) {
            this.forWhoName = forWhoName;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public BigDecimal getExpenseAmount() {
            return expenseAmount;
        }

        public void setExpenseAmount(BigDecimal expenseAmount) {
            this.expenseAmount = expenseAmount;
        }
    }

    public static class SettlementVoucherTempUpsertRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotNull
        @Valid
        private List<SettlementVoucherTempUpsertRowDTO> rows = new ArrayList<>();

        public List<SettlementVoucherTempUpsertRowDTO> getRows() {
            return rows;
        }

        public void setRows(List<SettlementVoucherTempUpsertRowDTO> rows) {
            this.rows = rows;
        }
    }

    public static class SettlementVoucherTempListResponse implements Serializable {
        private static final long serialVersionUID = 1L;

        private List<SettlementVoucherTempDTO> rows = new ArrayList<>();
        private BigDecimal totalExpenseAmount = BigDecimal.ZERO;

        public List<SettlementVoucherTempDTO> getRows() {
            return rows;
        }

        public void setRows(List<SettlementVoucherTempDTO> rows) {
            this.rows = rows;
        }

        public BigDecimal getTotalExpenseAmount() {
            return totalExpenseAmount;
        }

        public void setTotalExpenseAmount(BigDecimal totalExpenseAmount) {
            this.totalExpenseAmount = totalExpenseAmount;
        }
    }
}
