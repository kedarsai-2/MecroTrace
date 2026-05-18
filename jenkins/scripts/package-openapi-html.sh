#!/usr/bin/env bash
# Package generated openapi.json with Swagger UI into a browsable HTML zip.
# Embeds the spec in openapi-spec.js so index.html works via file:// (no fetch/CORS).
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

python3 <<PY
import json
from pathlib import Path

spec_path = Path("${OPENAPI_JSON}")
out_js = Path("${HTML_DIR}") / "openapi-spec.js"
spec = json.loads(spec_path.read_text(encoding="utf-8"))
out_js.write_text("window.OPENAPI_SPEC = " + json.dumps(spec) + ";\n", encoding="utf-8")
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
      window.ui = SwaggerUIBundle({
        spec: window.OPENAPI_SPEC,
        dom_id: '#swagger-ui',
        deepLinking: true,
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
echo "Unzip and open index.html in a browser (works offline; openapi.json included for tooling)."
