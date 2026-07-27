#!/usr/bin/env bash
#
# Branch cover for scripts/deploy.sh's SIDECAR DECISION, with `git` and `docker` stubbed.
#
# Why this exists: that decision has shipped three defects in three days — a git-history comparison that
# silently reused a stale image after a failed build, an `unknown == unknown` match that asserted
# provenance it did not have, and a `up -d` that would build a missing sidecar after announcing it would
# not. Every one was a wrong BRANCH, and none was reachable by any existing test: CI runs
# `docker compose up -d --build` and never invokes deploy.sh at all.
#
# It runs the REAL scripts/deploy.sh — not a copy — so edits to it are actually covered. Isolation:
#   * stubs live in $HOME/bin because lib.sh prepends /usr/bin to PATH and would otherwise shadow them;
#   * BACKUP_REPO_DIR points lib.sh's `cd` at an empty temp dir, so no real .env is read, no real
#     backup-db.sh runs, and nothing touches the working repo;
#   * the stubs only log and echo — they never reach a daemon or a remote.
#
#   ./scripts/test-deploy-sidecar.sh          (prints one line per case)
set -uo pipefail

DEPLOY="${DEPLOY_SH:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy.sh}"
TREE_MATCH="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
TREE_OTHER="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
pass=0 fail=0

# Runs deploy.sh once in a throwaway sandbox.
#   $1 what `git rev-parse --verify -q HEAD:gotenberg` prints ("" = unresolvable, exit 1)
#   $2 what the image's provenance label prints ("" = unlabelled, "NOIMAGE" = inspect fails)
#   rest: extra env assignments
run_case() {
  local tree="$1" label="$2"; shift 2
  SANDBOX="$(mktemp -d)"
  mkdir -p "$SANDBOX/home/bin" "$SANDBOX/repo"

  cat >"$SANDBOX/home/bin/git" <<EOF
#!/usr/bin/env bash
echo "git \$*" >>"$SANDBOX/calls"
# Matched on the ARGUMENT, not the flag spelling, so the stub is not coupled to how deploy.sh happens
# to invoke rev-parse today — that coupling would quietly weaken it if the call form changed.
if [[ "\$*" == *"HEAD:gotenberg"* ]]; then
  [[ -n "$tree" ]] || exit 1
  echo "$tree"; exit 0
fi
[[ "\$*" == *"--short"* ]] && { echo "deadbee"; exit 0; }
exit 0   # pull etc. — succeed silently
EOF

  cat >"$SANDBOX/home/bin/docker" <<EOF
#!/usr/bin/env bash
echo "docker \$*" >>"$SANDBOX/calls"
if [[ "\$1 \$2" == "compose config" ]]; then echo "lesson3-gotenberg"; exit 0; fi
if [[ "\$1 \$2" == "image inspect" ]]; then
  [[ "$label" == "NOIMAGE" ]] && exit 1
  echo "$label"; exit 0
fi
exit 0
EOF
  chmod +x "$SANDBOX/home/bin/git" "$SANDBOX/home/bin/docker"
  : >"$SANDBOX/calls"

  env -i HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" ALLOW_UNBACKED_DEPLOY=1 \
      PATH="$SANDBOX/home/bin:/usr/bin:/bin" "$@" \
      bash "$DEPLOY" >"$SANDBOX/out" 2>&1
  EXIT=$?
  CALLS="$(cat "$SANDBOX/calls")"
  OUT="$(cat "$SANDBOX/out")"
  rm -rf "$SANDBOX"
}

check() { # name, condition-description, 0/1 result
  if [[ "$3" == "0" ]]; then printf '  ok   %s\n' "$1"; pass=$((pass+1));
  else printf '  FAIL %s — %s\n' "$1" "$2"; printf '       exit=%s\n       calls:\n%s\n' "$EXIT" "$CALLS"; fail=$((fail+1)); fi
}
built()     { grep -q "compose build gotenberg" <<<"$CALLS"; }
not_built() { ! built; }

echo "deploy.sh sidecar decision:"

# 1. Provenance matches → the whole point: no font build on an unchanged sidecar.
run_case "$TREE_MATCH" "$TREE_MATCH"
check "matching label skips the build" "expected no gotenberg build" "$(not_built && echo 0 || echo 1)"

# 2. Sidecar genuinely changed → must rebuild.
run_case "$TREE_OTHER" "$TREE_MATCH"
check "mismatched label rebuilds" "expected a gotenberg build" "$(built && echo 0 || echo 1)"

# 3. THE RETRY CASE. A failed build writes no label, so an unlabelled image must rebuild — this is the
#    defect the first implementation had (it compared git history, saw no diff on the retry, and skipped).
run_case "$TREE_MATCH" ""
check "unlabelled image rebuilds (failed-build retry)" "expected a gotenberg build" "$(built && echo 0 || echo 1)"

# 4. No image at all (fresh box or pruned) → must rebuild.
run_case "$TREE_MATCH" "NOIMAGE"
check "missing image rebuilds" "expected a gotenberg build" "$(built && echo 0 || echo 1)"

# 5. Force flag overrides a match.
run_case "$TREE_MATCH" "$TREE_MATCH" FORCE_SIDECAR_BUILD=1
check "FORCE_SIDECAR_BUILD rebuilds a matching image" "expected a gotenberg build" "$(built && echo 0 || echo 1)"

# 6. Unresolvable tree must ABORT, not compare two "unknown"s as equal — the provenance hole where a
#    hand-built `unknown` label matched an `unknown` tree and skipped while claiming proof.
run_case "" "unknown"
check "unresolvable tree aborts" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "unresolvable tree builds nothing" "expected no gotenberg build" "$(not_built && echo 0 || echo 1)"

# 7. `up` must not silently build a missing image after the decision said it would not.
run_case "$TREE_MATCH" "$TREE_MATCH"
check "up -d passes --no-build" "expected 'compose up -d --no-build'" \
  "$(grep -q "compose up -d --no-build" <<<"$CALLS" && echo 0 || echo 1)"

echo
printf 'deploy.sh sidecar: %d passed, %d failed\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
