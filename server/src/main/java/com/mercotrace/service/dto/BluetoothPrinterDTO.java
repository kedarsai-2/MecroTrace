package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.HashSet;
import java.util.Set;

public class BluetoothPrinterDTO {

    private Long id;

    @JsonProperty("mac_address")
    private String macAddress;

    @JsonProperty("display_name")
    private String displayName;

    @JsonProperty("access_mode")
    private String accessMode;

    @JsonProperty("allowed_user_ids")
    private Set<Long> allowedUserIds = new HashSet<>();

    @JsonProperty("allowed_role_ids")
    private Set<Long> allowedRoleIds = new HashSet<>();

    @JsonProperty("current_user_can_use")
    private boolean currentUserCanUse;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getMacAddress() {
        return macAddress;
    }

    public void setMacAddress(String macAddress) {
        this.macAddress = macAddress;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getAccessMode() {
        return accessMode;
    }

    public void setAccessMode(String accessMode) {
        this.accessMode = accessMode;
    }

    public Set<Long> getAllowedUserIds() {
        return allowedUserIds;
    }

    public void setAllowedUserIds(Set<Long> allowedUserIds) {
        this.allowedUserIds = allowedUserIds != null ? allowedUserIds : new HashSet<>();
    }

    public Set<Long> getAllowedRoleIds() {
        return allowedRoleIds;
    }

    public void setAllowedRoleIds(Set<Long> allowedRoleIds) {
        this.allowedRoleIds = allowedRoleIds != null ? allowedRoleIds : new HashSet<>();
    }

    public boolean isCurrentUserCanUse() {
        return currentUserCanUse;
    }

    public void setCurrentUserCanUse(boolean currentUserCanUse) {
        this.currentUserCanUse = currentUserCanUse;
    }
}
