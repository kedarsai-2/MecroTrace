package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class TraderAccountOptionDTO {

    @JsonProperty("trader_id")
    private String traderId;

    @JsonProperty("business_name")
    private String businessName;

    @JsonProperty("owner_name")
    private String ownerName;

    private String city;

    private String state;

    @JsonProperty("approval_status")
    private String approvalStatus;

    private Boolean active;

    @JsonProperty("primary_mapping")
    private Boolean primaryMapping;

    public String getTraderId() {
        return traderId;
    }

    public void setTraderId(String traderId) {
        this.traderId = traderId;
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

    public String getApprovalStatus() {
        return approvalStatus;
    }

    public void setApprovalStatus(String approvalStatus) {
        this.approvalStatus = approvalStatus;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public Boolean getPrimaryMapping() {
        return primaryMapping;
    }

    public void setPrimaryMapping(Boolean primaryMapping) {
        this.primaryMapping = primaryMapping;
    }
}
