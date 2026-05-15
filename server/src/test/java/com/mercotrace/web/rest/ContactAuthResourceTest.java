package com.mercotrace.web.rest;

import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.http.HttpHeaders.AUTHORIZATION;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mercotrace.IntegrationTest;
import com.mercotrace.domain.Contact;
import com.mercotrace.domain.ContactOtpToken;
import com.mercotrace.repository.ContactOtpTokenRepository;
import com.mercotrace.repository.ContactRepository;
import com.mercotrace.security.SecurityUtils;
import com.mercotrace.service.AuthRefreshSessionService;
import com.mercotrace.web.rest.vm.ContactOtpRequestVM;
import com.mercotrace.web.rest.vm.ContactOtpVerifyVM;
import com.mercotrace.web.rest.vm.ContactRegisterVM;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contact Portal auth tests for {@link ContactAuthResource}:
 * - POST /api/auth/register-contact
 * - POST /api/portal/auth/login
 * - POST /api/portal/auth/otp/request
 * - POST /api/portal/auth/otp/verify
 * - GET  /api/portal/me
 *
 * Positive and negative cases are covered for registration, password login,
 * OTP flows and CONTACT JWT bootstrap.
 */
@AutoConfigureMockMvc
@IntegrationTest
@TestPropertySource(
    properties = {
        "otp.fast2sms.api-key=test-otp-api-key",
        "application.security.cookie.secure=false",
        "jhipster.security.authentication.jwt.token-validity-in-seconds=86400",
        "jhipster.security.authentication.jwt.token-validity-in-seconds-for-remember-me=7776000",
    }
)
class ContactAuthResourceTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ContactRepository contactRepository;

    @Autowired
    private ContactOtpTokenRepository contactOtpTokenRepository;

    @Autowired
    private ContactAuthResource contactAuthResource;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtDecoder jwtDecoder;

    // ----- POST /api/auth/register-contact (self-onboarding) -----

    @Test
    @Transactional
    void registerContact_withValidPayload_createsNewLoginCapableContact_andReturns201() throws Exception {
        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("98765 43210");
        vm.setPassword("strongpass");
        vm.setEmail("User@Example.com");
        vm.setName("  Jane Contact  ");
        vm.setMark("VENDOR1");

        ResultActions result = mockMvc
            .perform(
                post("/api/auth/register-contact")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").isNumber())
            .andExpect(jsonPath("$.phone").value("9876543210"))
            .andExpect(jsonPath("$.email").value("user@example.com"))
            .andExpect(jsonPath("$.canLogin").value(true))
            .andExpect(header().string(AUTHORIZATION, not(nullValue())))
            .andExpect(header().string(AUTHORIZATION, not(emptyString())))
            .andExpect(header().string("Set-Cookie", not(emptyString())))
            .andExpect(header().string("Set-Cookie", containsString("Max-Age=7776000")));

        Long contactId = contactRepository.findOneByPhone("9876543210").map(Contact::getId).orElseThrow();

        Contact persisted = contactRepository.findById(contactId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(persisted.getCanLogin()).isTrue();
        org.assertj.core.api.Assertions.assertThat(persisted.getPasswordHash()).isNotBlank();
        org.assertj.core.api.Assertions.assertThat(persisted.getOpeningBalance()).isNotNull();
        org.assertj.core.api.Assertions.assertThat(persisted.getCurrentBalance()).isNotNull();
        org.assertj.core.api.Assertions.assertThat(persisted.getEmail()).isEqualTo("user@example.com");
        org.assertj.core.api.Assertions.assertThat(persisted.getName()).isEqualTo("Jane Contact");
    }

    @Test
    @Transactional
    void registerContact_withExistingNonLoginContact_upgradesToLoginCapable_andReusesContact() throws Exception {
        Contact existing = new Contact();
        existing.setPhone("9876543210");
        existing.setName("Existing Contact");
        existing.setOpeningBalance(BigDecimal.ZERO);
        existing.setCurrentBalance(BigDecimal.ZERO);
        existing.setCanLogin(false);
        existing.setCreatedAt(Instant.parse("2024-01-01T00:00:00Z"));

        existing = contactRepository.saveAndFlush(existing);
        Long originalId = existing.getId();

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("newstrongpass");
        vm.setMark("UPGRADE1");

        mockMvc
            .perform(
                post("/api/auth/register-contact")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(originalId))
            .andExpect(jsonPath("$.phone").value("9876543210"))
            .andExpect(jsonPath("$.canLogin").value(true));

        Contact upgraded = contactRepository.findById(originalId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(upgraded.getCanLogin()).isTrue();
        org.assertj.core.api.Assertions.assertThat(upgraded.getPasswordHash()).isNotBlank();
        org.assertj.core.api.Assertions.assertThat(upgraded.getCreatedAt()).isEqualTo(Instant.parse("2024-01-01T00:00:00Z"));
    }

    @Test
    @Transactional
    void registerContact_withExistingLoginCapablePhone_returns409() throws Exception {
        Contact existing = new Contact();
        existing.setPhone("9876543210");
        existing.setName("Login Enabled");
        existing.setOpeningBalance(BigDecimal.ZERO);
        existing.setCurrentBalance(BigDecimal.ZERO);
        existing.setPasswordHash("hash");
        existing.setCanLogin(true);
        contactRepository.saveAndFlush(existing);

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("anotherpass");
        vm.setMark("OTHER1");

        mockMvc
            .perform(
                post("/api/auth/register-contact")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isConflict());
    }

    @Test
    @Transactional
    void registerContact_withExistingLoginCapableEmail_returns409() throws Exception {
        Contact existing = new Contact();
        existing.setPhone("9876543210");
        existing.setEmail("existing@example.com");
        existing.setName("Login Enabled");
        existing.setOpeningBalance(BigDecimal.ZERO);
        existing.setCurrentBalance(BigDecimal.ZERO);
        existing.setPasswordHash("hash");
        existing.setCanLogin(true);
        contactRepository.saveAndFlush(existing);

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543211");
        vm.setPassword("anotherpass");
        vm.setEmail("Existing@Example.com");
        vm.setMark("EMAILDUP1");

        mockMvc
            .perform(
                post("/api/auth/register-contact")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isConflict());
    }

    @Test
    @Transactional
    void registerContact_withDuplicateMark_returns409() throws Exception {
        Contact existing = new Contact();
        existing.setPhone("9876543210");
        existing.setName("First Contact");
        existing.setMark("DUPMARK");
        existing.setOpeningBalance(BigDecimal.ZERO);
        existing.setCurrentBalance(BigDecimal.ZERO);
        existing.setCanLogin(false);
        existing.setCreatedAt(Instant.now());
        contactRepository.saveAndFlush(existing);

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543211");
        vm.setPassword("strongpass");
        vm.setMark("DUPMARK");

        mockMvc
            .perform(
                post("/api/auth/register-contact")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isConflict());
    }

    @Test
    void registerContact_withoutMark_returns400() throws Exception {
        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("strongpass");

        mockMvc
            .perform(
                post("/api/auth/register-contact")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isBadRequest());
    }

    @Test
    void registerContact_withShortPassword_returns400() throws Exception {
        String json = """
            {
              "phone": "9876543210",
              "password": "short"
            }
            """;

        mockMvc
            .perform(post("/api/auth/register-contact").contentType(MediaType.APPLICATION_JSON).content(json))
            .andExpect(status().isBadRequest());
    }

    @Test
    void registerContact_withInvalidPhone_returns400() throws Exception {
        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("12345");
        vm.setPassword("strongpass");

        mockMvc
            .perform(
                post("/api/auth/register-contact")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isBadRequest());
    }

    // ----- POST /api/portal/auth/login (password login) -----

    @Test
    @Transactional
    void login_withValidPhone_returns200AndJwt() throws Exception {
        Contact contact = createLoginCapableContact("9876543210", "login-phone@example.com", "strongpass");

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("strongpass");

        mockMvc
            .perform(
                post("/api/portal/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(contact.getId()))
            .andExpect(jsonPath("$.phone").value("9876543210"))
            .andExpect(jsonPath("$.email").value("login-phone@example.com"))
            .andExpect(header().string(AUTHORIZATION, not(nullValue())))
            .andExpect(header().string(AUTHORIZATION, not(emptyString())))
            .andExpect(header().string("Set-Cookie", not(emptyString())))
            .andExpect(header().string("Set-Cookie", containsString("Max-Age=7776000")));
    }

    @Test
    @Transactional
    void login_withValidEmail_returns200AndJwt() throws Exception {
        Contact contact = createLoginCapableContact("9876543210", "login-email@example.com", "strongpass");

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("login-email@example.com");
        vm.setPassword("strongpass");

        mockMvc
            .perform(
                post("/api/portal/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(contact.getId()))
            .andExpect(jsonPath("$.phone").value("9876543210"))
            .andExpect(jsonPath("$.email").value("login-email@example.com"))
            .andExpect(header().string(AUTHORIZATION, not(nullValue())));
    }

    @Test
    @Transactional
    void login_withWrongPassword_returns401() throws Exception {
        createLoginCapableContact("9876543210", "wrong-pass@example.com", "strongpass");

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("incorrect");

        mockMvc
            .perform(
                post("/api/portal/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isUnauthorized())
            .andExpect(header().doesNotExist(AUTHORIZATION));
    }

    @Test
    void login_withUnknownIdentifier_returns401() throws Exception {
        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9999999999");
        vm.setPassword("somepass");

        mockMvc
            .perform(
                post("/api/portal/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional
    void login_withDisabledContact_returns401() throws Exception {
        Contact contact = new Contact();
        contact.setPhone("9876543210");
        contact.setEmail("disabled@example.com");
        contact.setName("Disabled");
        contact.setOpeningBalance(BigDecimal.ZERO);
        contact.setCurrentBalance(BigDecimal.ZERO);
        contact.setPasswordHash("$2a$10$abcdefghijklmnopqrstuv"); // dummy hash
        contact.setCanLogin(false);
        contact = contactRepository.saveAndFlush(contact);

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("ignoredpass");

        mockMvc
            .perform(
                post("/api/portal/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional
    void refresh_withJustRotatedContactTokenWithinGrace_returnsFreshTokens() throws Exception {
        createLoginCapableContact("9876543210", "contact-refresh@example.com", "strongpass");

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("strongpass");

        ResultActions loginResult = mockMvc
            .perform(
                post("/api/portal/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk());
        String oldRefreshToken = loginResult.andReturn().getResponse().getHeader(AuthRefreshSessionService.REFRESH_TOKEN_HEADER);

        ResultActions firstRefresh = mockMvc
            .perform(post("/api/portal/auth/refresh").header(AuthRefreshSessionService.REFRESH_TOKEN_HEADER, oldRefreshToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isString())
            .andExpect(jsonPath("$.refresh_token").isString());
        String firstRotatedToken = objectMapper.readTree(firstRefresh.andReturn().getResponse().getContentAsString()).get("refresh_token").asText();

        ResultActions duplicateRefresh = mockMvc
            .perform(post("/api/portal/auth/refresh").header(AuthRefreshSessionService.REFRESH_TOKEN_HEADER, oldRefreshToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").isString())
            .andExpect(jsonPath("$.refresh_token").isString());
        String duplicateRotatedToken = objectMapper
            .readTree(duplicateRefresh.andReturn().getResponse().getContentAsString())
            .get("refresh_token")
            .asText();

        org.assertj.core.api.Assertions.assertThat(firstRotatedToken).isNotBlank().isNotEqualTo(oldRefreshToken);
        org.assertj.core.api.Assertions
            .assertThat(duplicateRotatedToken)
            .isNotBlank()
            .isNotEqualTo(oldRefreshToken)
            .isNotEqualTo(firstRotatedToken);
    }

    // ----- OTP request & verify -----

    @Test
    @Transactional
    void requestOtp_withValidLoginCapableContact_persistsToken_andReturns200() throws Exception {
        createLoginCapableContact("9876543210", "otp@example.com", "strongpass");

        ContactOtpRequestVM vm = new ContactOtpRequestVM();
        vm.setIdentifier("9876543210");

        mockMvc
            .perform(
                post("/api/portal/auth/otp/request")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("OK"));

        long tokenCount = contactOtpTokenRepository.count();
        org.assertj.core.api.Assertions.assertThat(tokenCount).isGreaterThanOrEqualTo(1);
    }

    @Test
    @Transactional
    void requestOtp_withUnregisteredPhone_stillPersistsToken_andReturns200() throws Exception {
        ContactOtpRequestVM vm = new ContactOtpRequestVM();
        vm.setIdentifier("9876543210");

        mockMvc
            .perform(
                post("/api/portal/auth/otp/request")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("OK"));

        long tokenCount = contactOtpTokenRepository.count();
        org.assertj.core.api.Assertions.assertThat(tokenCount).isGreaterThanOrEqualTo(1);
    }

    @Test
    void requestOtp_withMissingIdentifier_returns400() throws Exception {
        String json = """
            {
              "identifier": ""
            }
            """;

        mockMvc
            .perform(post("/api/portal/auth/otp/request").contentType(MediaType.APPLICATION_JSON).content(json))
            .andExpect(status().isBadRequest());
    }

    @Test
    @Transactional
    void requestOtp_whenOtpProviderNotConfigured_returns503() throws Exception {
        Object original = ReflectionTestUtils.getField(contactAuthResource, "otpApiKey");
        ReflectionTestUtils.setField(contactAuthResource, "otpApiKey", "");
        try {
            createLoginCapableContact("9876543210", "otp-no-provider@example.com", "strongpass");

            ContactOtpRequestVM vm = new ContactOtpRequestVM();
            vm.setIdentifier("9876543210");

            mockMvc
                .perform(
                    post("/api/portal/auth/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(vm))
                )
                .andExpect(status().isServiceUnavailable());
        } finally {
            ReflectionTestUtils.setField(contactAuthResource, "otpApiKey", original);
        }
    }

    @Test
    @Transactional
    void verifyOtp_withValidCode_forExistingContact_issuesContactJwt_andMarksTokenConsumed() throws Exception {
        Contact contact = createLoginCapableContact("9876543210", "otp-verify@example.com", "strongpass");

        ContactOtpToken token = new ContactOtpToken();
        token.setMobile("9876543210");
        token.setCode("1234");
        token.setCreatedAt(Instant.now().minusSeconds(10));
        token.setExpiresAt(Instant.now().plusSeconds(300));
        token.setAttempts(0);
        token.setMaxAttempts(5);
        token.setLastRequestIp("127.0.0.1");
        token.setConsumedAt(null);
        token = contactOtpTokenRepository.saveAndFlush(token);

        ContactOtpVerifyVM vm = new ContactOtpVerifyVM();
        vm.setIdentifier("9876543210");
        vm.setOtp("1234");

        mockMvc
            .perform(
                post("/api/portal/auth/otp/verify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.guest").value(false))
            .andExpect(jsonPath("$.phone").value("9876543210"))
            .andExpect(jsonPath("$.contact.id").value(contact.getId()))
            .andExpect(header().string(AUTHORIZATION, not(nullValue())))
            .andExpect(header().string(AUTHORIZATION, not(emptyString())))
            .andExpect(header().string("Set-Cookie", not(emptyString())))
            .andExpect(header().string("Set-Cookie", containsString("Max-Age=7776000")));

        ContactOtpToken refreshed = contactOtpTokenRepository.findById(token.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(refreshed.getConsumedAt()).isNotNull();
        org.assertj.core.api.Assertions.assertThat(refreshed.getAttempts()).isGreaterThanOrEqualTo(1);
    }

    @Test
    @Transactional
    void verifyOtp_withInvalidCode_returns400_andIncrementsAttempts() throws Exception {
        createLoginCapableContact("9876543210", "otp-invalid@example.com", "strongpass");

        ContactOtpToken token = new ContactOtpToken();
        token.setMobile("9876543210");
        token.setCode("1234");
        token.setCreatedAt(Instant.now().minusSeconds(10));
        token.setExpiresAt(Instant.now().plusSeconds(300));
        token.setAttempts(0);
        token.setMaxAttempts(5);
        token.setLastRequestIp("127.0.0.1");
        token.setConsumedAt(null);
        token = contactOtpTokenRepository.saveAndFlush(token);

        ContactOtpVerifyVM vm = new ContactOtpVerifyVM();
        vm.setIdentifier("9876543210");
        vm.setOtp("0000");

        mockMvc
            .perform(
                post("/api/portal/auth/otp/verify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isBadRequest());

        ContactOtpToken refreshed = contactOtpTokenRepository.findById(token.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(refreshed.getAttempts()).isEqualTo(1);
    }

    @Test
    @Transactional
    void verifyOtp_withTooManyAttempts_returns429_andMarksTokenConsumed() throws Exception {
        createLoginCapableContact("9876543210", "otp-too-many@example.com", "strongpass");

        ContactOtpToken token = new ContactOtpToken();
        token.setMobile("9876543210");
        token.setCode("1234");
        token.setCreatedAt(Instant.now().minusSeconds(10));
        token.setExpiresAt(Instant.now().plusSeconds(300));
        token.setAttempts(5);
        token.setMaxAttempts(5);
        token.setLastRequestIp("127.0.0.1");
        token.setConsumedAt(null);
        token = contactOtpTokenRepository.saveAndFlush(token);

        ContactOtpVerifyVM vm = new ContactOtpVerifyVM();
        vm.setIdentifier("9876543210");
        vm.setOtp("1234");

        mockMvc
            .perform(
                post("/api/portal/auth/otp/verify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isTooManyRequests());

        ContactOtpToken refreshed = contactOtpTokenRepository.findById(token.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(refreshed.getConsumedAt()).isNotNull();
    }

    @Test
    void verifyOtp_withMissingIdentifier_returns400() throws Exception {
        String json = """
            {
              "identifier": "",
              "otp": "1234"
            }
            """;

        mockMvc
            .perform(post("/api/portal/auth/otp/verify").contentType(MediaType.APPLICATION_JSON).content(json))
            .andExpect(status().isBadRequest());
    }

    @Test
    @Transactional
    void verifyOtp_withValidCode_forUnregisteredPhone_issuesGuestJwt_andMarksTokenConsumed() throws Exception {
        ContactOtpToken token = new ContactOtpToken();
        token.setMobile("9876543210");
        token.setCode("1234");
        token.setCreatedAt(Instant.now().minusSeconds(10));
        token.setExpiresAt(Instant.now().plusSeconds(300));
        token.setAttempts(0);
        token.setMaxAttempts(5);
        token.setLastRequestIp("127.0.0.1");
        token.setConsumedAt(null);
        token = contactOtpTokenRepository.saveAndFlush(token);

        ContactOtpVerifyVM vm = new ContactOtpVerifyVM();
        vm.setIdentifier("9876543210");
        vm.setOtp("1234");

        ResultActions verifyResult = mockMvc
            .perform(
                post("/api/portal/auth/otp/verify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.guest").value(true))
            .andExpect(jsonPath("$.phone").value("9876543210"))
            .andExpect(jsonPath("$.contact").doesNotExist())
            .andExpect(header().string(AUTHORIZATION, not(nullValue())))
            .andExpect(header().string(AUTHORIZATION, not(emptyString())))
            .andExpect(header().string("Set-Cookie", not(emptyString())))
            .andExpect(header().string("Set-Cookie", containsString("Max-Age=7776000")));

        ContactOtpToken refreshed = contactOtpTokenRepository.findById(token.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(refreshed.getConsumedAt()).isNotNull();
        org.assertj.core.api.Assertions.assertThat(refreshed.getAttempts()).isGreaterThanOrEqualTo(1);

        String authHeader = verifyResult.andReturn().getResponse().getHeader(AUTHORIZATION);
        String jwtToken = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
        Jwt jwt = jwtDecoder.decode(jwtToken);
        String authorities = jwt.getClaimAsString(SecurityUtils.AUTHORITIES_CLAIM);
        Object contactIdClaim = jwt.getClaim(SecurityUtils.CONTACT_ID_CLAIM);

        org.assertj.core.api.Assertions.assertThat(authorities).isEqualTo("ROLE_CONTACT_GUEST");
        org.assertj.core.api.Assertions.assertThat(contactIdClaim).isNull();
        org.assertj.core.api.Assertions.assertThat(contactRepository.findOneByPhone("9876543210")).isEmpty();
    }

    // ----- GET /api/portal/me -----

    @Test
    @Transactional
    void me_withValidContactToken_returnsCurrentContact() throws Exception {
        Contact contact = createLoginCapableContact("9876543210", "me@example.com", "strongpass");

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("strongpass");

        ResultActions loginResult = mockMvc
            .perform(
                post("/api/portal/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk());

        String authHeader = loginResult.andReturn().getResponse().getHeader(AUTHORIZATION);
        String token = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

        mockMvc
            .perform(get("/api/portal/me").header(AUTHORIZATION, "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(contact.getId()))
            .andExpect(jsonPath("$.phone").value("9876543210"))
            .andExpect(jsonPath("$.email").value("me@example.com"));
    }

    // ----- GET /api/portal/session -----

    @Test
    @Transactional
    void session_withContactToken_returnsNonGuestSession() throws Exception {
        Contact contact = createLoginCapableContact("9876543210", "session@example.com", "strongpass");

        ContactRegisterVM vm = new ContactRegisterVM();
        vm.setPhone("9876543210");
        vm.setPassword("strongpass");

        ResultActions loginResult = mockMvc
            .perform(
                post("/api/portal/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk());

        String authHeader = loginResult.andReturn().getResponse().getHeader(AUTHORIZATION);
        String token = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

        mockMvc
            .perform(get("/api/portal/session").header(AUTHORIZATION, "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.guest").value(false))
            .andExpect(jsonPath("$.phone").value("9876543210"))
            .andExpect(jsonPath("$.contact.id").value(contact.getId()));
    }

    @Test
    @Transactional
    void session_withGuestToken_returnsGuestSessionWithoutContact() throws Exception {
        ContactOtpToken token = new ContactOtpToken();
        token.setMobile("9876543210");
        token.setCode("1234");
        token.setCreatedAt(Instant.now().minusSeconds(10));
        token.setExpiresAt(Instant.now().plusSeconds(300));
        token.setAttempts(0);
        token.setMaxAttempts(5);
        token.setLastRequestIp("127.0.0.1");
        token.setConsumedAt(null);
        contactOtpTokenRepository.saveAndFlush(token);

        ContactOtpVerifyVM vm = new ContactOtpVerifyVM();
        vm.setIdentifier("9876543210");
        vm.setOtp("1234");

        ResultActions verifyResult = mockMvc
            .perform(
                post("/api/portal/auth/otp/verify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.guest").value(true))
            .andExpect(jsonPath("$.phone").value("9876543210"));

        String authHeader = verifyResult.andReturn().getResponse().getHeader(AUTHORIZATION);
        String jwtToken = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

        ResultActions sessionResult = mockMvc
            .perform(get("/api/portal/session").header(AUTHORIZATION, "Bearer " + jwtToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.guest").value(true))
            .andExpect(jsonPath("$.phone").value("9876543210"));

        String sessionBody = sessionResult.andReturn().getResponse().getContentAsString();
        JsonNode sessionJson = objectMapper.readTree(sessionBody);
        org.assertj.core.api.Assertions.assertThat(sessionJson.get("contact").isNull()).isTrue();
    }

    @Test
    @Transactional
    void portalData_withGuestToken_cannotAccessContactOnlyEndpoints() throws Exception {
        ContactOtpToken token = new ContactOtpToken();
        token.setMobile("9876543210");
        token.setCode("1234");
        token.setCreatedAt(Instant.now().minusSeconds(10));
        token.setExpiresAt(Instant.now().plusSeconds(300));
        token.setAttempts(0);
        token.setMaxAttempts(5);
        token.setLastRequestIp("127.0.0.1");
        token.setConsumedAt(null);
        contactOtpTokenRepository.saveAndFlush(token);

        ContactOtpVerifyVM vm = new ContactOtpVerifyVM();
        vm.setIdentifier("9876543210");
        vm.setOtp("1234");

        ResultActions verifyResult = mockMvc
            .perform(
                post("/api/portal/auth/otp/verify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsBytes(vm))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.guest").value(true));

        String authHeader = verifyResult.andReturn().getResponse().getHeader(AUTHORIZATION);
        String jwtToken = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

        mockMvc
            .perform(get("/api/portal/arrivals").header(AUTHORIZATION, "Bearer " + jwtToken))
            .andExpect(status().isForbidden());
    }

    private Contact createLoginCapableContact(String phone, String email, String rawPassword) {
        Contact contact = new Contact();
        contact.setPhone(phone);
        contact.setEmail(email);
        contact.setName("Test Contact");
        contact.setOpeningBalance(BigDecimal.ZERO);
        contact.setCurrentBalance(BigDecimal.ZERO);
        contact.setPasswordHash(passwordEncoder.encode(rawPassword));
        contact.setCanLogin(true);
        return contactRepository.saveAndFlush(contact);
    }
}
