package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class BluetoothPrinterAccessCheckDTO {

    @JsonProperty("allowed")
    private boolean allowed;

    public BluetoothPrinterAccessCheckDTO() {}

    public BluetoothPrinterAccessCheckDTO(boolean allowed) {
        this.allowed = allowed;
    }

    public boolean isAllowed() {
        return allowed;
    }

    public void setAllowed(boolean allowed) {
        this.allowed = allowed;
    }
}
