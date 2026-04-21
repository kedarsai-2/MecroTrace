package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.HashSet;
import java.util.Set;

public class BluetoothPrinterAccessUpdateRequest {

    @NotBlank
    @Pattern(regexp = "^(OPEN|RESTRICTED)$")
    @JsonProperty("access_mode")
    private String accessMode;

    @JsonProperty("allowed_user_ids")
    private Set<Long> allowedUserIds = new HashSet<>();

    @JsonProperty("allowed_role_ids")
    private Set<Long> allowedRoleIds = new HashSet<>();

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
}
