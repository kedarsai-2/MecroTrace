package com.mercotrace.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * Auction session header for a single lot.
 * Aligned with client/src/types/models.ts (PART 6.1 Auctions)
 * and AuctionsPage.tsx (Sales Pad).
 */
@Entity
@Table(name = "auction")
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Auction extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @Column(name = "trader_id")
    private Long traderId;

    @Column(name = "lot_id", nullable = false)
    private Long lotId;

    @Column(name = "self_sale_unit_id")
    private Long selfSaleUnitId;

    @Column(name = "auction_datetime", nullable = false)
    private Instant auctionDatetime;

    @Column(name = "conducted_by", length = 50)
    private String conductedBy;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at")
    private Instant createdAt;

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

    public Instant getAuctionDatetime() {
        return auctionDatetime;
    }

    public void setAuctionDatetime(Instant auctionDatetime) {
        this.auctionDatetime = auctionDatetime;
    }

    public Long getSelfSaleUnitId() {
        return selfSaleUnitId;
    }

    public void setSelfSaleUnitId(Long selfSaleUnitId) {
        this.selfSaleUnitId = selfSaleUnitId;
    }

    public String getConductedBy() {
        return conductedBy;
    }

    public void setConductedBy(String conductedBy) {
        this.conductedBy = conductedBy;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
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
        if (!(o instanceof Auction)) {
            return false;
        }
        return getId() != null && getId().equals(((Auction) o).getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    @Override
    public String toString() {
        return "Auction{" +
            "id=" + getId() +
            ", traderId=" + getTraderId() +
            ", lotId=" + getLotId() +
            ", selfSaleUnitId=" + getSelfSaleUnitId() +
            ", auctionDatetime='" + getAuctionDatetime() + "'" +
            ", conductedBy='" + getConductedBy() + "'" +
            ", completedAt='" + getCompletedAt() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            "}";
    }
}

