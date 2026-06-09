#!/usr/bin/env bash
# Build the Chrome Web Store upload zip (only the files the extension ships).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/cineville-ratings-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"
zip -rX "$OUT" manifest.json src icons -x '*.DS_Store' >/dev/null

echo "Built $OUT"
unzip -l "$OUT"
