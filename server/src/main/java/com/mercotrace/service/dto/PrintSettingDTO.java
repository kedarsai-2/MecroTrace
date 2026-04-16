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

    @Pattern(regexp = "^(A4|A5)$")
    @JsonProperty("paper_size_with_header")
    private String paperSizeWithHeader;

    @Pattern(regexp = "^(A4|A5)$")
    @JsonProperty("paper_size_without_header")
    private String paperSizeWithoutHeader;

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

    public String getPaperSizeWithHeader() {
        return paperSizeWithHeader;
    }

    public void setPaperSizeWithHeader(String paperSizeWithHeader) {
        this.paperSizeWithHeader = paperSizeWithHeader;
    }

    public String getPaperSizeWithoutHeader() {
        return paperSizeWithoutHeader;
    }

    public void setPaperSizeWithoutHeader(String paperSizeWithoutHeader) {
        this.paperSizeWithoutHeader = paperSizeWithoutHeader;
    }

    public Boolean getIncludeHeader() {
        return includeHeader;
    }

    public void setIncludeHeader(Boolean includeHeader) {
        this.includeHeader = includeHeader;
    }
}
