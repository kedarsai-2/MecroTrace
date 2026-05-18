package com.mercotrace.service.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** Minimal JSON envelope for OTP request acceptance and similar flows. */
@Schema(description = "Simple status payload, e.g. after OTP send")
public class SimpleStatusResponse {

    private String status;

    public SimpleStatusResponse() {}

    public SimpleStatusResponse(String status) {
        this.status = status;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
