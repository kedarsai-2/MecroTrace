package com.mercotrace.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Properties specific to Mercotrace.
 * <p>
 * Properties are configured in the {@code application.yml} file.
 * See {@link tech.jhipster.config.JHipsterProperties} for a good example.
 */
@ConfigurationProperties(prefix = "application", ignoreUnknownFields = false)
public class ApplicationProperties {

    private final Liquibase liquibase = new Liquibase();

    private final Security security = new Security();

    private final Cors cors = new Cors();

    // jhipster-needle-application-properties-property

    public Liquibase getLiquibase() {
        return liquibase;
    }

    public Security getSecurity() {
        return security;
    }

    public Cors getCors() {
        return cors;
    }

    // jhipster-needle-application-properties-property-getter

    public static class Cors {

        /** Merged into JHipster CORS (e.g. Jenkins HTML Swagger at http://host:9090). */
        private List<String> extraAllowedOrigins = new ArrayList<>();

        public List<String> getExtraAllowedOrigins() {
            return extraAllowedOrigins;
        }

        public void setExtraAllowedOrigins(List<String> extraAllowedOrigins) {
            this.extraAllowedOrigins = extraAllowedOrigins != null ? extraAllowedOrigins : new ArrayList<>();
        }
    }

    public static class Liquibase {

        private Boolean asyncStart = true;

        public Boolean getAsyncStart() {
            return asyncStart;
        }

        public void setAsyncStart(Boolean asyncStart) {
            this.asyncStart = asyncStart;
        }
    }

    public static class Security {

        private final Cookie cookie = new Cookie();

        /**
         * Access JWT/cookie lifetime used when refresh sessions are enabled.
         * Refresh session lifetime remains controlled by JHipster remember-me validity.
         */
        private long accessTokenValidityInSeconds = 86400;

        /**
         * Small grace window for duplicate refresh-token rotation attempts.
         * Set to 0 to disable duplicate rotation tolerance.
         */
        private long refreshTokenRotationGraceSeconds = 15;

        public Cookie getCookie() {
            return cookie;
        }

        public long getAccessTokenValidityInSeconds() {
            return accessTokenValidityInSeconds;
        }

        public void setAccessTokenValidityInSeconds(long accessTokenValidityInSeconds) {
            this.accessTokenValidityInSeconds = accessTokenValidityInSeconds;
        }

        public long getRefreshTokenRotationGraceSeconds() {
            return refreshTokenRotationGraceSeconds;
        }

        public void setRefreshTokenRotationGraceSeconds(long refreshTokenRotationGraceSeconds) {
            this.refreshTokenRotationGraceSeconds = refreshTokenRotationGraceSeconds;
        }
    }

    public static class Cookie {

        /**
         * Controls whether the ACCESS_TOKEN cookie is marked as Secure.
         * Defaults to true so that production environments use Secure cookies
         * unless explicitly overridden (for example in application-dev.yml).
         */
        private boolean secure = true;

        public boolean isSecure() {
            return secure;
        }

        public void setSecure(boolean secure) {
            this.secure = secure;
        }
    }
    // jhipster-needle-application-properties-property-class
}
