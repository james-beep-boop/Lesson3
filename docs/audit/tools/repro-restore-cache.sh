#!/usr/bin/env bash
# Database-free fault probe of the unmodified restore helper. No Docker daemon is used.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
[[ "$(id -u)" != 0 ]] || { echo 'Run as an ordinary user for the permissions control.' >&2; exit 2; }
sandbox="$(mktemp -d)"
cleanup() { chmod u+w "$sandbox/cache"; rm -rf "$sandbox"; }
trap cleanup EXIT
mkdir "$sandbox/cache"
printf 'old database artifact\n' >"$sandbox/cache/stale.bin"
chmod 0555 "$sandbox/cache"
export ARTIFACT_CACHE_DIR="$sandbox/cache"

# Execute the exact helper body from current source. The stub runs only its in-container shell
# command against this temporary directory; it does not model Compose or the restore state machine.
docker() {
  [[ "$*" == 'compose run --rm --no-deps -T --entrypoint sh app -c '* ]] || return 90
  sh -c "${!#}"
}
eval "$(sed -n '/^clear_export_cache() {/,/^}/p' "$root/scripts/restore-db.sh")"
status=0
clear_export_cache || status=$?
printf 'helper_exit=%s stale_file_present=%s\n' "$status" "$([[ -f "$sandbox/cache/stale.bin" ]] && echo yes || echo no)"
[[ "$status" == 0 && -f "$sandbox/cache/stale.bin" ]] || {
  echo 'Expected baseline failure masking was not reproduced.' >&2
  exit 1
}

# Positive control: the same helper removes the same file once its directory is writable.
chmod 0755 "$sandbox/cache"
clear_export_cache
[[ ! -f "$sandbox/cache/stale.bin" ]]
echo 'writable_control=removed'
