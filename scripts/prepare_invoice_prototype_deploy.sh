#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/invoice-prototype"
DIST_DIR="$APP_DIR/dist"
API_KEY="${VITE_FIREBASE_API_KEY:-}"

if [[ -z "$API_KEY" ]]; then
  echo "ERROR: VITE_FIREBASE_API_KEY is not set." >&2
  echo "This deploy must inject the Firebase Web API key before publishing dashboards." >&2
  exit 1
fi

cd "$APP_DIR"
npm run build

for file in \
  "$DIST_DIR/hyvs-mavs-dashboard.html" \
  "$DIST_DIR/audience-dashboard.html"
do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: Expected dashboard file missing: $file" >&2
    exit 1
  fi
  perl -0pi -e 's/__FIREBASE_API_KEY__/$ENV{VITE_FIREBASE_API_KEY}/g' "$file"
done

mkdir -p \
  "$DIST_DIR/dashboard/hyvs-mavs" \
  "$DIST_DIR/dashboard/audience" \
  "$DIST_DIR/prototype/ai_agent" \
  "$DIST_DIR/prototype/ai_agent/0408_v1"

cp "$DIST_DIR/hyvs-mavs-dashboard.html" "$DIST_DIR/dashboard/hyvs-mavs/index.html"
cp "$DIST_DIR/audience-dashboard.html" "$DIST_DIR/dashboard/audience/index.html"
cp "$DIST_DIR/index.html" "$DIST_DIR/prototype/ai_agent/index.html"
cp "$DIST_DIR/index.html" "$DIST_DIR/prototype/ai_agent/0408_v1/index.html"

if grep -R "__FIREBASE_API_KEY__" -n "$DIST_DIR" >/dev/null; then
  echo "ERROR: Firebase API key placeholder still exists in dist output." >&2
  grep -R "__FIREBASE_API_KEY__" -n "$DIST_DIR" >&2 || true
  exit 1
fi

echo "Deploy assets prepared successfully."
