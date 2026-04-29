package com.mercotrace.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * Line item within a sales bill commodity group. Aligned with BillingPage BillLineItem.
 */
@Entity
@Table(name = "sales_bill_line_item")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class SalesBillLineItem implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "commodity_group_id", nullable = false)
    private SalesBillCommodityGroup commodityGroup;

    @NotNull
    @Column(name = "bid_number", nullable = false)
    private Integer bidNumber;

    @Column(name = "lot_name", length = 150)
    private String lotName;

    /** Auction lot id (string); optional for legacy rows. */
    @Column(name = "lot_id", length = 64)
    private String lotId;

    /** {@link com.mercotrace.domain.AuctionEntry} id for billing ↔ auction sync. */
    @Column(name = "auction_entry_id")
    private Long auctionEntryId;

    @Column(name = "self_sale_unit_id")
    private Long selfSaleUnitId;

    @Column(name = "seller_name", length = 255)
    private String sellerName;

    /** Lot bag count at lot level (canonical identifier segment); not billed line quantity. */
    @Column(name = "lot_total_qty")
    private Integer lotTotalQty;

    @Column(name = "vehicle_total_qty")
    private Integer vehicleTotalQty;

    @Column(name = "seller_vehicle_qty")
    private Integer sellerVehicleQty;

    @Column(name = "vehicle_mark", length = 32)
    private String vehicleMark;

    @Column(name = "seller_mark", length = 32)
    private String sellerMark;

    @NotNull
    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    @NotNull
    @Column(name = "weight", precision = 12, scale = 2, nullable = false)
    private BigDecimal weight;

    @NotNull
    @Column(name = "base_rate", precision = 15, scale = 2, nullable = false)
    private BigDecimal baseRate;

    @NotNull
    @Column(name = "brokerage", precision = 15, scale = 2, nullable = false)
    private BigDecimal brokerage = BigDecimal.ZERO;

    /** Signed auction preset margin (₹/rate add); independent of {@link #otherCharges}. */
    @NotNull
    @Column(name = "preset_applied", precision = 15, scale = 2, nullable = false)
    private BigDecimal presetApplied = BigDecimal.ZERO;

    @NotNull
    @Column(name = "other_charges", precision = 15, scale = 2, nullable = false)
    private BigDecimal otherCharges = BigDecimal.ZERO;

    @NotNull
    @Column(name = "new_rate", precision = 15, scale = 2, nullable = false)
    private BigDecimal newRate;

    @NotNull
    @Column(name = "amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal amount;

    /** Token advance collected at auction for this bid/lot (₹). */
    @NotNull
    @Column(name = "token_advance", precision = 15, scale = 2, nullable = false)
    private BigDecimal tokenAdvance = BigDecimal.ZERO;

    @NotNull
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public SalesBillCommodityGroup getCommodityGroup() { return commodityGroup; }
    public void setCommodityGroup(SalesBillCommodityGroup commodityGroup) { this.commodityGroup = commodityGroup; }
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
    public Integer getLotTotalQty() { return lotTotalQty; }
    public void setLotTotalQty(Integer lotTotalQty) { this.lotTotalQty = lotTotalQty; }
    public Integer getVehicleTotalQty() { return vehicleTotalQty; }
    public void setVehicleTotalQty(Integer vehicleTotalQty) { this.vehicleTotalQty = vehicleTotalQty; }
    public Integer getSellerVehicleQty() { return sellerVehicleQty; }
    public void setSellerVehicleQty(Integer sellerVehicleQty) { this.sellerVehicleQty = sellerVehicleQty; }
    public String getVehicleMark() { return vehicleMark; }
    public void setVehicleMark(String vehicleMark) { this.vehicleMark = vehicleMark; }
    public String getSellerMark() { return sellerMark; }
    public void setSellerMark(String sellerMark) { this.sellerMark = sellerMark; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public BigDecimal getWeight() { return weight; }
    public void setWeight(BigDecimal weight) { this.weight = weight; }
    public BigDecimal getBaseRate() { return baseRate; }
    public void setBaseRate(BigDecimal baseRate) { this.baseRate = baseRate; }
    public BigDecimal getBrokerage() { return brokerage; }
    public void setBrokerage(BigDecimal brokerage) { this.brokerage = brokerage; }
    public BigDecimal getPresetApplied() { return presetApplied; }
    public void setPresetApplied(BigDecimal presetApplied) { this.presetApplied = presetApplied; }
    public BigDecimal getOtherCharges() { return otherCharges; }
    public void setOtherCharges(BigDecimal otherCharges) { this.otherCharges = otherCharges; }
    public BigDecimal getNewRate() { return newRate; }
    public void setNewRate(BigDecimal newRate) { this.newRate = newRate; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BigDecimal getTokenAdvance() { return tokenAdvance; }
    public void setTokenAdvance(BigDecimal tokenAdvance) { this.tokenAdvance = tokenAdvance; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SalesBillLineItem)) return false;
        SalesBillLineItem that = (SalesBillLineItem) o;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() { return getClass().hashCode(); }
}
