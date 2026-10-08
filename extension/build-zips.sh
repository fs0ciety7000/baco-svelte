#!/usr/bin/env bash
# Construit les paquets de l'extension DICOS pour Chrome/Edge et Firefox dans extension/dist/.
# Les sources (src/, popup, icônes) sont communes ; seul le manifest diffère (background service_worker vs scripts,
# browser_specific_settings pour Firefox). À relancer après toute modification de l'extension.
set -euo pipefail
cd "$(dirname "$0")"

SRC="dicos-connector"
VERSION="$(node -e "process.stdout.write(require('./${SRC}/manifest.json').version)")"
OUT="dist"
rm -rf "$OUT" && mkdir -p "$OUT"

# --- Chrome / Edge : manifest.json tel quel, sans le manifest Firefox ---
( cd "$SRC" && zip -r -q "../$OUT/csm-dicos-connector-chrome-v${VERSION}.zip" . \
    -x '*/.*' -x 'manifest.firefox.json' )

# --- Firefox : manifest.firefox.json renommé en manifest.json ---
TMP="$(mktemp -d)"
cp -r "$SRC" "$TMP/ext"
mv "$TMP/ext/manifest.firefox.json" "$TMP/ext/manifest.json"
( cd "$TMP/ext" && zip -r -q "$OLDPWD/$OUT/csm-dicos-connector-firefox-v${VERSION}.zip" . -x '*/.*' )
rm -rf "$TMP"

echo "Paquets construits (v${VERSION}) :"
( cd "$OUT" && ls -1 && unzip -l "csm-dicos-connector-firefox-v${VERSION}.zip" | grep -E "manifest.json|background|inject|content|popup" )
