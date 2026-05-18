package com.mercotrace.config;

import org.springframework.boot.test.util.TestPropertyValues;

/**
 * When {@code CI_USE_COMPOSE_DB=true}, integration tests use PostgreSQL/Redis from
 * docker-compose (jenkins/docker-compose.yml) instead of starting Testcontainers.
 */
final class CiComposeDb {

    private CiComposeDb() {}

    static boolean isEnabled() {
        return "true".equalsIgnoreCase(System.getenv("CI_USE_COMPOSE_DB"));
    }

    static TestPropertyValues withSqlProperties(TestPropertyValues base) {
        String url = System.getenv("SPRING_DATASOURCE_URL");
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("CI_USE_COMPOSE_DB=true requires SPRING_DATASOURCE_URL");
        }
        String username = System.getenv("SPRING_DATASOURCE_USERNAME");
        String password = System.getenv("SPRING_DATASOURCE_PASSWORD");
        if (username != null && !username.isBlank() && password != null && !password.isBlank()) {
            return base.and(
                "spring.datasource.url=" + url,
                "spring.datasource.username=" + username,
                "spring.datasource.password=" + password
            );
        }
        if (username != null && !username.isBlank()) {
            return base.and("spring.datasource.url=" + url, "spring.datasource.username=" + username);
        }
        return base.and("spring.datasource.url=" + url);
    }

    static TestPropertyValues withRedisProperties(TestPropertyValues base) {
        String server = System.getenv("JHIPSTER_CACHE_REDIS_SERVER");
        if (server == null || server.isBlank()) {
            throw new IllegalStateException("CI_USE_COMPOSE_DB=true requires JHIPSTER_CACHE_REDIS_SERVER");
        }
        return base.and("jhipster.cache.redis.server=" + server);
    }
}
