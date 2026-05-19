#!/usr/bin/env bash
# Client Vitest unit tests for Jenkins (Node 20+, produces JUnit + HTML under client/target/).
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
CLIENT_DIR="${REPO_ROOT}/client"

if ! command -v node >/dev/null 2>&1; then
  echo "node not found on PATH — install Node.js 20+ on the Jenkins agent" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found on PATH" >&2
  exit 1
fi

echo "node $(node --version) npm $(npm --version)"

cd "${CLIENT_DIR}"
mkdir -p target

if [ ! -f package-lock.json ]; then
  echo "package-lock.json missing — use npm install and commit the lockfile" >&2
  exit 1
fi

echo "Installing client dependencies (npm ci)..."
npm ci

export CI=true
echo "Running Vitest (client unit tests)..."
npm run test

if [ ! -f target/vitest-junit.xml ]; then
  echo "JUnit report missing: client/target/vitest-junit.xml" >&2
  exit 1
fi

echo "Client unit tests finished ($(grep -c '<testcase' target/vitest-junit.xml 2>/dev/null || echo 0) test case(s) in JUnit XML)"
