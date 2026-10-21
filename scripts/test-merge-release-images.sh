#!/usr/bin/env bash
# Exercise registry failures and incomplete platforms without writing to any registry.
set -euo pipefail

if [[ "$(basename "$0")" == docker ]]; then
  [[ "${1:-} ${2:-}" == 'buildx imagetools' ]] || exit 90
  operation="$3"; shift 3
  case "$operation" in
    inspect)
      ref="$1"
      [[ "${2:-} ${3:-}" == '--format {{json .Manifest}}' ]] || exit 90
      case "$ref" in
        "$TEST_IMAGE:$TEST_VERSION@$TEST_APP_INDEX"|"ghcr.io/james-beep-boop/lesson3-migrate:$TEST_VERSION@$TEST_MIGRATE_INDEX")
          digest="${ref##*@}"
          [[ "$TEST_CASE" != bundle-mismatch ]] || digest="$TEST_AMD_DIGEST"
          jq -n --arg digest "$digest" '{digest: $digest, manifests: [
            {platform: {os: "linux", architecture: "amd64"}},
            {platform: {os: "linux", architecture: "arm64"}},
            {platform: {os: "unknown", architecture: "unknown"}}]}'
          exit 0
          ;;
        "$TEST_IMAGE:$TEST_VERSION@$TEST_AMD_DIGEST") arch=amd64; digest="$TEST_AMD_DIGEST" ;;
        "ghcr.io/james-beep-boop/lesson3-migrate:$TEST_VERSION@$TEST_ARM_DIGEST") arch=arm64; digest="$TEST_ARM_DIGEST" ;;
        "$TEST_IMAGE:$TEST_VERSION-amd64") arch=amd64; digest="$TEST_AMD_DIGEST" ;;
        "$TEST_IMAGE:$TEST_VERSION-arm64")
          [[ "$TEST_CASE" != missing-arm ]] || exit 1
          arch=arm64; digest="$TEST_ARM_DIGEST"
          [[ "$TEST_CASE" != wrong-arm ]] || arch=amd64
          [[ "$TEST_CASE" != bad-digest ]] || digest=sha256:broken
          ;;
        "$TEST_IMAGE:$TEST_VERSION")
          echo inspect-published >>"$STUB_ROOT/calls"
          jq -n --argjson incomplete "$([[ "$TEST_CASE" == bad-published ]] && echo true || echo false)" \
            '{manifests: ([{platform: {os: "linux", architecture: "amd64"}}] +
              (if $incomplete then [] else [{platform: {os: "linux", architecture: "arm64"}}] end))}'
          exit 0
          ;;
        *) exit 90 ;;
      esac
      echo "inspect-$arch" >>"$STUB_ROOT/calls"
      jq -n --arg arch "$arch" --arg digest "$digest" \
        '{digest: $digest, manifests: [{platform: {os: "linux", architecture: $arch}},
          {platform: {os: "unknown", architecture: "unknown"}}]}'
      ;;
    create)
      if [[ "${1:-}" == --dry-run ]]; then
        echo preview >>"$STUB_ROOT/calls"
        shift
        jq -n --argjson incomplete "$([[ "$TEST_CASE" == bad-preview ]] && echo true || echo false)" \
          '{manifests: ([{platform: {os: "linux", architecture: "amd64"}}] +
            (if $incomplete then [] else [{platform: {os: "linux", architecture: "arm64"}}] end))}'
      else
        [[ "${1:-} ${2:-}" == "--tag $TEST_IMAGE:$TEST_VERSION" ]] || exit 90
        echo publish >>"$STUB_ROOT/calls"
        [[ "$TEST_CASE" != publish-error ]] || exit 1
        shift 2
      fi
      [[ "$#" == 2 && "$1" == "$TEST_IMAGE@$TEST_AMD_DIGEST" && "$2" == "$TEST_IMAGE@$TEST_ARM_DIGEST" ]] \
        || exit 90
      ;;
    *) exit 90 ;;
  esac
  exit 0
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
fail() { echo "test-merge-release-images: $*" >&2; cat "$work_dir/output" >&2; exit 1; }
mkdir "$work_dir/bin"
ln -s "$repo_dir/scripts/test-merge-release-images.sh" "$work_dir/bin/docker"
export TEST_IMAGE=ghcr.io/james-beep-boop/lesson3-app TEST_VERSION=v1.1 STUB_ROOT="$work_dir"
export TEST_AMD_DIGEST="sha256:$(printf '%064d' 1)" TEST_ARM_DIGEST="sha256:$(printf '%064d' 2)"
export TEST_APP_INDEX="sha256:$(printf '%064d' 3)" TEST_MIGRATE_INDEX="sha256:$(printf '%064d' 4)"

run_case() {
  export TEST_CASE="$1"
  : >"$work_dir/calls"
  result=0
  PATH="$work_dir/bin:$PATH" bash "$repo_dir/scripts/merge-release-images.sh" "$TEST_IMAGE" "${2:-$TEST_VERSION}" \
    >"$work_dir/output" 2>&1 || result=$?
}

run_case success
[[ "$result" == 0 ]] || fail 'valid native images failed'
[[ "$(cat "$work_dir/calls")" == $'inspect-amd64\ninspect-arm64\npreview\npublish\ninspect-published' ]] \
  || fail 'publication did not follow source and preview validation'
echo '  ok: complete platforms and attestations merge using exact digests'

for refused in missing-arm wrong-arm bad-digest bad-preview; do
  run_case "$refused"
  [[ "$result" != 0 ]] || fail "$refused succeeded"
  ! grep -q '^publish$' "$work_dir/calls" || fail "$refused published an image"
  echo "  ok: $refused refuses publication"
done
run_case success latest
[[ "$result" != 0 && ! -s "$work_dir/calls" ]] || fail 'non-versioned tag reached the registry'
echo '  ok: latest is refused before registry access'
for refused in publish-error bad-published; do
  run_case "$refused"
  [[ "$result" != 0 ]] || fail "$refused succeeded"
  echo "  ok: $refused cannot report a usable release image"
done

run_bundle() {
  export TEST_CASE="$3"
  bash "$repo_dir/scripts/build-local-deploy-bundle.sh" "$TEST_VERSION" "$work_dir/bundle with spaces" "$1" "$2" \
    >"$work_dir/output" 2>&1 || fail 'fixture bundle did not build'
  result=0
  PATH="$work_dir/bin:$PATH" bash "$repo_dir/scripts/verify-release-bundle-images.sh" \
    "$work_dir/bundle with spaces/lesson3-online-deploy.tar.gz" "$TEST_VERSION" \
    >>"$work_dir/output" 2>&1 || result=$?
}
run_bundle "$TEST_APP_INDEX" "$TEST_MIGRATE_INDEX" success
[[ "$result" == 0 ]] || fail 'joined image pins did not verify'
echo '  ok: actual built bundle pins resolve on both platforms'
run_bundle "$TEST_AMD_DIGEST" "$TEST_MIGRATE_INDEX" success
[[ "$result" != 0 ]] || fail 'bundle accepted a per-platform app digest'
echo '  ok: a per-platform app pin is refused'
run_bundle "$TEST_APP_INDEX" "$TEST_ARM_DIGEST" success
[[ "$result" != 0 ]] || fail 'bundle accepted a per-platform migrate digest'
echo '  ok: a per-platform migrate pin is refused'
run_bundle "$TEST_APP_INDEX" "$TEST_MIGRATE_INDEX" bundle-mismatch
[[ "$result" != 0 ]] || fail 'bundle accepted a different resolved digest'
echo '  ok: resolved digests must match the bundle pins'

grep -Fq 'run: scripts/merge-release-images.sh "$IMAGE" "$GITHUB_REF_NAME"' \
  "$repo_dir/.github/workflows/publish-containers.yml" || fail 'workflow bypasses the tested helper'
grep -Fq 'needs: manifests' "$repo_dir/.github/workflows/publish-containers.yml" \
  || fail 'release can precede complete manifests'
! grep -q 'setup-qemu-action' "$repo_dir/.github/workflows/publish-containers.yml" \
  || fail 'release builds still use emulation'
verify_line="$(awk '/scripts\/verify-release-bundle-images.sh/ {print NR; exit}' "$repo_dir/.github/workflows/publish-containers.yml")"
publish_line="$(awk '/run: bash scripts\/publish-release-bundle.sh/ {print NR; exit}' "$repo_dir/.github/workflows/publish-containers.yml")"
[[ -n "$verify_line" && -n "$publish_line" && "$verify_line" -lt "$publish_line" ]] \
  || fail 'bundle images are not verified before publication'
# Exercise the actual required gate commands, including cancellation after both parents completed.
ci_workflow="$repo_dir/.github/workflows/ci.yml"
gate_job="$(awk '/^  gate:$/ {inside=1; next} inside && /^  [a-z_]+:$/ {exit} inside {print}' "$ci_workflow")"
grep -Fq 'needs: [native_arm, checks, restore_stack]' <<<"$gate_job" || fail 'CI gate ignores a required job'
[[ "$(grep -Fc 'if: ${{ always() }}' <<<"$gate_job")" == 2 ]] \
  || fail 'failed or cancelled CI can skip the gate or its status check'
grep -Fq 'if: ${{ cancelled() }}' <<<"$gate_job" || fail 'gate ignores workflow cancellation'
gate_script="$(awk '/^        run: \|$/ {inside=1; next} inside && /^      - / {exit} inside {sub(/^          /, ""); print}' <<<"$gate_job")"
cancel_script="$(awk '/if: \$\{\{ cancelled\(\) \}\}/ {inside=1; next} inside && /^        run:/ {sub(/^        run: /, ""); print; exit}' <<<"$gate_job")"
[[ -n "$gate_script" && -n "$cancel_script" ]] || fail 'required gate has no status or cancellation commands'
gate_cases=0
while read -r native_result checks_result restore_result cancelled expected; do
  [[ "$native_result" != missing ]] || native_result=''
  [[ "$restore_result" != missing ]] || restore_result=''
  result=0
  NATIVE_ARM_RESULT="$native_result" CHECKS_RESULT="$checks_result" RESTORE_STACK_RESULT="$restore_result" \
    bash -eo pipefail -c "$gate_script" >"$work_dir/output" 2>&1 || result=$?
  if [[ "$result" == 0 && "$cancelled" == true ]]; then
    bash -eo pipefail -c "$cancel_script" >>"$work_dir/output" 2>&1 || result=$?
  fi
  if [[ "$expected" == pass ]]; then
    [[ "$result" == 0 ]] || fail 'successful CI did not pass the gate'
  else
    [[ "$result" != 0 ]] || fail "$native_result/$checks_result/$restore_result/cancelled=$cancelled passed the gate"
  fi
  gate_cases=$((gate_cases + 1))
done <<'CASES'
success success success false pass
failure success success false fail
skipped success success false fail
cancelled success success true fail
cancelled success success false fail
success failure success false fail
success skipped success false fail
success cancelled success true fail
success cancelled success false fail
success success success true fail
missing success success false fail
success success failure false fail
success success skipped false fail
success success cancelled false fail
success success missing false fail
CASES
echo "  ok: $gate_cases required-gate outcomes include failure, skip and cancellation"
echo 'test-merge-release-images: PASS'
