package com.mercotrace.domain;

import com.mercotrace.domain.enumeration.FreightMethod;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A FreightCalculation.
 */
@Entity
@Table(name = "freight_calculation")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class FreightCalculation extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @Column(name = "vehicle_id", nullable = false)
    private Long vehicleId;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 30)
    private FreightMethod method;

    @Column(name = "rate", nullable = false)
    private Double rate;

    @Column(name = "freight_kgs", nullable = false)
    private Double freightKgs;

    @Column(name = "total_amount", nullable = false)
    private Double totalAmount;

    @Column(name = "no_rental", nullable = false)
    private Boolean noRental;

    @Column(name = "advance_paid", nullable = false)
    private Double advancePaid;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Override
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getVehicleId() {
        return vehicleId;
    }

    public void setVehicleId(Long vehicleId) {
        this.vehicleId = vehicleId;
    }

    public FreightMethod getMethod() {
        return method;
    }

    public void setMethod(FreightMethod method) {
        this.method = method;
    }

    public Double getRate() {
        return rate;
    }

    public void setRate(Double rate) {
        this.rate = rate;
    }

    public Double getFreightKgs() {
        return freightKgs;
    }

    public void setFreightKgs(Double freightKgs) {
        this.freightKgs = freightKgs;
    }

    public Double getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(Double totalAmount) {
        this.totalAmount = totalAmount;
    }

    public Boolean getNoRental() {
        return noRental;
    }

    public void setNoRental(Boolean noRental) {
        this.noRental = noRental;
    }

    public Double getAdvancePaid() {
        return advancePaid;
    }

    public void setAdvancePaid(Double advancePaid) {
        this.advancePaid = advancePaid;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof FreightCalculation)) {
            return false;
        }
        return getId() != null && getId().equals(((FreightCalculation) o).getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    @Override
    public String toString() {
        return "FreightCalculation{" +
            "id=" + getId() +
            ", vehicleId=" + getVehicleId() +
            ", method=" + getMethod() +
            ", rate=" + getRate() +
            ", freightKgs=" + getFreightKgs() +
            ", totalAmount=" + getTotalAmount() +
            ", noRental=" + getNoRental() +
            ", advancePaid=" + getAdvancePaid() +
            ", createdAt='" + getCreatedAt() + "'" +
            "}";
    }
}

