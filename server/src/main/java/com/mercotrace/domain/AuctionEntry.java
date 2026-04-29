package com.mercotrace.domain;

import com.mercotrace.domain.enumeration.AuctionPresetType;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * AuctionEntry represents a single bid / partial sale within an Auction session.
 * Aligned with client/src/types/models.ts (PART 6.2 Auction_Entries)
 * and Sales Pad (AuctionsPage.tsx) data model.
 */
@Entity
@Table(name = "auction_entry")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AuctionEntry extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @Column(name = "auction_id", nullable = false)
    private Long auctionId;

    @Column(name = "buyer_id")
    private Long buyerId;

    @NotNull
    @Column(name = "bid_number", nullable = false)
    private Integer bidNumber;

    @NotNull
    @Column(name = "bid_rate", precision = 19, scale = 2, nullable = false)
    private BigDecimal bidRate;

    /**
     * Signed preset margin for this bid (from Sales Pad). Stored separately from the base bid.
     * Downstream modules (settlement, billing, print) should compute effective seller rate as
     * {@code bid_rate + preset_margin} when a combined value is required.
     */
    @NotNull
    @Column(name = "preset_margin", precision = 19, scale = 2, nullable = false)
    private BigDecimal presetMargin;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "preset_type", length = 10, nullable = false)
    private AuctionPresetType presetType;

    /**
     * Base auction bid rate (same as {@link #bidRate}). Not merged with preset; see {@link #presetMargin}.
     */
    @NotNull
    @Column(name = "seller_rate", precision = 19, scale = 2, nullable = false)
    private BigDecimal sellerRate;

    /**
     * Vehicle-ops / Summary "new seller rate". Independent from auction {@link #bidRate} /
     * {@link #buyerRate}; PATCH updates this alone without recomputing buyer totals.
     */
    @NotNull
    @Column(name = "summary_seller_rate", precision = 19, scale = 2, nullable = false)
    private BigDecimal summarySellerRate;

    @NotNull
    @Column(name = "buyer_rate", precision = 19, scale = 2, nullable = false)
    private BigDecimal buyerRate;

    @NotNull
    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    @NotNull
    @Column(name = "amount", precision = 19, scale = 2, nullable = false)
    private BigDecimal amount;

    @NotNull
    @Column(name = "is_self_sale", nullable = false)
    private Boolean isSelfSale = Boolean.FALSE;

    @NotNull
    @Column(name = "is_scribble", nullable = false)
    private Boolean isScribble = Boolean.FALSE;

    @NotNull
    @Column(name = "token_advance", precision = 19, scale = 2, nullable = false)
    private BigDecimal tokenAdvance;

    @NotNull
    @Column(name = "extra_rate", precision = 19, scale = 2, nullable = false)
    private BigDecimal extraRate;

    @NotNull
    @Column(name = "buyer_name", length = 200, nullable = false)
    private String buyerName;

    @NotNull
    @Column(name = "buyer_mark", length = 50, nullable = false)
    private String buyerMark;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Override
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getAuctionId() {
        return auctionId;
    }

    public void setAuctionId(Long auctionId) {
        this.auctionId = auctionId;
    }

    public Long getBuyerId() {
        return buyerId;
    }

    public void setBuyerId(Long buyerId) {
        this.buyerId = buyerId;
    }

    public Integer getBidNumber() {
        return bidNumber;
    }

    public void setBidNumber(Integer bidNumber) {
        this.bidNumber = bidNumber;
    }

    public BigDecimal getBidRate() {
        return bidRate;
    }

    public void setBidRate(BigDecimal bidRate) {
        this.bidRate = bidRate;
    }

    public BigDecimal getPresetMargin() {
        return presetMargin;
    }

    public void setPresetMargin(BigDecimal presetMargin) {
        this.presetMargin = presetMargin;
    }

    public AuctionPresetType getPresetType() {
        return presetType;
    }

    public void setPresetType(AuctionPresetType presetType) {
        this.presetType = presetType;
    }

    public BigDecimal getSellerRate() {
        return sellerRate;
    }

    public void setSellerRate(BigDecimal sellerRate) {
        this.sellerRate = sellerRate;
    }

    public BigDecimal getSummarySellerRate() {
        return summarySellerRate;
    }

    public void setSummarySellerRate(BigDecimal summarySellerRate) {
        this.summarySellerRate = summarySellerRate;
    }

    public BigDecimal getBuyerRate() {
        return buyerRate;
    }

    public void setBuyerRate(BigDecimal buyerRate) {
        this.buyerRate = buyerRate;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public Boolean getIsSelfSale() {
        return isSelfSale;
    }

    public void setIsSelfSale(Boolean selfSale) {
        isSelfSale = selfSale;
    }

    public Boolean getIsScribble() {
        return isScribble;
    }

    public void setIsScribble(Boolean scribble) {
        isScribble = scribble;
    }

    public BigDecimal getTokenAdvance() {
        return tokenAdvance;
    }

    public void setTokenAdvance(BigDecimal tokenAdvance) {
        this.tokenAdvance = tokenAdvance;
    }

    public BigDecimal getExtraRate() {
        return extraRate;
    }

    public void setExtraRate(BigDecimal extraRate) {
        this.extraRate = extraRate;
    }

    public String getBuyerName() {
        return buyerName;
    }

    public void setBuyerName(String buyerName) {
        this.buyerName = buyerName;
    }

    public String getBuyerMark() {
        return buyerMark;
    }

    public void setBuyerMark(String buyerMark) {
        this.buyerMark = buyerMark;
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
        if (!(o instanceof AuctionEntry)) {
            return false;
        }
        return getId() != null && getId().equals(((AuctionEntry) o).getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }

    @Override
    public String toString() {
        return "AuctionEntry{" +
            "id=" + getId() +
            ", auctionId=" + getAuctionId() +
            ", buyerId=" + getBuyerId() +
            ", bidNumber=" + getBidNumber() +
            ", bidRate=" + getBidRate() +
            ", presetMargin=" + getPresetMargin() +
            ", presetType=" + getPresetType() +
            ", sellerRate=" + getSellerRate() +
            ", summarySellerRate=" + getSummarySellerRate() +
            ", buyerRate=" + getBuyerRate() +
            ", quantity=" + getQuantity() +
            ", amount=" + getAmount() +
            ", isSelfSale=" + getIsSelfSale() +
            ", isScribble=" + getIsScribble() +
            ", tokenAdvance=" + getTokenAdvance() +
            ", extraRate=" + getExtraRate() +
            ", buyerName='" + getBuyerName() + "'" +
            ", buyerMark='" + getBuyerMark() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            "}";
    }
}

