#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(node -e "console.log(require(process.argv[1]).version)" "$ROOT_DIR/manifest.json")
PPK_FILE=${KINTONE_PLUGIN_PPK:-}
OUT_FILE="$ROOT_DIR/../kintone-design-doc-exporter-plugin-v$VERSION.zip"

if [ -z "$PPK_FILE" ]; then
  printf '%s\n' "KINTONE_PLUGIN_PPK must point to an existing .ppk file." >&2
  exit 1
fi

npm exec --yes @kintone/plugin-packer -- \
  --ppk "$PPK_FILE" \
  --out "$OUT_FILE" \
  "$ROOT_DIR"

printf '%s\n' "Generated: $OUT_FILE"
