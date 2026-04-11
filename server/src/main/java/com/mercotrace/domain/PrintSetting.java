package com.mercotrace.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.Serializable;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

@Entity
@Table(
    name = "print_setting",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_print_setting_trader_module", columnNames = { "trader_id", "module_key" }),
    }
)
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
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
    @Column(name = "paper_size", length = 2, nullable = false)
    private String paperSize;

    @NotNull
    @Column(name = "include_header", nullable = false)
    private Boolean includeHeader = Boolean.TRUE;

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
