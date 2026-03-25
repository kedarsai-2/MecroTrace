package com.mercotrace.web.rest;

import com.mercotrace.domain.Authority;
import com.mercotrace.domain.User;
import com.mercotrace.repository.TraderRepository;
import com.mercotrace.repository.UserRepository;
import com.mercotrace.repository.UserTraderRepository;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.security.DomainUserDetailsService.UserWithId;
import com.mercotrace.service.EmailAlreadyUsedException;
import com.mercotrace.service.MailService;
import com.mercotrace.service.OtpService;
import com.mercotrace.service.TraderOwnerAuthorityService;
import com.mercotrace.service.TraderService;
import com.mercotrace.service.UserService;
import com.mercotrace.service.UsernameAlreadyUsedException;
import com.mercotrace.service.dto.AdminUserDTO;
import com.mercotrace.service.dto.TraderAuthDTO;
import com.mercotrace.service.dto.TraderDTO;
import com.mercotrace.web.rest.errors.TraderEmailAlreadyRegisteredException;
import com.mercotrace.web.rest.errors.TraderMobileAlreadyRegisteredException;
import com.mercotrace.web.rest.vm.LoginVM;
import com.mercotrace.web.rest.vm.ManagedUserVM;
import com.mercotrace.web.rest.vm.TraderOtpRequestVM;
import com.mercotrace.web.rest.vm.TraderOtpVerifyVM;
import com.mercotrace.web.rest.vm.TraderRegisterVM;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Trader auth API (formerly Module 1 spec) — auth paths:
 * /api/auth/register, /api/auth/login, /api/auth/me, /api/auth/profile,
 * /api/auth/otp/request, /api/auth/otp/verify.
 *
 * Delegates to existing JHipster auth/account while shaping responses as
 * {@link TraderAuthDTO} to match the mobile/web frontend expectations.
 */
@RestController
@RequestMapping("/api/auth")
public class TraderAuthResource {

    private static final Logger log = LoggerFactory.getLogger(TraderAuthResource.class);

    private final UserService userService;
    private final MailService mailService;
    private final UserRepository userRepository;
    private final com.mercotrace.web.rest.AccountResource accountResource;
    private final com.mercotrace.web.rest.AuthenticateController authenticateController;
    private final TraderService traderService;
    private final TraderRepository traderRepository;
    private final UserTraderRepository userTraderRepository;
    private final OtpService otpService;
    private final TraderOwnerAuthorityService traderOwnerAuthorityService;
    private final com.mercotrace.repository.ContactRepository contactRepository;
    private final com.mercotrace.admin.identity.AdminUserRepository adminUserRepository;

    public TraderAuthResource(
        UserService userService,
        MailService mailService,
        UserRepository userRepository,
        com.mercotrace.web.rest.AccountResource accountResource,
        com.mercotrace.web.rest.AuthenticateController authenticateController,
        TraderService traderService,
        TraderRepository traderRepository,
        UserTraderRepository userTraderRepository,
        OtpService otpService,
        TraderOwnerAuthorityService traderOwnerAuthorityService,
        com.mercotrace.repository.ContactRepository contactRepository,
        com.mercotrace.admin.identity.AdminUserRepository adminUserRepository
    ) {
        this.userService = userService;
        this.mailService = mailService;
        this.userRepository = userRepository;
        this.accountResource = accountResource;
        this.authenticateController = authenticateController;
        this.traderService = traderService;
        this.traderRepository = traderRepository;
        this.userTraderRepository = userTraderRepository;
        this.otpService = otpService;
        this.traderOwnerAuthorityService = traderOwnerAuthorityService;
        this.contactRepository = contactRepository;
        this.adminUserRepository = adminUserRepository;
    }

    /** POST /auth/register — Register Trader (Directory Listing only) + auto-login for trader UI. */
    @PostMapping("/register")
    public ResponseEntity<TraderAuthDTO> register(@Valid @RequestBody TraderRegisterVM vm) {
        // Enforce same password policy as frontend (min 6 chars)
        if (vm.getPassword() == null || vm.getPassword().length() < 6) {
            throw new com.mercotrace.service.InvalidPasswordException();
        }

        // Normalize and validate PIN code only when provided (optional field)
        String normalizedPinCode = null;
        if (vm.getPinCode() != null) {
            String trimmed = vm.getPinCode().trim();
            if (!trimmed.isEmpty()) {
                if (!trimmed.matches("^[0-9]{6}$")) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PIN code must be a 6-digit number");
                }
                normalizedPinCode = trimmed;
            }
        }

        // Duplicate checks before creating trader or user — return 409 to avoid duplicate entries and re-registration
        if (userRepository.findOneByEmailIgnoreCase(vm.getEmail()).isPresent()) {
            throw new TraderEmailAlreadyRegisteredException();
        }
        String mobile = vm.getMobile() != null ? vm.getMobile().trim() : null;
        if (mobile != null && !mobile.isEmpty()) {
            // Ensure the mobile is not already used anywhere (trader, trader user, admin user, or contact).
            traderRepository
                .findOneByMobile(mobile)
                .ifPresent(existing -> {
                    throw new TraderMobileAlreadyRegisteredException();
                });
            userRepository
                .findOneByMobile(mobile)
                .ifPresent(existing -> {
                    throw new TraderMobileAlreadyRegisteredException();
                });
            adminUserRepository
                .findOneByMobile(mobile)
                .ifPresent(existing -> {
                    throw new TraderMobileAlreadyRegisteredException();
                });
            contactRepository
                .findOneByPhone(mobile)
                .ifPresent(existing -> {
                    throw new TraderMobileAlreadyRegisteredException();
                });
        }

        // 1) Create Trader (directory listing, pending approval)
        TraderDTO traderDTO = new TraderDTO();
        traderDTO.setBusinessName(vm.getBusinessName());
        traderDTO.setOwnerName(vm.getOwnerName());
        traderDTO.setAddress(vm.getAddress());
        traderDTO.setMobile(vm.getMobile());
        traderDTO.setEmail(vm.getEmail());
        traderDTO.setCity(vm.getCity());
        traderDTO.setState(vm.getState());
        traderDTO.setPinCode(normalizedPinCode);
        traderDTO.setCategory(vm.getCategory());
        traderDTO.setApprovalStatus(com.mercotrace.domain.enumeration.ApprovalStatus.PENDING);
        traderDTO.setBillPrefix("");

        traderDTO.setGstNumber(vm.getGstNumber());
        traderDTO.setRmcApmcCode(vm.getRmcApmcCode());
        if (vm.getShopPhotos() != null && vm.getShopPhotos().length > 0) {
            if (vm.getShopPhotos().length > 4) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Too many shop photos. Maximum is 4.");
            }
            for (String photo : vm.getShopPhotos()) {
                if (photo != null && photo.length() > 512) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Shop photo URL is too long");
                }
            }
            traderDTO.setShopPhotos(String.join(",", vm.getShopPhotos()));
        }

        traderDTO = traderService.save(traderDTO);

        // 2) Create User linked logically to this trader (login by email)
        AdminUserDTO userDTO = new AdminUserDTO();
        userDTO.setLogin(vm.getEmail());
        userDTO.setEmail(vm.getEmail());
        userDTO.setFirstName(vm.getOwnerName());
        Set<String> auths = new HashSet<>();
        auths.add(AuthoritiesConstants.USER);
        userDTO.setAuthorities(auths);

        com.mercotrace.domain.User user;
        try {
            user = userService.registerUser(userDTO, vm.getPassword());
        } catch (UsernameAlreadyUsedException | EmailAlreadyUsedException e) {
            // Race or bypass: translate to 409 so client gets consistent conflict message
            throw new TraderEmailAlreadyRegisteredException();
        }
        // Auto-activate user for trader flows (no email activation flow in UI)
        user.setActivated(true);
        user.setActivationKey(null);
        if (mobile != null && !mobile.isEmpty()) {
            user.setMobile(mobile);
        }
        userRepository.save(user);

        // Ensure trader owners receive full trader-module authorities (no global admin).
        traderOwnerAuthorityService.ensureTraderOwnerAuthorities(user);

        // Link this user and trader as primary mapping for trader auth
        com.mercotrace.domain.UserTrader mapping = new com.mercotrace.domain.UserTrader();
        mapping.setUser(user);
        com.mercotrace.domain.Trader traderRef = new com.mercotrace.domain.Trader();
        traderRef.setId(traderDTO.getId());
        mapping.setTrader(traderRef);
        mapping.setRoleInTrader("OWNER");
        mapping.setPrimaryMapping(true);
        userTraderRepository.save(mapping);

        AdminUserDTO account = new AdminUserDTO(user);
        TraderAuthDTO dto = buildAuthDto(account, traderDTO);

        // 3) Best-effort auto-login via authorize(); registration already succeeded.
        LoginVM loginVM = new LoginVM();
        loginVM.setUsername(user.getLogin());
        loginVM.setPassword(vm.getPassword());
        loginVM.setRememberMe(false);
        try {
            ResponseEntity<com.mercotrace.web.rest.AuthenticateController.JWTToken> jwtResponse =
                authenticateController.authorize(loginVM);
            if (jwtResponse.getBody() != null && jwtResponse.getHeaders() != null) {
                AdminUserDTO authenticatedAccount = accountResource.getAccount();
                authenticatedAccount = upgradeTraderOwnerAuthoritiesIfNeeded(authenticatedAccount);
                TraderDTO resolvedTrader = resolveTraderForUser(authenticatedAccount).orElse(traderDTO);
                TraderAuthDTO authDto = buildAuthDto(authenticatedAccount, resolvedTrader);
                // Persistable token for the same reason as /auth/login above.
                authDto.setToken(jwtResponse.getBody().getIdToken());
                return ResponseEntity.status(HttpStatus.CREATED).headers(jwtResponse.getHeaders()).body(authDto);
            }
        } catch (Exception ex) {
            // Do not throw 401: registration succeeded; return 201 with needsLogin so client can redirect to login.
            log.debug("Registration succeeded but auto-login failed: {}", ex.getMessage());
        }
        dto.setNeedsLogin(true);
        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    /**
     * POST /auth/login — Login trader user. Returns normalized user/trader payloads.
     * JWT is issued via secure httpOnly cookie, not used directly by the frontend.
     */
    @PostMapping("/login")
    public ResponseEntity<TraderAuthDTO> login(@Valid @RequestBody LoginVM loginVM) {
        // Frontend sends an email and requires 6+ char password. Enforce that here.
        if (loginVM.getPassword() == null || loginVM.getPassword().length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters");
        }
        // Allow email- or mobile-based login by resolving to internal login username
        String username = loginVM.getUsername();
        if (username != null && username.contains("@")) {
            userRepository
                .findOneByEmailIgnoreCase(username.toLowerCase())
                .ifPresent(user -> loginVM.setUsername(user.getLogin()));
        } else if (username != null && username.matches("^[0-9]{10}$")) {
            userRepository
                .findOneByMobile(username)
                .ifPresent(user -> loginVM.setUsername(user.getLogin()));
        }

        // Delegate authentication to existing JWT controller
        ResponseEntity<com.mercotrace.web.rest.AuthenticateController.JWTToken> jwtResponse;
        try {
            jwtResponse = authenticateController.authorize(loginVM);
        } catch (Exception ex) {
            // Normalize authentication failures into a clean 401 with clear message
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        if (jwtResponse.getBody() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication failed");
        }

        // Fetch current authenticated user
        AdminUserDTO account = accountResource.getAccount();
        // Prevent global admin-only accounts from using trader auth endpoints.
        if (isAdminAccount(account)) {
            // If there is no trader mapping for this admin account, force them to use /api/admin/auth/login instead.
            java.util.Optional<TraderDTO> traderOptForAdmin = resolveTraderForUser(account);
            if (traderOptForAdmin.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin accounts must log in via /admin/login");
            }
        }
        account = upgradeTraderOwnerAuthoritiesIfNeeded(account);

        java.util.Optional<TraderDTO> traderOpt = resolveTraderForUser(account);
        TraderDTO trader = traderOpt.orElse(null);
        if (trader == null && !isAdminAccount(account)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Trader not configured");
        }
        if (trader != null && !Boolean.TRUE.equals(trader.getActive())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Trader account is inactive. Contact support.");
        }
        TraderAuthDTO dto = buildAuthDto(account, trader);
        // Persistable token: frontend stores it on Android and reuses it for /auth/me
        // to survive app restarts (cookies are httpOnly and may be cleared).
        dto.setToken(jwtResponse.getBody().getIdToken());

        return ResponseEntity.status(jwtResponse.getStatusCode()).headers(jwtResponse.getHeaders()).body(dto);
    }

    /** GET /auth/me — Return current user + trader payload based on JWT cookie. */
    @GetMapping("/me")
    public TraderAuthDTO me() {
        AdminUserDTO account = accountResource.getAccount();
        account = upgradeTraderOwnerAuthoritiesIfNeeded(account);

        java.util.Optional<TraderDTO> traderOpt = resolveTraderForUser(account);
        TraderDTO trader = traderOpt.orElse(null);
        if (isAdminAccount(account)) {
            // Admin-only accounts must never resolve trader context via /api/auth/me; they should use /api/admin/auth/me instead.
            java.util.Optional<TraderDTO> traderOptForAdmin = resolveTraderForUser(account);
            if (traderOptForAdmin.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin accounts must log in via /admin/login");
            }
        }
        if (trader == null && !isAdminAccount(account)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Trader not configured");
        }
        if (trader != null && !Boolean.TRUE.equals(trader.getActive())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Trader account is inactive. Contact support.");
        }
        return buildAuthDto(account, trader);
    }

    /** PUT /auth/profile — Update user profile. */
    @PutMapping("/profile")
    public void updateProfile(@RequestBody com.mercotrace.service.dto.AdminUserDTO userDTO) {
        // Delegate to AccountResource without triggering bean validation on AdminUserDTO here.
        // AccountResource will use the current authenticated user and only the updated fields.
        accountResource.saveAccount(userDTO);
    }

    /** POST /auth/otp/request — Request OTP for phone-based login. */
    @PostMapping("/otp/request")
    public ResponseEntity<Map<String, String>> requestOtp(
        @Valid @RequestBody TraderOtpRequestVM vm,
        HttpServletRequest request
    ) {
        String mobile = vm.getMobile();

        // OTP login is only allowed when this mobile belongs to a trader or trader user.
        boolean hasTraderByMobile = traderRepository.findOneByMobile(mobile).isPresent();
        boolean hasTraderUserByMobile = userRepository
            .findOneByMobile(mobile)
            .flatMap(user -> userTraderRepository.findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(user.getId()))
            .isPresent();
        if (!hasTraderByMobile && !hasTraderUserByMobile) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No trader registered with this mobile");
        }

        try {
            String clientIp = request.getRemoteAddr();
            otpService.generateOtpForMobile(mobile, clientIp);
        } catch (OtpService.OtpRateLimitExceededException ex) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many OTP requests. Please try again later.");
        }

        return ResponseEntity.ok(Map.of("status", "OK"));
    }

    /** POST /auth/otp/verify — Verify OTP and perform login. */
    @PostMapping("/otp/verify")
    public ResponseEntity<TraderAuthDTO> verifyOtp(@Valid @RequestBody TraderOtpVerifyVM vm) {
        String mobile = vm.getMobile();
        String otp = vm.getOtp();

        OtpService.OtpValidationStatus status = otpService.validateOtp(mobile, otp);
        if (status == OtpService.OtpValidationStatus.EXPIRED || status == OtpService.OtpValidationStatus.NOT_FOUND) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP expired");
        }
        if (status == OtpService.OtpValidationStatus.TOO_MANY_ATTEMPTS) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Please request a new OTP.");
        }
        if (status == OtpService.OtpValidationStatus.INVALID) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid OTP");
        }

        // At this point, OTP is valid. Resolve trader and user by mobile.
        com.mercotrace.domain.User user = null;
        com.mercotrace.domain.Trader traderEntity = null;

        // Prefer a trader user whose mobile matches and has a primary trader mapping.
        java.util.Optional<com.mercotrace.domain.User> userOpt = userRepository.findOneByMobile(mobile);
        if (userOpt.isPresent()) {
            com.mercotrace.domain.User candidate = userOpt.get();
            traderEntity =
                userTraderRepository
                    .findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(candidate.getId())
                    .map(com.mercotrace.domain.UserTrader::getTrader)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trader not configured"));
            user = candidate;
        } else {
            // Fallback: treat the mobile as the trader's own registration number.
            traderEntity =
                traderRepository
                    .findOneByMobile(mobile)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No trader registered with this mobile"));
            // Resolve or create canonical user associated with this trader for OTP-based login.
            user = resolveOrCreateUserForTrader(traderEntity, mobile);
        }

        // Load user with authorities to build a consistent security principal.
        User managedUser = userRepository
            .findOneWithAuthoritiesById(user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Trader not configured"));

        UserWithId userDetails = UserWithId.fromUser(managedUser);
        Authentication authentication = new UsernamePasswordAuthenticationToken(
            userDetails,
            null,
            userDetails.getAuthorities()
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        String jwt = authenticateController.createToken(authentication, false);
        HttpHeaders httpHeaders = authenticateController.buildAuthHeaders(jwt);

        AdminUserDTO account = accountResource.getAccount();

        TraderDTO trader = traderService
            .findOne(traderEntity.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Trader not configured"));

        if (!Boolean.TRUE.equals(trader.getActive())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Trader account is inactive. Contact support.");
        }

        TraderAuthDTO dto = buildAuthDto(account, trader);
        // Persistable token for the same reason as /auth/login above.
        dto.setToken(jwt);

        return ResponseEntity.ok().headers(httpHeaders).body(dto);
    }

    private AdminUserDTO upgradeTraderOwnerAuthoritiesIfNeeded(AdminUserDTO account) {
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
                // Idempotent upgrade – safe to call repeatedly.
                traderOwnerAuthorityService.ensureTraderOwnerAuthorities(user);

                // After upgrade, re-read a managed User with initialized authorities.
                Optional<User> managedUserOpt = userRepository.findOneWithAuthoritiesById(account.getId());
                if (managedUserOpt.isEmpty()) {
                    return account;
                }
                User managedUser = managedUserOpt.get();

                Set<String> updatedAuthorities =
                    managedUser
                        .getAuthorities()
                        .stream()
                        .map(Authority::getName)
                        .collect(Collectors.toSet());
                account.setAuthorities(updatedAuthorities);
                return account;
            })
            .orElse(account);
    }

    private TraderAuthDTO buildAuthDto(AdminUserDTO account, TraderDTO trader) {
        // Ensure OWNER authorities are always up-to-date when we serialize the auth payload.
        account = upgradeTraderOwnerAuthoritiesIfNeeded(account);

        TraderAuthDTO dto = new TraderAuthDTO();

        // Map user
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
        userPayload.setRole(computeDisplayRole(account, trader));
        userPayload.setAuthorities(account.getAuthorities());

        dto.setUser(userPayload);

        // Map trader when available (trader users). Admin/superadmin without a trader mapping receive trader = null.
        if (trader != null) {
            TraderAuthDTO.TraderPayload traderPayload = new TraderAuthDTO.TraderPayload();
            if (trader.getId() != null) {
                traderPayload.setTraderId(trader.getId().toString());
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

            dto.setTrader(traderPayload);
        }

        return dto;
    }

    private String[] splitShopPhotos(String shopPhotos) {
        if (shopPhotos == null || shopPhotos.isBlank()) {
            return new String[0];
        }
        return shopPhotos.split("\\s*,\\s*");
    }

    private java.util.Optional<TraderDTO> resolveTraderForUser(AdminUserDTO account) {
        if (account.getId() == null) {
            return java.util.Optional.empty();
        }
        return userTraderRepository
            .findFirstByUserIdAndPrimaryMappingTrueAndActiveTrue(account.getId())
            .flatMap(mapping -> traderService.findOne(mapping.getTrader().getId()));
    }

    private boolean isAdminAccount(AdminUserDTO account) {
        if (account == null || account.getAuthorities() == null) {
            return false;
        }
        java.util.Set<String> authorities = account.getAuthorities();
        return authorities.contains(AuthoritiesConstants.ADMIN)
            || authorities.contains("SUPER_ADMIN")
            || authorities.contains("ROLE_SUPER_ADMIN");
    }

    private String computeDisplayRole(AdminUserDTO account, TraderDTO trader) {
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
                    if (isAdminAccount(account)) {
                        java.util.Set<String> authorities = account.getAuthorities() != null ? account.getAuthorities() : java.util.Set.of();
                        if (authorities.contains("ROLE_SUPER_ADMIN") || authorities.contains("SUPER_ADMIN")) {
                            return "SUPER_ADMIN";
                        }
                        if (authorities.contains(AuthoritiesConstants.ADMIN)) {
                            return "ADMIN";
                        }
                    }
                    return "USER";
                });
        }

        if (isAdminAccount(account)) {
            java.util.Set<String> authorities = account.getAuthorities() != null ? account.getAuthorities() : java.util.Set.of();
            if (authorities.contains("ROLE_SUPER_ADMIN") || authorities.contains("SUPER_ADMIN")) {
                return "SUPER_ADMIN";
            }
            if (authorities.contains(AuthoritiesConstants.ADMIN)) {
                return "ADMIN";
            }
        }

        return "USER";
    }

    private com.mercotrace.domain.User resolveOrCreateUserForTrader(com.mercotrace.domain.Trader trader, String mobile) {
        // Prefer the canonical primary user-trader mapping (typically the owner user created at registration).
        return userTraderRepository
            .findAllWithUserByTraderIdAndPrimaryMappingTrue(trader.getId())
            .stream()
            .findFirst()
            .map(mapping -> {
                com.mercotrace.domain.User primaryUser = mapping.getUser();
                // Ensure trader owners receive full trader-module authorities.
                traderOwnerAuthorityService.ensureTraderOwnerAuthorities(primaryUser);
                return primaryUser;
            })
            // If no primary mapping exists, fall back to creating a dedicated phone-login user and mapping.
            .orElseGet(() -> createUserForTrader(trader, mobile));
    }

    private com.mercotrace.domain.User createUserForTrader(com.mercotrace.domain.Trader trader, String mobile) {
        String login = mobile + "@phone.mercotrace.com";
        String email = login;

        Optional<com.mercotrace.domain.User> existingByLogin = userRepository.findOneByLogin(login);
        com.mercotrace.domain.User user;
        if (existingByLogin.isPresent()) {
            user = existingByLogin.get();
        } else {
            AdminUserDTO userDTO = new AdminUserDTO();
            userDTO.setLogin(login);
            userDTO.setEmail(email);
            userDTO.setFirstName(trader.getOwnerName());
            Set<String> auths = new HashSet<>();
            auths.add(AuthoritiesConstants.USER);
            userDTO.setAuthorities(auths);

            String password = "phone-otp-login";
            user = userService.registerUser(userDTO, password);
            user.setActivated(true);
            user.setActivationKey(null);
            user = userRepository.save(user);
        }

        // Ensure mapping exists between this user and trader
        final com.mercotrace.domain.User currentUser = user;
        final com.mercotrace.domain.Trader currentTrader = trader;
        userTraderRepository
            .findFirstByTraderIdAndPrimaryMappingTrue(currentTrader.getId())
            .orElseGet(() -> {
                com.mercotrace.domain.UserTrader mapping = new com.mercotrace.domain.UserTrader();
                mapping.setUser(currentUser);
                mapping.setTrader(currentTrader);
                mapping.setRoleInTrader("OWNER");
                mapping.setPrimaryMapping(true);
                return userTraderRepository.save(mapping);
            });

        // Ensure this OWNER user has full trader-module authorities.
        traderOwnerAuthorityService.ensureTraderOwnerAuthorities(user);

        return user;
    }
}

