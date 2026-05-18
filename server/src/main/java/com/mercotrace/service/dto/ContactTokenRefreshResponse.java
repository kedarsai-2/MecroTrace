package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;

/** JSON body returned by POST /api/portal/auth/refresh (tokens also repeated in headers/cookies). */
@Schema(description = "New access and refresh tokens after portal refresh")
public class ContactTokenRefreshResponse {

    private String token;

    @JsonProperty("refresh_token")
    private String refreshToken;

    public ContactTokenRefreshResponse() {}

    public ContactTokenRefreshResponse(String token, String refreshToken) {
        this.token = token;
        this.refreshToken = refreshToken;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }
}
