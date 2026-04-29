package com.mercotrace.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * Commodity group within a sales bill. Aligned with BillingPage CommodityGroup.
 */
@Entity
@Table(name = "sales_bill_commodity_group")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class SalesBillCommodityGroup implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_bill_id", nullable = false)
    private SalesBill salesBill;

    @NotNull
    @Column(name = "commodity_name", nullable = false, length = 150)
    private String commodityName;

    @Column(name = "hsn_code", length = 20)
    private String hsnCode;

    @NotNull
    @Column(name = "commission_percent", precision = 8, scale = 2, nullable = false)
    private BigDecimal commissionPercent = BigDecimal.ZERO;

    @NotNull
    @Column(name = "user_fee_percent", precision = 8, scale = 2, nullable = false)
    private BigDecimal userFeePercent = BigDecimal.ZERO;

    @NotNull
    @Column(name = "subtotal", precision = 15, scale = 2, nullable = false)
    private BigDecimal subtotal;

    @NotNull
    @Column(name = "commission_amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal commissionAmount = BigDecimal.ZERO;

    @NotNull
    @Column(name = "user_fee_amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal userFeeAmount = BigDecimal.ZERO;

    @NotNull
    @Column(name = "total_charges", precision = 15, scale = 2, nullable = false)
    private BigDecimal totalCharges = BigDecimal.ZERO;

    // Per-commodity coolie charge (calculated from coolieRate * quantity)
    @Column(name = "coolie_rate", precision = 15, scale = 2)
    private BigDecimal coolieRate = BigDecimal.ZERO;

    @Column(name = "coolie_amount", precision = 15, scale = 2)
    private BigDecimal coolieAmount = BigDecimal.ZERO;

    // Per-commodity weighman charge (calculated from weighmanChargeRate * quantity)
    @Column(name = "weighman_charge_rate", precision = 15, scale = 2)
    private BigDecimal weighmanChargeRate = BigDecimal.ZERO;

    @Column(name = "weighman_charge_amount", precision = 15, scale = 2)
    private BigDecimal weighmanChargeAmount = BigDecimal.ZERO;

    /** When null, coolie amount uses sum of line item quantities. */
    @Column(name = "coolie_charge_qty")
    private Integer coolieChargeQty;

    /** When null, weighman amount uses sum of line item quantities. */
    @Column(name = "weighman_charge_qty")
    private Integer weighmanChargeQty;

    // Per-commodity discount (PERCENT or AMOUNT)
    @Column(name = "discount", precision = 15, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(name = "discount_type", length = 20)
    private String discountType = "AMOUNT"; // PERCENT or AMOUNT

    // Per-commodity manual round-off adjustment
    @Column(name = "manual_round_off", precision = 15, scale = 2)
    private BigDecimal manualRoundOff = BigDecimal.ZERO;

    /** Combined GST % on bill (overrides commodity config for this bill line). */
    @Column(name = "gst_rate", precision = 8, scale = 2)
    private BigDecimal gstRate;

    @Column(name = "gst_input_mode", length = 10)
    private String gstInputMode;

    @Column(name = "sgst_rate", precision = 8, scale = 2)
    private BigDecimal sgstRate;

    @Column(name = "sgst_input_mode", length = 10)
    private String sgstInputMode;

    @Column(name = "cgst_rate", precision = 8, scale = 2)
    private BigDecimal cgstRate;

    @Column(name = "cgst_input_mode", length = 10)
    private String cgstInputMode;

    @Column(name = "igst_rate", precision = 8, scale = 2)
    private BigDecimal igstRate;

    @Column(name = "igst_input_mode", length = 10)
    private String igstInputMode;

    @NotNull
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @OneToMany(mappedBy = "commodityGroup", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder")
    private List<SalesBillLineItem> items = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public SalesBill getSalesBill() { return salesBill; }
    public void setSalesBill(SalesBill salesBill) { this.salesBill = salesBill; }
    public String getCommodityName() { return commodityName; }
    public void setCommodityName(String commodityName) { this.commodityName = commodityName; }
    public String getHsnCode() { return hsnCode; }
    public void setHsnCode(String hsnCode) { this.hsnCode = hsnCode; }
    public BigDecimal getCommissionPercent() { return commissionPercent; }
    public void setCommissionPercent(BigDecimal commissionPercent) { this.commissionPercent = commissionPercent; }
    public BigDecimal getUserFeePercent() { return userFeePercent; }
    public void setUserFeePercent(BigDecimal userFeePercent) { this.userFeePercent = userFeePercent; }
    public BigDecimal getSubtotal() { return subtotal; }
    public void setSubtotal(BigDecimal subtotal) { this.subtotal = subtotal; }
    public BigDecimal getCommissionAmount() { return commissionAmount; }
    public void setCommissionAmount(BigDecimal commissionAmount) { this.commissionAmount = commissionAmount; }
    public BigDecimal getUserFeeAmount() { return userFeeAmount; }
    public void setUserFeeAmount(BigDecimal userFeeAmount) { this.userFeeAmount = userFeeAmount; }
    public BigDecimal getTotalCharges() { return totalCharges; }
    public void setTotalCharges(BigDecimal totalCharges) { this.totalCharges = totalCharges; }
    public BigDecimal getCoolieRate() { return coolieRate; }
    public void setCoolieRate(BigDecimal coolieRate) { this.coolieRate = coolieRate; }
    public BigDecimal getCoolieAmount() { return coolieAmount; }
    public void setCoolieAmount(BigDecimal coolieAmount) { this.coolieAmount = coolieAmount; }
    public BigDecimal getWeighmanChargeRate() { return weighmanChargeRate; }
    public void setWeighmanChargeRate(BigDecimal weighmanChargeRate) { this.weighmanChargeRate = weighmanChargeRate; }
    public BigDecimal getWeighmanChargeAmount() { return weighmanChargeAmount; }
    public void setWeighmanChargeAmount(BigDecimal weighmanChargeAmount) { this.weighmanChargeAmount = weighmanChargeAmount; }
    public Integer getCoolieChargeQty() { return coolieChargeQty; }
    public void setCoolieChargeQty(Integer coolieChargeQty) { this.coolieChargeQty = coolieChargeQty; }
    public Integer getWeighmanChargeQty() { return weighmanChargeQty; }
    public void setWeighmanChargeQty(Integer weighmanChargeQty) { this.weighmanChargeQty = weighmanChargeQty; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public String getDiscountType() { return discountType; }
    public void setDiscountType(String discountType) { this.discountType = discountType; }
    public BigDecimal getManualRoundOff() { return manualRoundOff; }
    public void setManualRoundOff(BigDecimal manualRoundOff) { this.manualRoundOff = manualRoundOff; }
    public BigDecimal getGstRate() { return gstRate; }
    public void setGstRate(BigDecimal gstRate) { this.gstRate = gstRate; }
    public String getGstInputMode() { return gstInputMode; }
    public void setGstInputMode(String gstInputMode) { this.gstInputMode = gstInputMode; }
    public BigDecimal getSgstRate() { return sgstRate; }
    public void setSgstRate(BigDecimal sgstRate) { this.sgstRate = sgstRate; }
    public String getSgstInputMode() { return sgstInputMode; }
    public void setSgstInputMode(String sgstInputMode) { this.sgstInputMode = sgstInputMode; }
    public BigDecimal getCgstRate() { return cgstRate; }
    public void setCgstRate(BigDecimal cgstRate) { this.cgstRate = cgstRate; }
    public String getCgstInputMode() { return cgstInputMode; }
    public void setCgstInputMode(String cgstInputMode) { this.cgstInputMode = cgstInputMode; }
    public BigDecimal getIgstRate() { return igstRate; }
    public void setIgstRate(BigDecimal igstRate) { this.igstRate = igstRate; }
    public String getIgstInputMode() { return igstInputMode; }
    public void setIgstInputMode(String igstInputMode) { this.igstInputMode = igstInputMode; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public List<SalesBillLineItem> getItems() { return items; }
    public void setItems(List<SalesBillLineItem> items) { this.items = items; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SalesBillCommodityGroup)) return false;
        SalesBillCommodityGroup that = (SalesBillCommodityGroup) o;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() { return getClass().hashCode(); }
}
