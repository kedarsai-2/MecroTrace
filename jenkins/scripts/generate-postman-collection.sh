#!/usr/bin/env bash
# Convert exported openapi.json to a Postman Collection v2.1 (importable in Postman).
# Uses OpenAPI Generator CLI (Java + curl only) — no Node.js/npx required on Jenkins.
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
VERSION="${2:-local}"
SERVER_DIR="${REPO_ROOT}/server"
TOOLS_DIR="${REPO_ROOT}/jenkins/tools"
OPENAPI_JSON="${SERVER_DIR}/target/openapi/openapi.json"
OUT_DIR="${SERVER_DIR}/target/openapi"
COLLECTION_FILE="${OUT_DIR}/mercotrace.postman_collection.json"
ARTIFACT_FILE="${SERVER_DIR}/mercotrace-postman-${VERSION}.json"
OG_VERSION="${OPENAPI_GENERATOR_VERSION:-7.11.0}"
OG_JAR="${TOOLS_DIR}/openapi-generator-cli-${OG_VERSION}.jar"
GEN_OUT="${OUT_DIR}/postman-generated"

if [ ! -f "${OPENAPI_JSON}" ]; then
  echo "Missing ${OPENAPI_JSON} — run generate-openapi.sh first" >&2
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "java not found on PATH" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found on PATH (needed to download OpenAPI Generator CLI)" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}" "${TOOLS_DIR}"
rm -rf "${GEN_OUT}"
rm -f "${COLLECTION_FILE}" "${ARTIFACT_FILE}"

if [ ! -f "${OG_JAR}" ]; then
  echo "Downloading OpenAPI Generator CLI ${OG_VERSION}..."
  curl -fsSL \
    "https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${OG_VERSION}/openapi-generator-cli-${OG_VERSION}.jar" \
    -o "${OG_JAR}"
fi

# Sanitize spec copy for converters (Java regex patterns, empty info fields).
POSTMAN_OPENAPI="${OUT_DIR}/openapi-for-postman.json"
export MERCO_OPENAPI_JSON="${OPENAPI_JSON}" MERCO_POSTMAN_OPENAPI="${POSTMAN_OPENAPI}"
python3 <<'PY'
import json
import os

src = os.environ["MERCO_OPENAPI_JSON"]
dst = os.environ["MERCO_POSTMAN_OPENAPI"]
spec = json.loads(open(src, encoding="utf-8").read())
stripped = 0

def walk(node):
    global stripped
    if isinstance(node, dict):
        pat = node.get("pattern")
        if isinstance(pat, str) and "(?>" in pat:
            node.pop("pattern", None)
            stripped += 1
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for v in node:
            walk(v)

walk(spec)
info = spec.setdefault("info", {})
if not (info.get("license") or {}).get("name"):
    info["license"] = {"name": "unlicensed"}
contact = info.get("contact")
if not isinstance(contact, dict) or not any(contact.values()):
    info["contact"] = {"name": "MercoTrace", "email": "api@localhost"}

open(dst, "w", encoding="utf-8").write(json.dumps(spec))
print(f"Prepared Postman OpenAPI copy ({stripped} incompatible pattern(s) removed)")
PY

echo "Converting OpenAPI to Postman collection (openapi-generator-cli@${OG_VERSION})..."
java -jar "${OG_JAR}" generate \
  -g postman-collection \
  -i "${POSTMAN_OPENAPI}" \
  -o "${GEN_OUT}" \
  --skip-validate-spec

GENERATED="${GEN_OUT}/postman.json"
if [ ! -s "${GENERATED}" ]; then
  echo "Expected ${GENERATED} was not produced" >&2
  exit 1
fi

cp "${GENERATED}" "${COLLECTION_FILE}"

export MERCO_POSTMAN_COLLECTION="${COLLECTION_FILE}"
python3 <<'PY'
import json
import os
import sys

path = os.environ["MERCO_POSTMAN_COLLECTION"]
with open(path, encoding="utf-8") as f:
    coll = json.load(f)
items = coll.get("item")
if not isinstance(items, list) or len(items) == 0:
    raise SystemExit("Postman sanity check failed: collection has no folders/requests")
print(f"Postman collection OK: {len(items)} top-level folder(s)/item(s)")
PY

cp "${COLLECTION_FILE}" "${ARTIFACT_FILE}"

echo "Postman collection written to:"
echo "  ${COLLECTION_FILE}"
echo "  ${ARTIFACT_FILE} ($(wc -c < "${ARTIFACT_FILE}" | tr -d ' ') bytes)"
