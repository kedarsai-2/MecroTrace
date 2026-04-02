package com.mercotrace.service.dto;

import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;

/**
 * A DTO for the {@link com.mercotrace.domain.Contact} entity.
 * Exposes fields aligned with frontend Contact model.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class ContactDTO implements Serializable {

    private static final long serialVersionUID = -8733523392348609622L;

    private Long id;

    // Logical trader owner (mapped from traderId)
    private Long traderId;

    @Size(max = 191)
    private String email;

    @Size(max = 150)
    private String name;

    @Size(max = 20)
    private String phone;

    @Size(max = 20)
    private String mark;

    private String address;

    private Instant createdAt;

    private BigDecimal openingBalance;

    private BigDecimal currentBalance;

    private Boolean canLogin;

    private Boolean active;

    /** True when this row is a portal self-signup contact surfaced in the trader registry via first use (not trader-created). */
    private Boolean portalSignupLinked;

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

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getMark() {
        return mark;
    }

    public void setMark(String mark) {
        this.mark = mark;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public BigDecimal getOpeningBalance() {
        return openingBalance;
    }

    public void setOpeningBalance(BigDecimal openingBalance) {
        this.openingBalance = openingBalance;
    }

    public BigDecimal getCurrentBalance() {
        return currentBalance;
    }

    public void setCurrentBalance(BigDecimal currentBalance) {
        this.currentBalance = currentBalance;
    }

    public Boolean getCanLogin() {
        return canLogin;
    }

    public void setCanLogin(Boolean canLogin) {
        this.canLogin = canLogin;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public Boolean getPortalSignupLinked() {
        return portalSignupLinked;
    }

    public void setPortalSignupLinked(Boolean portalSignupLinked) {
        this.portalSignupLinked = portalSignupLinked;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ContactDTO)) {
            return false;
        }

        ContactDTO contactDTO = (ContactDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, contactDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    @Override
    public String toString() {
        return "ContactDTO{" +
            "id=" + getId() +
            ", traderId=" + getTraderId() +
            ", email='" + getEmail() + "'" +
            ", name='" + getName() + "'" +
            ", phone='" + getPhone() + "'" +
            ", mark='" + getMark() + "'" +
            ", address='" + getAddress() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            ", openingBalance=" + getOpeningBalance() +
            ", currentBalance=" + getCurrentBalance() +
            ", canLogin=" + getCanLogin() +
            "}";
    }
}

