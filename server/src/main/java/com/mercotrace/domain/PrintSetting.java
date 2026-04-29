package com.mercotrace.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.Serializable;

@Entity
@Table(
    name = "print_setting",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_print_setting_trader_module", columnNames = { "trader_id", "module_key" }),
    }
)
public class PrintSetting implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotNull
    @Column(name = "trader_id", nullable = false)
    private Long traderId;

    @NotBlank
    @Size(max = 50)
    @Pattern(regexp = "^[A-Z_]+$")
    @Column(name = "module_key", length = 50, nullable = false)
    private String moduleKey;

    @NotBlank
    @Pattern(regexp = "^(A4|A5)$")
    @Column(name = "paper_size_with_header", length = 2, nullable = false)
    private String paperSizeWithHeader;

    @NotBlank
    @Pattern(regexp = "^(A4|A5)$")
    @Column(name = "paper_size_without_header", length = 2, nullable = false)
    private String paperSizeWithoutHeader;

    @NotNull
    @Column(name = "include_header", nullable = false)
    private Boolean includeHeader = Boolean.TRUE;

    /** Optional minimum numeric suffix for next sales bill number (BILLING row) or patti base (SETTLEMENT row). */
    @Column(name = "bill_number_start_from")
    private Integer billNumberStartFrom;

    /** JSON array of `{ "label": string }` print copies; null = default one ORIGINAL COPY in API layer. */
    @Column(name = "print_copies_json", columnDefinition = "text")
    private String printCopiesJson;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getTraderId() {
        return traderId;
    }

    public void setTraderId(Long traderId) {
        this.traderId = traderId;
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
