package com.mercotrace;

import com.mercotrace.config.AsyncSyncConfiguration;
import com.mercotrace.config.EmbeddedRedis;
import com.mercotrace.config.EmbeddedSQL;
import com.mercotrace.config.JacksonConfiguration;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Base composite annotation for integration tests (database / Redis via Testcontainers).
 * Excluded from Jenkins unit-test runs — use profile {@code unit-tests-ci} or tag filter.
 */
@Tag("integration")
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest(classes = { MercotraceApp.class, JacksonConfiguration.class, AsyncSyncConfiguration.class })
@EmbeddedRedis
@EmbeddedSQL
public @interface IntegrationTest {
}
