#!/usr/bin/env bash
# Exercise real Git revisions without changing this checkout or contacting upstream.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
upstream="$work_dir/upstream with spaces"
target="$work_dir/lesson3 with spaces"
mkdir -p "$upstream/generators/lib" "$upstream/config" "$target/scripts"
cp "$repo_dir/scripts/vendor-generator.sh" "$target/scripts/"
git -C "$upstream" init -q
for file in build_docs.js sections.js docx_kit.js attribution.js; do
  printf 'original library: %s\n' "$file" > "$upstream/generators/lib/$file"
done
printf 'year: auto   # upstream dynamic year\nlesson_footer: SeaVuria and ARES.\n' > "$upstream/config/attribution.yaml"
git -C "$upstream" add .
git -C "$upstream" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm original
library_sha="$(git -C "$upstream" rev-parse HEAD)"
for file in build_docs.js sections.js docx_kit.js attribution.js; do
  printf 'changed library: %s\n' "$file" > "$upstream/generators/lib/$file"
done
printf 'year: auto   # upstream dynamic year\nlesson_footer: SeaVuria and ARES Education.\nslide_footer: unused\n' > "$upstream/config/attribution.yaml"
git -C "$upstream" add .
git -C "$upstream" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm updated
config_sha="$(git -C "$upstream" rev-parse HEAD)"

fail() { echo "test-vendor-generator: $*" >&2; cat "$work_dir/output" >&2; exit 1; }
check_copy() {
  local lib_revision="$1" config_revision="$2" file
  for file in build_docs.js sections.js docx_kit.js attribution.js; do
    git -C "$upstream" show "$lib_revision:generators/lib/$file" > "$work_dir/expected"
    cmp "$work_dir/expected" "$target/app/src/generator/vendor/lib/$file" || fail "wrong library: $file"
  done
  git -C "$upstream" show "$config_revision:config/attribution.yaml" > "$work_dir/expected"
  cmp "$work_dir/expected" "$target/app/src/generator/vendor/config/attribution.upstream.yaml" \
    || fail 'pristine config does not match requested revision'
  {
    printf 'year: 2026   # Lesson3: fixed configured copyright year (upstream: auto); see PROVENANCE.md\n'
    tail -n +2 "$work_dir/expected"
  } > "$work_dir/expected-fixed"
  cmp "$work_dir/expected-fixed" "$target/app/src/generator/config/attribution.yaml" \
    || fail 'runtime config differs beyond the fixed-year line'
}

bash "$target/scripts/vendor-generator.sh" "$upstream" "$library_sha" > "$work_dir/output" 2>&1
check_copy "$library_sha" "$library_sha"
echo 'ok: original two-argument invocation takes libraries and config from the same revision'

bash "$target/scripts/vendor-generator.sh" "$upstream" "$library_sha" "$config_sha" > "$work_dir/output" 2>&1
check_copy "$library_sha" "$config_sha"
echo 'ok: split revisions retain old libraries and new config, including the unused key'

if bash "$target/scripts/vendor-generator.sh" "$upstream" "$config_sha" missing-config-revision \
  > "$work_dir/output" 2>&1; then
  fail 'missing config revision succeeded'
fi
check_copy "$library_sha" "$config_sha"
echo 'ok: invalid config revision fails before any vendored file changes'

if bash "$target/scripts/vendor-generator.sh" "$upstream" missing-library-revision "$config_sha" \
  > "$work_dir/output" 2>&1; then
  fail 'missing library revision succeeded'
fi
check_copy "$library_sha" "$config_sha"
echo 'ok: invalid library revision fails before any vendored file changes'
echo 'test-vendor-generator: PASS'
