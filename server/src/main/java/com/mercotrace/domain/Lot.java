package com.mercotrace.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A Lot.
 */
@Entity
@Table(name = "lot")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Lot extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @Column(name = "seller_vehicle_id", nullable = false)
    private Long sellerVehicleId;

    @Column(name = "commodity_id", nullable = false)
    private Long commodityId;

    @Column(name = "lot_name", length = 50, nullable = false)
    private String lotName;

    @Column(name = "bag_count", nullable = false)
    private Integer bagCount;

    @Column(name = "seller_serial_no", nullable = false)
    private Integer sellerSerialNo;

    @Column(name = "lot_serial_no", nullable = false)
    private Integer lotSerialNo;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "variant", length = 50)
    private String variant;

    @Column(name = "broker_tag", length = 100)
    private String brokerTag;

    @Override
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getSellerVehicleId() {
        return sellerVehicleId;
    }

    public void setSellerVehicleId(Long sellerVehicleId) {
        this.sellerVehicleId = sellerVehicleId;
    }

    public Long getCommodityId() {
        return commodityId;
    }

    public void setCommodityId(Long commodityId) {
        this.commodityId = commodityId;
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

    public Integer getSellerSerialNo() {
        return sellerSerialNo;
    }

    public void setSellerSerialNo(Integer sellerSerialNo) {
        this.sellerSerialNo = sellerSerialNo;
    }

    public Integer getLotSerialNo() {
        return lotSerialNo;
    }

    public void setLotSerialNo(Integer lotSerialNo) {
        this.lotSerialNo = lotSerialNo;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public String getVariant() {
        return variant;
    }

    public void setVariant(String variant) {
        this.variant = variant;
    }

    public String getBrokerTag() {
        return brokerTag;
    }

    public void setBrokerTag(String brokerTag) {
        this.brokerTag = brokerTag;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Lot)) {
            return false;
        }
        return getId() != null && getId().equals(((Lot) o).getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    @Override
    public String toString() {
        return "Lot{" +
            "id=" + getId() +
            ", sellerVehicleId=" + getSellerVehicleId() +
            ", commodityId=" + getCommodityId() +
            ", lotName='" + getLotName() + "'" +
            ", bagCount=" + getBagCount() +
            ", sellerSerialNo=" + getSellerSerialNo() +
            ", lotSerialNo=" + getLotSerialNo() +
            ", createdAt='" + getCreatedAt() + "'" +
            "}";
    }
}

