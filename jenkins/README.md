# Jenkins CI (MercoTrace)

No Docker, no database, no Testcontainers in the default pipeline — **unit tests only**.

| Step | What runs |
|------|-----------|
| **Unit tests** | Server: Surefire (`-Punit-tests-ci`, excludes `@Tag("integration")`). Client: `npm run test` (Vitest). |
| **OpenAPI / Swagger** | HTML zip artifact (`mercotrace-openapi-<sha>.zip`) |
| **JavaDoc** | HTML zip artifact (`mercotrace-javadoc-<sha>.zip`) |
| **SonarQube** | Static analysis (optional) |

Integration tests (`*IT.java`, `@IntegrationTest`) are **not** run in Jenkins.

## Requirements on the Jenkins agent

| Tool | Purpose |
|------|---------|
| Java 21+ | `server/mvnw test` |
| Node.js 20+ | `client/npm run test` |
| `curl`, `zip` | OpenAPI HTML packaging (Swagger UI download) |
| SonarQubeScanner | Only if **RUN_SONAR** is enabled (Global Tool name: `SonarQubeScanner`) |

## Jenkins setup

**Credential:** `sonar-token` (Secret text) — required when **RUN_SONAR** is on.

**Optional env:** `SONAR_HOST_URL` = `http://localhost:9000`

Create a **Pipeline** job → Script Path: `Jenkinsfile` → **Build Now**.

## Build parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `RUN_UNIT_TESTS` | ✓ | Master switch for unit tests |
| `RUN_SERVER_UNIT_TESTS` | ✓ | Server Surefire only (no DB) |
| `RUN_CLIENT_UNIT_TESTS` | ✓ | Client Vitest (no Docker) |
| `GENERATE_OPENAPI_HTML` | ✓ | OpenAPI JSON + Swagger UI HTML zip |
| `GENERATE_JAVADOC` | ✓ | JavaDoc HTML zip |
| `RUN_SONAR` | ✓ | SonarQube upload |
| `SONAR_ONLY` | ✓ | Skip package / deploy |
| `PROD_PACKAGE` | off | Production build |
| `DEPLOY_UAT` | off | UAT deploy on `main` |

## Download OpenAPI (Swagger) HTML

1. Build with **GENERATE_OPENAPI_HTML** enabled.
2. **Build Artifacts** → download `mercotrace-openapi-<sha>.zip`.
3. Unzip → open `index.html` (bundled Swagger UI; see `openapi-summary.txt` for path/operation counts).

Uses Spring profiles `api-docs`, `openapi-ci`, `no-liquibase` (in-memory H2, Hibernate `ddl-auto: create`, no Redis/PostgreSQL/Docker).

Typical export size: **~197 `/api` paths**, **~265 HTTP operations**, **~168 schemas** (matches REST controllers; not limited to a subset).

## Download JavaDoc HTML

1. Build with **GENERATE_JAVADOC** enabled.
2. **Build Artifacts** → download `mercotrace-javadoc-<sha>.zip`.
3. Unzip → open `index.html`.

## Local commands

```bash
# Server unit tests only (same as Jenkins)
cd server
./mvnw -Punit-tests-ci -Dmodernizer.skip=true test

# Client unit tests
cd client && npm ci && npm run test

# OpenAPI HTML (same as Jenkins)
bash jenkins/scripts/generate-openapi.sh .
bash jenkins/scripts/package-openapi-html.sh . local

# Integration tests (need Docker / Testcontainers — not run in Jenkins)
cd server
./mvnw verify
```
