#!/usr/bin/env bash
#
# Branch cover for restore-db.sh — the drill's VERIFICATION gate, and the live replacement's refusals,
# lock and journal decisions (design A1). The real script runs with docker/age/df stubbed in a
# throwaway repo, so no daemon, database or backup is touched; the stubbed `docker` answers the
# script's queries from fixtures and logs every call, so a case can assert what was (not) issued.
#
# The real-stack counterpart — renames, terminations, migrations, renders — is
# scripts/test-restore-db-stack.sh. This file is the fast one CI runs on every push.
#
# ⚑ WHY THE DRILL CASES EXIST (audit 2026-10-17). The gate required lesson plans, versions, subjects
# and grades to be non-empty, so a valid backup of a NEW installation — administrator accounts, no
# curriculum yet — restored cleanly and was then reported "Do NOT treat this backup as recoverable".
# The cases below pin the corrected rule: tables present, accounts non-empty, empty content a NOTE.
set -uo pipefail

RESTORE="${RESTORE_SH:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/restore-db.sh}"
pass=0 fail=0
SANDBOX=""

cleanup() { [[ -z "$SANDBOX" ]] || rm -rf "$SANDBOX"; }
trap cleanup EXIT

# The tables a current schema has that the gate looks at, plus one it only reports.
ALL_TABLES=$'lesson_bundle_versions\nlesson_plans\nmessages\nsubject_grades\nsubjects\nusers'
FULL_COUNTS=$'lesson_bundle_versions 9\nlesson_plans 3\nmessages 0\nsubject_grades 4\nsubjects 2\nusers 12'
INSTALLED=$'20260608_024132_initial\n20260608_145602_lesson_entities\n20260608_224715_bundle_versioning'

prepare_case() {
  cleanup
  SANDBOX="$(mktemp -d)"
  mkdir -p "$SANDBOX/home/bin" "$SANDBOX/repo/out/ops"
  printf 'encrypted bytes' >"$SANDBOX/backup.dump.age"
  printf 'encrypted bytes' >"$SANDBOX/lesson3-20261020T030000Z.dump.age"
  printf 'AGE-SECRET-KEY-TEST' >"$SANDBOX/identity"
  printf 'v9.9.9\n' >"$SANDBOX/repo/VERSION"
  printf 'DATABASE_URI=postgres://lesson3:pw@postgres:5432/lesson3\n' >"$SANDBOX/repo/.env"
  : >"$SANDBOX/calls"

  # `docker …`: answer each query the script makes from the case's fixtures, log every call.
  cat >"$SANDBOX/home/bin/docker" <<'EOF'
#!/usr/bin/env bash
args="$*"
printf '%s\n' "$args" >>"$CALLS"
[[ "${SLOW:-}" == 1 ]] && sleep 0.3
case "$args" in
  *"FROM pg_database WHERE datname = '"*)
    name="${args#*datname = \'}"; name="${name%%\'*}"
    # `lesson3_incoming_*` in DBS stands for whichever timestamped copy the run creates.
    [[ " $DBS " == *" $name "* || ( " $DBS " == *" lesson3_incoming_* "* && "$name" == lesson3_incoming_* ) ]] && echo 1 ;;
  *"count(*) FROM pg_stat_activity"*) echo 0 ;;
  *"pg_tables"*) printf '%s\n' "$TABLES_FIXTURE" ;;
  *"UNION ALL"*|*"count(*) AS n"*)
    [[ "${FAIL_COUNT:-0}" == "1" ]] && { echo "ERROR: relation vanished" >&2; exit 1; }
    printf '%s\n' "$COUNTS_FIXTURE" ;;
  *"FROM payload_migrations"*) printf '%s\n' "$BACKUP_MIGRATIONS" ;;
  *"RESTORE_CHECK_MODE=migrations"*) printf '%s\n' "$INSTALLED_FIXTURE" | sed 's/^/MIGRATION /' ;;
  *"restore-check.ts"*)
    [[ "${CHECK_FAILS:-0}" == "1" ]] && { echo "restore-check: FAILED — relation does not exist" >&2; exit 1; }
    echo "restore-check: rendered PDF"; echo "RESTORE_CHECK_OK version=7 plan=3 docx=10 pdf=20" ;;
  *"pg_database_size"*) echo "${LIVE_BYTES:-1000}" ;;
  *"df -Pk"*) printf 'Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/x 1 1 %s 1%% /\n' "${VOLUME_FREE_KB:-99999999}" ;;
  *"ps --services"*) echo app ;;
  # Everything else (CREATE/DROP, pg_restore, the swap's SQL on stdin): log the input too, so a case
  # can assert a rename was or was not issued.
  *) cat >>"$CALLS" ;;
esac
exit 0
EOF

  cat >"$SANDBOX/home/bin/age" <<'EOF'
#!/usr/bin/env bash
out="" id=""
while [[ $# -gt 0 ]]; do
  [[ "$1" == "-o" ]] && { out="$2"; shift 2; continue; }
  [[ "$1" == "-i" ]] && { id="$2"; shift 2; continue; }
  shift
done
grep -q WRONG "$id" 2>/dev/null && { echo "age: error: no identity matched any of the recipients" >&2; exit 1; }
printf 'plain dump' >"$out"
EOF

  # Free space for the decrypted dump, in KB, from the case.
  cat >"$SANDBOX/home/bin/df" <<'EOF'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/y 1 1 %s 1%% /tmp\n' "${TMP_FREE_KB:-99999999}"
EOF
  # The restore lock. The real one is exercised at the end, where the host has it.
  cat >"$SANDBOX/home/bin/flock" <<'EOF'
#!/usr/bin/env bash
echo "flock $*" >>"$CALLS"
[[ "${LOCK_HELD:-0}" == "1" ]] && exit 1
exit 0
EOF
  chmod +x "$SANDBOX/home/bin/docker" "$SANDBOX/home/bin/age" "$SANDBOX/home/bin/df" "$SANDBOX/home/bin/flock"
}

# run <stdin-answer> <args…>: run the real script against the stubs. Fixture env vars pass through.
run() {
  local answer="$1"; shift
  printf '%s\n' "$answer" >"$SANDBOX/answer"
  env -i HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" PATH="/usr/bin:/bin" CALLS="$SANDBOX/calls" \
    AGE_IDENTITY="${IDENTITY:-$SANDBOX/identity}" TABLES_FIXTURE="${TABLES_FIXTURE:-$ALL_TABLES}" \
    COUNTS_FIXTURE="${COUNTS_FIXTURE:-$FULL_COUNTS}" FAIL_COUNT="${FAIL_COUNT:-0}" \
    BACKUP_MIGRATIONS="${BACKUP_MIGRATIONS:-$INSTALLED}" INSTALLED_FIXTURE="$INSTALLED" DBS="${DBS:-lesson3}" \
    TMP_FREE_KB="${TMP_FREE_KB:-99999999}" VOLUME_FREE_KB="${VOLUME_FREE_KB:-99999999}" \
    LIVE_BYTES="${LIVE_BYTES:-1000}" CHECK_FAILS="${CHECK_FAILS:-0}" RESTORE_APP_WAIT_SECONDS=5 \
    LOCK_HELD="${LOCK_HELD:-0}" \
    bash "$RESTORE" "$@" <"$SANDBOX/answer" >"$SANDBOX/output" 2>&1
  EXIT=$?
  OUTPUT="$(cat "$SANDBOX/output")"
  CALLED="$(cat "$SANDBOX/calls")"
}
# run_case <tables> <counts> [fail-count]: the drill, as before.
run_case() {
  TABLES_FIXTURE="$1" COUNTS_FIXTURE="$2" FAIL_COUNT="${3:-0}" \
    run "" --local-file "$SANDBOX/backup.dump.age" --into lesson3_restore_check
}
live() { run "$1" --local-file "$SANDBOX/lesson3-20261020T030000Z.dump.age" --into lesson3 --force-prod; }

# A journal in a given state, as the script writes it.
journal() { # state [extra key=value…]
  local f="$SANDBOX/repo/out/ops/restore-journal.json" k v kv
  {
    printf '{\n  "version": "1"'
    for k in id state backup backupDate backupTime incoming previous undone installed checkPlan checkVersion services undoFrom startedAt updatedAt; do
      case "$k" in
        id) v=20261021T000000Z ;; state) v="$1" ;; incoming) v=lesson3_incoming_20261021T000000Z ;;
        previous) v=lesson3_before_restore_20261021T000000Z ;; services) v=app ;; backupDate) v=2026-10-20 ;;
        *) v="" ;;
      esac
      for kv in "${@:2}"; do [[ "${kv%%=*}" == "$k" ]] && v="${kv#*=}"; done
      printf ',\n  "%s": "%s"' "$k" "$v"
    done
    printf '\n}\n'
  } >"$f"
}
jstate() { sed -n 's/^  "state": "\(.*\)",$/\1/p' "$SANDBOX/repo/out/ops/restore-journal.json" 2>/dev/null; }

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
called() { [[ "$CALLED" == *"$1"* ]]; }
not_called() { ! called "$1"; }
no_journal() { [[ ! -f "$SANDBOX/repo/out/ops/restore-journal.json" ]]; }
state_is() { [[ "$(jstate)" == "$1" ]]; }

# ─── The drill's verification gate ──────────────────────────────────────────────────────────────────

# 1. A new installation: two administrator accounts, no curriculum or lesson plans yet.
prepare_case
run_case "$ALL_TABLES" $'lesson_bundle_versions 0\nlesson_plans 0\nmessages 0\nsubject_grades 0\nsubjects 0\nusers 2'
check "accounts-only backup passes" passed
check "accounts-only backup says PASSED" has 'RESTORE DRILL PASSED'
check "accounts-only backup notes the empty content tables" \
  has 'NOTE  no rows in: lesson_plans lesson_bundle_versions subjects subject_grades'
check "accounts-only backup is not called unrecoverable" lacks 'Do NOT treat'
check "a drill writes no journal" no_journal
check "a drill never renames a database" not_called 'RENAME TO'

# 2. An installation in use: everything has rows, and there is nothing to note.
prepare_case
run_case "$ALL_TABLES" "$FULL_COUNTS"
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

# 6. A drill may not take a name the live journal uses.
prepare_case
run "" --local-file "$SANDBOX/backup.dump.age" --into lesson3_before_restore_20261021T000000Z
check "a drill into a journal name is refused" has 'live-restore journal uses'

# ─── Live replacement: refusals before anything live changes ────────────────────────────────────────

prepare_case
run "" --local-file "$SANDBOX/backup.dump.age" --into lesson3 --force-prod
check "a backup without its dated name is refused" has "cannot read the backup's date"
check "an undated backup is refused before decrypting" not_called 'pg_restore'

prepare_case
printf 'WRONG KEY' >"$SANDBOX/identity"
live ""
check "a key that does not decrypt is refused" failed
check "the wrong key is named" has 'did not decrypt'
check "the wrong key leaves no journal" no_journal
check "the wrong key creates no database" not_called 'CREATE DATABASE'

prepare_case
TMP_FREE_KB=10 live ""
check "no room for the decrypted dump is refused" has 'not enough space for the decrypted backup'
check "no tmp room is refused before decrypting" not_called 'pg_restore -l'

prepare_case
VOLUME_FREE_KB=10 live ""
check "no room on the database volume is refused" has 'not enough space on the database volume'
check "no volume room creates no database" not_called 'CREATE DATABASE'
check "no volume room leaves no journal" no_journal

prepare_case
LIVE_BYTES=900000000 VOLUME_FREE_KB=500000 live ""
check "the live database's size counts toward the space needed" has 'not enough space on the database volume'

prepare_case
BACKUP_MIGRATIONS=$'20260608_024132_initial\n29991231_000000_from_the_future' DBS="lesson3 lesson3_incoming_*" live ""
check "a backup from newer software is refused" has 'NEWER software'
check "the unknown migration is named" has '29991231_000000_from_the_future'
check "the newer backup is refused before migrating" not_called 'payload migrate'
check "the refused copy is dropped" called 'DROP DATABASE "lesson3_incoming_'
check "the refused restore closes its journal" no_journal
check "the refused restore never touches live" not_called 'ALLOW_CONNECTIONS false'

prepare_case
BACKUP_MIGRATIONS=$'20260608_024132_initial\n20260608_224715_bundle_versioning' live ""
check "a gap in the backup's migrations is refused" has 'not a prefix'

prepare_case
BACKUP_MIGRATIONS=$'20260608_024132_initial' live "2026-10-19"
check "an older backup's schema is accepted" has '1 of the installed migrations; 2 to apply'
check "migrate runs against the incoming database" called 'migrate npx payload migrate'
check "the check runs before the prompt" has 'rendered PDF'
check "the prompt names what will happen" has 'in one transaction, rename'
check "a wrong date is not a confirmation" has 'not confirmed'
check "declining never blocks live connections" not_called 'ALLOW_CONNECTIONS false'
check "declining never renames" not_called 'RENAME TO'
check "declining closes the journal" no_journal

prepare_case
journal provisional
live ""
check "a second restore is refused while one is open" has 'already in progress'

# ─── Journal commands and the resume decision table ─────────────────────────────────────────────────

for s in staging migrating checking checked; do
  prepare_case
  journal "$s"
  DBS="lesson3 lesson3_incoming_20261021T000000Z" run "" --resume
  check "resume from '$s' reverses" has 'reversing the unconfirmed restore'
  check "resume from '$s' drops the incoming copy" called 'DROP DATABASE "lesson3_incoming_20261021T000000Z"'
  check "resume from '$s' never renames" not_called 'RENAME TO'
  check "resume from '$s' closes the journal" no_journal
done

prepare_case
journal writers-stopped
DBS="lesson3 lesson3_incoming_20261021T000000Z" run "" --resume
check "resume before the swap committed swaps" called 'RENAME TO "lesson3_before_restore_20261021T000000Z"'
check "resume completes to provisional" state_is provisional
check "resume empties the export cache" called '--entrypoint sh app'

prepare_case
journal writers-stopped
DBS="lesson3 lesson3_before_restore_20261021T000000Z" run "" --resume
check "resume after the swap committed does not swap again" not_called 'RENAME TO'
check "it says the catalog shows the swap committed" has 'already committed'
check "and still completes" state_is provisional

prepare_case
journal writers-stopped
DBS="lesson3" run "" --resume
check "an unexpected set of databases is not guessed at" has 'Not guessing'
check "and nothing is renamed" not_called 'RENAME TO'

prepare_case
journal swapped
CHECK_FAILS=1 DBS="lesson3 lesson3_before_restore_20261021T000000Z" run "" --resume
check "a failed startup check exits non-zero" failed
check "a failed startup check offers --undo" has 'scripts/restore-db.sh --undo'
check "a failed startup check is recorded" state_is live-check-failed
check "a failed startup check undoes nothing on its own" not_called 'RENAME TO'
check "a failed startup check takes no backup on its own" not_called 'pg_dump'

prepare_case
journal provisional
run "" --discard-previous
check "--discard-previous before --confirm is refused" has 'run --confirm first'
run "" --confirm
check "--confirm accepts a provisional restore" state_is accepted
run "not-the-name" --discard-previous
check "--discard-previous needs the name typed" not_called 'DROP DATABASE'
DBS="lesson3 lesson3_before_restore_20261021T000000Z" run "lesson3_before_restore_20261021T000000Z" --discard-previous
check "--discard-previous drops the previous database" called 'DROP DATABASE "lesson3_before_restore_20261021T000000Z"'
check "--discard-previous closes the journal" no_journal

prepare_case
run "" --undo
check "--undo with no restore is refused" has '--undo is possible after a swap'
journal accepted
run "no" --undo
check "--undo needs 'undo' typed" has 'nothing was changed'
check "an unconfirmed undo stops nothing" not_called 'stop app'
check "an unconfirmed undo leaves the state" state_is accepted

prepare_case
journal undo-backed-up undone=lesson3_undone_20261021T000000Z undoFrom=accepted
DBS="lesson3 lesson3_before_restore_20261021T000000Z" run "" --resume
check "resume of an undo swaps back" called 'RENAME TO "lesson3_undone_20261021T000000Z"'
check "resume of an undo re-allows connections to the previous database" called 'ALTER DATABASE "lesson3" ALLOW_CONNECTIONS true'
check "resume of an undo ends undone" state_is undone

prepare_case
journal provisional
LOCK_HELD=1 run "" --confirm
check "a held lock refuses a second runner" has "another restore-db.sh is running"
check "a refused runner changes nothing" state_is provisional
run "" --confirm
check "every journal command takes the lock" called 'flock -n 9'
check "and the command proceeds once it is free" state_is accepted

# ── The REAL lock (design review 2026-10-21) ─────────────────────────────────────────────────────────
#
# ⚑ THE STUB ABOVE PROVES THE SCRIPT ASKS; ONLY THE KERNEL'S LOCK PROVES TWO RUNS CANNOT BOTH ENTER. The
# directory-with-a-PID lock this replaced let a second run remove a just-created, still-empty lock as
# "stale" and enter alongside the first (reproduced in review). macOS has no `flock`; CI's Ubuntu runner
# and the probe tools image do.
REAL_FLOCK="$(PATH=/usr/bin:/bin:/usr/sbin:/sbin command -v flock || true)"
if [[ -z "$REAL_FLOCK" ]]; then
  echo "SKIP the real restore lock — this host has no flock (CI runs it; on a Mac run this in the probe tools image)"
else
  prepare_case
  rm -f "$SANDBOX/home/bin/flock"; ln -s "$REAL_FLOCK" "$SANDBOX/home/bin/flock"
  journal provisional
  LOCKFILE="$SANDBOX/repo/out/ops/.restore.lock"
  # One process holds it (the lock command's own fork would otherwise keep it after the kill below).
  ( exec 9>"$LOCKFILE"; "$REAL_FLOCK" 9; exec sleep 30 ) & HOLDER=$!
  sleep 0.5
  run "" --confirm
  check "real lock: a second runner is refused while the first holds it" has "another restore-db.sh is running"
  check "real lock: the refused runner changed nothing" state_is provisional
  kill -KILL "$HOLDER" 2>/dev/null; wait "$HOLDER" 2>/dev/null
  check "real lock: the lock file outlives its holder" test -e "$LOCKFILE"
  run "" --confirm
  check "real lock: a killed holder leaves nothing to clear" state_is accepted
  # A slow resume holds the lock while a confirm starts: the confirm must be refused BY THE LOCK. (Without
  # a lock it would also fail — the state is not provisional — but with a different message, which is
  # why the check is on the message.)
  prepare_case
  rm -f "$SANDBOX/home/bin/flock"; ln -s "$REAL_FLOCK" "$SANDBOX/home/bin/flock"
  journal writers-stopped
  printf '\n' >"$SANDBOX/answer"
  slow_run() { # output-file args…
    local out="$1"; shift
    env -i HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" PATH="/usr/bin:/bin" CALLS="$SANDBOX/calls" \
      DBS="lesson3 lesson3_incoming_20261021T000000Z" RESTORE_APP_WAIT_SECONDS=5 SLOW=1 \
      bash "$RESTORE" "$@" <"$SANDBOX/answer" >"$out" 2>&1
  }
  slow_run "$SANDBOX/o1" --resume & A=$!
  sleep 1
  slow_run "$SANDBOX/o2" --confirm; EB=$?
  wait "$A"; EA=$?
  OUTPUT="$(cat "$SANDBOX/o2")"
  check "real lock: the first run completes" test "$EA" -eq 0
  check "real lock: a run started meanwhile is refused" test "$EB" -ne 0
  check "real lock: the other is told why" has "another restore-db.sh is running"
fi

echo "restore-db: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
