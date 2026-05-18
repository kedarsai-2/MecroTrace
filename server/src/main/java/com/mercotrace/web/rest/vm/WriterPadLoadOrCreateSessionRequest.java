package com.mercotrace.web.rest.vm;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/**
 * Request body for {@code POST /api/module-writers-pad/sessions/load-or-create}.
 */
@Schema(description = "Identify lot/bid and buyer context to load or create a Writer's Pad session")
public class WriterPadLoadOrCreateSessionRequest {

    @NotNull
    private Long lotId;

    @NotNull
    private Integer bidNumber;

    private String buyerMark;

    private String buyerName;

    @Schema(description = "Lot display name; optional, default empty")
    private String lotName;

    @NotNull
    private Integer totalBags;

    @Schema(description = "Scale device id; optional, default empty")
    private String scaleId;

    @Schema(description = "Scale display name; optional, default empty")
    private String scaleName;

    public Long getLotId() {
        return lotId;
    }

    public void setLotId(Long lotId) {
        this.lotId = lotId;
    }

    public Integer getBidNumber() {
        return bidNumber;
    }

    public void setBidNumber(Integer bidNumber) {
        this.bidNumber = bidNumber;
    }

    public String getBuyerMark() {
        return buyerMark;
    }

    public void setBuyerMark(String buyerMark) {
        this.buyerMark = buyerMark;
    }

    public String getBuyerName() {
        return buyerName;
    }

    public void setBuyerName(String buyerName) {
        this.buyerName = buyerName;
    }

    public String getLotName() {
        return lotName;
    }

    public void setLotName(String lotName) {
        this.lotName = lotName;
    }

    public Integer getTotalBags() {
        return totalBags;
    }

    public void setTotalBags(Integer totalBags) {
        this.totalBags = totalBags;
    }

    public String getScaleId() {
        return scaleId;
    }

    public void setScaleId(String scaleId) {
        this.scaleId = scaleId;
    }

    public String getScaleName() {
        return scaleName;
    }

    public void setScaleName(String scaleName) {
        this.scaleName = scaleName;
    }
}
