package com.mercotrace.security;

import com.mercotrace.repository.UserTraderRepository;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Security helper for SpEL in @PreAuthorize: allows trader owners to bypass
 * role checks so they always have full access to trader-scoped modules (e.g. Preset Settings).
 * Trader users (staff) continue to use RBAC only.
 */
@Component("traderOwnerAccess")
public class TraderOwnerAccess {

    private final UserTraderRepository userTraderRepository;

    public TraderOwnerAccess(UserTraderRepository userTraderRepository) {
        this.userTraderRepository = userTraderRepository;
    }

    /**
     * @return true if the current authenticated user is the primary OWNER for their trader.
     */
    public boolean isCurrentUserTraderOwner() {
        Optional<Long> userId = SecurityUtils.getCurrentUserId();
        if (userId.isEmpty()) {
            return false;
        }
        return isUserTraderOwner(userId.get());
    }

    /**
     * @return true when the given user is the primary active OWNER mapping for their trader.
     */
    public boolean isUserTraderOwner(Long userId) {
        if (userId == null) {
            return false;
        }
        return userTraderRepository
            .findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(userId)
            .map(mapping -> {
                String role = mapping.getRoleInTrader();
                return role != null && "OWNER".equalsIgnoreCase(role.trim());
            })
            .orElse(false);
    }
}
