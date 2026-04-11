package com.mercotrace.service;

import com.mercotrace.domain.Authority;
import com.mercotrace.domain.Trader;
import com.mercotrace.domain.User;
import com.mercotrace.repository.AuthorityRepository;
import com.mercotrace.repository.UserRepository;
import com.mercotrace.repository.UserTraderRepository;
import com.mercotrace.security.AuthoritiesConstants;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Central helper for assigning full trader-module authorities to trader owners.
 *
 * This service is intentionally idempotent: calling {@link #ensureTraderOwnerAuthorities(User)}
 * multiple times for the same user will not duplicate authorities.
 *
 * <p><strong>Approval enforcement:</strong> Module authorities (Contacts, Auctions, etc.) are only
 * granted when the user's primary trader has {@link ApprovalStatus#APPROVED}. Pending traders
 * receive only {@code ROLE_USER}, so backend {@code @PreAuthorize} on module endpoints returns
 * 403 and prevents bypass via direct API calls or frontend tampering.
 */
@Service
@Transactional
public class TraderOwnerAuthorityService {

    private static final Logger LOG = LoggerFactory.getLogger(TraderOwnerAuthorityService.class);

    private static final Set<String> TRADER_OWNER_AUTHORITY_NAMES = buildTraderOwnerAuthorityNames();

    private final AuthorityRepository authorityRepository;
    private final UserRepository userRepository;
    private final UserTraderRepository userTraderRepository;
    private final CacheManager cacheManager;

    public TraderOwnerAuthorityService(
        AuthorityRepository authorityRepository,
        UserRepository userRepository,
        UserTraderRepository userTraderRepository,
        CacheManager cacheManager
    ) {
        this.authorityRepository = authorityRepository;
        this.userRepository = userRepository;
        this.userTraderRepository = userTraderRepository;
        this.cacheManager = cacheManager;
    }

    /**
     * Ensure that the given user has the full set of trader-module authorities required
     * for an OWNER, plus {@code ROLE_USER}. Does not grant any global admin authority.
     * <p>
     * If the user's primary trader is not {@link ApprovalStatus#APPROVED}, only
     * {@code ROLE_USER} is ensured; no module authorities are added. This enforces
     * backend rejection of module API calls for unapproved traders.
     * <p>
     * This method is transactional and always works on a managed {@link User} with its
     * {@code authorities} collection initialized to avoid {@link org.hibernate.LazyInitializationException}.
     *
     * @param user the (possibly detached) JHipster {@link User} to upgrade
     */
    public void ensureTraderOwnerAuthorities(User user) {
        if (user == null) {
            return;
        }

        User target = user;
        if (user.getId() != null) {
            target = userRepository.findOneWithAuthoritiesById(user.getId()).orElse(user);
        }

        Set<Authority> currentAuthorities = target.getAuthorities();
        if (currentAuthorities == null) {
            currentAuthorities = new HashSet<>();
            target.setAuthorities(currentAuthorities);
        }

        Long userId = target.getId();
        if (userId == null) {
            return;
        }

        boolean traderApproved = userTraderRepository
            .findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(userId)
            .map(ut -> {
                Trader t = ut.getTrader();
                return t != null && t.getApprovalStatus() == com.mercotrace.domain.enumeration.ApprovalStatus.APPROVED;
            })
            .orElse(false);

        if (!traderApproved) {
            ensureOnlyRoleUser(target, currentAuthorities);
            return;
        }

        Set<String> existingNames = currentAuthorities.stream().map(Authority::getName).collect(Collectors.toSet());
        Set<String> missingNames = TRADER_OWNER_AUTHORITY_NAMES
            .stream()
            .filter(name -> !existingNames.contains(name))
            .collect(Collectors.toSet());

        if (missingNames.isEmpty()) {
            return;
        }

        List<Authority> toAdd = authorityRepository.findAllById(missingNames);
        if (toAdd.isEmpty()) {
            LOG.warn(
                "No trader-owner authorities found in database for names {}. User {} will not be upgraded.",
                missingNames,
                target.getLogin()
            );
            return;
        }

        currentAuthorities.addAll(toAdd);
        userRepository.save(target);
        clearUserCaches(target);

        LOG.info("Upgraded user {} with trader-owner authorities: {}", target.getLogin(), missingNames);
    }

    /**
     * Ensure the user has only ROLE_USER (no module authorities). Used when trader is not approved.
     */
    private void ensureOnlyRoleUser(User target, Set<Authority> currentAuthorities) {
        Set<String> existingNames = currentAuthorities.stream().map(Authority::getName).collect(Collectors.toSet());
        if (existingNames.contains(AuthoritiesConstants.USER)) {
            return;
        }
        authorityRepository.findById(AuthoritiesConstants.USER).ifPresent(currentAuthorities::add);
        userRepository.save(target);
        clearUserCaches(target);
        LOG.debug("User {} has unapproved trader; ensured ROLE_USER only.", target.getLogin());
    }

    private void clearUserCaches(User user) {
        if (user == null) {
            return;
        }
        if (cacheManager.getCache(UserRepository.USERS_BY_LOGIN_CACHE) != null) {
            Objects
                .requireNonNull(cacheManager.getCache(UserRepository.USERS_BY_LOGIN_CACHE))
                .evictIfPresent(user.getLogin());
        }
        if (user.getEmail() != null && cacheManager.getCache(UserRepository.USERS_BY_EMAIL_CACHE) != null) {
            Objects
                .requireNonNull(cacheManager.getCache(UserRepository.USERS_BY_EMAIL_CACHE))
                .evictIfPresent(user.getEmail());
        }
    }

    private static Set<String> buildTraderOwnerAuthorityNames() {
        Set<String> names = new HashSet<>();
        // Base user role
        names.add(AuthoritiesConstants.USER);

        // Auctions / Sales module
        names.add(AuthoritiesConstants.AUCTIONS_VIEW);
        names.add(AuthoritiesConstants.AUCTIONS_CREATE);
        names.add(AuthoritiesConstants.AUCTIONS_EDIT);
        names.add(AuthoritiesConstants.AUCTIONS_DELETE);
        names.add(AuthoritiesConstants.AUCTIONS_APPROVE);

        // Writer's Pad module
        names.add(AuthoritiesConstants.WRITERS_PAD_VIEW);
        names.add(AuthoritiesConstants.WRITERS_PAD_CREATE);
        names.add(AuthoritiesConstants.WRITERS_PAD_EDIT);
        names.add(AuthoritiesConstants.WRITERS_PAD_DELETE);

        // Weighing module
        names.add(AuthoritiesConstants.WEIGHING_VIEW);
        names.add(AuthoritiesConstants.WEIGHING_CREATE);
        names.add(AuthoritiesConstants.WEIGHING_EDIT);
        names.add(AuthoritiesConstants.WEIGHING_DELETE);

        // Settlement (Puty) module
        names.add(AuthoritiesConstants.SETTLEMENTS_VIEW);
        names.add(AuthoritiesConstants.SETTLEMENTS_CREATE);
        names.add(AuthoritiesConstants.SETTLEMENTS_EDIT);
        names.add(AuthoritiesConstants.SETTLEMENTS_DELETE);
        names.add(AuthoritiesConstants.SETTLEMENTS_APPROVE);

        // Contacts module
        names.add(AuthoritiesConstants.CONTACTS_VIEW);
        names.add(AuthoritiesConstants.CONTACTS_CREATE);
        names.add(AuthoritiesConstants.CONTACTS_EDIT);
        names.add(AuthoritiesConstants.CONTACTS_DELETE);

        // Print logs / print hub module
        names.add(AuthoritiesConstants.PRINT_LOGS_VIEW);
        names.add(AuthoritiesConstants.PRINT_LOGS_CREATE);
        names.add(AuthoritiesConstants.PRINT_LOGS_EDIT);
        names.add(AuthoritiesConstants.PRINT_LOGS_DELETE);

        // Commodity Settings module
        names.add(AuthoritiesConstants.COMMODITY_SETTINGS_VIEW);
        names.add(AuthoritiesConstants.COMMODITY_SETTINGS_CREATE);
        names.add(AuthoritiesConstants.COMMODITY_SETTINGS_EDIT);
        names.add(AuthoritiesConstants.COMMODITY_SETTINGS_DELETE);
        names.add(AuthoritiesConstants.COMMODITY_SETTINGS_APPROVE);

        // Arrivals module
        names.add(AuthoritiesConstants.ARRIVALS_VIEW);
        names.add(AuthoritiesConstants.ARRIVALS_CREATE);
        names.add(AuthoritiesConstants.ARRIVALS_EDIT);
        names.add(AuthoritiesConstants.ARRIVALS_DELETE);
        names.add(AuthoritiesConstants.ARRIVALS_APPROVE);

        // Billing module
        names.add(AuthoritiesConstants.BILLING_VIEW);
        names.add(AuthoritiesConstants.BILLING_CREATE);
        names.add(AuthoritiesConstants.BILLING_EDIT);
        names.add(AuthoritiesConstants.BILLING_DELETE);
        names.add(AuthoritiesConstants.BILLING_APPROVE);

        // Self-Sale module
        names.add(AuthoritiesConstants.SELF_SALE_VIEW);
        names.add(AuthoritiesConstants.SELF_SALE_CREATE);
        names.add(AuthoritiesConstants.SELF_SALE_EDIT);
        names.add(AuthoritiesConstants.SELF_SALE_DELETE);
        names.add(AuthoritiesConstants.SELF_SALE_APPROVE);

        // Stock Purchase module
        names.add(AuthoritiesConstants.STOCK_PURCHASE_VIEW);
        names.add(AuthoritiesConstants.STOCK_PURCHASE_CREATE);
        names.add(AuthoritiesConstants.STOCK_PURCHASE_EDIT);
        names.add(AuthoritiesConstants.STOCK_PURCHASE_DELETE);
        names.add(AuthoritiesConstants.STOCK_PURCHASE_APPROVE);

        // CDN (Delivery Note) module
        names.add(AuthoritiesConstants.CDN_VIEW);
        names.add(AuthoritiesConstants.CDN_CREATE);
        names.add(AuthoritiesConstants.CDN_EDIT);
        names.add(AuthoritiesConstants.CDN_DELETE);
        names.add(AuthoritiesConstants.CDN_APPROVE);

        // Chart of Accounts module
        names.add(AuthoritiesConstants.CHART_OF_ACCOUNTS_VIEW);
        names.add(AuthoritiesConstants.CHART_OF_ACCOUNTS_CREATE);
        names.add(AuthoritiesConstants.CHART_OF_ACCOUNTS_EDIT);
        names.add(AuthoritiesConstants.CHART_OF_ACCOUNTS_DELETE);
        names.add(AuthoritiesConstants.CHART_OF_ACCOUNTS_APPROVE);

        // Vouchers & Payments module
        names.add(AuthoritiesConstants.VOUCHERS_VIEW);
        names.add(AuthoritiesConstants.VOUCHERS_CREATE);
        names.add(AuthoritiesConstants.VOUCHERS_EDIT);
        names.add(AuthoritiesConstants.VOUCHERS_DELETE);
        names.add(AuthoritiesConstants.VOUCHERS_APPROVE);

        // Financial Reports module (read-only)
        names.add(AuthoritiesConstants.FINANCIAL_REPORTS_VIEW);

        // Operational Reports module (read-only)
        names.add(AuthoritiesConstants.REPORTS_VIEW);

        // RBAC Settings module
        names.add(AuthoritiesConstants.RBAC_SETTINGS_VIEW);
        names.add(AuthoritiesConstants.RBAC_SETTINGS_CREATE);
        names.add(AuthoritiesConstants.RBAC_SETTINGS_EDIT);
        names.add(AuthoritiesConstants.RBAC_SETTINGS_DELETE);
        names.add(AuthoritiesConstants.RBAC_SETTINGS_APPROVE);

        // Preset Settings module
        names.add(AuthoritiesConstants.PRESET_SETTINGS_VIEW);
        names.add(AuthoritiesConstants.PRESET_SETTINGS_CREATE);
        names.add(AuthoritiesConstants.PRESET_SETTINGS_EDIT);
        names.add(AuthoritiesConstants.PRESET_SETTINGS_DELETE);

        // Print Settings module (Settlement / Billing print format presets)
        names.add(AuthoritiesConstants.PRINT_SETTINGS_VIEW);
        names.add(AuthoritiesConstants.PRINT_SETTINGS_EDIT);

        // Print Templates module
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_VIEW);
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_CREATE);
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_EDIT);
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_DELETE);
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_APPROVE);

        // Guard rail: DO NOT ever add ROLE_ADMIN or global admin-like authorities here.

        return names;
    }
}

