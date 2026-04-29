#!/usr/bin/env bash
# Runs on the UAT VPS after CI uploads:
#   $DEPLOY_ROOT/backend/releases/mercotrace-${RELEASE_ID}.jar
#   $DEPLOY_ROOT/frontend/releases/${RELEASE_ID}/  (static assets)
#
# Env (required): RELEASE_ID  (e.g. 7-char git sha)
# Env (optional): DEPLOY_ROOT (default /var/www/uatmerco), SERVICE_NAME (default uatmerco)

set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/uatmerco}"
RELEASE_ID="${RELEASE_ID:?Set RELEASE_ID (e.g. short git sha)}"
SERVICE_NAME="${SERVICE_NAME:-uatmerco}"

BACKEND_LINK="${DEPLOY_ROOT}/backend/mercotrace.jar"
JAR_PATH="${DEPLOY_ROOT}/backend/releases/mercotrace-${RELEASE_ID}.jar"
FE_RELEASE="${DEPLOY_ROOT}/frontend/releases/${RELEASE_ID}"
FE_CURRENT="${DEPLOY_ROOT}/frontend/current"

if [[ ! -f "$JAR_PATH" ]]; then
  echo "deploy-uat-remote: missing jar: $JAR_PATH" >&2
  exit 1
fi
if [[ ! -d "$FE_RELEASE" ]] || [[ -z "$(find "$FE_RELEASE" -maxdepth 1 -mindepth 1 2>/dev/null | head -1)" ]]; then
  echo "deploy-uat-remote: missing or empty frontend release dir: $FE_RELEASE" >&2
  exit 1
fi

mkdir -p "${DEPLOY_ROOT}/backend/releases"
mkdir -p "${DEPLOY_ROOT}/frontend/releases"

# Backend first: symlink to new JAR, then restart API (short downtime on restart).
ln -sfn "$JAR_PATH" "$BACKEND_LINK"
sudo -n systemctl restart "$SERVICE_NAME"

# Frontend: atomic switch to new static release (Apache should use DocumentRoot .../frontend/current).
ln -sfn "$FE_RELEASE" "$FE_CURRENT"

echo "deploy-uat-remote: deployed ${RELEASE_ID} (${SERVICE_NAME} restarted)"
