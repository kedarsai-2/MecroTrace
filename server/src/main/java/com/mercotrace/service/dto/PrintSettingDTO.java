package com.mercotrace.service.dto;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** JSON uses snake_case for all properties (matches trader React API conventions). */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public class PrintSettingDTO {

    private Long id;

    @NotBlank
    @Size(max = 50)
    @Pattern(regexp = "^[A-Z_]+$")
    private String moduleKey;

    @Pattern(regexp = "^(A4|A5)$")
    private String paperSizeWithHeader;

    @Pattern(regexp = "^(A4|A5)$")
    private String paperSizeWithoutHeader;

    @NotNull
    private Boolean includeHeader;

    @Min(1)
    private Integer billNumberStartFrom;

    private String printCopiesJson;

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

    public Integer getBillNumberStartFrom() {
        return billNumberStartFrom;
    }

    public void setBillNumberStartFrom(Integer billNumberStartFrom) {
        this.billNumberStartFrom = billNumberStartFrom;
    }

    public String getPrintCopiesJson() {
        return printCopiesJson;
    }

    public void setPrintCopiesJson(String printCopiesJson) {
        this.printCopiesJson = printCopiesJson;
    }
}
