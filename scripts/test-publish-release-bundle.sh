#!/usr/bin/env bash
# Run the workflow's release helper against a stateful gh stub, never GitHub.
set -euo pipefail

if [[ "$(basename "$0")" == gh ]]; then
  stub_fail() { echo "STUB FAILURE: $*" >&2; exit 90; }
  [[ "${1:-}" == release && "${3:-}" == v1.1 ]] || stub_fail "unexpected gh command: $*"
  operation="$2"; shift 3
  echo "$operation" >>"$STUB_ROOT/calls"
  state="$(cat "$STUB_ROOT/state")"
  case "$operation" in
    view)
      [[ "$*" == '--json isDraft,isPrerelease --jq [.isDraft, .isPrerelease] | @tsv' ]] \
        || stub_fail "release state was not queried: $*"
      [[ "$state" != absent ]] || exit 1
      if [[ "$state" == draft ]]; then printf 'true\t'; else printf 'false\t'; fi
      cat "$STUB_ROOT/prerelease"
      ;;
    upload|create)
      [[ "${1:-}" == "$TEST_BUNDLE" && "${2:-}" == "$TEST_BUNDLE.sha256" ]] \
        || stub_fail 'both release assets must be attached'
      shift 2
      if [[ "$operation" == upload ]]; then
        [[ "$state" != absent && "$*" == --clobber ]] || stub_fail 'invalid upload'
      else
        [[ "$state" == absent && "$*" == '--draft --verify-tag --generate-notes --title Lesson3 v1.1' ]] \
          || stub_fail 'new release must be assembled as a draft'
        echo draft >"$STUB_ROOT/state"
        echo false >"$STUB_ROOT/prerelease"
      fi
      [[ "$FAIL_STAGE" != "$operation" ]] || exit 1
      echo attached >"$STUB_ROOT/assets"
      ;;
    edit)
      [[ "$state" == draft && -f "$STUB_ROOT/assets" ]] || stub_fail 'published before assets or edited published release'
      [[ "${1:-}" == --draft=false ]] || stub_fail 'draft was not published'
      shift
      if [[ "$#" != 0 ]]; then
        [[ "$#" == 1 && "$1" == "--prerelease=$(cat "$STUB_ROOT/prerelease")" ]] \
          || stub_fail 'prerelease state was not preserved'
      fi
      [[ "$FAIL_STAGE" != edit ]] || exit 1
      echo published >"$STUB_ROOT/state"
      ;;
    *) stub_fail "unexpected operation: $operation" ;;
  esac
  exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail() { echo "test-publish-release-bundle: FAIL: $*" >&2; cat "$TMP/output" >&2; exit 1; }
mkdir "$TMP/bin"
ln -s "$ROOT/scripts/test-publish-release-bundle.sh" "$TMP/bin/gh"
bundle="$TMP/bundle with spaces.tar.gz"
touch "$bundle" "$bundle.sha256"

prepare() {
  echo "$1" >"$TMP/state"
  echo "$2" >"$TMP/prerelease"
  rm -f "$TMP/assets"
  : >"$TMP/calls"
  : >"$TMP/output"
}
run_publish() {
  if env -i PATH="$TMP/bin:/usr/bin:/bin" STUB_ROOT="$TMP" TEST_BUNDLE="$bundle" FAIL_STAGE="$1" \
    bash "$ROOT/scripts/publish-release-bundle.sh" v1.1 "$bundle" >"$TMP/output" 2>&1; then
    RESULT=0
  else
    RESULT=$?
  fi
  ! grep -q 'STUB FAILURE' "$TMP/output" || fail 'stub contract violated'
}
check_published() {
  [[ "$RESULT" == 0 && "$(cat "$TMP/state")" == published && -f "$TMP/assets" ]] \
    || fail 'release not published with its assets'
  [[ "$(cat "$TMP/prerelease")" == "$1" ]] || fail 'prerelease changed'
  [[ "$(cat "$TMP/calls")" == "$2" ]] || fail 'wrong release operation order'
}

for prerelease in false true; do
  prepare draft "$prerelease"
  run_publish success
  check_published "$prerelease" $'view\nupload\nedit'
  echo "  ok: existing draft publishes after upload, prerelease=$prerelease preserved"

  prepare published "$prerelease"
  run_publish success
  check_published "$prerelease" $'view\nupload'
  echo "  ok: published release only replaces assets, prerelease=$prerelease preserved"
done

prepare absent false
run_publish success
check_published false $'view\ncreate\nedit'
echo '  ok: absent release is created with draft assets before publication'

for operation in upload create edit; do
  if [[ "$operation" == upload ]]; then prepare draft true; else prepare absent false; fi
  prerelease="$(cat "$TMP/prerelease")"
  run_publish "$operation"
  [[ "$RESULT" != 0 && "$(cat "$TMP/state")" == draft ]] || fail "$operation failure published a release"
  if [[ "$operation" != edit ]]; then
    ! grep -q '^edit$' "$TMP/calls" || fail 'published after failed asset upload'
  fi
  : >"$TMP/calls"
  run_publish success
  check_published "$prerelease" $'view\nupload\nedit'
  echo "  ok: $operation failure leaves a draft that a rerun finishes"
done

grep -Fq 'run: bash scripts/publish-release-bundle.sh "$GITHUB_REF_NAME" dist/lesson3-online-deploy.tar.gz' \
  "$ROOT/.github/workflows/publish-containers.yml" || fail 'workflow no longer invokes tested helper'
! grep -Eq 'lesson3-(app|migrate).*:latest|matrix\.package.*:latest' \
  "$ROOT/.github/workflows/publish-containers.yml" \
  || fail 'independent image jobs must not publish a non-atomic latest alias'
echo 'test-publish-release-bundle: PASS'
