#!/usr/bin/env bash
# Builds a clean Chrome Web Store package containing only runtime files.
# Output: dist/klick-klean-<version>.zip
# Usage: bash scripts/build-zip.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -e "process.stdout.write(require('./manifest.json').version)")"
STAGE="dist/klick-klean-${VERSION}"
ZIP="dist/klick-klean-${VERSION}.zip"
ZIP_ABS="${ROOT}/${ZIP}"

# Runtime files/directories referenced by the manifest and HTML surfaces.
RUNTIME=(
  manifest.json
  sw.js
  i18n.js
  privacy.html
  LICENSE
  shared
  cleanup
  popup
  options
  onboarding
  static
  _locales
)

rm -rf dist
mkdir -p "$STAGE"

for item in "${RUNTIME[@]}"; do
  if [ ! -e "$item" ]; then
    echo "ERROR: required runtime path missing: $item" >&2
    exit 1
  fi
  cp -R "$item" "$STAGE/"
done

# Never ship editor/OS cruft.
find "$STAGE" -name ".DS_Store" -delete
find "$STAGE" -name "*.map" -delete

# Zip the CONTENTS of the staging dir so manifest.json sits at the archive root
# (the Chrome Web Store rejects packages where the manifest is nested in a folder).
( cd "$STAGE" && zip -rqX "$ZIP_ABS" . -x "*.DS_Store" )

echo "Built ${ZIP} (version ${VERSION})"
ls -l "$ZIP"
