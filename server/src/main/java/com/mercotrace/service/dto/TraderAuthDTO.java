package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Set;

/**
 * Auth response payload, aligned to frontend AuthState expectations, for both
 * trader and admin flows.
 *
 * Shape on the wire:
 * {
 *   "token": "jwt",
 *   "user": { ... },
 *   "trader": { ... }
 * }
 */
public class TraderAuthDTO {

    private String token;

    /** When true, registration succeeded but auto-login failed; client should prompt sign-in. */
    @JsonProperty("needs_login")
    private Boolean needsLogin;

    @JsonProperty("user")
    private UserPayload user;

    @JsonProperty("trader")
    private TraderPayload trader;

    public Boolean getNeedsLogin() {
        return needsLogin;
    }

    public void setNeedsLogin(Boolean needsLogin) {
        this.needsLogin = needsLogin;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public UserPayload getUser() {
        return user;
    }

    public void setUser(UserPayload user) {
        this.user = user;
    }

    public TraderPayload getTrader() {
        return trader;
    }

    public void setTrader(TraderPayload trader) {
        this.trader = trader;
    }

    /** Minimal user payload mapped to frontend `User` model. */
    public static class UserPayload {

        @JsonProperty("user_id")
        private String userId;

        @JsonProperty("trader_id")
        private String traderId;

        private String username;

        @JsonProperty("is_active")
        private boolean active;

        @JsonProperty("created_at")
        private String createdAt;

        // UI helpers
        private String name;
        private String role;

        @JsonProperty("authorities")
        private Set<String> authorities;

        public String getUserId() {
            return userId;
        }

        public void setUserId(String userId) {
            this.userId = userId;
        }

        public String getTraderId() {
            return traderId;
        }

        public void setTraderId(String traderId) {
            this.traderId = traderId;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public boolean isActive() {
            return active;
        }

        public void setActive(boolean active) {
            this.active = active;
        }

        public String getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(String createdAt) {
            this.createdAt = createdAt;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getRole() {
            return role;
        }

        public void setRole(String role) {
            this.role = role;
        }

        public Set<String> getAuthorities() {
            return authorities;
        }

        public void setAuthorities(Set<String> authorities) {
            this.authorities = authorities;
        }
    }

    /** Minimal trader payload mapped to frontend `Trader` model. */
    public static class TraderPayload {

        @JsonProperty("trader_id")
        private String traderId;

        @JsonProperty("business_name")
        private String businessName;

        @JsonProperty("owner_name")
        private String ownerName;

        private String address;

        private String category;

        @JsonProperty("approval_status")
        private String approvalStatus;

        @JsonProperty("bill_prefix")
        private String billPrefix;

        @JsonProperty("created_at")
        private String createdAt;

        @JsonProperty("updated_at")
        private String updatedAt;

        // Optional UI-only fields
        private String mobile;
        private String email;
        private String city;
        private String state;

        @JsonProperty("pin_code")
        private String pinCode;

        @JsonProperty("gst_number")
        private String gstNumber;

        @JsonProperty("rmc_apmc_code")
        private String rmcApmcCode;

        @JsonProperty("shop_photos")
        private String[] shopPhotos;

        /** When false, trader uses administrator-defined global preset marks only. */
        @JsonProperty("preset_enabled")
        private Boolean presetEnabled;

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

        public String getAddress() {
            return address;
        }

        public void setAddress(String address) {
            this.address = address;
        }

        public String getCategory() {
            return category;
        }

        public void setCategory(String category) {
            this.category = category;
        }

        public String getApprovalStatus() {
            return approvalStatus;
        }

        public void setApprovalStatus(String approvalStatus) {
            this.approvalStatus = approvalStatus;
        }

        public String getBillPrefix() {
            return billPrefix;
        }

        public void setBillPrefix(String billPrefix) {
            this.billPrefix = billPrefix;
        }

        public String getCreatedAt() {
            return createdAt;
        }

        public void setCreatedAt(String createdAt) {
            this.createdAt = createdAt;
        }

        public String getUpdatedAt() {
            return updatedAt;
        }

        public void setUpdatedAt(String updatedAt) {
            this.updatedAt = updatedAt;
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

        public Boolean getPresetEnabled() {
            return presetEnabled;
        }

        public void setPresetEnabled(Boolean presetEnabled) {
            this.presetEnabled = presetEnabled;
        }
    }
}

