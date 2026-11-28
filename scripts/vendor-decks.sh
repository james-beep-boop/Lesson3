#!/usr/bin/env bash
# Re-sync the ARES deck renderer from a local cbe-generation-system clone.
# Update the pin and hashes in PROVENANCE.md, bump the deck render version, and run the pilot test.
set -euo pipefail

upstream="${1:?usage: vendor-decks.sh <clone-path> <presentations-commit>}"
revision="${2:?usage: vendor-decks.sh <clone-path> <presentations-commit>}"
commit="$(git -C "$upstream" rev-parse --verify "${revision}^{commit}")"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vendor="$root/app/src/decks/vendor"

# Use the recorded subset. The pilot fixtures and Carlito fonts are refreshed separately.
files=()
while IFS= read -r file; do
  files+=("$file")
done < <(sed -nE 's/^[a-f0-9]{64}  (\.\/(LICENSE|config\/.*|data\/.*|generators\/.*))$/\1/p' "$vendor/PROVENANCE.md")
if [ "${#files[@]}" -eq 0 ]; then
  echo "No deck renderer files found in PROVENANCE.md" >&2
  exit 1
fi

# Validate the entire subset at the pinned revision before replacing any file.
for file in "${files[@]}"; do
  git -C "$upstream" cat-file -e "${commit}:${file#./}"
done

echo "Deck renderer commit $commit"
for file in "${files[@]}"; do
  mkdir -p "$vendor/$(dirname "$file")"
  git -C "$upstream" cat-file blob "${commit}:${file#./}" > "$vendor/$file"
done
(cd "$vendor" && shasum -a 256 "${files[@]}")
