package com.mercotrace.web.rest;

import static org.hamcrest.Matchers.*;
import static org.springframework.http.HttpHeaders.AUTHORIZATION;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.IntegrationTest;
import com.mercotrace.admin.identity.AdminAuthority;
import com.mercotrace.admin.identity.AdminUser;
import com.mercotrace.admin.identity.AdminUserRepository;
import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.web.rest.vm.LoginVM;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin authentication module tests for {@link AdminAuthResource}:
 * - POST /api/admin/auth/login
 * - GET  /api/admin/auth/me
 *
 * Positive and negative cases are covered for admin login and the
 * current-admin bootstrap payload. Run alone:
 * mvn test -Dtest=AdminAuthResourceTest (from server/).
 */
@AutoConfigureMockMvc
@IntegrationTest
@TestPropertySource(
    properties = {
        "application.security.cookie.secure=false",
        "jhipster.security.authentication.jwt.token-validity-in-seconds=86400",
        "jhipster.security.authentication.jwt.token-validity-in-seconds-for-remember-me=7776000",
    }
)
class AdminAuthResourceTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AdminUserRepository adminUserRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private com.mercotrace.admin.identity.AdminAuthorityRepository adminAuthorityRepository;

    @Test
    @Transactional
    void login_withValidAdminCredentials_returns200AndJwtAndUserPayload() throws Exception {
        AdminUser admin = createAdminUser(
            "admin-login",
            "admin-login@example.com",
            "strongpass",
            true,
            Set.of(AuthoritiesConstants.ADMIN)
        );

        LoginVM vm = new LoginVM();
        vm.setUsername(admin.getLogin());
        vm.setPassword("strongpass");
        vm.setRememberMe(true);

        mockMvc
            .perform(
                post("/api/admin/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token", not(isEmptyOrNullString())))
            .andExpect(jsonPath("$.user.username").value("admin-login"))
            .andExpect(jsonPath("$.user.role").value("ADMIN"))
            .andExpect(jsonPath("$.user.user_id").value(admin.getId().toString()))
            .andExpect(jsonPath("$.trader").isEmpty())
            .andExpect(header().string(AUTHORIZATION, not(isEmptyOrNullString())))
            .andExpect(header().string("Set-Cookie", containsString("ACCESS_TOKEN=")))
            .andExpect(header().string("Set-Cookie", containsString("Max-Age=86400")))
            .andExpect(header().string("Set-Cookie", not(containsString("Max-Age=7776000"))));
    }

    @Test
    void login_withShortPassword_returns400() throws Exception {
        LoginVM vm = new LoginVM();
        vm.setUsername("someone");
        vm.setPassword("short"); // 5 chars: passes @Size(min=4) but fails controller's >= 6 check

        mockMvc
            .perform(
                post("/api/admin/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isBadRequest());
    }

    @Test
    void login_withInvalidCredentials_returns401() throws Exception {
        LoginVM vm = new LoginVM();
        vm.setUsername("unknown-admin");
        vm.setPassword("doesnotmatter");

        mockMvc
            .perform(
                post("/api/admin/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isUnauthorized())
            .andExpect(header().doesNotExist(AUTHORIZATION));
    }

    @Test
    @Transactional
    void login_withNonAdminAuthorities_returns403() throws Exception {
        createAdminUser(
            "readonly-admin",
            "readonly-admin@example.com",
            "strongpass",
            true,
            Set.of("ROLE_ADMIN_DASHBOARD")
        );

        LoginVM vm = new LoginVM();
        vm.setUsername("readonly-admin");
        vm.setPassword("strongpass");

        mockMvc
            .perform(
                post("/api/admin/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isForbidden());
    }

    @Test
    void me_withoutToken_returns401() throws Exception {
        mockMvc.perform(get("/api/admin/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional
    void me_withValidAdminToken_returnsCurrentAdminPayload() throws Exception {
        AdminUser admin = createAdminUser(
            "admin-me",
            "admin-me@example.com",
            "strongpass",
            true,
            Set.of(AuthoritiesConstants.ADMIN)
        );

        LoginVM vm = new LoginVM();
        vm.setUsername("admin-me");
        vm.setPassword("strongpass");

        ResultActions loginResult = mockMvc
            .perform(
                post("/api/admin/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk());

        String authHeader = loginResult.andReturn().getResponse().getHeader(AUTHORIZATION);
        String token = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

        mockMvc
            .perform(get("/api/admin/auth/me").header(AUTHORIZATION, "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.username").value("admin-me"))
            .andExpect(jsonPath("$.user.role").value("ADMIN"))
            .andExpect(jsonPath("$.user.user_id").value(admin.getId().toString()))
            .andExpect(jsonPath("$.trader").isEmpty());
    }

    private AdminUser createAdminUser(
        String login,
        String email,
        String rawPassword,
        boolean activated,
        Set<String> authorityNames
    ) {
        AdminUser user = new AdminUser();
        user.setLogin(login);
        user.setEmail(email);
        user.setActivated(activated);
        user.setPassword(passwordEncoder.encode(rawPassword));

        if (authorityNames != null && !authorityNames.isEmpty()) {
            Set<AdminAuthority> authorities = authorityNames
                .stream()
                .map(name -> {
                    AdminAuthority authority = adminAuthorityRepository.findById(name).orElseGet(() -> {
                        AdminAuthority a = new AdminAuthority();
                        a.setName(name);
                        return adminAuthorityRepository.saveAndFlush(a);
                    });
                    return authority;
                })
                .collect(java.util.stream.Collectors.toSet());
            user.setAuthorities(authorities);
        }

        return adminUserRepository.saveAndFlush(user);
    }
}
