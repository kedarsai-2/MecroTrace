#!/usr/bin/env bash
# Package generated JavaDoc HTML into a single zip for Jenkins artifact download.
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
VERSION="${2:-local}"
SERVER_DIR="${REPO_ROOT}/server"
OUT_ZIP="${SERVER_DIR}/mercotrace-javadoc-${VERSION}.zip"

# Maven javadoc output (see javadoc-ci profile)
CANDIDATES=(
  "${SERVER_DIR}/target/javadoc-html/apidocs"
  "${SERVER_DIR}/target/javadoc-html"
  "${SERVER_DIR}/target/apidocs/apidocs"
  "${SERVER_DIR}/target/apidocs"
)

JAVADOC_DIR=""
for dir in "${CANDIDATES[@]}"; do
  if [ -f "${dir}/index.html" ]; then
    JAVADOC_DIR="$(cd "${dir}" && pwd)"
    break
  fi
done

if [ -z "${JAVADOC_DIR}" ]; then
  echo "JavaDoc index.html not found under ${SERVER_DIR}/target — run mvn javadoc:javadoc first" >&2
  exit 1
fi

echo "Packaging JavaDoc from ${JAVADOC_DIR}"
mkdir -p "${SERVER_DIR}"
rm -f "${OUT_ZIP}"
(cd "${JAVADOC_DIR}" && zip -qr "${OUT_ZIP}" .)

echo "Created ${OUT_ZIP} ($(du -h "${OUT_ZIP}" | cut -f1))"
echo "Open index.html inside the zip in a browser to browse the API docs."
