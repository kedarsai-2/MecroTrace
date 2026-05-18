package com.mercotrace.web.rest.errors;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Single entry in {@link ApiErrorBody#getErrors()}; mirrors JSON returned by module REST helpers.
 */
@Schema(description = "Field-level error; optional numeric fields appear for auction quantity conflicts.")
public class ApiFieldError {

    private String field;
    private String message;

    @Schema(nullable = true, description = "Auction quantity conflict: current total bags on the bid")
    private Integer currentTotal;

    @Schema(nullable = true, description = "Auction quantity conflict: lot total bags")
    private Integer lotTotal;

    @Schema(nullable = true, description = "Auction quantity conflict: attempted quantity")
    private Integer attemptedQty;

    @Schema(nullable = true, description = "Auction quantity conflict: total after attempted add")
    private Integer newTotal;

    public String getField() {
        return field;
    }

    public void setField(String field) {
        this.field = field;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Integer getCurrentTotal() {
        return currentTotal;
    }

    public void setCurrentTotal(Integer currentTotal) {
        this.currentTotal = currentTotal;
    }

    public Integer getLotTotal() {
        return lotTotal;
    }

    public void setLotTotal(Integer lotTotal) {
        this.lotTotal = lotTotal;
    }

    public Integer getAttemptedQty() {
        return attemptedQty;
    }

    public void setAttemptedQty(Integer attemptedQty) {
        this.attemptedQty = attemptedQty;
    }

    public Integer getNewTotal() {
        return newTotal;
    }

    public void setNewTotal(Integer newTotal) {
        this.newTotal = newTotal;
    }
}
