package com.mercotrace.service;

import com.mercotrace.domain.RefreshSession;
import com.mercotrace.repository.RefreshSessionRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Collection;
import java.util.HexFormat;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AuthRefreshSessionService {

    public static final String REFRESH_TOKEN_COOKIE = "REFRESH_TOKEN";
    public static final String REFRESH_TOKEN_HEADER = "X-Merco-Refresh-Token";

    private final RefreshSessionRepository refreshSessionRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${jhipster.security.authentication.jwt.token-validity-in-seconds-for-remember-me:0}")
    private long refreshValidityInSeconds;

    @Value("${application.security.cookie.secure:true}")
    private boolean cookieSecure;

    public AuthRefreshSessionService(RefreshSessionRepository refreshSessionRepository) {
        this.refreshSessionRepository = refreshSessionRepository;
    }

    public IssuedRefreshSession issue(
        String tokenType,
        String subject,
        Long userId,
        Long contactId,
        Collection<? extends GrantedAuthority> authorities
    ) {
        return issue(tokenType, subject, userId, contactId, authoritiesToClaim(authorities));
    }

    public IssuedRefreshSession issue(String tokenType, String subject, Long userId, Long contactId, String authorities) {
        String rawToken = newRawToken();
        Instant now = Instant.now();

        RefreshSession session = new RefreshSession();
        session.setTokenHash(hash(rawToken));
        session.setTokenType(tokenType);
        session.setSubject(subject);
        session.setUserId(userId);
        session.setContactId(contactId);
        session.setAuthorities(authorities);
        session.setCreatedAt(now);
        session.setExpiresAt(now.plus(refreshValidityInSeconds, ChronoUnit.SECONDS));
        session.setLastUsedAt(now);

        return new IssuedRefreshSession(rawToken, refreshSessionRepository.save(session));
    }

    public IssuedRefreshSession rotate(String rawToken, String expectedTokenType) {
        RefreshSession current = findActive(rawToken, expectedTokenType);
        Instant now = Instant.now();
        current.setLastUsedAt(now);
        current.setRevokedAt(now);
        refreshSessionRepository.save(current);

        return issue(
            current.getTokenType(),
            current.getSubject(),
            current.getUserId(),
            current.getContactId(),
            current.getAuthorities()
        );
    }

    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        refreshSessionRepository
            .findOneByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(hash(rawToken), Instant.now())
            .ifPresent(session -> {
                Instant now = Instant.now();
                session.setLastUsedAt(now);
                session.setRevokedAt(now);
                refreshSessionRepository.save(session);
            });
    }

    @Transactional(readOnly = true)
    public String resolveRefreshToken(HttpServletRequest request, String bodyToken, String headerToken) {
        if (bodyToken != null && !bodyToken.isBlank()) {
            return bodyToken.trim();
        }
        if (headerToken != null && !headerToken.isBlank()) {
            return headerToken.trim();
        }
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (REFRESH_TOKEN_COOKIE.equals(cookie.getName()) && cookie.getValue() != null && !cookie.getValue().isBlank()) {
                return cookie.getValue().trim();
            }
        }
        return null;
    }

    public void addRefreshHeaders(HttpHeaders headers, String rawToken) {
        headers.add(HttpHeaders.SET_COOKIE, buildRefreshCookie(rawToken).toString());
        headers.add(REFRESH_TOKEN_HEADER, rawToken);
    }

    public void addDeleteRefreshCookie(HttpHeaders headers) {
        headers.add(
            HttpHeaders.SET_COOKIE,
            ResponseCookie
                .from(REFRESH_TOKEN_COOKIE, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path("/")
                .maxAge(0)
                .build()
                .toString()
        );
    }

    public long refreshValiditySeconds() {
        return refreshValidityInSeconds;
    }

    private RefreshSession findActive(String rawToken, String expectedTokenType) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new InvalidRefreshTokenException();
        }
        RefreshSession session = refreshSessionRepository
            .findOneByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(hash(rawToken), Instant.now())
            .orElseThrow(InvalidRefreshTokenException::new);
        if (!expectedTokenType.equals(session.getTokenType())) {
            throw new InvalidRefreshTokenException();
        }
        return session;
    }

    private ResponseCookie buildRefreshCookie(String rawToken) {
        return ResponseCookie
            .from(REFRESH_TOKEN_COOKIE, rawToken)
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ofSeconds(refreshValidityInSeconds))
            .build();
    }

    private String newRawToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to hash refresh token", ex);
        }
    }

    private String authoritiesToClaim(Collection<? extends GrantedAuthority> authorities) {
        return authorities.stream().map(GrantedAuthority::getAuthority).collect(Collectors.joining(" "));
    }

    public record IssuedRefreshSession(String rawToken, RefreshSession session) {}

    public static class InvalidRefreshTokenException extends RuntimeException {}
}
