#!/usr/bin/env bash
# Flatten Maven javadoc output into one browsable tree (index.html at the zip root).
set -euo pipefail

SERVER_DIR="${1:?server directory required}"
UNIFIED="${SERVER_DIR}/target/javadoc-html-site"

SRC=""
for candidate in \
  "${SERVER_DIR}/target/javadoc-html/apidocs" \
  "${SERVER_DIR}/target/javadoc-html" \
  "${SERVER_DIR}/target/apidocs/apidocs" \
  "${SERVER_DIR}/target/apidocs"; do
  if [ -f "${candidate}/index.html" ]; then
    SRC="${candidate}"
    break
  fi
done

if [ -z "${SRC}" ]; then
  echo "JavaDoc index.html not found under ${SERVER_DIR}/target" >&2
  exit 1
fi

echo "Unifying JavaDoc HTML from ${SRC} -> ${UNIFIED}"
rm -rf "${UNIFIED}"
mkdir -p "${UNIFIED}"
cp -a "${SRC}/." "${UNIFIED}/"

echo "Unified JavaDoc site: ${UNIFIED}/index.html"
