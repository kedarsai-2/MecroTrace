package com.mercotrace.web.rest.vm;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

public class MultiTraderAccountSwitchVM {

    @JsonProperty("trader_id")
    @NotNull
    private Long traderId;

    public Long getTraderId() {
        return traderId;
    }

    public void setTraderId(Long traderId) {
        this.traderId = traderId;
    }
}
