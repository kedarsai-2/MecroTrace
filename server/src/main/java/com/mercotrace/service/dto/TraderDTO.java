package com.mercotrace.service.dto;

import com.mercotrace.domain.enumeration.ApprovalStatus;
import com.mercotrace.domain.enumeration.BusinessMode;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * A DTO for the {@link com.mercotrace.domain.Trader} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class TraderDTO implements Serializable {

    private Long id;

    @NotNull
    @Size(max = 150)
    private String businessName;

    @NotNull
    @Size(max = 150)
    private String ownerName;

    private String address;

    @Size(max = 20)
    private String mobile;

    @Size(max = 191)
    private String email;

    @Size(max = 100)
    private String city;

    @Size(max = 100)
    private String state;

    @Size(max = 20)
    private String pinCode;

    @Size(max = 100)
    private String category;

    private ApprovalStatus approvalStatus;

    private BusinessMode businessMode;

    @Size(max = 20)
    private String billPrefix;

    private Instant createdAt;

    private Instant updatedAt;

    private Instant approvalDecisionAt;

    // Comma-separated URLs/paths
    private String shopPhotos;

    @Size(max = 15)
    private String gstNumber;

    @Size(max = 64)
    private String rmcApmcCode;

    private Boolean active = true;

    private Boolean presetEnabled = true;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getBusinessName() {
        return businessName;
    }

    public void setBusinessName(String businessName) {
        this.businessName = businessName;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getMobile() {
        return mobile;
    }

    public void setMobile(String mobile) {
        this.mobile = mobile;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getPinCode() {
        return pinCode;
    }

    public void setPinCode(String pinCode) {
        this.pinCode = pinCode;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public ApprovalStatus getApprovalStatus() {
        return approvalStatus;
    }

    public void setApprovalStatus(ApprovalStatus approvalStatus) {
        this.approvalStatus = approvalStatus;
    }

    public BusinessMode getBusinessMode() {
        return businessMode;
    }

    public void setBusinessMode(BusinessMode businessMode) {
        this.businessMode = businessMode;
    }

    public String getBillPrefix() {
        return billPrefix;
    }

    public void setBillPrefix(String billPrefix) {
        this.billPrefix = billPrefix;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getApprovalDecisionAt() {
        return approvalDecisionAt;
    }

    public void setApprovalDecisionAt(Instant approvalDecisionAt) {
        this.approvalDecisionAt = approvalDecisionAt;
    }

    public String getShopPhotos() {
        return shopPhotos;
    }

    public void setShopPhotos(String shopPhotos) {
        this.shopPhotos = shopPhotos;
    }

    public String getGstNumber() {
        return gstNumber;
    }

    public void setGstNumber(String gstNumber) {
        this.gstNumber = gstNumber;
    }

    public String getRmcApmcCode() {
        return rmcApmcCode;
    }

    public void setRmcApmcCode(String rmcApmcCode) {
        this.rmcApmcCode = rmcApmcCode;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public Boolean getPresetEnabled() {
        return presetEnabled;
    }

    public void setPresetEnabled(Boolean presetEnabled) {
        this.presetEnabled = presetEnabled;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof TraderDTO)) {
            return false;
        }

        TraderDTO traderDTO = (TraderDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, traderDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "TraderDTO{" +
            "id=" + getId() +
            ", businessName='" + getBusinessName() + "'" +
            ", ownerName='" + getOwnerName() + "'" +
            ", address='" + getAddress() + "'" +
            ", category='" + getCategory() + "'" +
            ", approvalStatus='" + getApprovalStatus() + "'" +
            ", businessMode='" + getBusinessMode() + "'" +
            ", billPrefix='" + getBillPrefix() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            ", updatedAt='" + getUpdatedAt() + "'" +
            ", approvalDecisionAt='" + getApprovalDecisionAt() + "'" +
            "}";
    }
}
