package com.mercotrace.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A Vehicle.
 */
@Entity
@Table(name = "vehicle")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Vehicle extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @Column(name = "trader_id")
    private Long traderId;

    // Allow null/blank vehicle numbers for draft-style submissions and for multi-seller mode.
    @Column(name = "vehicle_number", length = 50, nullable = true)
    private String vehicleNumber;

    /** Optional global unique mark/alias for the vehicle (NULL = unset). Uniqueness enforced case-insensitive on trimmed value. */
    @Column(name = "vehicle_mark_alias", length = 8, nullable = true)
    private String vehicleMarkAlias;

    @Column(name = "arrival_datetime", nullable = false)
    private Instant arrivalDatetime;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "godown", length = 255)
    private String godown;

    @Column(name = "gatepass_number", length = 100)
    private String gatepassNumber;

    @Column(name = "origin", length = 500)
    private String origin;

    @Column(name = "broker_name", length = 255)
    private String brokerName;

    @Column(name = "narration", length = 500)
    private String narration;

    @Column(name = "partially_completed", nullable = false)
    private Boolean partiallyCompleted = false;

    /** When true, UI/API treat arrival as multi-seller (vehicle plate, multiple sellers). Persisted so drafts resume correctly. */
    @Column(name = "multi_seller", nullable = false)
    private Boolean multiSeller = true;

    // jhipster-needle-entity-add-field - JHipster will add fields here

    @Override
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getTraderId() {
        return traderId;
    }

    public void setTraderId(Long traderId) {
        this.traderId = traderId;
    }

    public String getVehicleNumber() {
        return vehicleNumber;
    }

    public void setVehicleNumber(String vehicleNumber) {
        this.vehicleNumber = vehicleNumber;
    }

    public String getVehicleMarkAlias() {
        return vehicleMarkAlias;
    }

    public void setVehicleMarkAlias(String vehicleMarkAlias) {
        this.vehicleMarkAlias = vehicleMarkAlias;
    }

    public Instant getArrivalDatetime() {
        return arrivalDatetime;
    }

    public void setArrivalDatetime(Instant arrivalDatetime) {
        this.arrivalDatetime = arrivalDatetime;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
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

    public String getBrokerName() {
        return brokerName;
    }

    public void setBrokerName(String brokerName) {
        this.brokerName = brokerName;
    }

    public String getNarration() {
        return narration;
    }

    public void setNarration(String narration) {
        this.narration = narration;
    }

    public Boolean getPartiallyCompleted() {
        return partiallyCompleted;
    }

    public void setPartiallyCompleted(Boolean partiallyCompleted) {
        this.partiallyCompleted = partiallyCompleted;
    }

    public Boolean getMultiSeller() {
        return multiSeller;
    }

    public void setMultiSeller(Boolean multiSeller) {
        this.multiSeller = multiSeller;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Vehicle)) {
            return false;
        }
        return getId() != null && getId().equals(((Vehicle) o).getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    @Override
    public String toString() {
        return "Vehicle{" +
            "id=" + getId() +
            ", traderId=" + getTraderId() +
            ", vehicleNumber='" + getVehicleNumber() + "'" +
            ", vehicleMarkAlias='" + getVehicleMarkAlias() + "'" +
            ", arrivalDatetime='" + getArrivalDatetime() + "'" +
            ", createdBy='" + getCreatedBy() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            "}";
    }
}

