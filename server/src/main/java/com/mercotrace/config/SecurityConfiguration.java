package com.mercotrace.config;

import static org.springframework.security.config.Customizer.withDefaults;

import com.mercotrace.security.AuthoritiesConstants;
import com.mercotrace.security.CookieOrHeaderBearerTokenResolver;
import com.mercotrace.security.SecurityUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.servlet.util.matcher.MvcRequestMatcher;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.web.servlet.handler.HandlerMappingIntrospector;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import tech.jhipster.config.JHipsterProperties;

@Configuration
@EnableMethodSecurity(securedEnabled = true)
public class SecurityConfiguration {

    private final JHipsterProperties jHipsterProperties;

    public SecurityConfiguration(JHipsterProperties jHipsterProperties) {
        this.jHipsterProperties = jHipsterProperties;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Swagger UI and OpenAPI docs: permit without JWT using path matchers (not MVC)
     * so they match even when api-docs profile is disabled (no controller registered).
     * Prevents 401 when opening /swagger-ui/index.html behind Apache proxy.
     */
    @Bean
    @Order(-1)
    public SecurityFilterChain swaggerPublicFilterChain(HttpSecurity http) throws Exception {
        http
            .securityMatcher(new OrRequestMatcher(
                new AntPathRequestMatcher("/swagger-ui/**"),
                new AntPathRequestMatcher("/swagger-ui.html"),
                new AntPathRequestMatcher("/v3/api-docs/**")
            ))
            .cors(withDefaults())
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(authz -> authz.anyRequest().permitAll())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        return http.build();
    }

    /**
     * Handles public API paths without JWT so that unauthenticated flows (trader
     * setup/registration/login/OTP) work. Runs before the trader chain so no Bearer token is
     * validated (avoids 401 when an invalid/expired cookie is sent with the request).
     * - GET  /api/business-categories(/**): load categories anonymously
     * - POST /api/auth/register          : trader registration (user not logged in)
     * - POST /api/auth/login             : trader email/password login
     * - POST /api/auth/otp/request       : request OTP for phone-based login
     * - POST /api/auth/otp/verify        : verify OTP and perform login
     */
    @Bean
    @Order(0)
    public SecurityFilterChain businessCategoriesPublicFilterChain(HttpSecurity http, MvcRequestMatcher.Builder mvc) throws Exception {
        http
            .securityMatcher(new OrRequestMatcher(
                mvc.pattern(HttpMethod.GET, "/api/business-categories"),
                mvc.pattern(HttpMethod.GET, "/api/business-categories/**"),
                // Trader public auth endpoints
                mvc.pattern(HttpMethod.POST, "/api/auth/register"),
                mvc.pattern(HttpMethod.POST, "/api/auth/login"),
                mvc.pattern(HttpMethod.POST, "/api/auth/otp/request"),
                mvc.pattern(HttpMethod.POST, "/api/auth/otp/verify"),
                mvc.pattern(HttpMethod.POST, "/api/auth/refresh"),
                mvc.pattern(HttpMethod.POST, "/api/auth/logout"),
                // Contact Portal public auth endpoints
                mvc.pattern(HttpMethod.POST, "/api/auth/register-contact"),
                mvc.pattern(HttpMethod.POST, "/api/portal/auth/login"),
                mvc.pattern(HttpMethod.POST, "/api/portal/auth/otp/request"),
                mvc.pattern(HttpMethod.POST, "/api/portal/auth/otp/verify"),
                mvc.pattern(HttpMethod.POST, "/api/portal/auth/refresh"),
                mvc.pattern(HttpMethod.POST, "/api/portal/auth/logout"),
                // Admin public auth endpoints
                mvc.pattern(HttpMethod.POST, "/api/admin/auth/login"),
                mvc.pattern(HttpMethod.POST, "/api/admin/auth/logout")
            ))
            .cors(withDefaults())
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(authz -> authz.anyRequest().permitAll())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        return http.build();
    }

    @Bean
    @Order(1)
    public SecurityFilterChain adminSecurityFilterChain(HttpSecurity http, MvcRequestMatcher.Builder mvc) throws Exception {
        http
            .securityMatcher("/api/admin/**", "/admin/**")
            .cors(withDefaults())
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(authz ->
                // prettier-ignore
                authz
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/admin/auth/login")).permitAll()
                    .requestMatchers(mvc.pattern("/api/admin/**")).hasAuthority(AuthoritiesConstants.ADMIN)
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(exceptions ->
                exceptions
                    .authenticationEntryPoint(new BearerTokenAuthenticationEntryPoint())
                    .accessDeniedHandler(new BearerTokenAccessDeniedHandler())
            )
            .oauth2ResourceServer(oauth2 ->
                oauth2
                    .bearerTokenResolver(new CookieOrHeaderBearerTokenResolver())
                    .jwt(jwt -> jwt.jwtAuthenticationConverter(adminJwtAuthenticationConverter()))
            );
        return http.build();
    }

    /**
     * Trader API chain: all /api/** except /api/admin/** (handled by admin chain).
     * Explicit securityMatcher ensures /api/trader/rbac/* and other trader endpoints
     * require authentication (401/403 when no valid JWT).
     */
    @Bean
    @Order(2)
    public SecurityFilterChain contactSecurityFilterChain(HttpSecurity http, MvcRequestMatcher.Builder mvc) throws Exception {
        http
            .securityMatcher("/api/portal/**")
            .cors(withDefaults())
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(authz ->
                authz
                    // Public contact auth endpoints are already handled by businessCategoriesPublicFilterChain
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/portal/auth/login")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/portal/auth/otp/request")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/portal/auth/otp/verify")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/portal/auth/refresh")).permitAll()
                    .requestMatchers(mvc.pattern("/api/portal/**")).authenticated()
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(exceptions ->
                exceptions
                    .authenticationEntryPoint(new BearerTokenAuthenticationEntryPoint())
                    .accessDeniedHandler(new BearerTokenAccessDeniedHandler())
            )
            .oauth2ResourceServer(oauth2 ->
                oauth2
                    .bearerTokenResolver(new CookieOrHeaderBearerTokenResolver())
                    .jwt(jwt -> jwt.jwtAuthenticationConverter(contactJwtAuthenticationConverter()))
            );
        return http.build();
    }

    @Bean
    @Order(3)
    public SecurityFilterChain traderSecurityFilterChain(HttpSecurity http, MvcRequestMatcher.Builder mvc) throws Exception {
        http
            .securityMatcher("/api/**")
            .cors(withDefaults())
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(authz ->
                // prettier-ignore
                authz
                    // Trader-scoped APIs: require auth first (fix: GET /api/trader/rbac/roles without token → 401/403)
                    .requestMatchers(new AntPathRequestMatcher("/api/trader/**")).authenticated()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/authenticate")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.GET, "/api/authenticate")).permitAll()
                    .requestMatchers(mvc.pattern("/api/register")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/auth/register")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/auth/login")).permitAll()
                    .requestMatchers(mvc.pattern(HttpMethod.POST, "/api/auth/refresh")).permitAll()
                    .requestMatchers(mvc.pattern("/api/activate")).permitAll()
                    .requestMatchers(mvc.pattern("/api/account/reset-password/init")).permitAll()
                    .requestMatchers(mvc.pattern("/api/account/reset-password/finish")).permitAll()
                    .requestMatchers(mvc.pattern("/v3/api-docs/**")).permitAll()
                    .requestMatchers(mvc.pattern("/swagger-ui/**")).permitAll()
                    .requestMatchers(mvc.pattern("/swagger-ui.html")).permitAll()
                    .requestMatchers(mvc.pattern("/management/health")).permitAll()
                    .requestMatchers(mvc.pattern("/management/health/**")).permitAll()
                    .requestMatchers(mvc.pattern("/management/info")).permitAll()
                    .requestMatchers(mvc.pattern("/management/prometheus")).permitAll()
                    .requestMatchers(mvc.pattern("/management/**")).hasAuthority(AuthoritiesConstants.ADMIN)
                    // everything else under /api/** requires an authenticated trader
                    .requestMatchers(mvc.pattern("/api/**")).authenticated()
            )
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(exceptions ->
                exceptions
                    .authenticationEntryPoint(new BearerTokenAuthenticationEntryPoint())
                    .accessDeniedHandler(new BearerTokenAccessDeniedHandler())
            )
            .oauth2ResourceServer(oauth2 ->
                oauth2
                    .bearerTokenResolver(new CookieOrHeaderBearerTokenResolver())
                    .jwt(jwt -> jwt.jwtAuthenticationConverter(traderJwtAuthenticationConverter()))
            );
        return http.build();
    }

    @Bean
    MvcRequestMatcher.Builder mvc(HandlerMappingIntrospector introspector) {
        return new MvcRequestMatcher.Builder(introspector);
    }

    private Converter<Jwt, ? extends AbstractAuthenticationToken> adminJwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter delegate = new JwtGrantedAuthoritiesConverter();
        delegate.setAuthoritiesClaimName(SecurityUtils.AUTHORITIES_CLAIM);
        delegate.setAuthorityPrefix("");

        return jwt -> {
            String tokenType = getTokenType(jwt);
            if (!SecurityUtils.TOKEN_TYPE_ADMIN.equals(tokenType)) {
                throw new JwtException("Invalid token_type for admin resources");
            }
            var authorities = delegate.convert(jwt);
            String principalName = jwt.getSubject();
            return new JwtAuthenticationToken(jwt, authorities, principalName);
        };
    }

    private Converter<Jwt, ? extends AbstractAuthenticationToken> traderJwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter delegate = new JwtGrantedAuthoritiesConverter();
        delegate.setAuthoritiesClaimName(SecurityUtils.AUTHORITIES_CLAIM);
        delegate.setAuthorityPrefix("");

        return jwt -> {
            String tokenType = getTokenType(jwt);
            if (!SecurityUtils.TOKEN_TYPE_TRADER.equals(tokenType)) {
                throw new JwtException("Invalid token_type for trader resources");
            }
            var authorities = delegate.convert(jwt);
            String principalName = jwt.getSubject();
            return new JwtAuthenticationToken(jwt, authorities, principalName);
        };
    }

    private Converter<Jwt, ? extends AbstractAuthenticationToken> contactJwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter delegate = new JwtGrantedAuthoritiesConverter();
        delegate.setAuthoritiesClaimName(SecurityUtils.AUTHORITIES_CLAIM);
        delegate.setAuthorityPrefix("");

        return jwt -> {
            String tokenType = getTokenType(jwt);
            if (!SecurityUtils.TOKEN_TYPE_CONTACT.equals(tokenType)) {
                throw new JwtException("Invalid token_type for contact resources");
            }
            var authorities = delegate.convert(jwt);
            String principalName = jwt.getSubject();
            return new JwtAuthenticationToken(jwt, authorities, principalName);
        };
    }

    private String getTokenType(Jwt jwt) {
        Object raw = jwt.getClaim(SecurityUtils.TOKEN_TYPE_CLAIM);
        if (raw == null) {
            throw new JwtException("Missing token_type claim");
        }
        return raw.toString();
    }
}
