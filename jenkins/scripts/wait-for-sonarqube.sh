#!/usr/bin/env bash
# Wait until SonarQube reports status UP. Usage: wait-for-sonarqube.sh <base-url> [max-attempts]
set -euo pipefail

BASE_URL="${1:?SonarQube base URL required, e.g. http://sonarqube:9000}"
MAX_ATTEMPTS="${2:-60}"
STATUS_URL="${BASE_URL%/}/api/system/status"

echo "Waiting for SonarQube at ${STATUS_URL} (max ${MAX_ATTEMPTS} attempts)..."
for ((i = 1; i <= MAX_ATTEMPTS; i++)); do
  if response="$(curl -fsS "$STATUS_URL" 2>/dev/null)" && echo "$response" | grep -q '"status":"UP"'; then
    echo "SonarQube is UP"
    exit 0
  fi
  sleep 5
done

echo "SonarQube did not become ready in time" >&2
exit 1
