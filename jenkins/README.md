# Jenkins CI (MercoTrace)

No Docker, no database, no Testcontainers in the default pipeline — **unit tests only**.

| Step | What runs |
|------|-----------|
| **Unit tests** | Server: Surefire + HTML report. Client: Vitest + HTML report. Zip: `mercotrace-unit-tests-<sha>.zip` |
| **OpenAPI / Swagger** | HTML zip (`mercotrace-openapi-<sha>.zip`) + Postman collection (`mercotrace-postman-<sha>.json`) |
| **JavaDoc** | HTML zip artifact (`mercotrace-javadoc-<sha>.zip`) |
| **SonarQube** | Static analysis (optional) |

Integration tests (`*IT.java`, `@IntegrationTest`) are **not** run in Jenkins.

## Requirements on the Jenkins agent

| Tool | Purpose |
|------|---------|
| Java 21+ | Server Maven build, OpenAPI export, Postman collection (`openapi-generator-cli`) |
| Node.js 20+ | Client unit tests only (`npm run test`) |
| `curl`, `zip`, `python3` | OpenAPI/Postman scripts and Swagger UI zip packaging |
| SonarQubeScanner | Only if **RUN_SONAR** is enabled (Global Tool name: `SonarQubeScanner`) |

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

**Credential:** `sonar-token` (Secret text) — required when **RUN_SONAR** is on.

**Optional env:** `SONAR_HOST_URL` = `http://localhost:9000`

Create a **Pipeline** job → Script Path: `Jenkinsfile` → **Build Now**.

## Build parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `RUN_UNIT_TESTS` | ✓ | Master switch for unit tests |
| `RUN_SERVER_UNIT_TESTS` | ✓ | Server Surefire only (no DB) |
| `RUN_CLIENT_UNIT_TESTS` | ✓ | Client Vitest (no Docker) |
| `GENERATE_OPENAPI_HTML` | ✓ | OpenAPI JSON + Postman collection + Swagger UI HTML zip |
| `GENERATE_JAVADOC` | ✓ | JavaDoc HTML zip |
| `RUN_SONAR` | ✓ | SonarQube upload |
| `SONAR_ONLY` | ✓ | Skip package / deploy |
| `PROD_PACKAGE` | off | Production build |
| `DEPLOY_UAT` | off | UAT deploy on `main` |

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

Typical export size: **~197 `/api` paths**, **~265 HTTP operations**, **~168 schemas** (matches REST controllers; not limited to a subset).

## Download unit test HTML reports

1. Build with **RUN_UNIT_TESTS** and at least one of **RUN_SERVER_UNIT_TESTS** / **RUN_CLIENT_UNIT_TESTS**.
2. **Build Artifacts** → download `mercotrace-unit-tests-<sha>.zip`.
3. Unzip → open `index.html` → links to **Server (Surefire)** and **Client (Vitest)** reports.

If the [HTML Publisher](https://plugins.jenkins.io/htmlpublisher/) plugin is installed, each build publishes (when that stage ran):

| Jenkins sidebar link | Source |
|----------------------|--------|
| Unit tests — overview | `server/target/unit-test-html/index.html` |
| Server unit tests (Surefire) | `server/target/surefire-reports/surefire-report.html` |
| Client unit tests (Vitest) | `client/target/vitest-report/index.html` |
| OpenAPI / Swagger UI | `server/target/swagger-html/index.html` |
| JavaDoc | `server/target/javadoc-html/.../index.html` |

Configured in `jenkins/publish-html-reports.groovy` (loaded from the pipeline `post { always }` block).

## Download JavaDoc HTML

1. Build with **GENERATE_JAVADOC** enabled.
2. **Build Artifacts** → download `mercotrace-javadoc-<sha>.zip`.
3. Unzip → open `index.html`.

The archive documents **all main application packages** (REST, services, domain, repositories, security, management, `config`, admin, contact portal, etc.). Members are shown up to **private** visibility. The overview page groups packages (REST API, configuration, domain, services, …). CI still enforces **class-level Javadoc only on** `*Resource` / `*Controller` classes under `web/rest` (Checkstyle); other types may have sparse comments but appear in the HTML.

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
