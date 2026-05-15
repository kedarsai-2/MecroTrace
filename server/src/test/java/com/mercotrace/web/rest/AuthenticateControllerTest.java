package com.mercotrace.web.rest;

import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.HttpHeaders.AUTHORIZATION;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.IntegrationTest;
import com.mercotrace.domain.RefreshSession;
import com.mercotrace.domain.User;
import com.mercotrace.repository.RefreshSessionRepository;
import com.mercotrace.repository.UserRepository;
import com.mercotrace.security.SecurityUtils;
import com.mercotrace.service.AuthRefreshSessionService;
import com.mercotrace.web.rest.vm.LoginVM;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Login module tests for {@link AuthenticateController}: POST /api/authenticate (login),
 * GET /api/authenticate (isAuthenticated). Positive and negative cases.
 * Run alone: mvn test -Dtest=AuthenticateControllerTest
 */
@AutoConfigureMockMvc
@IntegrationTest
@TestPropertySource(properties = "application.security.refresh-token-rotation-grace-seconds=1")
class AuthenticateControllerTest {

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private AuthRefreshSessionService refreshSessionService;

    // ----- POST /api/authenticate (login) - positive -----

    @Test
    @Transactional
    void login_withValidCredentials_returns200() throws Exception {
        User user = new User();
        user.setLogin("login-valid");
        user.setEmail("login-valid@example.com");
        user.setActivated(true);
        user.setPassword(passwordEncoder.encode("validpass"));

        userRepository.saveAndFlush(user);

        LoginVM login = new LoginVM();
        login.setUsername("login-valid");
        login.setPassword("validpass");

        mockMvc
            .perform(
                post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(login))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id_token").isString())
            .andExpect(jsonPath("$.id_token").value(not(emptyString())))
            .andExpect(header().string(AUTHORIZATION, not(nullValue())))
            .andExpect(header().string(AUTHORIZATION, not(emptyString())));
    }

    @Test
    @Transactional
    void login_withValidCredentialsAndRememberMe_returns200() throws Exception {
        User user = new User();
        user.setLogin("login-remember");
        user.setEmail("login-remember@example.com");
        user.setActivated(true);
        user.setPassword(passwordEncoder.encode("validpass"));

        userRepository.saveAndFlush(user);

        LoginVM login = new LoginVM();
        login.setUsername("login-remember");
        login.setPassword("validpass");
        login.setRememberMe(true);

        mockMvc
            .perform(
                post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(login))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id_token").isString())
            .andExpect(jsonPath("$.id_token").value(not(emptyString())))
            .andExpect(header().string(AUTHORIZATION, not(nullValue())));
    }

    // ----- POST /api/authenticate (login) - negative -----

    @Test
    void login_withInvalidPassword_returns401() throws Exception {
        LoginVM login = new LoginVM();
        login.setUsername("wrong-user");
        login.setPassword("wrong-password");

        mockMvc
            .perform(
                post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(login))
            )
            .andExpect(status().isUnauthorized())
            .andExpect(header().doesNotExist(AUTHORIZATION));
    }

    @Test
    @Transactional
    void login_withDisabledUser_returns401() throws Exception {
        User user = new User();
        user.setLogin("login-disabled");
        user.setEmail("login-disabled@example.com");
        user.setActivated(false);
        user.setPassword(passwordEncoder.encode("validpass"));

        userRepository.saveAndFlush(user);

        LoginVM login = new LoginVM();
        login.setUsername("login-disabled");
        login.setPassword("validpass");

        mockMvc
            .perform(
                post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(login))
            )
            .andExpect(status().isUnauthorized());
    }

    @Test
    void login_withMissingUsername_returns400() throws Exception {
        String json = "{\"password\":\"validpass123\",\"rememberMe\":false}";

        mockMvc
            .perform(post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(json))
            .andExpect(status().isBadRequest());
    }

    @Test
    void login_withEmptyUsername_returns400() throws Exception {
        LoginVM login = new LoginVM();
        login.setUsername("");
        login.setPassword("validpass123");

        mockMvc
            .perform(
                post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(login))
            )
            .andExpect(status().isBadRequest());
    }

    @Test
    void login_withShortPassword_returns400() throws Exception {
        LoginVM login = new LoginVM();
        login.setUsername("someuser");
        login.setPassword("abc"); // min is 4

        mockMvc
            .perform(
                post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(login))
            )
            .andExpect(status().isBadRequest());
    }

    @Test
    void login_withMissingPassword_returns400() throws Exception {
        String json = "{\"username\":\"someuser\",\"rememberMe\":false}";

        mockMvc
            .perform(post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(json))
            .andExpect(status().isBadRequest());
    }

    // ----- GET /api/authenticate (isAuthenticated) -----

    @Test
    void isAuthenticated_withoutCredentials_returns401() throws Exception {
        mockMvc.perform(get("/api/authenticate")).andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional
    void isAuthenticated_withValidToken_returns204() throws Exception {
        User user = new User();
        user.setLogin("login-check");
        user.setEmail("login-check@example.com");
        user.setActivated(true);
        user.setPassword(passwordEncoder.encode("validpass"));

        userRepository.saveAndFlush(user);

        LoginVM login = new LoginVM();
        login.setUsername("login-check");
        login.setPassword("validpass");

        ResultActions loginResult = mockMvc
            .perform(
                post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(login))
            )
            .andExpect(status().isOk());

        String authHeader = loginResult.andReturn().getResponse().getHeader(AUTHORIZATION);
        String token = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

        mockMvc.perform(get("/api/authenticate").header(AUTHORIZATION, "Bearer " + token)).andExpect(status().isNoContent());
    }

    @Test
    @Transactional
    void refresh_withJustRotatedTraderTokenWithinGrace_returnsFreshTokens() throws Exception {
        createActivatedUser("refresh-grace", "refresh-grace@example.com", "validpass");
        String oldRefreshToken = loginAndReturnRefreshToken("refresh-grace", "validpass");

        ResultActions firstRefresh = mockMvc
            .perform(post("/api/auth/refresh").header(AuthRefreshSessionService.REFRESH_TOKEN_HEADER, oldRefreshToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id_token").isString())
            .andExpect(jsonPath("$.refresh_token").isString());
        String firstRotatedToken = refreshTokenFrom(firstRefresh);

        ResultActions duplicateRefresh = mockMvc
            .perform(post("/api/auth/refresh").header(AuthRefreshSessionService.REFRESH_TOKEN_HEADER, oldRefreshToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id_token").isString())
            .andExpect(jsonPath("$.refresh_token").isString());
        String duplicateRotatedToken = refreshTokenFrom(duplicateRefresh);

        org.assertj.core.api.Assertions.assertThat(firstRotatedToken).isNotBlank().isNotEqualTo(oldRefreshToken);
        org.assertj.core.api.Assertions
            .assertThat(duplicateRotatedToken)
            .isNotBlank()
            .isNotEqualTo(oldRefreshToken)
            .isNotEqualTo(firstRotatedToken);
    }

    @Test
    @Transactional
    void refresh_withRotatedTraderTokenAfterGrace_returns401() throws Exception {
        createActivatedUser("refresh-expired-grace", "refresh-expired-grace@example.com", "validpass");
        String oldRefreshToken = loginAndReturnRefreshToken("refresh-expired-grace", "validpass");

        mockMvc
            .perform(post("/api/auth/refresh").header(AuthRefreshSessionService.REFRESH_TOKEN_HEADER, oldRefreshToken))
            .andExpect(status().isOk());

        RefreshSession revokedSession = refreshSessionRepository
            .findAll()
            .stream()
            .filter(session -> "refresh-expired-grace".equals(session.getSubject()))
            .filter(session -> session.getRevokedAt() != null)
            .findFirst()
            .orElseThrow();
        revokedSession.setRevokedAt(Instant.now().minusSeconds(5));
        refreshSessionRepository.saveAndFlush(revokedSession);

        mockMvc
            .perform(post("/api/auth/refresh").header(AuthRefreshSessionService.REFRESH_TOKEN_HEADER, oldRefreshToken))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional
    void refresh_withContactRefreshTokenOnTraderEndpoint_returns401() throws Exception {
        AuthRefreshSessionService.IssuedRefreshSession contactSession = refreshSessionService.issue(
            SecurityUtils.TOKEN_TYPE_CONTACT,
            "9876543210",
            null,
            null,
            Set.of(new SimpleGrantedAuthority("ROLE_CONTACT"))
        );

        mockMvc
            .perform(post("/api/auth/refresh").header(AuthRefreshSessionService.REFRESH_TOKEN_HEADER, contactSession.rawToken()))
            .andExpect(status().isUnauthorized());
    }

    private User createActivatedUser(String login, String email, String rawPassword) {
        User user = new User();
        user.setLogin(login);
        user.setEmail(email);
        user.setActivated(true);
        user.setPassword(passwordEncoder.encode(rawPassword));
        return userRepository.saveAndFlush(user);
    }

    private String loginAndReturnRefreshToken(String username, String password) throws Exception {
        LoginVM login = new LoginVM();
        login.setUsername(username);
        login.setPassword(password);

        ResultActions loginResult = mockMvc
            .perform(post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(login)))
            .andExpect(status().isOk());

        return refreshTokenFrom(loginResult);
    }

    private String refreshTokenFrom(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("refresh_token").asText();
    }
}
