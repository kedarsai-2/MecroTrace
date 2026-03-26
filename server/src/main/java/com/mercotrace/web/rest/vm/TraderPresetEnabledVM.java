package com.mercotrace.web.rest.vm;

import com.fasterxml.jackson.annotation.JsonProperty;

public class TraderPresetEnabledVM {

    @JsonProperty("enabled")
    private boolean enabled;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
