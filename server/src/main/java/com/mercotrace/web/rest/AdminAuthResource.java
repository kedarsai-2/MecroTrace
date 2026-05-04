package com.mercotrace.web.rest;

import com.mercotrace.admin.identity.AdminUserService;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.security.SecurityUtils;
import com.mercotrace.service.dto.AdminUserDTO;
import com.mercotrace.service.dto.TraderAuthDTO;
import com.mercotrace.web.rest.vm.LoginVM;
import jakarta.validation.Valid;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin-only authentication API.
 *
 * Base path: /api/admin/auth
 *
 * This controller is responsible for logging in and bootstrapping global admin
 * sessions that are not associated with any trader. All responses intentionally
 * omit trader context by returning a {@link TraderAuthDTO} with {@code trader = null}.
 */
@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminAuthResource.class);

    private final AdminUserService adminUserService;
    private final com.mercotrace.web.rest.AuthenticateController authenticateController;
    private final org.springframework.security.authentication.AuthenticationManager adminAuthenticationManager;

    /**
     * Controls whether the ACCESS_TOKEN cookie is marked as Secure for admin flows.
     * In production this should remain true (HTTPS only), but for local HTTP
     * development we allow overriding it via configuration so that the browser
     * will actually store and send the cookie.
     */
    @Value("${application.security.cookie.secure:true}")
    private boolean cookieSecure;

    public AdminAuthResource(
        AdminUserService adminUserService,
        com.mercotrace.web.rest.AuthenticateController authenticateController,
        @Qualifier("adminAuthenticationManager") org.springframework.security.authentication.AuthenticationManager adminAuthenticationManager
    ) {
        this.adminUserService = adminUserService;
        this.authenticateController = authenticateController;
        this.adminAuthenticationManager = adminAuthenticationManager;
    }

    /**
     * {@code POST /api/admin/auth/login} : Authenticate a global admin user.
     *
     * On success, returns a {@link TraderAuthDTO} where {@code trader} is always {@code null}.
     */
    @PostMapping("/login")
    public ResponseEntity<TraderAuthDTO> login(@Valid @RequestBody LoginVM loginVM) {
        if (loginVM.getPassword() == null || loginVM.getPassword().length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters");
        }

        org.springframework.security.authentication.UsernamePasswordAuthenticationToken authenticationToken =
            new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginVM.getUsername(), loginVM.getPassword());
        org.springframework.security.core.Authentication authentication;
        try {
            authentication = adminAuthenticationManager.authenticate(authenticationToken);
            org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
        }

        AdminUserDTO account = adminUserService
            .getCurrentAdminDto()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Admin account not found"));
        if (!isAdminAccount(account)) {
            LOG.warn("Non-admin user {} attempted to login via /api/admin/auth/login", account != null ? account.getLogin() : "UNKNOWN");
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin accounts only");
        }

        TraderAuthDTO dto = buildAdminAuthDto(account);
        String jwt = authenticateController.createToken(authentication, loginVM.isRememberMe(), SecurityUtils.TOKEN_TYPE_ADMIN);

        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.setBearerAuth(jwt);
        org.springframework.http.ResponseCookie cookie = org.springframework.http.ResponseCookie
            .from("ACCESS_TOKEN", jwt)
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ofSeconds(authenticateController.tokenValiditySeconds(loginVM.isRememberMe())))
            .build();
        headers.add(org.springframework.http.HttpHeaders.SET_COOKIE, cookie.toString());

        dto.setToken(jwt);

        return ResponseEntity.status(org.springframework.http.HttpStatus.OK).headers(headers).body(dto);
    }

    /**
     * {@code GET /api/admin/auth/me} : Return the current admin account.
     *
     * Requires the caller to have {@code ROLE_ADMIN}.
     */
    @GetMapping("/me")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public TraderAuthDTO me() {
        AdminUserDTO account = adminUserService
            .getCurrentAdminDto()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Admin account not found"));
        if (!isAdminAccount(account)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin accounts only");
        }
        return buildAdminAuthDto(account);
    }

    /**
     * POST /api/admin/auth/logout — clear ACCESS_TOKEN cookie for admin sessions.
     *
     * This complements the trader/contact logout endpoints and ensures multi-role
     * testing in the same browser does not leave stale ACCESS_TOKEN cookies behind.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        org.springframework.http.ResponseCookie deleteCookie = org.springframework.http.ResponseCookie
            .from("ACCESS_TOKEN", "")
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/")
            .maxAge(0)
            .build();
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.add(org.springframework.http.HttpHeaders.SET_COOKIE, deleteCookie.toString());
        return ResponseEntity.noContent().headers(headers).build();
    }

    private boolean isAdminAccount(AdminUserDTO account) {
        if (account == null || account.getAuthorities() == null) {
            return false;
        }
        java.util.Set<String> authorities = account.getAuthorities();
        return authorities.contains(AuthoritiesConstants.ADMIN)
            || authorities.contains("ROLE_SUPER_ADMIN")
            || authorities.contains("SUPER_ADMIN");
    }

    private TraderAuthDTO buildAdminAuthDto(AdminUserDTO account) {
        TraderAuthDTO dto = new TraderAuthDTO();

        TraderAuthDTO.UserPayload userPayload = new TraderAuthDTO.UserPayload();
        if (account.getId() != null) {
            userPayload.setUserId(account.getId().toString());
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

        // For admin accounts, derive a display role from authorities.
        java.util.Set<String> authorities = account.getAuthorities() != null ? account.getAuthorities() : java.util.Set.of();
        if (authorities.contains("ROLE_SUPER_ADMIN") || authorities.contains("SUPER_ADMIN")) {
            userPayload.setRole("SUPER_ADMIN");
        } else if (authorities.contains(AuthoritiesConstants.ADMIN)) {
            userPayload.setRole("ADMIN");
        } else {
            userPayload.setRole("USER");
        }
        userPayload.setAuthorities(authorities);

        dto.setUser(userPayload);
        // Admin flows must never expose trader context.
        dto.setTrader(null);

        return dto;
    }
}

