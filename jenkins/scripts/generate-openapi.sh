#!/usr/bin/env bash
# Start Spring Boot with api-docs + openapi-ci (H2, no Redis), export OpenAPI JSON.
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
SERVER_DIR="${REPO_ROOT}/server"
OPENAPI_PORT="${OPENAPI_PORT:-18080}"
OPENAPI_URL="http://127.0.0.1:${OPENAPI_PORT}/v3/api-docs"
HEALTH_URL="http://127.0.0.1:${OPENAPI_PORT}/management/health"
MAX_WAIT="${OPENAPI_MAX_WAIT:-180}"
OUT_DIR="${SERVER_DIR}/target/openapi"
OUT_FILE="${OUT_DIR}/openapi.json"

cd "${SERVER_DIR}"

MVN_PROFILES='-Papi-docs,openapi-ci,no-liquibase,!docker-compose'
SPRING_PROFILES='api-docs,openapi-ci,no-liquibase'

echo "Packaging server for OpenAPI export..."
./mvnw -ntp ${MVN_PROFILES} -DskipTests -Dmodernizer.skip=true package

JAR="$(find target -maxdepth 1 -name 'mercotrace-*.jar' -type f ! -name '*-sources.jar' ! -name '*.original' | head -1)"
if [ -z "${JAR}" ]; then
  echo "No packaged JAR found under target/" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
LOG_FILE="${OUT_DIR}/boot.log"

echo "Starting ${JAR} (profiles: ${SPRING_PROFILES}) on port ${OPENAPI_PORT}..."
java -jar "${JAR}" \
  --spring.profiles.active="${SPRING_PROFILES}" \
  --server.port="${OPENAPI_PORT}" \
  >"${LOG_FILE}" 2>&1 &
APP_PID=$!

cleanup() {
  if kill -0 "${APP_PID}" 2>/dev/null; then
    echo "Stopping application (pid ${APP_PID})..."
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Waiting for ${HEALTH_URL} (max ${MAX_WAIT}s)..."
for ((i = 1; i <= MAX_WAIT; i++)); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    echo "Application is up"
    break
  fi
  if ! kill -0 "${APP_PID}" 2>/dev/null; then
    echo "Application process exited early. Last log lines:" >&2
    tail -n 80 "${LOG_FILE}" >&2 || true
    exit 1
  fi
  if [ "$i" -eq "$MAX_WAIT" ]; then
    echo "Application did not become healthy in time. See ${LOG_FILE}" >&2
    tail -n 80 "${LOG_FILE}" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "Downloading OpenAPI from ${OPENAPI_URL}"
curl -fsS "${OPENAPI_URL}" -o "${OUT_FILE}"

if [ ! -s "${OUT_FILE}" ]; then
  echo "Downloaded OpenAPI file is empty" >&2
  exit 1
fi

echo "OpenAPI spec written to ${OUT_FILE} ($(wc -c < "${OUT_FILE}" | tr -d ' ') bytes)"
