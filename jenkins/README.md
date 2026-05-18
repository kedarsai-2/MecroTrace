# Jenkins CI (MercoTrace)

No Docker, no database, no Testcontainers in the default pipeline — **unit tests only**.

| Step | What runs |
|------|-----------|
| **Unit tests** | Server: Surefire (`-Punit-tests-ci`, excludes `@Tag("integration")`). Client: `npm run test` (Vitest). |
| **JavaDoc** | HTML zip artifact (`mercotrace-javadoc-<sha>.zip`) |
| **SonarQube** | Static analysis (optional) |

Integration tests (`*IT.java`, `@IntegrationTest`) are **not** run in Jenkins.

## Requirements on the Jenkins agent

| Tool | Purpose |
|------|---------|
| Java 21+ | `server/mvnw test` |
| Node.js 20+ | `client/npm run test` |
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
| `GENERATE_JAVADOC` | ✓ | JavaDoc HTML zip |
| `RUN_SONAR` | ✓ | SonarQube upload |
| `SONAR_ONLY` | ✓ | Skip package / deploy |
| `PROD_PACKAGE` | off | Production build |
| `DEPLOY_UAT` | off | UAT deploy on `main` |

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

# Integration tests (need Docker / Testcontainers — not run in Jenkins)
cd server
./mvnw verify
```
