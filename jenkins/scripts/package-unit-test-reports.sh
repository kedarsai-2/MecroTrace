#!/usr/bin/env bash
# Bundle server Surefire + client Vitest HTML reports into one downloadable zip.
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
VERSION="${2:-local}"
SERVER_DIR="${REPO_ROOT}/server"
CLIENT_DIR="${REPO_ROOT}/client"
STAGING="${SERVER_DIR}/target/unit-test-html"
OUT_ZIP="${SERVER_DIR}/mercotrace-unit-tests-${VERSION}.zip"

rm -rf "${STAGING}"
mkdir -p "${STAGING}/server" "${STAGING}/client"

SERVER_REPORT=""
for candidate in \
  "${SERVER_DIR}/target/surefire-reports/surefire-report.html" \
  "${SERVER_DIR}/target/surefire-reports/surefire-report.html.html"; do
  if [ -f "${candidate}" ]; then
    SERVER_REPORT="${candidate}"
    break
  fi
done

if [ -n "${SERVER_REPORT}" ]; then
  cp "${SERVER_REPORT}" "${STAGING}/server/index.html"
  echo "Included server Surefire HTML report"
else
  echo "No server Surefire HTML report found (run mvn test first)" >&2
fi

CLIENT_REPORT="${CLIENT_DIR}/target/vitest-report/index.html"
if [ -f "${CLIENT_REPORT}" ]; then
  cp -R "${CLIENT_DIR}/target/vitest-report/." "${STAGING}/client/"
  echo "Included client Vitest HTML report"
else
  echo "No client Vitest HTML report found (run CI=true npm test first)" >&2
fi

if [ ! -f "${STAGING}/server/index.html" ] && [ ! -f "${STAGING}/client/index.html" ]; then
  echo "Nothing to package — run server and/or client unit test stages first" >&2
  exit 1
fi

cat > "${STAGING}/index.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MercoTrace unit test reports</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
    a { display: block; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <h1>MercoTrace unit test reports</h1>
  <p>Open the report for the module you ran in this build:</p>
EOF

if [ -f "${STAGING}/server/index.html" ]; then
  echo '  <a href="server/index.html">Server (Java / Surefire)</a>' >> "${STAGING}/index.html"
fi
if [ -f "${STAGING}/client/index.html" ]; then
  echo '  <a href="client/index.html">Client (Vitest)</a>' >> "${STAGING}/index.html"
fi

cat >> "${STAGING}/index.html" <<'EOF'
</body>
</html>
EOF

rm -f "${OUT_ZIP}"
(cd "${STAGING}" && zip -qr "${OUT_ZIP}" .)

echo "Created ${OUT_ZIP} ($(du -h "${OUT_ZIP}" | cut -f1))"
echo "Unzip and open index.html to browse server and client test reports."
