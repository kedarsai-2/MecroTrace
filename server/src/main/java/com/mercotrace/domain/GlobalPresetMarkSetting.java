package com.mercotrace.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.math.BigDecimal;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * Platform-wide preset marks for auction margins. Used when {@link Trader#getPresetEnabled()} is false.
 */
@Entity
@Table(name = "global_preset_mark_setting")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class GlobalPresetMarkSetting implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sequenceGenerator")
    @SequenceGenerator(name = "sequenceGenerator")
    @Column(name = "id")
    private Long id;

    @NotBlank
    @Size(min = 1, max = 20)
    @Pattern(regexp = "^[a-zA-Z0-9]+$", message = "Only letters and numbers allowed (no spaces or special characters)")
    @Column(name = "predefined_mark", length = 20, nullable = false)
    private String predefinedMark;

    @NotNull
    @DecimalMin(value = "-100000", inclusive = true)
    @DecimalMax(value = "100000", inclusive = true)
    @Column(name = "extra_amount", precision = 19, scale = 2, nullable = false)
    private BigDecimal extraAmount;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPredefinedMark() {
        return predefinedMark;
    }

    public void setPredefinedMark(String predefinedMark) {
        this.predefinedMark = predefinedMark;
    }

    public BigDecimal getExtraAmount() {
        return extraAmount;
    }

    public void setExtraAmount(BigDecimal extraAmount) {
        this.extraAmount = extraAmount;
    }
}
