#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT_DIR="dist"
OUT_ZIP="$OUT_DIR/zen-view-$VERSION.zip"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

zip -r "$OUT_ZIP" \
  manifest.json \
  service-worker.js \
  content \
  vendor \
  -x '*.DS_Store'

echo "Packaged $OUT_ZIP"
