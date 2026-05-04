package com.mercotrace.web.rest;

import static com.mercotrace.security.SecurityUtils.AUTHORITIES_CLAIM;
import static com.mercotrace.security.SecurityUtils.JWT_ALGORITHM;
import static com.mercotrace.security.SecurityUtils.TOKEN_TYPE_CLAIM;
import static com.mercotrace.security.SecurityUtils.TOKEN_TYPE_TRADER;
import static com.mercotrace.security.SecurityUtils.USER_ID_CLAIM;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mercotrace.security.DomainUserDetailsService.UserWithId;
import com.mercotrace.web.rest.vm.LoginVM;
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

    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds:0}")
    private long tokenValidityInSeconds;

    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds-for-remember-me:0}")
    private long tokenValidityInSecondsForRememberMe;

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
        @Qualifier("traderAuthenticationManager") AuthenticationManager authenticationManager
    ) {
        this.jwtEncoder = jwtEncoder;
        this.authenticationManager = authenticationManager;
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

        return new ResponseEntity<>(new JWTToken(jwt), httpHeaders, HttpStatus.OK);
    }

    /** JWT lifetime in seconds (same rule as {@link #createToken}). */
    public long tokenValiditySeconds(boolean rememberMe) {
        return rememberMe ? tokenValidityInSecondsForRememberMe : tokenValidityInSeconds;
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

    /**
     * POST /auth/logout — clear ACCESS_TOKEN cookie for trader/admin flows.
     *
     * This does not invalidate the JWT server-side (tokens remain stateless),
     * but instructs the browser to delete the httpOnly cookie so subsequent
     * requests from this device are treated as logged out until a new login.
     */
    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout() {
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
        return ResponseEntity.noContent().headers(headers).build();
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

    /**
     * Object to return as body in JWT Authentication.
     */
    static class JWTToken {

        private String idToken;

        JWTToken(String idToken) {
            this.idToken = idToken;
        }

        @JsonProperty("id_token")
        String getIdToken() {
            return idToken;
        }

        void setIdToken(String idToken) {
            this.idToken = idToken;
        }
    }
}
