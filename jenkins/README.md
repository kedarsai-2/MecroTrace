# Jenkins + SonarQube (no Docker)

Bare-metal Jenkins pipeline — **no Docker** in the job. SonarQube runs on your server at **http://localhost:9000** (or set `SONAR_HOST_URL`).

| SonarQube project | Path | Command |
|-------------------|------|---------|
| `mercotrace` | `server/` | `./mvnw compile sonar:sonar -DskipTests` |
| `mercotrace-client` | `client/` | `sonar-scanner` |

## 1. Install on the Jenkins agent machine

| Tool | Version | Notes |
|------|---------|--------|
| Java | 21+ | `java -version` — used by `server/mvnw` |
| SonarScanner CLI | latest | [Install guide](https://docs.sonarsource.com/sonarqube-server/latest/analyzing-source-code/scanners/sonarscanner/) |
| Node.js + npm | 20+ | Only if you enable `PROD_PACKAGE` (client build) |

**macOS (Homebrew example):**

```bash
brew install openjdk@21 sonar-scanner
export SONAR_SCANNER_HOME="$(brew --prefix sonar-scanner)/libexec"
```

**Linux — unpack SonarScanner:**

```bash
curl -fsSL https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-6.2.1.4610-linux-x64.zip -o /tmp/scanner.zip
sudo unzip -q /tmp/scanner.zip -d /opt
export SONAR_SCANNER_HOME=/opt/sonar-scanner-6.2.1.4610-linux-x64
export PATH="$SONAR_SCANNER_HOME/bin:$PATH"
```

Add `SONAR_SCANNER_HOME` to the Jenkins agent environment if `sonar-scanner` is not on `PATH`.

## 2. Jenkins configuration

**Global Tool Configuration** → **SonarQube Scanner** → add installation:

| Field | Value |
|-------|--------|
| Name | `SonarQubeScanner` (must match `Jenkinsfile` exactly) |
| Install automatically | ✓ e.g. SonarQube Scanner 8.0.1.6346 from Maven Central |

**Credential** (Manage Jenkins → Credentials):

| ID | Type | Value |
|----|------|--------|
| `sonar-token` | Secret text | Your SonarQube token (`sqa_…`) |

**Environment** (optional, Manage Jenkins → System):

| Name | Value |
|------|--------|
| `SONAR_HOST_URL` | `http://localhost:9000` |

## 3. Create the job

1. **New Item** → **Pipeline** (or Multibranch Pipeline)
2. Pipeline script from SCM → point at this repo
3. Script Path: `Jenkinsfile`
4. **Build Now**

**Build parameters:**

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `SONAR_ONLY` | ✓ true | SonarQube only — skip package and deploy |
| `PROD_PACKAGE` | false | Build JARs after SonarQube (when `SONAR_ONLY` is false) |
| `DEPLOY_UAT` | false | Deploy to UAT on `main` (when `SONAR_ONLY` is false) |

## 4. Manual run (without Jenkins)

```bash
export SONAR_TOKEN="your-token"
export SONAR_HOST="http://localhost:9000"

cd server
./mvnw -DskipTests compile sonar:sonar \
  -Dsonar.host.url="$SONAR_HOST" \
  -Dsonar.token="$SONAR_TOKEN"

cd ../client
sonar-scanner \
  -Dsonar.host.url="$SONAR_HOST" \
  -Dsonar.token="$SONAR_TOKEN"
```

View results: http://localhost:9000

## Optional: run SonarQube server with Docker

Only the **SonarQube server** can use Docker if you want — the Jenkins pipeline does not:

```bash
docker compose -f server/src/main/docker/sonar.yml up -d
```

See [`jenkins/docker/README.md`](docker/README.md) for an optional local Jenkins-in-Docker setup (not required).
