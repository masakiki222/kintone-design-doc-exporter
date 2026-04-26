#!/bin/sh
set -eu

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(node -e "console.log(require(process.argv[1]).version)" "$ROOT_DIR/manifest.json")
PPK_FILE="/Users/masaki/Documents/kintone_plugin_ppk/secrets/kintone-design-doc-exporter-source.pikfdfclhfeodmelolamkkphpacankgp.private.ppk"
OUT_FILE="$ROOT_DIR/../kintone-design-doc-exporter-plugin-v$VERSION.zip"

npm exec --yes @kintone/plugin-packer -- \
  --ppk "$PPK_FILE" \
  --out "$OUT_FILE" \
  "$ROOT_DIR"

printf '%s\n' "Generated: $OUT_FILE"
