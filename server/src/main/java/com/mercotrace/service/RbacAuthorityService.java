package com.mercotrace.service;

import com.mercotrace.domain.Authority;
import com.mercotrace.domain.Role;
import com.mercotrace.domain.User;
import com.mercotrace.domain.UserRole;
import com.mercotrace.repository.AuthorityRepository;
import com.mercotrace.repository.RoleRepository;
import com.mercotrace.repository.UserRepository;
import com.mercotrace.repository.UserRoleRepository;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.service.dto.RoleDTO.ModulePermissionEntry;
import com.mercotrace.service.mapper.ModulePermissionsJsonMapper;
import java.util.*;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Computes effective Spring Security authorities for trader staff users based on
 * trader-scoped RBAC roles and their module-permission toggles.
 *
 * This service is responsible only for trader-module authorities and will preserve
 * any non-RBAC/global authorities that already exist on the user (e.g. ROLE_ADMIN).
 */
@Service
@Transactional
public class RbacAuthorityService {

    private static final Logger LOG = LoggerFactory.getLogger(RbacAuthorityService.class);

    /**
     * All trader-module authority names that are managed by RBAC (plus ROLE_USER).
     * Any other authorities on a User are considered external/global and are preserved.
     */
    private static final Set<String> TRADER_MODULE_AUTHORITY_NAMES = buildTraderModuleAuthorityNames();

    /**
     * Mapping from normalized module name (lowercase) to feature-name → authority-name.
     */
    private static final Map<String, Map<String, String>> MODULE_FEATURE_TO_AUTHORITY = buildModuleFeatureToAuthorityMap();

    private final UserRoleRepository userRoleRepository;

    private final RoleRepository roleRepository;

    private final UserRepository userRepository;

    private final AuthorityRepository authorityRepository;

    private final CacheManager cacheManager;

    private final com.mercotrace.repository.UserTraderRepository userTraderRepository;

    public RbacAuthorityService(
        UserRoleRepository userRoleRepository,
        RoleRepository roleRepository,
        UserRepository userRepository,
        AuthorityRepository authorityRepository,
        CacheManager cacheManager,
        com.mercotrace.repository.UserTraderRepository userTraderRepository
    ) {
        this.userRoleRepository = userRoleRepository;
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.authorityRepository = authorityRepository;
        this.cacheManager = cacheManager;
        this.userTraderRepository = userTraderRepository;
    }

    /**
     * Compute the set of authority names that should be granted to the given user
     * for the specified trader, based solely on trader-scoped RBAC roles and their
     * module-permission toggles.
     *
     * This does <strong>not</strong> read or modify the User entity; it is a pure
     * computation over {@link UserRole} and {@link Role}.
     *
     * @param userId   JHipster {@link User} id.
     * @param traderId trader id resolved from {@link com.mercotrace.service.TraderContextService}.
     * @return set of authority names (e.g. ROLE_CONTACTS_VIEW, ROLE_AUCTIONS_EDIT, ...).
     */
    @Transactional(readOnly = true)
    public Set<String> computeAuthoritiesForUser(Long userId, Long traderId) {
        if (userId == null || traderId == null) {
            return Set.of();
        }

        List<UserRole> mappings = userRoleRepository.findByUserId(userId);
        if (mappings.isEmpty()) {
            return Set.of();
        }

        Set<String> result = new HashSet<>();

        for (UserRole mapping : mappings) {
            Role role = mapping.getRole();
            if (role == null) {
                continue;
            }
            Long roleTraderId = role.getTraderId();
            if (roleTraderId == null || !traderId.equals(roleTraderId)) {
                // Ignore global/admin roles and roles for other traders.
                continue;
            }
            String json = role.getModulePermissions();
            Map<String, ModulePermissionEntry> modules = ModulePermissionsJsonMapper.fromJson(json);
            if (modules == null || modules.isEmpty()) {
                continue;
            }
            result.addAll(computeAuthoritiesFromModulePermissions(modules));
        }

        return Collections.unmodifiableSet(result);
    }

    /**
     * Recompute trader-module authorities for the given user and trader, merge them
     * with any existing non-RBAC authorities, and persist the updated User.
     *
     * This method also ensures that {@link AuthoritiesConstants#USER} is always
     * present for trader staff.
     *
     * @param userId   JHipster {@link User} id.
     * @param traderId trader id in whose context authorities should be computed.
     */
    public void applyTraderAuthoritiesToUser(Long userId, Long traderId) {
        if (userId == null || traderId == null) {
            return;
        }

        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            LOG.warn("applyTraderAuthoritiesToUser: user {} not found; skipping authority update.", userId);
            return;
        }

        // Only grant trader authorities if user has an active (non soft-deleted) mapping to this trader
        var mappingOpt = userTraderRepository.findFirstByUserIdAndTraderIdAndPrimaryMappingTrueAndActiveTrue(userId, traderId);
        boolean isTraderOwner = mappingOpt
            .map(mapping -> {
                String roleInTrader = mapping.getRoleInTrader();
                return roleInTrader != null && "OWNER".equalsIgnoreCase(roleInTrader);
            })
            .orElse(false);

        Set<String> rbacAuthorities = new HashSet<>();

        if (!mappingOpt.isPresent()) {
            // User has no active mapping to this trader (soft-deleted or never mapped) - grant only baseline USER
            rbacAuthorities.add(AuthoritiesConstants.USER);
        } else if (isTraderOwner) {
            // Trader owners must always have full access to all trader modules for their trader,
            // independent of any RBAC role toggles.
            rbacAuthorities.addAll(TRADER_MODULE_AUTHORITY_NAMES);
        } else {
            rbacAuthorities.addAll(computeAuthoritiesForUser(userId, traderId));
        }
        // Always ensure ROLE_USER baseline authority is present.
        rbacAuthorities.add(AuthoritiesConstants.USER);

        Set<Authority> currentAuthorities = user.getAuthorities() != null ? user.getAuthorities() : new HashSet<>();
        Set<String> currentNames = currentAuthorities.stream().map(Authority::getName).collect(Collectors.toSet());

        // Preserve any authorities that are not part of the trader-module set.
        Set<String> preservedNames = currentNames
            .stream()
            .filter(name -> !TRADER_MODULE_AUTHORITY_NAMES.contains(name))
            .collect(Collectors.toSet());

        Set<String> finalNames = new HashSet<>(preservedNames);
        finalNames.addAll(rbacAuthorities);

        if (finalNames.isEmpty()) {
            // Guard rail: never persist an empty authority set for a trader user.
            finalNames.add(AuthoritiesConstants.USER);
        }

        List<Authority> finalAuthorities = authorityRepository.findAllById(finalNames);
        if (finalAuthorities.isEmpty()) {
            LOG.warn(
                "applyTraderAuthoritiesToUser: no Authority rows found for names {}. User {} will not be modified.",
                finalNames,
                user.getLogin()
            );
            return;
        }

        user.setAuthorities(new HashSet<>(finalAuthorities));
        userRepository.save(user);
        clearUserCaches(user);

        LOG.debug(
            "Updated trader-module authorities for user {} (id={}): {}",
            user.getLogin(),
            user.getId(),
            finalNames
        );
    }

    private Set<String> computeAuthoritiesFromModulePermissions(Map<String, ModulePermissionEntry> modules) {
        Set<String> authorities = new HashSet<>();
        if (modules == null || modules.isEmpty()) {
            return authorities;
        }

        for (Map.Entry<String, ModulePermissionEntry> entry : modules.entrySet()) {
            String moduleName = normalizeKey(entry.getKey());
            ModulePermissionEntry module = entry.getValue();
            if (module == null || Boolean.FALSE.equals(module.getEnabled())) {
                continue;
            }

            Map<String, String> featureMap = MODULE_FEATURE_TO_AUTHORITY.get(moduleName);
            if (featureMap == null || featureMap.isEmpty()) {
                continue;
            }

            Map<String, Boolean> features = module.getFeatures();
            if (features == null || features.isEmpty()) {
                continue;
            }

            for (Map.Entry<String, Boolean> featureEntry : features.entrySet()) {
                if (!Boolean.TRUE.equals(featureEntry.getValue())) {
                    continue;
                }
                String featureKey = normalizeKey(featureEntry.getKey());
                String authorityName = featureMap.get(featureKey);
                if (authorityName != null) {
                    authorities.add(authorityName);
                }
            }
        }

        return authorities;
    }

    private static String normalizeKey(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    private static Set<String> buildTraderModuleAuthorityNames() {
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

        // Summary page (read-only)
        names.add(AuthoritiesConstants.SUMMARY_PAGE_VIEW);

        // Operational Reports module (read-only)
        names.add(AuthoritiesConstants.REPORTS_VIEW);

        // RBAC Settings module
        names.add(AuthoritiesConstants.RBAC_SETTINGS_VIEW);
        names.add(AuthoritiesConstants.RBAC_SETTINGS_CREATE);
        names.add(AuthoritiesConstants.RBAC_SETTINGS_EDIT);
        names.add(AuthoritiesConstants.RBAC_SETTINGS_DELETE);
        names.add(AuthoritiesConstants.RBAC_SETTINGS_APPROVE);

        // Preset Settings module (Auction margin presets)
        names.add(AuthoritiesConstants.PRESET_SETTINGS_VIEW);
        names.add(AuthoritiesConstants.PRESET_SETTINGS_CREATE);
        names.add(AuthoritiesConstants.PRESET_SETTINGS_EDIT);
        names.add(AuthoritiesConstants.PRESET_SETTINGS_DELETE);

        // Print Settings module
        names.add(AuthoritiesConstants.PRINT_SETTINGS_VIEW);
        names.add(AuthoritiesConstants.PRINT_SETTINGS_EDIT);

        // Print Templates module
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_VIEW);
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_CREATE);
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_EDIT);
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_DELETE);
        names.add(AuthoritiesConstants.PRINT_TEMPLATES_APPROVE);

        return Collections.unmodifiableSet(names);
    }

    private static Map<String, Map<String, String>> buildModuleFeatureToAuthorityMap() {
        Map<String, Map<String, String>> modules = new HashMap<>();

        // Helper to register module mappings
        register(
            modules,
            "commodity settings",
            mapOf(
                "view",
                AuthoritiesConstants.COMMODITY_SETTINGS_VIEW,
                "create",
                AuthoritiesConstants.COMMODITY_SETTINGS_CREATE,
                "edit",
                AuthoritiesConstants.COMMODITY_SETTINGS_EDIT,
                "delete",
                AuthoritiesConstants.COMMODITY_SETTINGS_DELETE
            )
        );

        register(
            modules,
            "contacts",
            mapOf(
                "view",
                AuthoritiesConstants.CONTACTS_VIEW,
                "create",
                AuthoritiesConstants.CONTACTS_CREATE,
                "edit",
                AuthoritiesConstants.CONTACTS_EDIT,
                "delete",
                AuthoritiesConstants.CONTACTS_DELETE
            )
        );

        register(
            modules,
            "arrivals",
            mapOf(
                "view", AuthoritiesConstants.ARRIVALS_VIEW,
                "create", AuthoritiesConstants.ARRIVALS_CREATE,
                "edit", AuthoritiesConstants.ARRIVALS_EDIT,
                "delete", AuthoritiesConstants.ARRIVALS_DELETE
            )
        );

        // Settlement (Patti) module – "Settlement" in UI.
        register(
            modules,
            "settlement",
            mapOf(
                "view",
                AuthoritiesConstants.SETTLEMENTS_VIEW,
                "create",
                AuthoritiesConstants.SETTLEMENTS_CREATE,
                "edit",
                AuthoritiesConstants.SETTLEMENTS_EDIT
            )
        );

        // Auctions / Sales module – exposed as "Auctions / Sales" in the trader UI.
        register(
            modules,
            "auctions / sales",
            mapOf(
                "view",
                AuthoritiesConstants.AUCTIONS_VIEW,
                "create",
                AuthoritiesConstants.AUCTIONS_CREATE,
                "edit",
                AuthoritiesConstants.AUCTIONS_EDIT,
                "delete",
                AuthoritiesConstants.AUCTIONS_DELETE,
                "approve",
                AuthoritiesConstants.AUCTIONS_APPROVE
            )
        );

        register(
            modules,
            "weighing",
            mapOf("view", AuthoritiesConstants.WEIGHING_VIEW, "create", AuthoritiesConstants.WEIGHING_CREATE)
        );

        register(
            modules,
            "summarypage",
            mapOf("view", AuthoritiesConstants.SUMMARY_PAGE_VIEW)
        );

        register(
            modules,
            "writer's pad",
            mapOf(
                "view",
                AuthoritiesConstants.WRITERS_PAD_VIEW,
                "create",
                AuthoritiesConstants.WRITERS_PAD_CREATE,
                "edit",
                AuthoritiesConstants.WRITERS_PAD_EDIT
            )
        );

        register(
            modules,
            "self-sale",
            mapOf("view", AuthoritiesConstants.SELF_SALE_VIEW, "create", AuthoritiesConstants.SELF_SALE_CREATE)
        );

        register(
            modules,
            "stock purchase",
            mapOf("view", AuthoritiesConstants.STOCK_PURCHASE_VIEW, "create", AuthoritiesConstants.STOCK_PURCHASE_CREATE)
        );

        register(
            modules,
            "cdn",
            mapOf("view", AuthoritiesConstants.CDN_VIEW, "create", AuthoritiesConstants.CDN_CREATE)
        );

        // Chart of Accounts module (exposed as "Chart of Accounts" in UI).
        register(
            modules,
            "chart of accounts",
            mapOf(
                "view",
                AuthoritiesConstants.CHART_OF_ACCOUNTS_VIEW,
                "create",
                AuthoritiesConstants.CHART_OF_ACCOUNTS_CREATE
            )
        );

        // Vouchers & Payments module.
        register(
            modules,
            "vouchers & payments",
            mapOf(
                "view",
                AuthoritiesConstants.VOUCHERS_VIEW,
                "create",
                AuthoritiesConstants.VOUCHERS_CREATE,
                "approve",
                AuthoritiesConstants.VOUCHERS_APPROVE
            )
        );

        register(
            modules,
            "billing",
            mapOf(
                "view", AuthoritiesConstants.BILLING_VIEW,
                "create", AuthoritiesConstants.BILLING_CREATE,
                "edit", AuthoritiesConstants.BILLING_EDIT
            )
        );

        // Print Hub / print logs module.
        register(
            modules,
            "print hub",
            mapOf(
                "view",
                AuthoritiesConstants.PRINT_LOGS_VIEW,
                "create",
                AuthoritiesConstants.PRINT_LOGS_CREATE
            )
        );

        register(modules, "financial reports", mapOf("view", AuthoritiesConstants.FINANCIAL_REPORTS_VIEW));

        register(modules, "reports", mapOf("view", AuthoritiesConstants.REPORTS_VIEW));

        register(modules, "print templates", mapOf("view", AuthoritiesConstants.PRINT_TEMPLATES_VIEW));

        // RBAC Settings surface as "Settings" module in the UI.
        register(modules, "settings", mapOf(
            "view", AuthoritiesConstants.RBAC_SETTINGS_VIEW,
            // Both "Manage Roles" and "Manage Users" are effectively full RBAC management.
            "manage roles", AuthoritiesConstants.RBAC_SETTINGS_EDIT,
            "manage users", AuthoritiesConstants.RBAC_SETTINGS_EDIT
        ));

        // Preset Settings module (Auction margin presets – separate from RBAC Settings).
        register(
            modules,
            "preset settings",
            mapOf(
                "view", AuthoritiesConstants.PRESET_SETTINGS_VIEW,
                "create", AuthoritiesConstants.PRESET_SETTINGS_CREATE,
                "edit", AuthoritiesConstants.PRESET_SETTINGS_EDIT,
                "delete", AuthoritiesConstants.PRESET_SETTINGS_DELETE
            )
        );

        register(
            modules,
            "print settings",
            mapOf(
                "view", AuthoritiesConstants.PRINT_SETTINGS_VIEW,
                "edit", AuthoritiesConstants.PRINT_SETTINGS_EDIT
            )
        );

        // Purely-UI modules such as "Home" do not have dedicated backend authorities and are
        // intentionally not mapped here.

        return Collections.unmodifiableMap(modules);
    }

    private static void register(
        Map<String, Map<String, String>> modules,
        String moduleKey,
        Map<String, String> featureMap
    ) {
        modules.put(normalizeStaticKey(moduleKey), Collections.unmodifiableMap(new HashMap<>(featureMap)));
    }

    private static String normalizeStaticKey(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    private static Map<String, String> mapOf(Object... keyValues) {
        if (keyValues.length % 2 != 0) {
            throw new IllegalArgumentException("mapOf requires an even number of arguments");
        }
        Map<String, String> map = new HashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            Object k = keyValues[i];
            Object v = keyValues[i + 1];
            if (k != null && v != null) {
                map.put(normalizeStaticKey(k.toString()), v.toString());
            }
        }
        return map;
    }

    private void clearUserCaches(User user) {
        if (user == null) {
            return;
        }
        if (cacheManager.getCache(com.mercotrace.repository.UserRepository.USERS_BY_LOGIN_CACHE) != null) {
            Objects
                .requireNonNull(cacheManager.getCache(com.mercotrace.repository.UserRepository.USERS_BY_LOGIN_CACHE))
                .evictIfPresent(user.getLogin());
        }
        if (user.getEmail() != null && cacheManager.getCache(com.mercotrace.repository.UserRepository.USERS_BY_EMAIL_CACHE) != null) {
            Objects
                .requireNonNull(cacheManager.getCache(com.mercotrace.repository.UserRepository.USERS_BY_EMAIL_CACHE))
                .evictIfPresent(user.getEmail());
        }
    }
}

