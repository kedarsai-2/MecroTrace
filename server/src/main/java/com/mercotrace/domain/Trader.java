package com.mercotrace.domain;

import com.mercotrace.domain.enumeration.ApprovalStatus;
import com.mercotrace.domain.enumeration.BusinessMode;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A Trader.
 */
@Entity
@Table(name = "trader")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Trader implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @Size(max = 150)
    @Column(name = "business_name", length = 150, nullable = false)
    private String businessName;

    @NotNull
    @Size(max = 150)
    @Column(name = "owner_name", length = 150, nullable = false)
    private String ownerName;

    @Column(name = "address")
    private String address;

    @Size(max = 20)
    @Column(name = "mobile", length = 20)
    private String mobile;

    @Size(max = 191)
    @Column(name = "email", length = 191)
    private String email;

    @Size(max = 100)
    @Column(name = "city", length = 100)
    private String city;

    @Size(max = 100)
    @Column(name = "state", length = 100)
    private String state;

    @Size(max = 20)
    @Column(name = "pin_code", length = 20)
    private String pinCode;

    @Size(max = 100)
    @Column(name = "category", length = 100)
    private String category;

    @Enumerated(EnumType.STRING)
    @Column(name = "approval_status")
    private ApprovalStatus approvalStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "business_mode")
    private BusinessMode businessMode;

    @Size(max = 20)
    @Column(name = "bill_prefix", length = 20)
    private String billPrefix;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "approval_decision_at")
    private Instant approvalDecisionAt;

    @Column(name = "shop_photos")
    private String shopPhotos; // comma-separated URLs/paths

    @Size(max = 15)
    @Column(name = "gst_number", length = 15)
    private String gstNumber;

    @Size(max = 64)
    @Column(name = "rmc_apmc_code", length = 64)
    private String rmcApmcCode;

    @NotNull
    @Column(name = "active", nullable = false)
    private Boolean active = true;

    /**
     * When true, trader may define own preset marks; when false, auction uses {@link GlobalPresetMarkSetting} rows only.
     */
    @NotNull
    @Column(name = "preset_enabled", nullable = false)
    private Boolean presetEnabled = true;

    /**
     * Optional JSON blob: mobile/tablet Sales Pad layout (client-owned schema). Persisted per trader for cross-device UX.
     */
    @Column(name = "auction_touch_layout_json", columnDefinition = "text")
    private String auctionTouchLayoutJson;

    // jhipster-needle-entity-add-field - JHipster will add fields here

    public Long getId() {
        return this.id;
    }

    public Trader id(Long id) {
        this.setId(id);
        return this;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getBusinessName() {
        return this.businessName;
    }

    public Trader businessName(String businessName) {
        this.setBusinessName(businessName);
        return this;
    }

    public void setBusinessName(String businessName) {
        this.businessName = businessName;
    }

    public String getOwnerName() {
        return this.ownerName;
    }

    public Trader ownerName(String ownerName) {
        this.setOwnerName(ownerName);
        return this;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
    }

    public String getAddress() {
        return this.address;
    }

    public Trader address(String address) {
        this.setAddress(address);
        return this;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getCategory() {
        return this.category;
    }

    public Trader category(String category) {
        this.setCategory(category);
        return this;
    }

    public void setCategory(String category) {
        this.category = category;
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

    public ApprovalStatus getApprovalStatus() {
        return this.approvalStatus;
    }

    public Trader approvalStatus(ApprovalStatus approvalStatus) {
        this.setApprovalStatus(approvalStatus);
        return this;
    }

    public void setApprovalStatus(ApprovalStatus approvalStatus) {
        this.approvalStatus = approvalStatus;
    }

    public BusinessMode getBusinessMode() {
        return this.businessMode;
    }

    public Trader businessMode(BusinessMode businessMode) {
        this.setBusinessMode(businessMode);
        return this;
    }

    public void setBusinessMode(BusinessMode businessMode) {
        this.businessMode = businessMode;
    }

    public String getBillPrefix() {
        return this.billPrefix;
    }

    public Trader billPrefix(String billPrefix) {
        this.setBillPrefix(billPrefix);
        return this;
    }

    public void setBillPrefix(String billPrefix) {
        this.billPrefix = billPrefix;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public Trader createdAt(Instant createdAt) {
        this.setCreatedAt(createdAt);
        return this;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return this.updatedAt;
    }

    public Trader updatedAt(Instant updatedAt) {
        this.setUpdatedAt(updatedAt);
        return this;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getApprovalDecisionAt() {
        return approvalDecisionAt;
    }

    public Trader approvalDecisionAt(Instant approvalDecisionAt) {
        this.setApprovalDecisionAt(approvalDecisionAt);
        return this;
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
        return this.active;
    }

    public Trader active(Boolean active) {
        this.setActive(active);
        return this;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public Boolean getPresetEnabled() {
        return presetEnabled;
    }

    public Trader presetEnabled(Boolean presetEnabled) {
        this.setPresetEnabled(presetEnabled);
        return this;
    }

    public void setPresetEnabled(Boolean presetEnabled) {
        this.presetEnabled = presetEnabled;
    }

    public String getAuctionTouchLayoutJson() {
        return auctionTouchLayoutJson;
    }

    public Trader auctionTouchLayoutJson(String auctionTouchLayoutJson) {
        this.setAuctionTouchLayoutJson(auctionTouchLayoutJson);
        return this;
    }

    public void setAuctionTouchLayoutJson(String auctionTouchLayoutJson) {
        this.auctionTouchLayoutJson = auctionTouchLayoutJson;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Trader)) {
            return false;
        }
        return getId() != null && getId().equals(((Trader) o).getId());
    }

    @Override
    public int hashCode() {
        // see https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/
        return getClass().hashCode();
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "Trader{" +
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
