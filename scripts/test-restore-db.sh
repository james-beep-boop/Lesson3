#!/usr/bin/env bash
#
# Branch cover for restore-db.sh's VERIFICATION gate — the part that tells an operator whether a backup
# is recoverable. The real script runs with docker/age stubbed in a throwaway repo, so no daemon,
# database or backup is touched; the stubbed `psql` answers the script's two queries (the table list,
# then every count) from fixtures.
#
# ⚑ WHY THIS EXISTS (audit 2026-10-17). The gate required lesson plans, versions, subjects and grades to
# be non-empty, so a valid backup of a NEW installation — administrator accounts, no curriculum yet —
# restored cleanly and was then reported "Do NOT treat this backup as recoverable". The cases below pin
# the corrected rule: tables present, accounts non-empty, empty content reported as a NOTE.
set -uo pipefail

RESTORE="${RESTORE_SH:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/restore-db.sh}"
pass=0 fail=0
SANDBOX=""

cleanup() { [[ -z "$SANDBOX" ]] || rm -rf "$SANDBOX"; }
trap cleanup EXIT

# The tables a current schema has that the gate looks at, plus one it only reports.
ALL_TABLES=$'lesson_bundle_versions\nlesson_plans\nmessages\nsubject_grades\nsubjects\nusers'

prepare_case() {
  cleanup
  SANDBOX="$(mktemp -d)"
  mkdir -p "$SANDBOX/home/bin" "$SANDBOX/repo"
  printf 'encrypted bytes' >"$SANDBOX/backup.dump.age"
  printf 'AGE-SECRET-KEY-TEST' >"$SANDBOX/identity"

  # `docker compose exec -T postgres psql … -c <sql>`: answer the table list and the counts from the
  # case's fixtures; everything else (DROP/CREATE, pg_restore) just drains stdin and succeeds.
  cat >"$SANDBOX/home/bin/docker" <<'EOF'
#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"pg_tables"* ]]; then
  printf '%s\n' "$TABLES_FIXTURE"
elif [[ "$args" == *"UNION ALL"* || "$args" == *"count(*)"* ]]; then
  [[ "${FAIL_COUNT:-0}" == "1" ]] && { echo "ERROR: relation vanished" >&2; exit 1; }
  printf '%s\n' "$COUNTS_FIXTURE"
else
  cat >/dev/null
fi
EOF

  cat >"$SANDBOX/home/bin/age" <<'EOF'
#!/usr/bin/env bash
out=""
while [[ $# -gt 0 ]]; do
  [[ "$1" == "-o" ]] && { out="$2"; shift 2; continue; }
  shift
done
printf 'plain dump' >"$out"
EOF
  chmod +x "$SANDBOX/home/bin/docker" "$SANDBOX/home/bin/age"
}

# run_case <tables> <counts> [fail-count]
run_case() {
  env -i HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" PATH="/usr/bin:/bin" \
    AGE_IDENTITY="$SANDBOX/identity" TABLES_FIXTURE="$1" COUNTS_FIXTURE="$2" FAIL_COUNT="${3:-0}" \
    bash "$RESTORE" --local-file "$SANDBOX/backup.dump.age" --into lesson3_restore_check \
    >"$SANDBOX/output" 2>&1
  EXIT=$?
  OUTPUT="$(cat "$SANDBOX/output")"
}

# check <name> <command…>: the command's exit status is the verdict.
check() {
  local name="$1"; shift
  if "$@"; then
    pass=$((pass + 1)); echo "ok   $name"
  else
    fail=$((fail + 1)); echo "FAIL $name"; printf '%s\n' "$OUTPUT" | sed 's/^/     /'
  fi
}
has() { [[ "$OUTPUT" == *"$1"* ]]; }
lacks() { ! has "$1"; }
passed() { [[ "$EXIT" -eq 0 ]]; }
failed() { [[ "$EXIT" -ne 0 ]]; }

# 1. A new installation: two administrator accounts, no curriculum or lesson plans yet.
prepare_case
run_case "$ALL_TABLES" $'lesson_bundle_versions 0\nlesson_plans 0\nmessages 0\nsubject_grades 0\nsubjects 0\nusers 2'
check "accounts-only backup passes" passed
check "accounts-only backup says PASSED" has 'RESTORE DRILL PASSED'
check "accounts-only backup notes the empty content tables" \
  has 'NOTE  no rows in: lesson_plans lesson_bundle_versions subjects subject_grades'
check "accounts-only backup is not called unrecoverable" lacks 'Do NOT treat'

# 2. An installation in use: everything has rows, and there is nothing to note.
prepare_case
run_case "$ALL_TABLES" $'lesson_bundle_versions 9\nlesson_plans 3\nmessages 0\nsubject_grades 4\nsubjects 2\nusers 12'
check "full backup passes" passed
check "full backup prints no NOTE" lacks 'NOTE'

# 3. No accounts at all: no installation backs up to this, so it is not recoverable.
prepare_case
run_case "$ALL_TABLES" $'lesson_bundle_versions 9\nlesson_plans 3\nmessages 0\nsubject_grades 4\nsubjects 2\nusers 0'
check "zero accounts fails" failed
check "zero accounts names users" has 'FAIL  users = 0'

# 4. A required table missing from the schema still fails, even with every other table populated.
prepare_case
run_case $'lesson_bundle_versions\nmessages\nsubject_grades\nsubjects\nusers' \
  $'lesson_bundle_versions 9\nmessages 0\nsubject_grades 4\nsubjects 2\nusers 12'
check "missing required table fails" failed
check "missing required table is named" has 'FAIL  lesson_plans — table absent'

# 5. A counting query that errors is a failed drill, never a silent pass.
prepare_case
run_case "$ALL_TABLES" "" 1
check "a failed count fails the drill" failed
check "a failed count says so" has 'counting rows'

echo "restore-db verification: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
