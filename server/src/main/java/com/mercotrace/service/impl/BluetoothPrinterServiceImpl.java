package com.mercotrace.service.impl;

import com.mercotrace.domain.BluetoothPrinter;
import com.mercotrace.domain.Role;
import com.mercotrace.domain.UserRole;
import com.mercotrace.domain.enumeration.BluetoothPrinterAccessMode;
import com.mercotrace.repository.BluetoothPrinterRepository;
import com.mercotrace.repository.RoleRepository;
import com.mercotrace.repository.UserRoleRepository;
import com.mercotrace.repository.UserTraderRepository;
import com.mercotrace.security.SecurityUtils;
import com.mercotrace.security.TraderOwnerAccess;
import com.mercotrace.service.BluetoothPrinterService;
import com.mercotrace.service.dto.BluetoothPrinterAccessUpdateRequest;
import com.mercotrace.service.dto.BluetoothPrinterDTO;
import com.mercotrace.service.dto.BluetoothPrinterRegisterRequest;
import com.mercotrace.web.rest.errors.BadRequestAlertException;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class BluetoothPrinterServiceImpl implements BluetoothPrinterService {

    private static final Pattern MAC_PATTERN = Pattern.compile("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$");

    private final BluetoothPrinterRepository bluetoothPrinterRepository;
    private final UserRoleRepository userRoleRepository;
    private final UserTraderRepository userTraderRepository;
    private final RoleRepository roleRepository;
    private final TraderOwnerAccess traderOwnerAccess;

    public BluetoothPrinterServiceImpl(
        BluetoothPrinterRepository bluetoothPrinterRepository,
        UserRoleRepository userRoleRepository,
        UserTraderRepository userTraderRepository,
        RoleRepository roleRepository,
        TraderOwnerAccess traderOwnerAccess
    ) {
        this.bluetoothPrinterRepository = bluetoothPrinterRepository;
        this.userRoleRepository = userRoleRepository;
        this.userTraderRepository = userTraderRepository;
        this.roleRepository = roleRepository;
        this.traderOwnerAccess = traderOwnerAccess;
    }

    @Override
    @Transactional(readOnly = true)
    public List<BluetoothPrinterDTO> listForTrader(Long traderId, Long currentUserId, boolean currentUserIsTraderOwner) {
        Set<Long> roleIds = roleIdsForTrader(currentUserId, traderId);
        return bluetoothPrinterRepository.findAllByTraderIdOrderByCreatedAtDesc(traderId).stream()
            .map(p -> toDto(p, currentUserId, currentUserIsTraderOwner, roleIds))
            .collect(Collectors.toList());
    }

    @Override
    public BluetoothPrinterDTO register(Long traderId, Long currentUserId, BluetoothPrinterRegisterRequest request) {
        String mac = normalizeMac(request.getMacAddress());
        if (!MAC_PATTERN.matcher(mac).matches()) {
            throw new BadRequestAlertException("Invalid Bluetooth MAC address", "bluetoothPrinter", "macInvalid");
        }
        if (bluetoothPrinterRepository.existsByTraderIdAndMacAddressIgnoreCase(traderId, mac)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This printer is already registered for your organization");
        }
        BluetoothPrinter entity = new BluetoothPrinter();
        entity.setTraderId(traderId);
        entity.setMacAddress(mac);
        String name = request.getDisplayName();
        if (name == null || name.isBlank()) {
            name = mac;
        } else {
            name = name.trim();
            if (name.length() > 200) {
                name = name.substring(0, 200);
            }
        }
        entity.setDisplayName(name);
        entity.setAccessMode(BluetoothPrinterAccessMode.OPEN);
        entity.setCreatedAt(Instant.now());
        entity.setCreatedByUserId(currentUserId);
        entity.getAllowedUserIds().clear();
        entity.getAllowedRoleIds().clear();
        BluetoothPrinter saved = bluetoothPrinterRepository.save(entity);
        Set<Long> roleIds = roleIdsForTrader(currentUserId, traderId);
        boolean owner = traderOwnerAccess.isUserTraderOwner(currentUserId);
        return toDto(saved, currentUserId, owner, roleIds);
    }

    @Override
    public BluetoothPrinterDTO updateAccess(Long traderId, Long printerId, BluetoothPrinterAccessUpdateRequest request) {
        BluetoothPrinter entity = bluetoothPrinterRepository
            .findByIdAndTraderId(printerId, traderId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Printer not found"));
        BluetoothPrinterAccessMode mode = BluetoothPrinterAccessMode.valueOf(request.getAccessMode().trim().toUpperCase(Locale.ROOT));
        entity.setAccessMode(mode);

        Set<Long> users = new HashSet<>(request.getAllowedUserIds());
        Set<Long> roles = new HashSet<>(request.getAllowedRoleIds());

        for (Long uid : users) {
            if (uid == null) continue;
            if (
                userTraderRepository.findFirstByUserIdAndTraderIdAndPrimaryMappingTrueAndActiveTrue(uid, traderId).isEmpty()
            ) {
                throw new BadRequestAlertException("Unknown user for this trader: " + uid, "bluetoothPrinter", "userInvalid");
            }
        }
        for (Long rid : roles) {
            if (rid == null) continue;
            Role role = roleRepository.findById(rid).orElseThrow(() -> new BadRequestAlertException("Unknown role: " + rid, "bluetoothPrinter", "roleInvalid"));
            if (!traderId.equals(role.getTraderId())) {
                throw new BadRequestAlertException("Role does not belong to this trader: " + rid, "bluetoothPrinter", "roleScopeInvalid");
            }
        }

        entity.getAllowedUserIds().clear();
        entity.getAllowedUserIds().addAll(users);
        entity.getAllowedRoleIds().clear();
        entity.getAllowedRoleIds().addAll(roles);

        BluetoothPrinter saved = bluetoothPrinterRepository.save(entity);
        Long currentUserId = SecurityUtils.getCurrentUserId().orElseThrow();
        return toDto(
            saved,
            currentUserId,
            traderOwnerAccess.isUserTraderOwner(currentUserId),
            roleIdsForTrader(currentUserId, traderId)
        );
    }

    @Override
    public void delete(Long traderId, Long printerId) {
        BluetoothPrinter entity = bluetoothPrinterRepository
            .findByIdAndTraderId(printerId, traderId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Printer not found"));
        bluetoothPrinterRepository.delete(entity);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isMacPrintAllowed(Long traderId, Long currentUserId, boolean currentUserIsTraderOwner, String normalizedMac) {
        if (normalizedMac == null || normalizedMac.isBlank()) {
            return true;
        }
        String mac = normalizeMac(normalizedMac);
        Optional<BluetoothPrinter> opt = bluetoothPrinterRepository.findByTraderIdAndMacAddressIgnoreCase(traderId, mac);
        if (opt.isEmpty()) {
            return true;
        }
        Set<Long> roleIds = roleIdsForTrader(currentUserId, traderId);
        return canUsePrinter(opt.get(), currentUserId, currentUserIsTraderOwner, roleIds);
    }

    private BluetoothPrinterDTO toDto(BluetoothPrinter p, Long userId, boolean owner, Set<Long> roleIds) {
        BluetoothPrinterDTO dto = new BluetoothPrinterDTO();
        dto.setId(p.getId());
        dto.setMacAddress(p.getMacAddress());
        dto.setDisplayName(p.getDisplayName());
        dto.setAccessMode(p.getAccessMode().name());
        dto.setAllowedUserIds(new HashSet<>(p.getAllowedUserIds()));
        dto.setAllowedRoleIds(new HashSet<>(p.getAllowedRoleIds()));
        dto.setCurrentUserCanUse(canUsePrinter(p, userId, owner, roleIds));
        return dto;
    }

    private boolean canUsePrinter(BluetoothPrinter p, Long userId, boolean owner, Set<Long> roleIds) {
        if (owner) {
            return true;
        }
        if (p.getAccessMode() == BluetoothPrinterAccessMode.OPEN) {
            return true;
        }
        if (p.getAllowedUserIds() != null && p.getAllowedUserIds().contains(userId)) {
            return true;
        }
        if (p.getAllowedRoleIds() != null && roleIds.stream().anyMatch(rid -> p.getAllowedRoleIds().contains(rid))) {
            return true;
        }
        return false;
    }

    private Set<Long> roleIdsForTrader(Long userId, Long traderId) {
        return userRoleRepository.findByUserId(userId).stream()
            .map(UserRole::getRole)
            .filter(Objects::nonNull)
            .filter(r -> traderId.equals(r.getTraderId()))
            .map(Role::getId)
            .collect(Collectors.toSet());
    }

    public static String normalizeMac(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.trim().toUpperCase(Locale.ROOT);
    }
}
