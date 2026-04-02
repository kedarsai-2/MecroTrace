package com.mercotrace.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * Sales bill (buyer invoice). Aligned with BillingPage.tsx BillData.
 * Bill number generated per trader prefix; version history on update.
 */
@Entity
@Table(name = "sales_bill")
@EntityListeners(AuditingEntityListener.class)
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class SalesBill implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @Column(name = "trader_id", nullable = false)
    private Long traderId;

    @Column(name = "bill_number", length = 30)
    private String billNumber;

    @NotNull
    @Column(name = "buyer_name", nullable = false, length = 255)
    private String buyerName;

    @NotNull
    @Column(name = "buyer_mark", nullable = false, length = 100)
    private String buyerMark;

    @Column(name = "buyer_contact_id")
    private Long buyerContactId;

    @Column(name = "buyer_phone", length = 20)
    private String buyerPhone;

    @Column(name = "buyer_address", length = 500)
    private String buyerAddress;

    @NotNull
    @Column(name = "buyer_as_broker", nullable = false)
    private Boolean buyerAsBroker = false;

    @Column(name = "broker_name", length = 255)
    private String brokerName;

    @Column(name = "broker_mark", length = 100)
    private String brokerMark;

    @Column(name = "broker_contact_id")
    private Long brokerContactId;

    @Column(name = "broker_phone", length = 20)
    private String brokerPhone;

    @Column(name = "broker_address", length = 500)
    private String brokerAddress;

    @NotNull
    @Column(name = "billing_name", nullable = false, length = 255)
    private String billingName;

    @NotNull
    @Column(name = "bill_date", nullable = false)
    private Instant billDate;

    @NotNull
    @Column(name = "outbound_freight", precision = 15, scale = 2, nullable = false)
    private BigDecimal outboundFreight = BigDecimal.ZERO;

    @Column(name = "outbound_vehicle", length = 50)
    private String outboundVehicle;

    @NotNull
    @Column(name = "token_advance", precision = 15, scale = 2, nullable = false)
    private BigDecimal tokenAdvance = BigDecimal.ZERO;

    @NotNull
    @Column(name = "grand_total", precision = 15, scale = 2, nullable = false)
    private BigDecimal grandTotal;

    @NotNull
    @Column(name = "brokerage_type", nullable = false, length = 10)
    private String brokerageType = "AMOUNT";

    @NotNull
    @Column(name = "brokerage_value", precision = 15, scale = 2, nullable = false)
    private BigDecimal brokerageValue = BigDecimal.ZERO;

    @NotNull
    @Column(name = "global_other_charges", precision = 15, scale = 2, nullable = false)
    private BigDecimal globalOtherCharges = BigDecimal.ZERO;

    @NotNull
    @Column(name = "pending_balance", precision = 15, scale = 2, nullable = false)
    private BigDecimal pendingBalance = BigDecimal.ZERO;

    @CreatedBy
    @Column(name = "created_by", length = 100, updatable = false)
    private String createdBy;

    @CreatedDate
    @Column(name = "created_date", nullable = false, updatable = false)
    private Instant createdDate;

    @LastModifiedBy
    @Column(name = "last_modified_by", length = 100)
    private String lastModifiedBy;

    @LastModifiedDate
    @Column(name = "last_modified_date")
    private Instant lastModifiedDate;

    @OneToMany(mappedBy = "salesBill", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder")
    private List<SalesBillCommodityGroup> commodityGroups = new ArrayList<>();

    @OneToMany(mappedBy = "salesBill", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("id")
    private List<SalesBillVersion> versions = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTraderId() { return traderId; }
    public void setTraderId(Long traderId) { this.traderId = traderId; }
    public String getBillNumber() { return billNumber; }
    public void setBillNumber(String billNumber) { this.billNumber = billNumber; }
    public String getBuyerName() { return buyerName; }
    public void setBuyerName(String buyerName) { this.buyerName = buyerName; }
    public String getBuyerMark() { return buyerMark; }
    public void setBuyerMark(String buyerMark) { this.buyerMark = buyerMark; }
    public Long getBuyerContactId() { return buyerContactId; }
    public void setBuyerContactId(Long buyerContactId) { this.buyerContactId = buyerContactId; }
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
    public Long getBrokerContactId() { return brokerContactId; }
    public void setBrokerContactId(Long brokerContactId) { this.brokerContactId = brokerContactId; }
    public String getBrokerPhone() { return brokerPhone; }
    public void setBrokerPhone(String brokerPhone) { this.brokerPhone = brokerPhone; }
    public String getBrokerAddress() { return brokerAddress; }
    public void setBrokerAddress(String brokerAddress) { this.brokerAddress = brokerAddress; }
    public String getBillingName() { return billingName; }
    public void setBillingName(String billingName) { this.billingName = billingName; }
    public Instant getBillDate() { return billDate; }
    public void setBillDate(Instant billDate) { this.billDate = billDate; }
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
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedDate() { return createdDate; }
    public void setCreatedDate(Instant createdDate) { this.createdDate = createdDate; }
    public String getLastModifiedBy() { return lastModifiedBy; }
    public void setLastModifiedBy(String lastModifiedBy) { this.lastModifiedBy = lastModifiedBy; }
    public Instant getLastModifiedDate() { return lastModifiedDate; }
    public void setLastModifiedDate(Instant lastModifiedDate) { this.lastModifiedDate = lastModifiedDate; }
    public List<SalesBillCommodityGroup> getCommodityGroups() { return commodityGroups; }
    public void setCommodityGroups(List<SalesBillCommodityGroup> commodityGroups) { this.commodityGroups = commodityGroups; }
    public List<SalesBillVersion> getVersions() { return versions; }
    public void setVersions(List<SalesBillVersion> versions) { this.versions = versions; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SalesBill)) return false;
        SalesBill that = (SalesBill) o;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() { return getClass().hashCode(); }

    @Override
    public String toString() {
        return "SalesBill{id=" + id + ", billNumber='" + billNumber + "', buyerMark='" + buyerMark + "'}";
    }
}
