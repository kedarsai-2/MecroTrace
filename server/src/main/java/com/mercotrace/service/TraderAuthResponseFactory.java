package com.mercotrace.service;

import com.mercotrace.domain.Authority;
import com.mercotrace.domain.User;
import com.mercotrace.repository.UserRepository;
import com.mercotrace.repository.UserTraderRepository;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.security.DomainUserDetailsService.UserWithId;
import com.mercotrace.security.SecurityUtils;
import com.mercotrace.service.dto.AdminUserDTO;
import com.mercotrace.service.dto.TraderAuthDTO;
import com.mercotrace.service.dto.TraderDTO;
import com.mercotrace.web.rest.AuthenticateController;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class TraderAuthResponseFactory {

    private final UserRepository userRepository;
    private final UserTraderRepository userTraderRepository;
    private final TraderOwnerAuthorityService traderOwnerAuthorityService;
    private final AuthenticateController authenticateController;

    public TraderAuthResponseFactory(
        UserRepository userRepository,
        UserTraderRepository userTraderRepository,
        TraderOwnerAuthorityService traderOwnerAuthorityService,
        AuthenticateController authenticateController
    ) {
        this.userRepository = userRepository;
        this.userTraderRepository = userTraderRepository;
        this.traderOwnerAuthorityService = traderOwnerAuthorityService;
        this.authenticateController = authenticateController;
    }

    public IssuedTraderAuth issueTraderSession(User user, TraderDTO trader) {
        traderOwnerAuthorityService.ensureTraderOwnerAuthorities(user);
        User managedUser = userRepository
            .findOneWithAuthoritiesById(user.getId())
            .orElseThrow(() -> new IllegalStateException("Trader user not found"));
        UserWithId userDetails = UserWithId.fromUser(managedUser);
        Authentication authentication = new UsernamePasswordAuthenticationToken(
            userDetails,
            null,
            userDetails.getAuthorities()
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        String jwt = authenticateController.createToken(authentication, true);
        HttpHeaders headers = authenticateController.buildAuthHeaders(jwt, true);
        AuthRefreshSessionService.IssuedRefreshSession refreshSession = authenticateController.issueRefreshSession(
            authentication,
            SecurityUtils.TOKEN_TYPE_TRADER
        );
        authenticateController.addRefreshHeaders(headers, refreshSession.rawToken());

        TraderAuthDTO dto = buildAuthDto(new AdminUserDTO(managedUser), trader);
        dto.setToken(jwt);
        dto.setRefreshToken(refreshSession.rawToken());
        return new IssuedTraderAuth(dto, headers);
    }

    public TraderAuthDTO buildAuthDto(AdminUserDTO account, TraderDTO trader) {
        account = upgradeTraderOwnerAuthoritiesIfNeeded(account);

        TraderAuthDTO dto = new TraderAuthDTO();
        TraderAuthDTO.UserPayload userPayload = new TraderAuthDTO.UserPayload();
        if (account.getId() != null) {
            userPayload.setUserId(account.getId().toString());
        }
        if (trader != null && trader.getId() != null) {
            userPayload.setTraderId(trader.getId().toString());
        }
        userPayload.setUsername(account.getLogin());
        userPayload.setActive(account.isActivated());
        userPayload.setCreatedAt(account.getCreatedDate() != null ? account.getCreatedDate().toString() : null);

        StringBuilder nameBuilder = new StringBuilder();
        if (account.getFirstName() != null) {
            nameBuilder.append(account.getFirstName());
        }
        if (account.getLastName() != null) {
            if (!nameBuilder.isEmpty()) {
                nameBuilder.append(" ");
            }
            nameBuilder.append(account.getLastName());
        }
        userPayload.setName(nameBuilder.toString());
        userPayload.setRole(computeDisplayRole(account));
        userPayload.setAuthorities(account.getAuthorities());
        dto.setUser(userPayload);

        if (trader != null) {
            TraderAuthDTO.TraderPayload traderPayload = new TraderAuthDTO.TraderPayload();
            if (trader.getId() != null) {
                traderPayload.setTraderId(trader.getId().toString());
                dto.setSelectedTraderId(trader.getId().toString());
            }
            traderPayload.setBusinessName(trader.getBusinessName());
            traderPayload.setOwnerName(trader.getOwnerName());
            traderPayload.setAddress(trader.getAddress());
            traderPayload.setMobile(trader.getMobile());
            traderPayload.setEmail(trader.getEmail());
            traderPayload.setCity(trader.getCity());
            traderPayload.setState(trader.getState());
            traderPayload.setPinCode(trader.getPinCode());
            traderPayload.setCategory(trader.getCategory());
            traderPayload.setApprovalStatus(trader.getApprovalStatus() != null ? trader.getApprovalStatus().name() : "PENDING");
            traderPayload.setBillPrefix(trader.getBillPrefix());
            traderPayload.setCreatedAt(trader.getCreatedAt() != null ? trader.getCreatedAt().toString() : null);
            traderPayload.setUpdatedAt(trader.getUpdatedAt() != null ? trader.getUpdatedAt().toString() : null);
            traderPayload.setGstNumber(trader.getGstNumber());
            traderPayload.setRmcApmcCode(trader.getRmcApmcCode());
            traderPayload.setShopPhotos(splitShopPhotos(trader.getShopPhotos()));
            traderPayload.setPresetEnabled(trader.getPresetEnabled() != null ? trader.getPresetEnabled() : Boolean.TRUE);
            dto.setTrader(traderPayload);
        }

        return dto;
    }

    public AdminUserDTO upgradeTraderOwnerAuthoritiesIfNeeded(AdminUserDTO account) {
        if (account == null || account.getId() == null) {
            return account;
        }

        return userTraderRepository
            .findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(account.getId())
            .filter(mapping -> {
                String roleInTrader = mapping.getRoleInTrader();
                return roleInTrader != null && "OWNER".equalsIgnoreCase(roleInTrader.trim());
            })
            .map(mapping -> {
                Optional<User> userOpt = userRepository.findById(account.getId());
                if (userOpt.isEmpty()) {
                    return account;
                }
                User user = userOpt.get();
                traderOwnerAuthorityService.ensureTraderOwnerAuthorities(user);
                Optional<User> managedUserOpt = userRepository.findOneWithAuthoritiesById(account.getId());
                if (managedUserOpt.isEmpty()) {
                    return account;
                }
                Set<String> updatedAuthorities = managedUserOpt
                    .get()
                    .getAuthorities()
                    .stream()
                    .map(Authority::getName)
                    .collect(Collectors.toSet());
                account.setAuthorities(updatedAuthorities);
                return account;
            })
            .orElse(account);
    }

    private String computeDisplayRole(AdminUserDTO account) {
        if (account == null) {
            return "USER";
        }

        if (account.getId() != null) {
            return userTraderRepository
                .findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(account.getId())
                .map(mapping -> {
                    String roleInTrader = mapping.getRoleInTrader();
                    if (roleInTrader == null || roleInTrader.isBlank()) {
                        return "TRADER_USER";
                    }
                    String normalized = roleInTrader.trim().toUpperCase();
                    if ("OWNER".equals(normalized)) {
                        return "TRADER_OWNER";
                    }
                    return normalized;
                })
                .orElseGet(() -> {
                    Set<String> authorities = account.getAuthorities() != null ? account.getAuthorities() : Set.of();
                    if (authorities.contains("ROLE_SUPER_ADMIN") || authorities.contains("SUPER_ADMIN")) {
                        return "SUPER_ADMIN";
                    }
                    if (authorities.contains(AuthoritiesConstants.ADMIN)) {
                        return "ADMIN";
                    }
                    return "USER";
                });
        }

        return "USER";
    }

    private String[] splitShopPhotos(String shopPhotos) {
        if (shopPhotos == null || shopPhotos.isBlank()) {
            return new String[0];
        }
        return shopPhotos.split("\\s*,\\s*");
    }

    public record IssuedTraderAuth(TraderAuthDTO dto, HttpHeaders headers) {}
}
