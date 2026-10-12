#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
cat > "$work/bin/git" <<'GIT'
#!/usr/bin/env bash
case "$1" in
  merge-base) [[ "${ANCESTOR:-yes}" == yes ]] ;;
  show-ref) [[ "${TAG_EXISTS:-no}" == yes ]] ;;
  rev-parse) printf '%s\n' "$GITHUB_SHA" ;;
  cat-file) echo tag ;;
  *) exit 99 ;;
esac
GIT
cat > "$work/bin/gh" <<'GH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CALLS"
case "$1 $2" in
  'pr view') if [[ "${MERGED:-yes}" == yes ]]; then printf '%040d\n' 2; fi ;;
  'release view')
    case "${RELEASE_STATE:-missing}" in
      published) echo false ;;
      draft) echo true ;;
      missing) echo 'gh: release not found (HTTP 404)' >&2; exit 1 ;;
      outage) echo 'gh: service unavailable (HTTP 503)' >&2; exit 1 ;;
    esac ;;
  'api repos/owner/repo/git/tags') [[ "${FAIL_TAG:-no}" != yes ]] || exit 1; printf '%040d\n' 3 ;;
  'api repos/owner/repo/git/refs') [[ "${FAIL_REF:-no}" != yes ]] ;;
  'workflow run') [[ "${FAIL_DISPATCH:-no}" != yes ]] ;;
  *) exit 99 ;;
esac
GH
chmod +x "$work/bin/git" "$work/bin/gh"
export PATH="$work/bin:$PATH" CALLS="$work/calls"
export GITHUB_SHA=1111111111111111111111111111111111111111
export GITHUB_REPOSITORY=owner/repo GITHUB_REF=refs/heads/main GITHUB_EVENT_NAME=push
run() { : > "$CALLS"; env "$@" "$root/scripts/publish-requested-release.sh" 389 v0.95 > "$work/output" 2>&1; }
dispatched() { grep -q '^workflow run publish-containers.yml .*--ref v0.95$' "$CALLS"; }
run; dispatched; grep -q -- '-f type=commit' "$CALLS"; grep -q -- '-f ref=refs/tags/v0.95' "$CALLS"
run MERGED=no; ! dispatched
run ANCESTOR=no; ! dispatched
run GITHUB_REF=refs/heads/other && exit 1; ! dispatched
run FAIL_TAG=yes && exit 1; ! dispatched; ! grep -q 'git/refs' "$CALLS"
run FAIL_REF=yes && exit 1; ! dispatched
run FAIL_DISPATCH=yes && exit 1
run TAG_EXISTS=yes RELEASE_STATE=published; ! dispatched; ! grep -q '^api ' "$CALLS"
run TAG_EXISTS=yes RELEASE_STATE=missing; dispatched; ! grep -q '^api ' "$CALLS"
run TAG_EXISTS=yes RELEASE_STATE=draft; dispatched; ! grep -q '^api ' "$CALLS"
run TAG_EXISTS=yes RELEASE_STATE=outage && exit 1; ! dispatched
[[ $(sed -n '/^  requested_release:/,/^  native_arm:/p' "$root/.github/workflows/ci.yml") == *'needs: gate'* ]]
grep -q 'scripts/publish-requested-release.sh 389 v0.95' "$root/.github/workflows/ci.yml"
grep -q 'workflow_dispatch:' "$root/.github/workflows/publish-containers.yml"
echo '11 requested-release cases pass'
