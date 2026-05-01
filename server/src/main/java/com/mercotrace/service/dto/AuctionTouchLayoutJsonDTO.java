package com.mercotrace.service.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.Size;

/** Trader-scoped JSON for mobile/tablet Sales Pad layout (opaque to server). */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class AuctionTouchLayoutJsonDTO {

    /** Full JSON string from client; null clears stored layout. */
    @Size(max = 32768)
    private String layoutJson;

    public String getLayoutJson() {
        return layoutJson;
    }

    public void setLayoutJson(String layoutJson) {
        this.layoutJson = layoutJson;
    }
}
