#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -x "./mvnw" ]]; then
  echo "Error: ./mvnw not found or not executable in $ROOT_DIR"
  exit 1
fi

SPRING_CMD=(./mvnw -Pdev spring-boot:run -DskipTests)
COMPILE_CMD=(./mvnw -q -Pdev compile -DskipTests)

echo "Starting backend (DevTools enabled)..."
"${SPRING_CMD[@]}" &
SPRING_PID=$!

cleanup() {
  echo
  echo "Stopping backend dev runner..."
  if kill -0 "$SPRING_PID" 2>/dev/null; then
    kill "$SPRING_PID" 2>/dev/null || true
    wait "$SPRING_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

watch_paths=(
  "src/main/java"
  "src/main/resources"
  "pom.xml"
)

echo "Watching for backend changes..."
echo "Tip: install inotify-tools for best performance."

run_compile() {
  echo
  echo "[watcher] change detected -> compiling..."
  if "${COMPILE_CMD[@]}"; then
    echo "[watcher] compile complete (DevTools will restart app if needed)."
  else
    echo "[watcher] compile failed. Fix errors; watcher will keep running."
  fi
}

if command -v inotifywait >/dev/null 2>&1; then
  while kill -0 "$SPRING_PID" 2>/dev/null; do
    inotifywait -qq -r \
      -e modify,create,delete,move \
      --exclude '(\.git|target|node_modules|\.idea|\.vscode)' \
      "${watch_paths[@]}" || true
    kill -0 "$SPRING_PID" 2>/dev/null || break
    run_compile
  done
else
  # Fallback polling (works without inotify-tools).
  last_state=""
  while kill -0 "$SPRING_PID" 2>/dev/null; do
    state="$( (find src/main/java src/main/resources -type f 2>/dev/null; echo pom.xml) | sort | xargs ls -l 2>/dev/null | sha1sum | awk '{print $1}' )"
    if [[ -n "$last_state" && "$state" != "$last_state" ]]; then
      run_compile
    fi
    last_state="$state"
    sleep 2
  done
fi

wait "$SPRING_PID"
