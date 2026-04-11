package com.mercotrace.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.math.BigDecimal;

/**
 * Temporary settlement voucher rows created from Settlement UI.
 * Stored separately so data can be migrated into the final voucher flow later.
 */
@Entity
@Table(name = "settlement_voucher_temp")
public class SettlementVoucherTemp extends AbstractAuditingEntity<Long> implements Serializable {

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

    @Column(name = "voucher_name", nullable = false, length = 200)
    private String voucherName;

    @Column(name = "for_who_name", length = 200)
    private String forWhoName;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "expense_amount", nullable = false, precision = 19, scale = 2)
    private BigDecimal expenseAmount = BigDecimal.ZERO;

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

    public String getVoucherName() {
        return voucherName;
    }

    public void setVoucherName(String voucherName) {
        this.voucherName = voucherName;
    }

    public String getForWhoName() {
        return forWhoName;
    }

    public void setForWhoName(String forWhoName) {
        this.forWhoName = forWhoName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getExpenseAmount() {
        return expenseAmount;
    }

    public void setExpenseAmount(BigDecimal expenseAmount) {
        this.expenseAmount = expenseAmount;
    }
}
