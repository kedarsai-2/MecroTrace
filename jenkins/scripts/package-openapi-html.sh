#!/usr/bin/env bash
# Package generated openapi.json with Swagger UI into a browsable HTML zip.
# Embeds the spec in openapi-spec.js so index.html works via file:// (no fetch/CORS).
# Swagger UI is initialized with `spec: window.OPENAPI_SPEC` so $ref resolves reliably offline.
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
VERSION="${2:-local}"
SERVER_DIR="${REPO_ROOT}/server"
OPENAPI_JSON="${SERVER_DIR}/target/openapi/openapi.json"
HTML_DIR="${SERVER_DIR}/target/swagger-html"
OUT_ZIP="${SERVER_DIR}/mercotrace-openapi-${VERSION}.zip"
SUI_VERSION="${SWAGGER_UI_VERSION:-5.18.2}"

if [ ! -f "${OPENAPI_JSON}" ]; then
  echo "Missing ${OPENAPI_JSON} — run generate-openapi.sh first" >&2
  exit 1
fi

rm -rf "${HTML_DIR}"
mkdir -p "${HTML_DIR}"
cp "${OPENAPI_JSON}" "${HTML_DIR}/openapi.json"
POSTMAN_COLLECTION="${SERVER_DIR}/target/openapi/mercotrace.postman_collection.json"
if [ -f "${POSTMAN_COLLECTION}" ]; then
  cp "${POSTMAN_COLLECTION}" "${HTML_DIR}/mercotrace.postman_collection.json"
  echo "Bundled Postman collection into HTML artifact"
fi

export MERCO_OPENAPI_JSON="${OPENAPI_JSON}"
export MERCO_SWAGGER_HTML_DIR="${HTML_DIR}"
# Quoted heredoc: bash must not expand Python strings like "$ref" (set -u treats as unset vars).
python3 <<'PY'
import json
import os
from pathlib import Path

spec_path = Path(os.environ["MERCO_OPENAPI_JSON"])
html_dir = Path(os.environ["MERCO_SWAGGER_HTML_DIR"])
spec = json.loads(spec_path.read_text(encoding="utf-8"))

# Embed spec for offline Swagger UI (passed as `spec` in index.html, not Blob URL).
(html_dir / "openapi-spec.js").write_text(
    "window.OPENAPI_SPEC = " + json.dumps(spec) + ";\n",
    encoding="utf-8",
)

# Coverage summary for the zip artifact.
HTTP = {"get", "post", "put", "patch", "delete", "head", "options"}
paths = spec.get("paths", {})
ops = sum(1 for methods in paths.values() for m in methods if m in HTTP)
api_ops = sum(
    1
    for path, methods in paths.items()
    if path.startswith("/api")
    for m in methods
    if m in HTTP
)
schema_count = len(spec.get("components", {}).get("schemas", {}))
summary = f"""MercoTrace OpenAPI export summary
openapi version: {spec.get("openapi", "?")}
paths (total): {len(paths)}
operations (total): {ops}
/api operations: {api_ops}
component schemas: {schema_count}
"""
(html_dir / "openapi-summary.txt").write_text(summary, encoding="utf-8")
print(summary.strip())

# Fail fast if the spec is unusable for Swagger UI (catches OAS 3.1 + UI regressions).
reg = spec.get("paths", {}).get("/api/auth/register", {}).get("post", {})
rb = (((reg.get("requestBody") or {}).get("content") or {}).get("application/json") or {}).get("schema")
ref_key = "$ref"
if not isinstance(rb, dict) or ref_key not in rb:
    raise SystemExit(
        "OpenAPI sanity check failed: POST /api/auth/register requestBody missing application/json $ref"
    )
ref_name = rb[ref_key].rsplit("/", 1)[-1]
schema_defs = spec.get("components", {}).get("schemas", {})
if ref_name not in schema_defs:
    raise SystemExit(
        f"OpenAPI sanity check failed: missing components.schemas.{ref_name} (register request body ref broken)"
    )
if schema_defs[ref_name].get("type") != "object":
    raise SystemExit(
        f"OpenAPI sanity check failed: {ref_name} is not type object (got {schema_defs[ref_name].get('type')!r})"
    )
r200 = (((reg.get("responses") or {}).get("200") or {}).get("content") or {}).get("application/json", {}).get(
    "schema"
)
if not isinstance(r200, dict) or ref_key not in r200:
    raise SystemExit("OpenAPI sanity check failed: POST /api/auth/register 200 response missing schema $ref")
PY

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "Downloading Swagger UI ${SUI_VERSION}..."
curl -fsSL "https://github.com/swagger-api/swagger-ui/archive/refs/tags/v${SUI_VERSION}.zip" -o "${WORK_DIR}/swagger-ui.zip"
unzip -q "${WORK_DIR}/swagger-ui.zip" -d "${WORK_DIR}"
cp -R "${WORK_DIR}/swagger-ui-${SUI_VERSION}/dist/"* "${HTML_DIR}/"

cat > "${HTML_DIR}/index.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MercoTrace API</title>
  <link rel="stylesheet" href="swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="openapi-spec.js"></script>
  <script src="swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    window.onload = function () {
      // Pass the spec object directly so Swagger UI resolves #/components/schemas/* without
      // relying on Blob URL document bases (some browsers show broken refs as plain "string").
      window.ui = SwaggerUIBundle({
        spec: window.OPENAPI_SPEC,
        dom_id: '#swagger-ui',
        deepLinking: true,
        validatorUrl: null,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
      });
    };
  </script>
</body>
</html>
EOF

echo "Packaging ${OUT_ZIP}"
rm -f "${OUT_ZIP}"
(cd "${HTML_DIR}" && zip -qr "${OUT_ZIP}" .)

echo "Created ${OUT_ZIP} ($(du -h "${OUT_ZIP}" | cut -f1))"
echo "Unzip and open index.html in a browser (works offline; openapi.json + Postman collection included when generated)."
