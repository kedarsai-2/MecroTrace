package com.mercotrace.config;

import jakarta.servlet.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.server.*;
import org.springframework.boot.web.servlet.ServletContextInitializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tech.jhipster.config.JHipsterProperties;

/**
 * Configuration of web application with Servlet 3.0 APIs.
 */
@Configuration
public class WebConfigurer implements ServletContextInitializer {

    private static final Logger LOG = LoggerFactory.getLogger(WebConfigurer.class);

    private final Environment env;

    private final JHipsterProperties jHipsterProperties;

    private final ApplicationProperties applicationProperties;

    public WebConfigurer(Environment env, JHipsterProperties jHipsterProperties, ApplicationProperties applicationProperties) {
        this.env = env;
        this.jHipsterProperties = jHipsterProperties;
        this.applicationProperties = applicationProperties;
    }

    @Override
    public void onStartup(ServletContext servletContext) {
        if (env.getActiveProfiles().length != 0) {
            LOG.info("Web application configuration, using profiles: {}", (Object[]) env.getActiveProfiles());
        }

        LOG.info("Web application fully configured");
    }

    /**
     * CORS configuration source used by Spring Security's .cors(withDefaults()).
     * Exposing this bean ensures CORS runs inside the security filter chain so that
     * 401/403 responses also get Access-Control-Allow-Origin headers (otherwise the
     * browser reports "blocked by CORS" when the real issue is auth failure).
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = jHipsterProperties.getCors();
        mergeExtraCorsOrigins(config);
        if (!CollectionUtils.isEmpty(config.getAllowedOrigins()) || !CollectionUtils.isEmpty(config.getAllowedOriginPatterns())) {
            LOG.debug("Registering CORS configuration");
            source.registerCorsConfiguration("/api/**", config);
            source.registerCorsConfiguration("/management/**", config);
            source.registerCorsConfiguration("/v3/api-docs", config);
            source.registerCorsConfiguration("/v3/api-docs/**", config);
            source.registerCorsConfiguration("/swagger-ui/**", config);
            source.registerCorsConfiguration("/swagger-ui.html", config);
        }
        return source;
    }

    private void mergeExtraCorsOrigins(CorsConfiguration config) {
        var extras = applicationProperties.getCors().getExtraAllowedOrigins();
        if (!CollectionUtils.isEmpty(extras)) {
            extras.stream().filter(StringUtils::hasText).forEach(config::addAllowedOrigin);
            LOG.info("CORS extra allowed origins: {}", extras);
        }
        String envExtras = env.getProperty("APPLICATION_CORS_EXTRA_ALLOWED_ORIGINS");
        if (StringUtils.hasText(envExtras)) {
            for (String origin : envExtras.split(",")) {
                String trimmed = origin.trim();
                if (StringUtils.hasText(trimmed)) {
                    config.addAllowedOrigin(trimmed);
                }
            }
            LOG.info("CORS extra allowed origins from env APPLICATION_CORS_EXTRA_ALLOWED_ORIGINS");
        }
    }
}
