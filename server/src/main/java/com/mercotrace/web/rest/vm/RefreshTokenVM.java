package com.mercotrace.web.rest.vm;

import com.fasterxml.jackson.annotation.JsonProperty;

public class RefreshTokenVM {

    @JsonProperty("refresh_token")
    private String refreshToken;

    public String getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }
}
