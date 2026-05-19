#!/usr/bin/env bash
# Generate JavaDoc HTML and zip for Jenkins (REST Checkstyle is advisory only).
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
VERSION="${2:-local}"
SERVER_DIR="${REPO_ROOT}/server"

cd "${SERVER_DIR}"

echo "Compiling and generating JavaDoc (javadoc-ci profile)..."
./mvnw -ntp -DskipTests -Pjavadoc-ci compile javadoc:javadoc

echo "REST resource Javadoc Checkstyle (advisory — does not fail the build)..."
if ! ./mvnw -ntp -Pjavadoc-ci -DskipTests checkstyle:check@verify-rest-javadoc; then
  echo "WARNING: REST Javadoc Checkstyle reported issues (see log above). JavaDoc artifact will still be packaged." >&2
fi

bash "${REPO_ROOT}/jenkins/scripts/unify-javadoc-html.sh" "${SERVER_DIR}"
cd "${REPO_ROOT}"
bash jenkins/scripts/package-javadoc.sh . "${VERSION}"
