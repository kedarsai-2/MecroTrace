package com.mercotrace.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class PrintSettingDTO {

    private Long id;

    @NotBlank
    @Size(max = 50)
    @Pattern(regexp = "^[A-Z_]+$")
    @JsonProperty("module_key")
    private String moduleKey;

    @NotBlank
    @Pattern(regexp = "^(A4|A5)$")
    @JsonProperty("paper_size")
    private String paperSize;

    @NotNull
    @JsonProperty("include_header")
    private Boolean includeHeader;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getModuleKey() {
        return moduleKey;
    }

    public void setModuleKey(String moduleKey) {
        this.moduleKey = moduleKey;
    }

    public String getPaperSize() {
        return paperSize;
    }

    public void setPaperSize(String paperSize) {
        this.paperSize = paperSize;
    }

    public Boolean getIncludeHeader() {
        return includeHeader;
    }

    public void setIncludeHeader(Boolean includeHeader) {
        this.includeHeader = includeHeader;
    }
}
