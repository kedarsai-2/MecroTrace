package com.mercotrace.service.dto;

import com.mercotrace.domain.enumeration.FreightMethod;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/**
 * DTOs for the Arrivals aggregate used by ArrivalsPage.
 */
public final class ArrivalDTOs {

    private ArrivalDTOs() {}

    public static class ArrivalLotDTO implements Serializable {

        @NotBlank
        private String lotName;

        /** Preserved on edit/reopen; generated server-side when absent. */
        private Integer lotSerialNumber;

        @Min(1)
        private int bagCount;

        @NotBlank
        private String commodityName;

        private String brokerTag;

        /** Optional variant per lot (e.g. Small, Medium, Large). */
        private String variant;

        public String getLotName() {
            return lotName;
        }

        public void setLotName(String lotName) {
            this.lotName = lotName;
        }

        public Integer getLotSerialNumber() {
            return lotSerialNumber;
        }

        public void setLotSerialNumber(Integer lotSerialNumber) {
            this.lotSerialNumber = lotSerialNumber;
        }

        public int getBagCount() {
            return bagCount;
        }

        public void setBagCount(int bagCount) {
            this.bagCount = bagCount;
        }

        public String getCommodityName() {
            return commodityName;
        }

        public void setCommodityName(String commodityName) {
            this.commodityName = commodityName;
        }

        public String getBrokerTag() {
            return brokerTag;
        }

        public void setBrokerTag(String brokerTag) {
            this.brokerTag = brokerTag;
        }

        public String getVariant() {
            return variant;
        }

        public void setVariant(String variant) {
            this.variant = variant;
        }
    }

    public static class ArrivalSellerDTO implements Serializable {

        /** When null, seller is free-text (name/phone from DTO only). */
        private Long contactId;

        /** Preserved on edit/reopen; ignored during create allocation when absent. */
        private Integer sellerSerialNumber;

        private String sellerName;

        private String sellerPhone;

        private String sellerMark;

        @NotNull
        private List<ArrivalLotDTO> lots;

        public Long getContactId() {
            return contactId;
        }

        public void setContactId(Long contactId) {
            this.contactId = contactId;
        }

        public String getSellerName() {
            return sellerName;
        }

        public Integer getSellerSerialNumber() {
            return sellerSerialNumber;
        }

        public void setSellerSerialNumber(Integer sellerSerialNumber) {
            this.sellerSerialNumber = sellerSerialNumber;
        }

        public void setSellerName(String sellerName) {
            this.sellerName = sellerName;
        }

        public String getSellerPhone() {
            return sellerPhone;
        }

        public void setSellerPhone(String sellerPhone) {
            this.sellerPhone = sellerPhone;
        }

        public String getSellerMark() {
            return sellerMark;
        }

        public void setSellerMark(String sellerMark) {
            this.sellerMark = sellerMark;
        }

        public List<ArrivalLotDTO> getLots() {
            return lots;
        }

        public void setLots(List<ArrivalLotDTO> lots) {
            this.lots = lots;
        }
    }

    public static class ArrivalRequestDTO implements Serializable {

        private String vehicleNumber;

        private boolean multiSeller;

        @NotNull
        private Double loadedWeight;

        @NotNull
        private Double emptyWeight;

        @NotNull
        private Double deductedWeight;

        @NotNull
        private FreightMethod freightMethod;

        @NotNull
        private Double freightRate;

        private boolean noRental;

        @NotNull
        private Double advancePaid;

        private String brokerName;

        /** When set, stored as SellerInVehicle.brokerId for all sellers. */
        private Long brokerContactId;

        private String narration;

        private String godown;

        private String gatepassNumber;

        private String origin;

        @NotNull
        private List<ArrivalSellerDTO> sellers;

        public String getVehicleNumber() {
            return vehicleNumber;
        }

        public void setVehicleNumber(String vehicleNumber) {
            this.vehicleNumber = vehicleNumber;
        }

        public boolean isMultiSeller() {
            return multiSeller;
        }

        public void setMultiSeller(boolean multiSeller) {
            this.multiSeller = multiSeller;
        }

        public Double getLoadedWeight() {
            return loadedWeight;
        }

        public void setLoadedWeight(Double loadedWeight) {
            this.loadedWeight = loadedWeight;
        }

        public Double getEmptyWeight() {
            return emptyWeight;
        }

        public void setEmptyWeight(Double emptyWeight) {
            this.emptyWeight = emptyWeight;
        }

        public Double getDeductedWeight() {
            return deductedWeight;
        }

        public void setDeductedWeight(Double deductedWeight) {
            this.deductedWeight = deductedWeight;
        }

        public FreightMethod getFreightMethod() {
            return freightMethod;
        }

        public void setFreightMethod(FreightMethod freightMethod) {
            this.freightMethod = freightMethod;
        }

        public Double getFreightRate() {
            return freightRate;
        }

        public void setFreightRate(Double freightRate) {
            this.freightRate = freightRate;
        }

        public boolean isNoRental() {
            return noRental;
        }

        public void setNoRental(boolean noRental) {
            this.noRental = noRental;
        }

        public Double getAdvancePaid() {
            return advancePaid;
        }

        public void setAdvancePaid(Double advancePaid) {
            this.advancePaid = advancePaid;
        }

        public String getBrokerName() {
            return brokerName;
        }

        public void setBrokerName(String brokerName) {
            this.brokerName = brokerName;
        }

        public Long getBrokerContactId() {
            return brokerContactId;
        }

        public void setBrokerContactId(Long brokerContactId) {
            this.brokerContactId = brokerContactId;
        }

        public String getNarration() {
            return narration;
        }

        public void setNarration(String narration) {
            this.narration = narration;
        }

        public String getGodown() {
            return godown;
        }

        public void setGodown(String godown) {
            this.godown = godown;
        }

        public String getGatepassNumber() {
            return gatepassNumber;
        }

        public void setGatepassNumber(String gatepassNumber) {
            this.gatepassNumber = gatepassNumber;
        }

        public String getOrigin() {
            return origin;
        }

        public void setOrigin(String origin) {
            this.origin = origin;
        }

        public List<ArrivalSellerDTO> getSellers() {
            return sellers;
        }

        public void setSellers(List<ArrivalSellerDTO> sellers) {
            this.sellers = sellers;
        }
    }

    public static class ArrivalSummaryDTO implements Serializable {

        private Long vehicleId;
        private String vehicleNumber;
        private int sellerCount;
        private int lotCount;
        private double netWeight;
        private double finalBillableWeight;
        private double freightTotal;
        private FreightMethod freightMethod;
        private Instant arrivalDatetime;
        private String godown;
        private String gatepassNumber;
        private String origin;
        /** First seller name for table display (vehicle | seller name). */
        private String primarySellerName;
        /** Total bags across all lots of this arrival. */
        private int totalBags;
        /** Number of lots that have at least one bid (auction entry). */
        private int bidsCount;
        /** Number of lots that have a weighing session. */
        private int weighedCount;

        public Long getVehicleId() {
            return vehicleId;
        }

        public void setVehicleId(Long vehicleId) {
            this.vehicleId = vehicleId;
        }

        public String getVehicleNumber() {
            return vehicleNumber;
        }

        public void setVehicleNumber(String vehicleNumber) {
            this.vehicleNumber = vehicleNumber;
        }

        public int getSellerCount() {
            return sellerCount;
        }

        public void setSellerCount(int sellerCount) {
            this.sellerCount = sellerCount;
        }

        public int getLotCount() {
            return lotCount;
        }

        public void setLotCount(int lotCount) {
            this.lotCount = lotCount;
        }

        public double getNetWeight() {
            return netWeight;
        }

        public void setNetWeight(double netWeight) {
            this.netWeight = netWeight;
        }

        public double getFinalBillableWeight() {
            return finalBillableWeight;
        }

        public void setFinalBillableWeight(double finalBillableWeight) {
            this.finalBillableWeight = finalBillableWeight;
        }

        public double getFreightTotal() {
            return freightTotal;
        }

        public void setFreightTotal(double freightTotal) {
            this.freightTotal = freightTotal;
        }

        public FreightMethod getFreightMethod() {
            return freightMethod;
        }

        public void setFreightMethod(FreightMethod freightMethod) {
            this.freightMethod = freightMethod;
        }

        public Instant getArrivalDatetime() {
            return arrivalDatetime;
        }

        public void setArrivalDatetime(Instant arrivalDatetime) {
            this.arrivalDatetime = arrivalDatetime;
        }

        public String getGodown() {
            return godown;
        }

        public void setGodown(String godown) {
            this.godown = godown;
        }

        public String getGatepassNumber() {
            return gatepassNumber;
        }

        public void setGatepassNumber(String gatepassNumber) {
            this.gatepassNumber = gatepassNumber;
        }

        public String getOrigin() {
            return origin;
        }

        public void setOrigin(String origin) {
            this.origin = origin;
        }

        public String getPrimarySellerName() {
            return primarySellerName;
        }

        public void setPrimarySellerName(String primarySellerName) {
            this.primarySellerName = primarySellerName;
        }

        public int getTotalBags() {
            return totalBags;
        }

        public void setTotalBags(int totalBags) {
            this.totalBags = totalBags;
        }

        public int getBidsCount() {
            return bidsCount;
        }

        public void setBidsCount(int bidsCount) {
            this.bidsCount = bidsCount;
        }

        public int getWeighedCount() {
            return weighedCount;
        }

        public void setWeighedCount(int weighedCount) {
            this.weighedCount = weighedCount;
        }
    }

    /**
     * Lot summary for arrival detail (e.g. WeighingPage bid enrichment).
     */
    public static class ArrivalLotDetailDTO implements Serializable {

        private Long id;
        private String lotName;

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
        }

        public String getLotName() {
            return lotName;
        }

        public void setLotName(String lotName) {
            this.lotName = lotName;
        }
    }

    /**
     * Seller summary for arrival detail (seller name + lots with id for lot lookup).
     */
    public static class ArrivalSellerDetailDTO implements Serializable {

        private String sellerName;
        private Long contactId;
        private String origin;
        private List<ArrivalLotDetailDTO> lots;

        public String getSellerName() {
            return sellerName;
        }

        public void setSellerName(String sellerName) {
            this.sellerName = sellerName;
        }

        public Long getContactId() {
            return contactId;
        }

        public void setContactId(Long contactId) {
            this.contactId = contactId;
        }

        public String getOrigin() {
            return origin;
        }

        public void setOrigin(String origin) {
            this.origin = origin;
        }

        public List<ArrivalLotDetailDTO> getLots() {
            return lots;
        }

        public void setLots(List<ArrivalLotDetailDTO> lots) {
            this.lots = lots;
        }
    }

    /**
     * Arrival with nested sellers and lots for pages that need lotId → lotName/sellerName (e.g. WeighingPage).
     */
    public static class ArrivalDetailDTO implements Serializable {

        private Long vehicleId;
        private String vehicleNumber;
        private Instant arrivalDatetime;
        private String godown;
        private String origin;
        private List<ArrivalSellerDetailDTO> sellers;

        public Long getVehicleId() {
            return vehicleId;
        }

        public void setVehicleId(Long vehicleId) {
            this.vehicleId = vehicleId;
        }

        public String getVehicleNumber() {
            return vehicleNumber;
        }

        public void setVehicleNumber(String vehicleNumber) {
            this.vehicleNumber = vehicleNumber;
        }

        public Instant getArrivalDatetime() {
            return arrivalDatetime;
        }

        public void setArrivalDatetime(Instant arrivalDatetime) {
            this.arrivalDatetime = arrivalDatetime;
        }

        public String getGodown() {
            return godown;
        }

        public void setGodown(String godown) {
            this.godown = godown;
        }

        public String getOrigin() {
            return origin;
        }

        public void setOrigin(String origin) {
            this.origin = origin;
        }

        public List<ArrivalSellerDetailDTO> getSellers() {
            return sellers;
        }

        public void setSellers(List<ArrivalSellerDetailDTO> sellers) {
            this.sellers = sellers;
        }
    }

    /** Lot with full fields for arrival expand/detail (FreightDetailsCard, SellerInfoCard). */
    public static class ArrivalLotFullDTO implements Serializable {
        private Long id;
        private String lotName;
        private Integer lotSerialNumber;
        private String commodityName;
        private int bagCount;
        private String brokerTag;
        private String variant;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getLotName() { return lotName; }
        public void setLotName(String lotName) { this.lotName = lotName; }
        public Integer getLotSerialNumber() { return lotSerialNumber; }
        public void setLotSerialNumber(Integer lotSerialNumber) { this.lotSerialNumber = lotSerialNumber; }
        public String getCommodityName() { return commodityName; }
        public void setCommodityName(String commodityName) { this.commodityName = commodityName; }
        public int getBagCount() { return bagCount; }
        public void setBagCount(int bagCount) { this.bagCount = bagCount; }
        public String getBrokerTag() { return brokerTag; }
        public void setBrokerTag(String brokerTag) { this.brokerTag = brokerTag; }
        public String getVariant() { return variant; }
        public void setVariant(String variant) { this.variant = variant; }
    }

    /** Seller with full lots for arrival expand (includes contactId/sellerPhone for edit form prefill). */
    public static class ArrivalSellerFullDTO implements Serializable {
        private Long contactId;
        private Integer sellerSerialNumber;
        private String sellerName;
        private String sellerPhone;
        private String sellerMark;
        private List<ArrivalLotFullDTO> lots;

        public Long getContactId() { return contactId; }
        public void setContactId(Long contactId) { this.contactId = contactId; }
        public Integer getSellerSerialNumber() { return sellerSerialNumber; }
        public void setSellerSerialNumber(Integer sellerSerialNumber) { this.sellerSerialNumber = sellerSerialNumber; }
        public String getSellerName() { return sellerName; }
        public void setSellerName(String sellerName) { this.sellerName = sellerName; }
        public String getSellerPhone() { return sellerPhone; }
        public void setSellerPhone(String sellerPhone) { this.sellerPhone = sellerPhone; }
        public String getSellerMark() { return sellerMark; }
        public void setSellerMark(String sellerMark) { this.sellerMark = sellerMark; }
        public List<ArrivalLotFullDTO> getLots() { return lots; }
        public void setLots(List<ArrivalLotFullDTO> lots) { this.lots = lots; }
    }

    /** Full arrival detail for expand panel: vehicle, weight, freight, sellers/lots. */
    public static class ArrivalFullDetailDTO implements Serializable {
        private Long vehicleId;
        private String vehicleNumber;
        private Instant arrivalDatetime;
        private String godown;
        private String gatepassNumber;
        private String origin;
        private String brokerName;
        private Long brokerContactId;
        private String narration;
        private Double loadedWeight;
        private Double emptyWeight;
        private Double deductedWeight;
        private Double netWeight;
        private FreightMethod freightMethod;
        private Double freightRate;
        private Double freightTotal;
        private Boolean noRental;
        private Double advancePaid;
        private List<ArrivalSellerFullDTO> sellers;

        public Long getVehicleId() { return vehicleId; }
        public void setVehicleId(Long vehicleId) { this.vehicleId = vehicleId; }
        public String getVehicleNumber() { return vehicleNumber; }
        public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }
        public Instant getArrivalDatetime() { return arrivalDatetime; }
        public void setArrivalDatetime(Instant arrivalDatetime) { this.arrivalDatetime = arrivalDatetime; }
        public String getGodown() { return godown; }
        public void setGodown(String godown) { this.godown = godown; }
        public String getGatepassNumber() { return gatepassNumber; }
        public void setGatepassNumber(String gatepassNumber) { this.gatepassNumber = gatepassNumber; }
        public String getOrigin() { return origin; }
        public void setOrigin(String origin) { this.origin = origin; }
        public String getBrokerName() { return brokerName; }
        public void setBrokerName(String brokerName) { this.brokerName = brokerName; }
        public Long getBrokerContactId() { return brokerContactId; }
        public void setBrokerContactId(Long brokerContactId) { this.brokerContactId = brokerContactId; }
        public String getNarration() { return narration; }
        public void setNarration(String narration) { this.narration = narration; }
        public Double getLoadedWeight() { return loadedWeight; }
        public void setLoadedWeight(Double loadedWeight) { this.loadedWeight = loadedWeight; }
        public Double getEmptyWeight() { return emptyWeight; }
        public void setEmptyWeight(Double emptyWeight) { this.emptyWeight = emptyWeight; }
        public Double getDeductedWeight() { return deductedWeight; }
        public void setDeductedWeight(Double deductedWeight) { this.deductedWeight = deductedWeight; }
        public Double getNetWeight() { return netWeight; }
        public void setNetWeight(Double netWeight) { this.netWeight = netWeight; }
        public FreightMethod getFreightMethod() { return freightMethod; }
        public void setFreightMethod(FreightMethod freightMethod) { this.freightMethod = freightMethod; }
        public Double getFreightRate() { return freightRate; }
        public void setFreightRate(Double freightRate) { this.freightRate = freightRate; }
        public Double getFreightTotal() { return freightTotal; }
        public void setFreightTotal(Double freightTotal) { this.freightTotal = freightTotal; }
        public Boolean getNoRental() { return noRental; }
        public void setNoRental(Boolean noRental) { this.noRental = noRental; }
        public Double getAdvancePaid() { return advancePaid; }
        public void setAdvancePaid(Double advancePaid) { this.advancePaid = advancePaid; }
        public List<ArrivalSellerFullDTO> getSellers() { return sellers; }
        public void setSellers(List<ArrivalSellerFullDTO> sellers) { this.sellers = sellers; }
    }

    /** Request body for PATCH /api/arrivals/:id (full update; all fields optional). When sellers present, replaces all sellers/lots. */
    public static class ArrivalUpdateDTO implements Serializable {
        private String vehicleNumber;
        private String godown;
        private String gatepassNumber;
        private String origin;
        private String brokerName;
        private Long brokerContactId;
        private String narration;
        private Double loadedWeight;
        private Double emptyWeight;
        private Double deductedWeight;
        private FreightMethod freightMethod;
        private Double freightRate;
        private Boolean noRental;
        private Double advancePaid;
        private Boolean multiSeller;
        private List<ArrivalSellerDTO> sellers;

        public String getVehicleNumber() { return vehicleNumber; }
        public void setVehicleNumber(String vehicleNumber) { this.vehicleNumber = vehicleNumber; }
        public String getGodown() { return godown; }
        public void setGodown(String godown) { this.godown = godown; }
        public String getGatepassNumber() { return gatepassNumber; }
        public void setGatepassNumber(String gatepassNumber) { this.gatepassNumber = gatepassNumber; }
        public String getOrigin() { return origin; }
        public void setOrigin(String origin) { this.origin = origin; }
        public String getBrokerName() { return brokerName; }
        public void setBrokerName(String brokerName) { this.brokerName = brokerName; }
        public Long getBrokerContactId() { return brokerContactId; }
        public void setBrokerContactId(Long brokerContactId) { this.brokerContactId = brokerContactId; }
        public String getNarration() { return narration; }
        public void setNarration(String narration) { this.narration = narration; }
        public Double getLoadedWeight() { return loadedWeight; }
        public void setLoadedWeight(Double loadedWeight) { this.loadedWeight = loadedWeight; }
        public Double getEmptyWeight() { return emptyWeight; }
        public void setEmptyWeight(Double emptyWeight) { this.emptyWeight = emptyWeight; }
        public Double getDeductedWeight() { return deductedWeight; }
        public void setDeductedWeight(Double deductedWeight) { this.deductedWeight = deductedWeight; }
        public FreightMethod getFreightMethod() { return freightMethod; }
        public void setFreightMethod(FreightMethod freightMethod) { this.freightMethod = freightMethod; }
        public Double getFreightRate() { return freightRate; }
        public void setFreightRate(Double freightRate) { this.freightRate = freightRate; }
        public Boolean getNoRental() { return noRental; }
        public void setNoRental(Boolean noRental) { this.noRental = noRental; }
        public Double getAdvancePaid() { return advancePaid; }
        public void setAdvancePaid(Double advancePaid) { this.advancePaid = advancePaid; }
        public Boolean getMultiSeller() { return multiSeller; }
        public void setMultiSeller(Boolean multiSeller) { this.multiSeller = multiSeller; }
        public List<ArrivalSellerDTO> getSellers() { return sellers; }
        public void setSellers(List<ArrivalSellerDTO> sellers) { this.sellers = sellers; }
    }
}

