package com.mercotrace.web.rest;

import static com.mercotrace.security.SecurityUtils.AUTHORITIES_CLAIM;
import static com.mercotrace.security.SecurityUtils.CONTACT_ID_CLAIM;
import static com.mercotrace.security.SecurityUtils.JWT_ALGORITHM;
import static com.mercotrace.security.SecurityUtils.TOKEN_TYPE_CLAIM;
import static com.mercotrace.security.SecurityUtils.TOKEN_TYPE_TRADER;
import static com.mercotrace.security.SecurityUtils.USER_ID_CLAIM;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mercotrace.domain.RefreshSession;
import com.mercotrace.security.DomainUserDetailsService.UserWithId;
import com.mercotrace.service.AuthRefreshSessionService;
import com.mercotrace.service.AuthRefreshSessionService.InvalidRefreshTokenException;
import com.mercotrace.web.rest.vm.LoginVM;
import com.mercotrace.web.rest.vm.RefreshTokenVM;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.*;

/**
 * Controller to authenticate users.
 */
@RestController
@RequestMapping("/api")
public class AuthenticateController {

    private static final Logger LOG = LoggerFactory.getLogger(AuthenticateController.class);

    private final JwtEncoder jwtEncoder;
    private final AuthRefreshSessionService refreshSessionService;

    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds:0}")
    private long tokenValidityInSeconds;

    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds-for-remember-me:0}")
    private long tokenValidityInSecondsForRememberMe;

    @Value("${application.security.access-token-validity-in-seconds:86400}")
    private long accessTokenValidityInSeconds;

    /**
     * Controls whether the ACCESS_TOKEN cookie is marked as Secure.
     * In production this should remain true (HTTPS only), but for local
     * HTTP development we allow overriding it via configuration so that
     * the browser will actually store and send the cookie.
     */
    @Value("${application.security.cookie.secure:true}")
    private boolean cookieSecure;

    private final AuthenticationManager authenticationManager;

    public AuthenticateController(
        JwtEncoder jwtEncoder,
        @Qualifier("traderAuthenticationManager") AuthenticationManager authenticationManager,
        AuthRefreshSessionService refreshSessionService
    ) {
        this.jwtEncoder = jwtEncoder;
        this.authenticationManager = authenticationManager;
        this.refreshSessionService = refreshSessionService;
    }

    @PostMapping("/authenticate")
    public ResponseEntity<JWTToken> authorize(@Valid @RequestBody LoginVM loginVM) {
        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(
            loginVM.getUsername(),
            loginVM.getPassword()
        );

        Authentication authentication = authenticationManager.authenticate(authenticationToken);
        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = this.createToken(authentication, loginVM.isRememberMe());

        HttpHeaders httpHeaders = new HttpHeaders();
        // Preserve existing Authorization header for compatibility
        httpHeaders.setBearerAuth(jwt);

        // Also issue JWT as secure, httpOnly cookie so the frontend never has
        // to read or store the token directly.
        long cookieMaxAgeSec = tokenValiditySeconds(loginVM.isRememberMe());
        ResponseCookie cookie = ResponseCookie
            .from("ACCESS_TOKEN", jwt)
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ofSeconds(cookieMaxAgeSec))
            .build();
        httpHeaders.add(HttpHeaders.SET_COOKIE, cookie.toString());
        AuthRefreshSessionService.IssuedRefreshSession refreshSession = issueRefreshSession(authentication, TOKEN_TYPE_TRADER);
        refreshSessionService.addRefreshHeaders(httpHeaders, refreshSession.rawToken());

        return new ResponseEntity<>(new JWTToken(jwt, refreshSession.rawToken()), httpHeaders, HttpStatus.OK);
    }

    /** JWT lifetime in seconds (same rule as {@link #createToken}). */
    public long tokenValiditySeconds(boolean rememberMe) {
        return rememberMe ? accessTokenValidityInSeconds : tokenValidityInSeconds;
    }

    /**
     * Build HTTP headers with Bearer token and httpOnly cookie for a JWT.
     * {@code rememberMe} must match how the JWT was created so cookie max-age aligns with token expiry.
     */
    public HttpHeaders buildAuthHeaders(String jwt, boolean rememberMe) {
        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setBearerAuth(jwt);
        long cookieMaxAgeSec = tokenValiditySeconds(rememberMe);
        ResponseCookie cookie = ResponseCookie
            .from("ACCESS_TOKEN", jwt)
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ofSeconds(cookieMaxAgeSec))
            .build();
        httpHeaders.add(HttpHeaders.SET_COOKIE, cookie.toString());
        return httpHeaders;
    }

    public AuthRefreshSessionService.IssuedRefreshSession issueRefreshSession(Authentication authentication, String tokenType) {
        Long userId = null;
        if (authentication.getPrincipal() instanceof UserWithId user) {
            userId = user.getId();
        }
        return refreshSessionService.issue(tokenType, authentication.getName(), userId, null, authentication.getAuthorities());
    }

    public void addRefreshHeaders(HttpHeaders headers, String rawRefreshToken) {
        refreshSessionService.addRefreshHeaders(headers, rawRefreshToken);
    }

    /**
     * POST /auth/logout — clear ACCESS_TOKEN cookie for trader/admin flows.
     *
     * This does not invalidate the JWT server-side (tokens remain stateless),
     * but instructs the browser to delete the httpOnly cookie so subsequent
     * requests from this device are treated as logged out until a new login.
     */
    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(
        HttpServletRequest request,
        @RequestHeader(value = AuthRefreshSessionService.REFRESH_TOKEN_HEADER, required = false) String refreshHeader
    ) {
        String refreshToken = refreshSessionService.resolveRefreshToken(request, null, refreshHeader);
        refreshSessionService.revoke(refreshToken);
        ResponseCookie deleteCookie = ResponseCookie
            .from("ACCESS_TOKEN", "")
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/")
            .maxAge(0)
            .build();
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.SET_COOKIE, deleteCookie.toString());
        refreshSessionService.addDeleteRefreshCookie(headers);
        return ResponseEntity.noContent().headers(headers).build();
    }

    @PostMapping("/auth/refresh")
    public ResponseEntity<JWTToken> refresh(
        HttpServletRequest request,
        @RequestHeader(value = AuthRefreshSessionService.REFRESH_TOKEN_HEADER, required = false) String refreshHeader,
        @RequestBody(required = false) RefreshTokenVM vm
    ) {
        String rawRefreshToken = refreshSessionService.resolveRefreshToken(
            request,
            vm != null ? vm.getRefreshToken() : null,
            refreshHeader
        );
        try {
            AuthRefreshSessionService.IssuedRefreshSession rotated = refreshSessionService.rotate(rawRefreshToken, TOKEN_TYPE_TRADER);
            String jwt = createToken(rotated.session(), true);
            HttpHeaders headers = buildAuthHeaders(jwt, true);
            refreshSessionService.addRefreshHeaders(headers, rotated.rawToken());
            return ResponseEntity.ok().headers(headers).body(new JWTToken(jwt, rotated.rawToken()));
        } catch (InvalidRefreshTokenException ex) {
            HttpHeaders headers = new HttpHeaders();
            refreshSessionService.addDeleteRefreshCookie(headers);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).headers(headers).build();
        }
    }

    /**
     * {@code GET /authenticate} : check if the user is authenticated.
     *
     * @return the {@link ResponseEntity} with status {@code 204 (No Content)},
     * or with status {@code 401 (Unauthorized)} if not authenticated.
     */
    @GetMapping("/authenticate")
    public ResponseEntity<Void> isAuthenticated(Principal principal) {
        LOG.debug("REST request to check if the current user is authenticated");
        return ResponseEntity.status(principal == null ? HttpStatus.UNAUTHORIZED : HttpStatus.NO_CONTENT).build();
    }

    public String createToken(Authentication authentication, boolean rememberMe) {
        return createToken(authentication, rememberMe, TOKEN_TYPE_TRADER);
    }

    public String createToken(Authentication authentication, boolean rememberMe, String tokenType) {
        String authorities = authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.joining(" "));

        Instant now = Instant.now();
        Instant validity = now.plus(tokenValiditySeconds(rememberMe), ChronoUnit.SECONDS);

        // @formatter:off
        JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
            .issuedAt(now)
            .expiresAt(validity)
            .subject(authentication.getName())
            .claim(AUTHORITIES_CLAIM, authorities)
            .claim(TOKEN_TYPE_CLAIM, tokenType);
        if (authentication.getPrincipal() instanceof UserWithId user) {
            builder.claim(USER_ID_CLAIM, user.getId());
        }

        JwsHeader jwsHeader = JwsHeader.with(JWT_ALGORITHM).build();
        return this.jwtEncoder.encode(JwtEncoderParameters.from(jwsHeader, builder.build())).getTokenValue();
    }

    public String createToken(RefreshSession session, boolean rememberMe) {
        Instant now = Instant.now();
        Instant validity = now.plus(tokenValiditySeconds(rememberMe), ChronoUnit.SECONDS);

        JwtClaimsSet.Builder builder = JwtClaimsSet
            .builder()
            .issuedAt(now)
            .expiresAt(validity)
            .subject(session.getSubject())
            .claim(AUTHORITIES_CLAIM, session.getAuthorities())
            .claim(TOKEN_TYPE_CLAIM, session.getTokenType());
        if (session.getUserId() != null) {
            builder.claim(USER_ID_CLAIM, session.getUserId());
        }
        if (session.getContactId() != null) {
            builder.claim(CONTACT_ID_CLAIM, session.getContactId());
        }

        JwsHeader jwsHeader = JwsHeader.with(JWT_ALGORITHM).build();
        return this.jwtEncoder.encode(JwtEncoderParameters.from(jwsHeader, builder.build())).getTokenValue();
    }

    /**
     * Object to return as body in JWT Authentication.
     */
    static class JWTToken {

        private String idToken;
        private String refreshToken;

        JWTToken(String idToken) {
            this.idToken = idToken;
        }

        JWTToken(String idToken, String refreshToken) {
            this.idToken = idToken;
            this.refreshToken = refreshToken;
        }

        @JsonProperty("id_token")
        String getIdToken() {
            return idToken;
        }

        void setIdToken(String idToken) {
            this.idToken = idToken;
        }

        @JsonProperty("refresh_token")
        String getRefreshToken() {
            return refreshToken;
        }

        void setRefreshToken(String refreshToken) {
            this.refreshToken = refreshToken;
        }
    }
}
