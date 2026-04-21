package com.mercotrace.domain;

import com.mercotrace.domain.enumeration.BluetoothPrinterAccessMode;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.Serializable;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(
    name = "bluetooth_printer",
    uniqueConstraints = { @UniqueConstraint(name = "uk_bluetooth_printer_trader_mac", columnNames = { "trader_id", "mac_address" }) }
)
public class BluetoothPrinter implements Serializable {

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
    @Size(max = 17)
    @Column(name = "mac_address", length = 17, nullable = false)
    private String macAddress;

    @NotBlank
    @Size(max = 200)
    @Column(name = "display_name", length = 200, nullable = false)
    private String displayName;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "access_mode", length = 20, nullable = false)
    private BluetoothPrinterAccessMode accessMode = BluetoothPrinterAccessMode.OPEN;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "bluetooth_printer_allowed_user", joinColumns = @JoinColumn(name = "printer_id"))
    @Column(name = "user_id", nullable = false)
    private Set<Long> allowedUserIds = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "bluetooth_printer_allowed_role", joinColumns = @JoinColumn(name = "printer_id"))
    @Column(name = "role_id", nullable = false)
    private Set<Long> allowedRoleIds = new HashSet<>();

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

    public String getMacAddress() {
        return macAddress;
    }

    public void setMacAddress(String macAddress) {
        this.macAddress = macAddress;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public BluetoothPrinterAccessMode getAccessMode() {
        return accessMode;
    }

    public void setAccessMode(BluetoothPrinterAccessMode accessMode) {
        this.accessMode = accessMode;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public Set<Long> getAllowedUserIds() {
        return allowedUserIds;
    }

    public void setAllowedUserIds(Set<Long> allowedUserIds) {
        this.allowedUserIds = allowedUserIds;
    }

    public Set<Long> getAllowedRoleIds() {
        return allowedRoleIds;
    }

    public void setAllowedRoleIds(Set<Long> allowedRoleIds) {
        this.allowedRoleIds = allowedRoleIds;
    }
}
