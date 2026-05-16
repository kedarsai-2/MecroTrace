package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mercotrace.domain.enumeration.MultiTraderAccountRequestStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

public class MultiTraderAccountRequestDTO implements Serializable {

    private Long id;

    private MultiTraderAccountRequestStatus status;

    @JsonProperty("requester_user_id")
    private Long requesterUserId;

    @JsonProperty("requester_trader_id")
    private Long requesterTraderId;

    @JsonProperty("created_trader_id")
    private Long createdTraderId;

    @JsonProperty("request_group_id")
    @Size(max = 64)
    private String requestGroupId;

    @JsonProperty("request_group_index")
    private Integer requestGroupIndex;

    @JsonProperty("request_group_size")
    private Integer requestGroupSize;

    @JsonProperty("business_name")
    @NotBlank
    @Size(max = 150)
    private String businessName;

    @JsonProperty("owner_name")
    @NotBlank
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

    @JsonProperty("pin_code")
    @Size(max = 20)
    private String pinCode;

    @JsonProperty("shop_no")
    @Size(max = 20)
    private String shopNo;

    @Size(max = 100)
    private String category;

    @JsonProperty("gst_number")
    @Size(max = 15)
    @Pattern(
        regexp = "^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
        message = "Invalid GST number"
    )
    private String gstNumber;

    @JsonProperty("rmc_apmc_code")
    @Size(max = 64)
    private String rmcApmcCode;

    @JsonProperty("shop_photos")
    @Size(max = 4)
    private String[] shopPhotos;

    @Size(max = 500)
    private String description;

    @JsonProperty("bill_prefix")
    @Size(max = 20)
    private String billPrefix;

    @JsonProperty("decision_reason")
    private String decisionReason;

    @JsonProperty("requested_at")
    private Instant requestedAt;

    @JsonProperty("decision_at")
    private Instant decisionAt;

    @JsonProperty("decided_by_admin_user_id")
    private Long decidedByAdminUserId;

    @JsonProperty("requester_login")
    private String requesterLogin;

    @JsonProperty("requester_name")
    private String requesterName;

    @JsonProperty("current_trader_business_name")
    private String currentTraderBusinessName;

    @JsonProperty("created_trader_business_name")
    private String createdTraderBusinessName;

    @JsonProperty("decided_by_admin_login")
    private String decidedByAdminLogin;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public MultiTraderAccountRequestStatus getStatus() {
        return status;
    }

    public void setStatus(MultiTraderAccountRequestStatus status) {
        this.status = status;
    }

    public Long getRequesterUserId() {
        return requesterUserId;
    }

    public void setRequesterUserId(Long requesterUserId) {
        this.requesterUserId = requesterUserId;
    }

    public Long getRequesterTraderId() {
        return requesterTraderId;
    }

    public void setRequesterTraderId(Long requesterTraderId) {
        this.requesterTraderId = requesterTraderId;
    }

    public Long getCreatedTraderId() {
        return createdTraderId;
    }

    public void setCreatedTraderId(Long createdTraderId) {
        this.createdTraderId = createdTraderId;
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

    public String[] getShopPhotos() {
        return shopPhotos;
    }

    public void setShopPhotos(String[] shopPhotos) {
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

    public Long getDecidedByAdminUserId() {
        return decidedByAdminUserId;
    }

    public void setDecidedByAdminUserId(Long decidedByAdminUserId) {
        this.decidedByAdminUserId = decidedByAdminUserId;
    }

    public String getRequesterLogin() {
        return requesterLogin;
    }

    public void setRequesterLogin(String requesterLogin) {
        this.requesterLogin = requesterLogin;
    }

    public String getRequesterName() {
        return requesterName;
    }

    public void setRequesterName(String requesterName) {
        this.requesterName = requesterName;
    }

    public String getCurrentTraderBusinessName() {
        return currentTraderBusinessName;
    }

    public void setCurrentTraderBusinessName(String currentTraderBusinessName) {
        this.currentTraderBusinessName = currentTraderBusinessName;
    }

    public String getCreatedTraderBusinessName() {
        return createdTraderBusinessName;
    }

    public void setCreatedTraderBusinessName(String createdTraderBusinessName) {
        this.createdTraderBusinessName = createdTraderBusinessName;
    }

    public String getDecidedByAdminLogin() {
        return decidedByAdminLogin;
    }

    public void setDecidedByAdminLogin(String decidedByAdminLogin) {
        this.decidedByAdminLogin = decidedByAdminLogin;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MultiTraderAccountRequestDTO that)) {
            return false;
        }
        return id != null && Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
