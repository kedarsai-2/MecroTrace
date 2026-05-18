# Jenkins setup (MercoTrace)

This folder and the repo-root [`Jenkinsfile`](../Jenkinsfile) define CI/CD for the monorepo:

| Stage | What it does |
|-------|----------------|
| Client | `npm ci`, lint, unit tests (optional), Vite production build |
| Server | `./mvnw verify` or compile when tests skipped |
| SonarQube | Optional — Maven `sonar:sonar` (server) + `sonar-scanner` (client) |
| Package | `./mvnw -Pprod package` (production JAR) |
| Deploy UAT | Optional rsync + [`scripts/deploy-uat-remote.sh`](../scripts/deploy-uat-remote.sh) on `main` |

Behavior matches [`.github/workflows/deploy-uat.yml`](../.github/workflows/deploy-uat.yml).

## 1. Run Jenkins + SonarQube locally (optional)

```bash
cd jenkins
export UAT_VITE_API_URL="https://your-uat-api.example.com"   # casc placeholder
export SONAR_TOKEN="squ_..."                                  # from SonarQube UI (see below)
export UAT_SSH_USER="deploy"
export UAT_SSH_PRIVATE_KEY="$(cat ~/.ssh/id_ed25519)"        # only if using deploy
docker compose up -d --build
```

**SonarQube UI:** http://localhost:9001 (default `admin` / `admin` when `SONAR_FORCEAUTHENTICATION=false`)

1. Log in → **My Account** → **Security** → **Generate Token**
2. Add Jenkins credential **Secret text**, ID `sonar-token`, value = that token  
   (or set `SONAR_TOKEN` before `docker compose up` so CasC seeds it)

**Jenkins UI:** http://localhost:8080

Open Jenkins and use the initial admin password:

```bash
docker compose exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Install plugins from [`plugins.txt`](plugins.txt) (Docker Pipeline, Git, SSH Agent, JUnit, etc.).

## 2. Connect the repository

**Multibranch Pipeline (recommended)**

1. **New Item** → **Multibranch Pipeline** → name `mercotrace`
2. Branch sources → your Git host (GitHub/GitLab/Bitbucket) or **Git** with repo URL
3. Build configuration → Script Path: `Jenkinsfile`
4. Scan repository triggers → build when branch is updated

**Single Pipeline job**

Create a **Pipeline** job pointing at `Jenkinsfile` in SCM (same script path as multibranch).

## 3. Controller environment (deploy)

Set on the job or under **Manage Jenkins → System → Global properties → Environment variables**:

| Variable | Example | Purpose |
|----------|---------|---------|
| `UAT_SSH_USER` | `deploy` | SSH user for UAT VPS |
| `UAT_SSH_HOST` | `uat.example.com` | SSH host |
| `UAT_DEPLOY_PATH` | `/var/www/uatmerco` | Deploy root on server |
| `UAT_SYSTEMD_SERVICE` | `uatmerco` | systemd unit name |
| `UAT_HEALTH_URL` | `https://uat.example.com/management/health` | Optional smoke check |

## 4. Jenkins credentials

| ID | Type | Used for |
|----|------|----------|
| `uat-vite-api-url` | Secret text | `VITE_API_URL` during `npm run build` |
| `uat-ssh` | SSH Username with private key | UAT rsync/ssh/scp (`username` = `UAT_SSH_USER`) |
| `sonar-token` | Secret text | SonarQube user token for analysis upload |

Known hosts: add the UAT host key on the agent (Docker image includes `ssh`; mount `known_hosts` or run `ssh-keyscan` in a setup step if needed).

## 5. Build parameters

- **DEPLOY_UAT** — run deploy stage (only on `main`, after successful package)
- **SKIP_TESTS** — skip `npm run test` and Maven `verify` (also skips SonarQube)
- **PROD_PACKAGE** — production client + server JAR (default on)
- **RUN_SONAR** — publish to SonarQube after tests (needs `sonar-token` + running server)

Typical flows:

- **PR / branch CI**: defaults (`DEPLOY_UAT=false`, `RUN_SONAR=false`, tests on)
- **Quality gate**: enable **RUN_SONAR** after configuring `SONAR_HOST_URL` and `sonar-token`
- **UAT release**: build `main` with `DEPLOY_UAT=true` and credentials configured

### SonarQube projects

| Project key | Path | Scanner |
|-------------|------|---------|
| `mercotrace` | `server/` | `./mvnw sonar:sonar` (JaCoCo from `verify`) |
| `mercotrace-client` | `client/` | `sonar-scanner` CLI (in agent image) |

Config: [`server/sonar-project.properties`](../server/sonar-project.properties), [`client/sonar-project.properties`](../client/sonar-project.properties).

Standalone SonarQube (JHipster): `docker compose -f server/src/main/docker/sonar.yml up -d` on port **9001**.

For Jenkins **not** using `jenkins/docker-compose.yml`, set `SONAR_HOST_URL` (e.g. `http://sonarqube.company.com:9000`) and remove or change the `args '--network=mercotrace-ci'` line in `Jenkinsfile` if the network does not exist.

## 6. Agent image

The pipeline uses [`agent/Dockerfile`](agent/Dockerfile) (Node 20 + JDK 21). The Jenkins controller must have Docker available (see `docker-compose.yml` mounting `/var/run/docker.sock`).

On Linux, if Docker permission errors occur:

```bash
export DOCKER_GID=$(getent group docker | cut -d: -f3)
cd jenkins && docker compose up -d
```

## 7. Customize

- Edit [`casc.yaml`](casc.yaml) repo URL and credential placeholders for your org.
- Adjust branch filters / cron in the multibranch job UI.
- For agents without Docker, change `agent { dockerfile { ... } }` in `Jenkinsfile` to `agent any` and install **JDK 21** and **Node.js 20** via Jenkins **Global Tool Configuration**.
