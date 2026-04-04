package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.Serializable;

/**
 * A buyer (registered contact or temporary scribble) who has at least one bid on a lot's latest auction.
 * Used to group lots "By Buyer" in Sales Pad.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class LotParticipatingBuyerDTO implements Serializable {

    @JsonProperty("group_key")
    private String groupKey;

    @JsonProperty("buyer_name")
    private String buyerName;

    @JsonProperty("buyer_mark")
    private String buyerMark;

    @JsonProperty("registered")
    private boolean registered;

    public String getGroupKey() {
        return groupKey;
    }

    public void setGroupKey(String groupKey) {
        this.groupKey = groupKey;
    }

    public String getBuyerName() {
        return buyerName;
    }

    public void setBuyerName(String buyerName) {
        this.buyerName = buyerName;
    }

    public String getBuyerMark() {
        return buyerMark;
    }

    public void setBuyerMark(String buyerMark) {
        this.buyerMark = buyerMark;
    }

    public boolean isRegistered() {
        return registered;
    }

    public void setRegistered(boolean registered) {
        this.registered = registered;
    }
}
