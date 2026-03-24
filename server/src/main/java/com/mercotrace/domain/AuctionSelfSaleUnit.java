package com.mercotrace.domain;

import com.mercotrace.domain.enumeration.AuctionSelfSaleUnitStatus;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * Quantity-based self-sale inventory unit created from a completed Sales Pad auction entry.
 * This is separate from the manual Self-Sale module and supports re-auction of only the self-sold quantity.
 */
@Entity
@Table(name = "auction_self_sale_unit")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionSelfSaleUnit extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @Column(name = "trader_id", nullable = false)
    private Long traderId;

    @NotNull
    @Column(name = "lot_id", nullable = false)
    private Long lotId;

    @NotNull
    @Column(name = "source_auction_id", nullable = false)
    private Long sourceAuctionId;

    @NotNull
    @Column(name = "source_auction_entry_id", nullable = false)
    private Long sourceAuctionEntryId;

    @Column(name = "last_reauction_auction_id")
    private Long lastReauctionAuctionId;

    @NotNull
    @Column(name = "self_sale_qty", nullable = false)
    private Integer selfSaleQty;

    @NotNull
    @Column(name = "remaining_qty", nullable = false)
    private Integer remainingQty;

    @NotNull
    @Column(name = "rate", precision = 19, scale = 2, nullable = false)
    private BigDecimal rate;

    @NotNull
    @Column(name = "amount", precision = 19, scale = 2, nullable = false)
    private BigDecimal amount;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private AuctionSelfSaleUnitStatus status = AuctionSelfSaleUnitStatus.OPEN;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "closed_at")
    private Instant closedAt;

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

    public Long getLotId() {
        return lotId;
    }

    public void setLotId(Long lotId) {
        this.lotId = lotId;
    }

    public Long getSourceAuctionId() {
        return sourceAuctionId;
    }

    public void setSourceAuctionId(Long sourceAuctionId) {
        this.sourceAuctionId = sourceAuctionId;
    }

    public Long getSourceAuctionEntryId() {
        return sourceAuctionEntryId;
    }

    public void setSourceAuctionEntryId(Long sourceAuctionEntryId) {
        this.sourceAuctionEntryId = sourceAuctionEntryId;
    }

    public Long getLastReauctionAuctionId() {
        return lastReauctionAuctionId;
    }

    public void setLastReauctionAuctionId(Long lastReauctionAuctionId) {
        this.lastReauctionAuctionId = lastReauctionAuctionId;
    }

    public Integer getSelfSaleQty() {
        return selfSaleQty;
    }

    public void setSelfSaleQty(Integer selfSaleQty) {
        this.selfSaleQty = selfSaleQty;
    }

    public Integer getRemainingQty() {
        return remainingQty;
    }

    public void setRemainingQty(Integer remainingQty) {
        this.remainingQty = remainingQty;
    }

    public BigDecimal getRate() {
        return rate;
    }

    public void setRate(BigDecimal rate) {
        this.rate = rate;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public AuctionSelfSaleUnitStatus getStatus() {
        return status;
    }

    public void setStatus(AuctionSelfSaleUnitStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getClosedAt() {
        return closedAt;
    }

    public void setClosedAt(Instant closedAt) {
        this.closedAt = closedAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof AuctionSelfSaleUnit)) {
            return false;
        }
        return getId() != null && getId().equals(((AuctionSelfSaleUnit) o).getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    @Override
    public String toString() {
        return "AuctionSelfSaleUnit{" +
            "id=" + getId() +
            ", traderId=" + getTraderId() +
            ", lotId=" + getLotId() +
            ", sourceAuctionId=" + getSourceAuctionId() +
            ", sourceAuctionEntryId=" + getSourceAuctionEntryId() +
            ", lastReauctionAuctionId=" + getLastReauctionAuctionId() +
            ", selfSaleQty=" + getSelfSaleQty() +
            ", remainingQty=" + getRemainingQty() +
            ", rate=" + getRate() +
            ", amount=" + getAmount() +
            ", status=" + getStatus() +
            ", createdAt='" + getCreatedAt() + "'" +
            ", closedAt='" + getClosedAt() + "'" +
            "}";
    }
}
