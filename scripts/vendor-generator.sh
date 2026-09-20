#!/usr/bin/env bash
#
# vendor-generator.sh — re-sync the vendored ARES generator into Lesson3.
#
# Copies the three Node lib files byte-verbatim from a local clone of
# cbe-generation-system at a given commit into app/src/generator/vendor/lib/.
# aresResources.js is intentionally NOT vendored (single-runtime; see
# app/src/generator/vendor/PROVENANCE.md).
#
# Usage:
#   scripts/vendor-generator.sh <path-to-cbe-generation-system-clone> <commit-sha>
#
# After running, re-run both fidelity regressions BEFORE trusting the new version, then update
# PROVENANCE.md. Create a mirror tag only as a separately approved upstream-repository operation.
set -euo pipefail

GEN_CLONE="${1:?usage: vendor-generator.sh <clone-path> <commit-sha>}"
SHA="${2:?usage: vendor-generator.sh <clone-path> <commit-sha>}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VEND="$REPO_ROOT/app/src/generator/vendor/lib"
mkdir -p "$VEND"

FILES=(build_docs.js sections.js docx_kit.js)

for f in "${FILES[@]}"; do
  git -C "$GEN_CLONE" show "${SHA}:generators/lib/$f" > "$VEND/$f"
  a="$(git -C "$GEN_CLONE" show "${SHA}:generators/lib/$f" | shasum -a 256 | cut -d' ' -f1)"
  b="$(shasum -a 256 "$VEND/$f" | cut -d' ' -f1)"
  if [ "$a" != "$b" ]; then
    echo "MISMATCH copying $f — aborting" >&2
    exit 1
  fi
  echo "vendored $f  ($a)"
done

echo
echo "Done. Next steps:"
echo "  1. Re-run the fidelity regression: (cd app && npx tsx scripts/fidelity-spike.ts)"
echo "  2. Re-run the adapter regression: (cd app && npx tsx scripts/adapter-fidelity.ts)"
echo "  3. Investigate every mismatch, then update PROVENANCE.md (SHA/date/checksums)."
echo "     Create a mirror tag only when that separate upstream operation is approved."
