# Jenkins CI (MercoTrace)

No Docker, no database, no Testcontainers in the default pipeline — **unit tests only**.

| Step | What runs |
|------|-----------|
| **Unit tests** | Server: Surefire + HTML report. Client: Vitest + HTML report. Zip: `mercotrace-unit-tests-<sha>.zip` |
| **OpenAPI / Swagger** | HTML zip (`mercotrace-openapi-<sha>.zip`) + Postman collection (`mercotrace-postman-<sha>.json`) |
| **JavaDoc** | HTML zip artifact (`mercotrace-javadoc-<sha>.zip`) |
| **SonarQube** | **SONAR_ONLY** build: server + client unit tests, then Sonar upload (not part of the default full CI) |

Integration tests (`*IT.java`, `@IntegrationTest`) are **not** run in Jenkins.

## Requirements on the Jenkins agent

| Tool | Purpose |
|------|---------|
| Java 21+ | Server Maven build, OpenAPI export, Postman collection (`openapi-generator-cli`) |
| Node.js 20+ | Client unit tests (`jenkins/scripts/run-client-unit-tests.sh`; configure Global Tool `nodejs20` optional) |
| `curl`, `zip`, `python3` | OpenAPI/Postman scripts and Swagger UI zip packaging |
| SonarQubeScanner | **SONAR_ONLY** builds (Global Tool name: `SonarQubeScanner`) |

Postman export does **not** require Node.js/npx on the agent.

## Ubuntu Jenkins agent

On Ubuntu, Jenkins runs `sh` as **dash** (`/bin/sh`), not bash. That caused:

`set: Illegal option -o pipefail`

The `Jenkinsfile` OpenAPI and Deploy steps start with `#!/usr/bin/env bash` so bash is used. Ensure bash is installed (`sudo apt install bash` — usually already present).

**Typical packages on the build agent:**

```bash
sudo apt update
sudo apt install -y bash curl zip python3 openjdk-21-jdk git
# Node 20+ only if you run client unit tests in Jenkins
```

All `jenkins/scripts/*.sh` files are already run as `bash jenkins/scripts/...` and work on Ubuntu.

## Jenkins setup

**Plugin (for HTML links on the build page):** install [HTML Publisher](https://plugins.jenkins.io/htmlpublisher/) (`htmlpublisher`). On Ubuntu:

```bash
sudo jenkins-plugin-cli install htmlpublisher
# or: Manage Jenkins → Plugins → Available → "HTML Publisher"
sudo systemctl restart jenkins
```

**Credential:** `sonar-token` (Secret text) — required for **SONAR_ONLY** builds.

**Optional env:** `SONAR_HOST_URL` = `http://localhost:9000`

Create a **Pipeline** job → Script Path: `Jenkinsfile` → **Build Now**.

## Build parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `SONAR_ONLY` | — | Unit tests (server + client) + SonarQube only; skips OpenAPI, JavaDoc, HTML publisher |
| `RUN_SERVER_UNIT_TESTS` | ✓ | Server Surefire only (no DB) |
| `RUN_CLIENT_UNIT_TESTS` | ✓ | Client Vitest (`@vitest/ui` required for HTML report in CI) |
| `GENERATE_OPENAPI_HTML` | ✓ | OpenAPI JSON + Postman collection + Swagger UI HTML zip |
| `GENERATE_JAVADOC` | ✓ | JavaDoc HTML zip |

**Sonar-only job:** enable **`SONAR_ONLY`** only.

1. **Unit tests** — server (`-Punit-tests-ci`, no Docker / no `*IT` / no `@IntegrationTest`) and client (Vitest). Failures mark the build **UNSTABLE** but do not block step 2.
2. **SonarQube** — always runs when **SONAR_ONLY** is enabled (`-DskipTests` on Maven; does **not** re-run tests).

If you see `ApplicationContext` / `Could not find a valid Docker environment`, the job is running **integration** tests (`*IT`, `@IntegrationTest`) — that should not happen with `-Punit-tests-ci`. Re-run with the current `Jenkinsfile` and `run-server-unit-tests.sh`.

Requires `sonar-token` and the **SonarQubeScanner** global tool.

**Client tests:** If the job previously had `RUN_UNIT_TESTS` unchecked, re-run with **`RUN_CLIENT_UNIT_TESTS`** enabled (that old parameter was removed).

## Download OpenAPI (Swagger) HTML

1. Build with **GENERATE_OPENAPI_HTML** enabled.
2. **Build Artifacts** → download `mercotrace-openapi-<sha>.zip`.
3. Unzip → open `index.html` (bundled Swagger UI; see `openapi-summary.txt` for path/operation counts).

The same zip also contains `openapi.json` and `mercotrace.postman_collection.json` when the Postman step succeeds.

## Download Postman collection

1. Build with **GENERATE_OPENAPI_HTML** enabled.
2. **Build Artifacts** → download `mercotrace-postman-<sha>.json`.
3. In Postman: **Import** → select the file (Collection v2.1).

The collection is generated from the same OpenAPI export as Swagger UI (OpenAPI Generator `postman-collection`). Set collection variables / environment base URL to your server (e.g. UAT) after import.

Uses Spring profiles `api-docs`, `openapi-ci`, `no-liquibase` (in-memory H2, Hibernate `ddl-auto: create`, no Redis/PostgreSQL/Docker).

The app boots on `127.0.0.1:18080` only to export the spec; **`servers[0].url`** in `openapi.json` / Swagger UI / Postman is rewritten to **`https://uat-merco.qualityoutsidethebox.org`** (override with Jenkins env `OPENAPI_PUBLIC_URL`).

**Try it out from Jenkins HTML** (e.g. `http://93.127.199.55:9090/job/.../artifact/server/target/swagger-html/index.html`):

- Browser **Origin** is `http://93.127.199.55:9090` (not the full job path).
- UAT must **allow that origin** in CORS and be **redeployed** (`application-prod.yml` includes it).
- Or use live Swagger / Postman below.

**Try it out / Execute from the offline zip or Jenkins HTML report** can still fail with **Failed to fetch (CORS)** until UAT is redeployed. Use:

- **Live Swagger (recommended):** `https://uat-merco.qualityoutsidethebox.org/swagger-ui/index.html` (after UAT is deployed with `-Pprod,api-docs`)
- **Postman:** import `mercotrace.postman_collection.json` from the zip

Typical export size: **~197 `/api` paths**, **~265 HTTP operations**, **~168 schemas** (matches REST controllers; not limited to a subset).

## Download unit test HTML reports

1. Build with **RUN_SERVER_UNIT_TESTS** and/or **RUN_CLIENT_UNIT_TESTS** enabled.
2. **Build Artifacts** → download `mercotrace-unit-tests-<sha>.zip`.
3. Unzip → open `index.html` → links to **Server (Surefire)** and **Client (Vitest)** reports.

If the [HTML Publisher](https://plugins.jenkins.io/htmlpublisher/) plugin is installed, each build publishes (when that stage ran):

| Jenkins sidebar link | Source |
|----------------------|--------|
| Unit tests — overview | `server/target/unit-test-html/index.html` |
| Server unit tests (Surefire) | `server/target/surefire-reports/surefire-report.html` |
| Client unit tests (Vitest) | `client/target/vitest-report/index.html` |
| OpenAPI / Swagger UI | `server/target/swagger-html/index.html` |
| JavaDoc | `server/target/javadoc-html-site/index.html` (single unified site) |

Configured in `jenkins/publish-html-reports.groovy` (loaded from the pipeline `post { always }` block).

## Download JavaDoc HTML

1. Build with **GENERATE_JAVADOC** enabled.
2. **Build Artifacts** → download `mercotrace-javadoc-<sha>.zip`.
3. Unzip → open `index.html`.

The archive is **one unified HTML site**: unzip and open **`index.html`** at the root (all packages in a single overview and hierarchy — no separate module/group tabs). Members are shown up to **private** visibility. CI still runs REST `*Resource` / `*Controller` Javadoc Checkstyle as advisory only.

## Local commands

```bash
# Server unit tests only (same as Jenkins)
cd server
./mvnw -Punit-tests-ci -Dmodernizer.skip=true test

# Client unit tests (+ HTML report under client/target/vitest-report/)
cd client && npm ci && CI=true npm run test

# Package unit test HTML zip (after server and/or client tests)
bash jenkins/scripts/package-unit-test-reports.sh . local

# OpenAPI HTML + Postman (same as Jenkins)
bash jenkins/scripts/generate-openapi.sh .
bash jenkins/scripts/generate-postman-collection.sh . local
bash jenkins/scripts/package-openapi-html.sh . local

# Integration tests (need Docker / Testcontainers — not run in Jenkins)
cd server
./mvnw verify
```
