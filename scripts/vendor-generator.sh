#!/usr/bin/env bash
#
# vendor-generator.sh — re-sync the vendored ARES generator into Lesson3.
#
# Copies the four Node lib files byte-verbatim from a local clone of
# cbe-generation-system at a given commit into app/src/generator/vendor/lib/, and writes the
# attribution config (see the YAML section below).
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

FILES=(build_docs.js sections.js docx_kit.js attribution.js)

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

# --- attribution config -----------------------------------------------------------------------
# Upstream's config/attribution.yaml is read by the pristine lib/attribution.js. It says `year: auto`,
# which stamps the RENDER-TIME year: the same immutable snapshot re-rendered in January would then
# produce different bytes, contradicting the byte-stability contract (renderVersion.ts). Lesson3 therefore
# ships a copy with a FIXED configured copyright year. The ONLY permitted difference from upstream is that
# one line; this script enforces it, so a re-sync can never silently widen the deviation.
PRISTINE_DIR="$REPO_ROOT/app/src/generator/vendor/config"   # provenance copy, byte-verbatim
# The pristine lib/attribution.js resolves its config as <its dir>/../../config/attribution.yaml, which
# from vendor/lib is app/src/generator/config/ — the file must live exactly there for dev, tests and the
# fidelity scripts. The PRODUCTION bundle does NOT resolve that path (Turbopack bakes a build-time
# `/ROOT/...` placeholder into `__dirname`), so generator/index.ts also sets ATTRIBUTION_YAML from
# process.cwd(), and next.config.ts lists the file in outputFileTracingIncludes so it ships.
CONFIG_DIR="$REPO_ROOT/app/src/generator/config"
FIXED_YEAR=2026
mkdir -p "$PRISTINE_DIR" "$CONFIG_DIR"
git -C "$GEN_CLONE" show "${SHA}:config/attribution.yaml" > "$PRISTINE_DIR/attribution.upstream.yaml"
sed -E "s/^year: auto( .*)?$/year: ${FIXED_YEAR}   # Lesson3: fixed configured copyright year (upstream: auto); see PROVENANCE.md/" \
  "$PRISTINE_DIR/attribution.upstream.yaml" > "$CONFIG_DIR/attribution.yaml"
if ! grep -q "^year: ${FIXED_YEAR} " "$CONFIG_DIR/attribution.yaml"; then
  echo "attribution.yaml: could not apply the fixed year — upstream's 'year:' line changed shape; aborting" >&2
  exit 1
fi
changed="$(diff "$PRISTINE_DIR/attribution.upstream.yaml" "$CONFIG_DIR/attribution.yaml" | grep -c '^[<>]' || true)"
if [ "$changed" != "2" ]; then
  echo "attribution.yaml: expected exactly one changed line (2 diff rows), found $changed — aborting" >&2
  exit 1
fi
echo "vendored config/attribution.yaml  (year fixed to ${FIXED_YEAR}; pristine copy at vendor/config/attribution.upstream.yaml)"
echo "  upstream sha256: $(shasum -a 256 "$PRISTINE_DIR/attribution.upstream.yaml" | cut -d' ' -f1)"
echo "  lesson3  sha256: $(shasum -a 256 "$CONFIG_DIR/attribution.yaml" | cut -d' ' -f1)"

echo
echo "Done. Next steps:"
echo "  1. Re-run the fidelity regression: (cd app && npx tsx scripts/fidelity-spike.ts)"
echo "  2. Re-run the adapter regression: (cd app && npx tsx scripts/adapter-fidelity.ts)"
echo "     Pick sub-strands that exercise what changed (Physics 4.1 has no framework table): set"
echo "     ARES_FIDELITY_SUBSTRAND_DIR=<clone-at-the-pin>/data/outputs/v2/<Subject>/<SSx.y_Name> (see scripts/lib/fidelityFixture.ts)"
echo "  2b. Render the WHOLE corpus: (cd app && ARES_CORPUS_DIR=<folder of bundle JSON> npx tsx scripts/corpus-check.ts)"
echo "  3. Investigate every mismatch, then update PROVENANCE.md (SHA/date/checksums)."
echo "     Create a mirror tag only when that separate upstream operation is approved."
