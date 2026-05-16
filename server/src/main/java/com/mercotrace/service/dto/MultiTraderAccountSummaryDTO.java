package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

public class MultiTraderAccountSummaryDTO {

    @JsonProperty("current_trader")
    private TraderAccountOptionDTO currentTrader;

    private List<TraderAccountOptionDTO> accounts;

    @JsonProperty("request_counts")
    private Map<String, Long> requestCounts;

    public TraderAccountOptionDTO getCurrentTrader() {
        return currentTrader;
    }

    public void setCurrentTrader(TraderAccountOptionDTO currentTrader) {
        this.currentTrader = currentTrader;
    }

    public List<TraderAccountOptionDTO> getAccounts() {
        return accounts;
    }

    public void setAccounts(List<TraderAccountOptionDTO> accounts) {
        this.accounts = accounts;
    }

    public Map<String, Long> getRequestCounts() {
        return requestCounts;
    }

    public void setRequestCounts(Map<String, Long> requestCounts) {
        this.requestCounts = requestCounts;
    }
}
