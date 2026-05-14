package com.mercotrace.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.mercotrace.domain.RefreshSession;
import com.mercotrace.repository.RefreshSessionRepository;
import com.mercotrace.security.SecurityUtils;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class AuthRefreshSessionServiceTest {

    @Mock
    private RefreshSessionRepository refreshSessionRepository;

    private AuthRefreshSessionService refreshSessionService;

    @BeforeEach
    void setUp() {
        refreshSessionService = new AuthRefreshSessionService(refreshSessionRepository);
        ReflectionTestUtils.setField(refreshSessionService, "refreshValidityInSeconds", 7_776_000L);
        ReflectionTestUtils.setField(refreshSessionService, "refreshTokenRotationGraceSeconds", 15L);
        when(refreshSessionRepository.save(any(RefreshSession.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void rotate_allowsDuplicateRefreshWithinGraceAndIssuesFreshToken() {
        AuthRefreshSessionService.IssuedRefreshSession issued = issueTraderSession();
        when(refreshSessionRepository.findOneByTokenHashAndExpiresAtAfter(any(), any())).thenReturn(Optional.of(issued.session()));

        AuthRefreshSessionService.IssuedRefreshSession firstRotation = refreshSessionService.rotate(
            issued.rawToken(),
            SecurityUtils.TOKEN_TYPE_TRADER
        );
        AuthRefreshSessionService.IssuedRefreshSession duplicateRotation = refreshSessionService.rotate(
            issued.rawToken(),
            SecurityUtils.TOKEN_TYPE_TRADER
        );

        assertThat(issued.session().getRevokedAt()).isNotNull();
        assertThat(firstRotation.rawToken()).isNotBlank().isNotEqualTo(issued.rawToken());
        assertThat(duplicateRotation.rawToken())
            .isNotBlank()
            .isNotEqualTo(issued.rawToken())
            .isNotEqualTo(firstRotation.rawToken());
    }

    @Test
    void rotate_rejectsDuplicateRefreshAfterGrace() {
        AuthRefreshSessionService.IssuedRefreshSession issued = issueTraderSession();
        Instant rotatedAt = Instant.now().minusSeconds(16);
        issued.session().setLastUsedAt(rotatedAt);
        issued.session().setRevokedAt(rotatedAt);
        when(refreshSessionRepository.findOneByTokenHashAndExpiresAtAfter(any(), any())).thenReturn(Optional.of(issued.session()));

        assertThatThrownBy(() -> refreshSessionService.rotate(issued.rawToken(), SecurityUtils.TOKEN_TYPE_TRADER))
            .isInstanceOf(AuthRefreshSessionService.InvalidRefreshTokenException.class);
    }

    @Test
    void rotate_rejectsExplicitlyRevokedTokenWithinGrace() {
        AuthRefreshSessionService.IssuedRefreshSession issued = issueTraderSession();
        when(refreshSessionRepository.findOneByTokenHashAndRevokedAtIsNullAndExpiresAtAfter(any(), any()))
            .thenReturn(Optional.of(issued.session()));

        refreshSessionService.revoke(issued.rawToken());

        assertThat(issued.session().getLastUsedAt()).isNull();
        assertThat(issued.session().getRevokedAt()).isNotNull();
        when(refreshSessionRepository.findOneByTokenHashAndExpiresAtAfter(any(), any())).thenReturn(Optional.of(issued.session()));

        assertThatThrownBy(() -> refreshSessionService.rotate(issued.rawToken(), SecurityUtils.TOKEN_TYPE_TRADER))
            .isInstanceOf(AuthRefreshSessionService.InvalidRefreshTokenException.class);
    }

    @Test
    void rotate_rejectsWrongTokenTypeEvenWithinGrace() {
        AuthRefreshSessionService.IssuedRefreshSession issued = refreshSessionService.issue(
            SecurityUtils.TOKEN_TYPE_CONTACT,
            "9876543210",
            null,
            null,
            Set.of(new SimpleGrantedAuthority("ROLE_CONTACT"))
        );
        issued.session().setRevokedAt(Instant.now());
        when(refreshSessionRepository.findOneByTokenHashAndExpiresAtAfter(any(), any())).thenReturn(Optional.of(issued.session()));

        assertThatThrownBy(() -> refreshSessionService.rotate(issued.rawToken(), SecurityUtils.TOKEN_TYPE_TRADER))
            .isInstanceOf(AuthRefreshSessionService.InvalidRefreshTokenException.class);
    }

    private AuthRefreshSessionService.IssuedRefreshSession issueTraderSession() {
        return refreshSessionService.issue(
            SecurityUtils.TOKEN_TYPE_TRADER,
            "trader-user",
            1L,
            null,
            Set.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
    }
}
