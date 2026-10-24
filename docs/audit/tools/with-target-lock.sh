#!/usr/bin/env bash
# Serialize live work against one explicitly configured disposable audit target.
set -euo pipefail
if [ "$#" -lt 2 ]; then
  echo 'Usage: with-target-lock.sh TARGET_DIR COMMAND [ARG...]' >&2
  exit 64
fi
target_dir="$(cd "$1" && pwd -P)"
shift
test -f "$target_dir/state/identity.json"
lock_dir="$target_dir/state/target.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo 'Audit target is locked; reconcile the recorded owner and process before retrying.' >&2
  exit 73
fi
token="$(python3 -c 'import secrets; print(secrets.token_hex(16))')"
printf '%s\n' "$token" > "$lock_dir/token"
printf 'pid=%s\nstarted=%s\n' "$$" "$(date -u +%FT%TZ)" > "$lock_dir/owner"
cleanup() {
  if [ -f "$lock_dir/token" ] && [ "$(cat "$lock_dir/token")" = "$token" ]; then
    rm "$lock_dir/token" "$lock_dir/owner"
    rmdir "$lock_dir"
  fi
}
trap 'echo "Audit command interrupted; target lock retained for reconciliation." >&2; exit 130' INT
trap 'echo "Audit command terminated; target lock retained for reconciliation." >&2; exit 143' TERM
export LESSON3_AUDIT_LOCK_DIR="$lock_dir"
export LESSON3_AUDIT_LOCK_TOKEN="$token"
if "$@"; then
  cleanup
else
  status=$?
  echo 'Audit command failed; target lock retained until its processes/outcome are reconciled.' >&2
  exit "$status"
fi
