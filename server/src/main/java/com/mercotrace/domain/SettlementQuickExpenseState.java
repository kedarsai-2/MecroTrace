package com.mercotrace.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.math.BigDecimal;

/**
 * Persisted quick-expense baseline/current values per settlement seller row.
 */
@Entity
@Table(
    name = "settlement_quick_expense_state",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_settlement_quick_expense_trader_seller", columnNames = { "trader_id", "seller_id" }),
    }
)
public class SettlementQuickExpenseState extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @Column(name = "trader_id", nullable = false)
    private Long traderId;

    @Column(name = "seller_id", nullable = false, length = 128)
    private String sellerId;

    @Column(name = "freight_original", nullable = false, precision = 19, scale = 2)
    private BigDecimal freightOriginal = BigDecimal.ZERO;

    @Column(name = "unloading_original", nullable = false, precision = 19, scale = 2)
    private BigDecimal unloadingOriginal = BigDecimal.ZERO;

    @Column(name = "weighing_original", nullable = false, precision = 19, scale = 2)
    private BigDecimal weighingOriginal = BigDecimal.ZERO;

    @Column(name = "gunnies_original", nullable = false, precision = 19, scale = 2)
    private BigDecimal gunniesOriginal = BigDecimal.ZERO;

    @Column(name = "freight_current", nullable = false, precision = 19, scale = 2)
    private BigDecimal freightCurrent = BigDecimal.ZERO;

    @Column(name = "unloading_current", nullable = false, precision = 19, scale = 2)
    private BigDecimal unloadingCurrent = BigDecimal.ZERO;

    @Column(name = "weighing_current", nullable = false, precision = 19, scale = 2)
    private BigDecimal weighingCurrent = BigDecimal.ZERO;

    @Column(name = "gunnies_current", nullable = false, precision = 19, scale = 2)
    private BigDecimal gunniesCurrent = BigDecimal.ZERO;

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

    public String getSellerId() {
        return sellerId;
    }

    public void setSellerId(String sellerId) {
        this.sellerId = sellerId;
    }

    public BigDecimal getFreightOriginal() {
        return freightOriginal;
    }

    public void setFreightOriginal(BigDecimal freightOriginal) {
        this.freightOriginal = freightOriginal;
    }

    public BigDecimal getUnloadingOriginal() {
        return unloadingOriginal;
    }

    public void setUnloadingOriginal(BigDecimal unloadingOriginal) {
        this.unloadingOriginal = unloadingOriginal;
    }

    public BigDecimal getWeighingOriginal() {
        return weighingOriginal;
    }

    public void setWeighingOriginal(BigDecimal weighingOriginal) {
        this.weighingOriginal = weighingOriginal;
    }

    public BigDecimal getGunniesOriginal() {
        return gunniesOriginal;
    }

    public void setGunniesOriginal(BigDecimal gunniesOriginal) {
        this.gunniesOriginal = gunniesOriginal;
    }

    public BigDecimal getFreightCurrent() {
        return freightCurrent;
    }

    public void setFreightCurrent(BigDecimal freightCurrent) {
        this.freightCurrent = freightCurrent;
    }

    public BigDecimal getUnloadingCurrent() {
        return unloadingCurrent;
    }

    public void setUnloadingCurrent(BigDecimal unloadingCurrent) {
        this.unloadingCurrent = unloadingCurrent;
    }

    public BigDecimal getWeighingCurrent() {
        return weighingCurrent;
    }

    public void setWeighingCurrent(BigDecimal weighingCurrent) {
        this.weighingCurrent = weighingCurrent;
    }

    public BigDecimal getGunniesCurrent() {
        return gunniesCurrent;
    }

    public void setGunniesCurrent(BigDecimal gunniesCurrent) {
        this.gunniesCurrent = gunniesCurrent;
    }
}
