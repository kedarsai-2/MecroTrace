package com.mercotrace.domain;

import com.mercotrace.admin.identity.AdminUser;
import com.mercotrace.domain.enumeration.MultiTraderAccountRequestStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "multi_trader_account_request")
public class MultiTraderAccountRequest extends AbstractAuditingEntity<Long> implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_user_id", nullable = false)
    private User requesterUser;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_trader_id", nullable = false)
    private Trader requesterTrader;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_trader_id")
    private Trader createdTrader;

    @Size(max = 64)
    @Column(name = "request_group_id", length = 64)
    private String requestGroupId;

    @Column(name = "request_group_index")
    private Integer requestGroupIndex;

    @Column(name = "request_group_size")
    private Integer requestGroupSize;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private MultiTraderAccountRequestStatus status = MultiTraderAccountRequestStatus.PENDING;

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

    @Size(max = 20)
    @Column(name = "shop_no", length = 20)
    private String shopNo;

    @Size(max = 100)
    @Column(name = "category", length = 100)
    private String category;

    @Size(max = 15)
    @Column(name = "gst_number", length = 15)
    private String gstNumber;

    @Size(max = 64)
    @Column(name = "rmc_apmc_code", length = 64)
    private String rmcApmcCode;

    @Column(name = "shop_photos")
    private String shopPhotos;

    @Column(name = "description")
    private String description;

    @Size(max = 20)
    @Column(name = "bill_prefix", length = 20)
    private String billPrefix = "";

    @Column(name = "decision_reason")
    private String decisionReason;

    @NotNull
    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "decision_at")
    private Instant decisionAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by_admin_user_id")
    private AdminUser decidedByAdminUser;

    @Override
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public User getRequesterUser() {
        return requesterUser;
    }

    public void setRequesterUser(User requesterUser) {
        this.requesterUser = requesterUser;
    }

    public Trader getRequesterTrader() {
        return requesterTrader;
    }

    public void setRequesterTrader(Trader requesterTrader) {
        this.requesterTrader = requesterTrader;
    }

    public Trader getCreatedTrader() {
        return createdTrader;
    }

    public void setCreatedTrader(Trader createdTrader) {
        this.createdTrader = createdTrader;
    }

    public String getRequestGroupId() {
        return requestGroupId;
    }

    public void setRequestGroupId(String requestGroupId) {
        this.requestGroupId = requestGroupId;
    }

    public Integer getRequestGroupIndex() {
        return requestGroupIndex;
    }

    public void setRequestGroupIndex(Integer requestGroupIndex) {
        this.requestGroupIndex = requestGroupIndex;
    }

    public Integer getRequestGroupSize() {
        return requestGroupSize;
    }

    public void setRequestGroupSize(Integer requestGroupSize) {
        this.requestGroupSize = requestGroupSize;
    }

    public MultiTraderAccountRequestStatus getStatus() {
        return status;
    }

    public void setStatus(MultiTraderAccountRequestStatus status) {
        this.status = status;
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

    public String getShopNo() {
        return shopNo;
    }

    public void setShopNo(String shopNo) {
        this.shopNo = shopNo;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
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

    public String getShopPhotos() {
        return shopPhotos;
    }

    public void setShopPhotos(String shopPhotos) {
        this.shopPhotos = shopPhotos;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getBillPrefix() {
        return billPrefix;
    }

    public void setBillPrefix(String billPrefix) {
        this.billPrefix = billPrefix;
    }

    public String getDecisionReason() {
        return decisionReason;
    }

    public void setDecisionReason(String decisionReason) {
        this.decisionReason = decisionReason;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public void setRequestedAt(Instant requestedAt) {
        this.requestedAt = requestedAt;
    }

    public Instant getDecisionAt() {
        return decisionAt;
    }

    public void setDecisionAt(Instant decisionAt) {
        this.decisionAt = decisionAt;
    }

    public AdminUser getDecidedByAdminUser() {
        return decidedByAdminUser;
    }

    public void setDecidedByAdminUser(AdminUser decidedByAdminUser) {
        this.decidedByAdminUser = decidedByAdminUser;
    }
}
