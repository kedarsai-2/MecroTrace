package com.mercotrace.service;

/**
 * Reasons {@link ArrivalService} refuses to remove lots / delete an arrival graph.
 * Serialized as enum names on API (e.g. {@code BILLING}).
 */
public enum ArrivalDeletionBlocker {
    BILLING,
    AUCTION_SELF_SALE,
    SELF_SALE_CLOSURE,
    CDN,
    STOCK_PURCHASE,
    WEIGHING,
    WRITER_PAD;

    /** Short label for UI toasts (English). */
    public String displayLabel() {
        return switch (this) {
            case BILLING -> "Billing";
            case AUCTION_SELF_SALE -> "Auction self-sale";
            case SELF_SALE_CLOSURE -> "Self-sale closure";
            case CDN -> "CDN";
            case STOCK_PURCHASE -> "Stock purchase";
            case WEIGHING -> "Weighing";
            case WRITER_PAD -> "Writer pad";
        };
    }
}
