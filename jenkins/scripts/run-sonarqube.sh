#!/usr/bin/env bash
# SonarQube analysis for server (Maven) and client (sonar-scanner) after unit tests.
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
SHORT_SHA="${2:-local}"

: "${SONAR_HOST_URL:?SONAR_HOST_URL is required}"
: "${SONAR_TOKEN:?SONAR_TOKEN is required}"
: "${SONAR_RUNNER_HOME:?SONAR_RUNNER_HOME is required (Jenkins tool SonarQubeScanner)}"

SCANNER="${SONAR_RUNNER_HOME}/bin/sonar-scanner"
test -x "${SCANNER}" || { echo "sonar-scanner not found at ${SCANNER}" >&2; exit 1; }

echo "SonarQube host: ${SONAR_HOST_URL}"
"${SCANNER}" -v

SERVER_DIR="${REPO_ROOT}/server"
CLIENT_DIR="${REPO_ROOT}/client"

echo "=== Server (Java) ==="
cd "${SERVER_DIR}"
SONAR_EXTRA=""
if [ -d target/surefire-reports ]; then
  SONAR_EXTRA="-Dsonar.junit.reportPaths=target/surefire-reports"
else
  echo "WARNING: no target/surefire-reports — run server unit tests before Sonar" >&2
fi

./mvnw -ntp -DskipTests -Dmodernizer.skip=true compile sonar:sonar \
  -Dsonar.host.url="${SONAR_HOST_URL}" \
  -Dsonar.token="${SONAR_TOKEN}" \
  -Dsonar.projectVersion="${SHORT_SHA}" \
  ${SONAR_EXTRA}

echo "=== Client (TypeScript) ==="
cd "${CLIENT_DIR}"
CLIENT_EXTRA=()
if [ -f target/vitest-junit.xml ]; then
  CLIENT_EXTRA+=("-Dsonar.testExecutionReportPaths=target/vitest-junit.xml")
else
  echo "WARNING: no target/vitest-junit.xml — run client unit tests before Sonar" >&2
fi

"${SCANNER}" \
  -Dsonar.host.url="${SONAR_HOST_URL}" \
  -Dsonar.token="${SONAR_TOKEN}" \
  -Dsonar.projectVersion="${SHORT_SHA}" \
  "${CLIENT_EXTRA[@]}"

echo "SonarQube analysis finished for server and client."
