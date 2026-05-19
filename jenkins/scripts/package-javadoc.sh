#!/usr/bin/env bash
# Package unified JavaDoc HTML into a single zip (one index.html at the root).
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
VERSION="${2:-local}"
SERVER_DIR="${REPO_ROOT}/server"
JAVADOC_DIR="${SERVER_DIR}/target/javadoc-html-site"
OUT_ZIP="${SERVER_DIR}/mercotrace-javadoc-${VERSION}.zip"

if [ ! -f "${JAVADOC_DIR}/index.html" ]; then
  echo "Unified JavaDoc not found at ${JAVADOC_DIR} — run generate-javadoc.sh first" >&2
  exit 1
fi

echo "Packaging unified JavaDoc from ${JAVADOC_DIR}"
rm -f "${OUT_ZIP}"
(cd "${JAVADOC_DIR}" && zip -qr "${OUT_ZIP}" .)

echo "Created ${OUT_ZIP} ($(du -h "${OUT_ZIP}" | cut -f1))"
echo "Unzip and open index.html — one site with all packages (no module tabs)."
