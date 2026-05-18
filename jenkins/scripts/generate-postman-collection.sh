#!/usr/bin/env bash
# Convert exported openapi.json to a Postman Collection v2.1 (importable in Postman).
# Requires Node.js/npx (same as client unit tests on the Jenkins agent).
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
VERSION="${2:-local}"
SERVER_DIR="${REPO_ROOT}/server"
OPENAPI_JSON="${SERVER_DIR}/target/openapi/openapi.json"
OUT_DIR="${SERVER_DIR}/target/openapi"
COLLECTION_FILE="${OUT_DIR}/mercotrace.postman_collection.json"
ARTIFACT_FILE="${SERVER_DIR}/mercotrace-postman-${VERSION}.json"
CONVERTER_VERSION="${POSTMAN_CONVERTER_VERSION:-4.25.0}"

if [ ! -f "${OPENAPI_JSON}" ]; then
  echo "Missing ${OPENAPI_JSON} — run generate-openapi.sh first" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found — install Node.js 20+ on the Jenkins agent" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
rm -f "${COLLECTION_FILE}" "${ARTIFACT_FILE}"

# Postman's example generator chokes on Java-style atomic groups (?>) in validation patterns.
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
open(dst, "w", encoding="utf-8").write(json.dumps(spec))
print(f"Prepared Postman OpenAPI copy ({stripped} incompatible pattern(s) removed)")
PY

echo "Converting OpenAPI to Postman collection (openapi-to-postmanv2@${CONVERTER_VERSION})..."
npx --yes "openapi-to-postmanv2@${CONVERTER_VERSION}" \
  -s "${POSTMAN_OPENAPI}" \
  -o "${COLLECTION_FILE}" \
  -p

if [ ! -s "${COLLECTION_FILE}" ]; then
  echo "Postman collection file is empty: ${COLLECTION_FILE}" >&2
  exit 1
fi

export MERCO_POSTMAN_COLLECTION="${COLLECTION_FILE}"
python3 <<'PY'
import json
import os
import sys

path = os.environ["MERCO_POSTMAN_COLLECTION"]
with open(path, encoding="utf-8") as f:
    coll = json.load(f)
if coll.get("info", {}).get("schema") and "collection/v2" not in coll["info"]["schema"]:
    print(f"warning: unexpected collection schema: {coll['info'].get('schema')}", file=sys.stderr)
items = coll.get("item")
if not isinstance(items, list) or len(items) == 0:
    raise SystemExit("Postman sanity check failed: collection has no folders/requests")
print(f"Postman collection OK: {len(items)} top-level folder(s)/item(s)")
PY

cp "${COLLECTION_FILE}" "${ARTIFACT_FILE}"

echo "Postman collection written to:"
echo "  ${COLLECTION_FILE}"
echo "  ${ARTIFACT_FILE} ($(wc -c < "${ARTIFACT_FILE}" | tr -d ' ') bytes)"
