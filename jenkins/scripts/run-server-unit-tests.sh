#!/usr/bin/env bash
# Server unit tests for Jenkins (Surefire only — no *IT / @IntegrationTest / Docker).
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
SERVER_DIR="${REPO_ROOT}/server"

cd "${SERVER_DIR}"
echo "Running server unit tests (-Punit-tests-ci: excludes integration tag and **/*IT*)..."
./mvnw -ntp -Punit-tests-ci -Dmodernizer.skip=true test

echo "Server unit tests finished."
