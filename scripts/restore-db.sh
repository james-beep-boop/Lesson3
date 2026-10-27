#!/usr/bin/env bash
#
# Restore a Lesson3 Postgres backup produced by backup-db.sh (SPEC §11 / readiness #9).
#
#   rclone copy from the configured destination  ->  age -d -i <identity>  ->  pg_restore into a DB
#
# This is also the RESTORE DRILL: run it periodically against a throwaway DB to prove the backups are
# actually recoverable (an untested backup is not a backup). See docs/OPS.md.
#
# USAGE
#   # List available backups:
#   scripts/restore-db.sh --list [daily|premigrate]
#
#   # Restore a specific backup into a TARGET database (created if missing). Requires the age identity:
#   AGE_IDENTITY=~/lesson3-backup.key \
#     scripts/restore-db.sh --from daily/lesson3-20260629T030000Z.dump.age --into lesson3_restore_check
#
#   # Replace the LIVE database (design A1, docs/DESIGN-backup-recovery-2026-10-21.md). Staged and
#   # journaled; the live database is renamed aside, never dropped, and stays until --discard-previous:
#   AGE_IDENTITY=~/lesson3-backup.key \
#     scripts/restore-db.sh --from daily/lesson3-20260629T030000Z.dump.age --into lesson3 --force-prod \
#     [--check-plan <lesson plan id>]
#   scripts/restore-db.sh --status              # what the journal says, and what you can do next
#   scripts/restore-db.sh --resume              # after an interruption: complete or reverse, per journal
#   scripts/restore-db.sh --confirm             # after you signed in, opened a lesson and exported it
#   scripts/restore-db.sh --undo                # put the previous database back (until --discard-previous)
#   scripts/restore-db.sh --discard-previous    # drop the database that is not live, close the journal
#
# SAFETY: refuses to restore into the live 'lesson3' unless --force-prod is given. Default target is a
# disposable check DB, so a drill never risks the corpus.
set -euo pipefail

# Shared PATH + repo-root cd + env_get (reads .env keys without sourcing it). See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_RCLONE_REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
DB_USER="$(env_get BACKUP_DB_USER)"; DB_USER="${DB_USER:-lesson3}"
die() { echo "restore-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH — see docs/OPS.md setup"; }
need docker

MODE=""; FROM=""; INTO="lesson3_restore_check"; FORCE_PROD=0; LOCAL_FILE=""; CHECK_PLAN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) MODE="list"; shift; STREAM="${1:-}"; [[ "$STREAM" == -* ]] && STREAM=""; [[ -n "$STREAM" ]] && shift || true ;;
    --from) FROM="${2:?--from needs a path}"; shift 2 ;;
    --into) INTO="${2:?--into needs a db name}"; shift 2 ;;
    --force-prod) FORCE_PROD=1; shift ;;
    # ⚑ THE SAFE DRILL PATH, AND IT IS NAMED RATHER THAN IMPROVISED. The private age identity is held
    # off-box (SPEC §11), so a drill has to bring the CIPHERTEXT to the key rather than the key to the
    # ciphertext — the backup is encrypted and safe to move; the identity is not. The first working
    # drill did this by temporarily redefining BACKUP_RCLONE_REMOTE to a local directory, which worked
    # and was far too clever to be the documented procedure. This option is that workflow, obvious and
    # supported: no remote, no rclone, just a file you already have beside the key.
    --local-file) LOCAL_FILE="${2:?--local-file needs a path}"; shift 2 ;;
    --check-plan) CHECK_PLAN="${2:?--check-plan needs a lesson plan id}"; shift 2 ;;
    --status|--resume|--confirm|--undo|--discard-previous) MODE="${1#--}"; shift ;;
    *) die "unknown arg: $1" ;;
  esac
done

# ⚑ ONLY THE TYPED CONFIRMATIONS READ THE OPERATOR'S INPUT. `docker compose exec` and `run` forward
# stdin into the container, so any of the dozen docker calls before a prompt could swallow an answer
# typed ahead or piped in, and the prompt would then read end-of-file and decline. Every command gets
# /dev/null; the prompts read the original input, saved on fd 3.
exec 3<&0 0</dev/null

# ─── Live replacement: journal, lock and database helpers (design A1) ─────────────────────────────
#
# ⚑ THE LIVE DATABASE IS NEVER DROPPED BY A RESTORE. Until 2026-10-21 `--force-prod` ran
# `DROP DATABASE lesson3` and only then `pg_restore`, verifying afterwards — so a truncated or
# incompatible backup destroyed the corpus before anything had looked at it. Now the backup is restored
# into `lesson3_incoming_<UTC>`, counted, schema-checked, migrated and rendered THERE; writers are
# stopped; and two renames in ONE transaction swap it in, keeping the old database as
# `lesson3_before_restore_<UTC>`. Only `--discard-previous`, after `--confirm`, drops anything live-sized.
#
# ⚑ EVERY STEP IS WRITTEN TO THE JOURNAL BEFORE THE NEXT BEGINS, so `--resume` after a crash, a killed
# shell or a power cut reads where it was instead of guessing. Before the typed confirmation an
# interrupted restore is REVERSED (nothing live had changed; drop the incoming copy). After it, the
# operator's intent is on record, so the restore is COMPLETED. Whether the swap committed is read from
# Postgres's own catalog — the one source that cannot disagree with itself — never inferred.
LIVE_DB="lesson3"
OPS_DIR="$REPO_DIR/out/ops"
JOURNAL="$OPS_DIR/restore-journal.json"
RESTORE_LOG="$OPS_DIR/restore.log"
LOCK="$OPS_DIR/.restore.lock"
TMP=""
J_KEYS="id state backup backupDate backupTime incoming previous undone installed checkPlan checkVersion services undoFrom startedAt updatedAt"

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

cleanup() {
  [[ -z "$TMP" ]] || rm -rf "$TMP"
}
trap cleanup EXIT

# One restore at a time: a kernel `flock` on a file that is never removed. The kernel releases it when
# the holder exits for any reason (SIGKILL, power cut), so there is no stale state to judge — the
# journal, not the lock, carries where an interrupted restore was.
#
# ⚑ NOT A DIRECTORY WITH A PID IN IT, which is what this was until review on 2026-10-21. Between one
# run's `mkdir` and its writing the PID, another run saw an empty lock, judged it stale, removed it and
# took its own — two restores then ran at once and collided over the journal (reproduced). Every
# repair of that shape (PID liveness, then "not us and still restore-db.sh") left the same window.
take_lock() {
  need flock
  mkdir -p "$OPS_DIR"
  exec 9>"$LOCK" || die "cannot open the restore lock at $LOCK"
  flock -n 9 || die "another restore-db.sh is running (it holds $LOCK); wait for it to finish"
}

# Journal values are identifiers, timestamps, version strings and validated file names only, so this
# flat one-key-per-line JSON needs no escaping and is read back without a JSON tool on the server.
j_get() {
  [[ -f "$JOURNAL" ]] || { printf ''; return 0; }
  sed -n "s/^  \"$1\": \"\\(.*\\)\",\\{0,1\\}\$/\\1/p" "$JOURNAL" | head -n1
}

j_write() { # key=value … — rewrites the whole journal atomically with the given keys changed
  local k v kv tmp
  mkdir -p "$OPS_DIR"
  tmp="$(mktemp "$OPS_DIR/.restore-journal.XXXXXX")"
  {
    printf '{\n  "version": "1"'
    for k in $J_KEYS; do
      v="$(j_get "$k")"
      for kv in "$@"; do [[ "${kv%%=*}" == "$k" ]] && v="${kv#*=}"; done
      [[ "$k" == updatedAt ]] && v="$(now_utc)"
      printf ',\n  "%s": "%s"' "$k" "$v"
    done
    printf '\n}\n'
  } >"$tmp"
  chmod 0644 "$tmp"
  mv -f "$tmp" "$JOURNAL"
}

# Move to a new state: journal first, then a line in the append-only log (the timeline of a recovery).
set_state() {
  j_write "state=$1" "${@:2}"
  echo "$(now_utc) $(j_get id) $1" >>"$RESTORE_LOG"
  # ⚑ TEST-ONLY: simulate an interruption right after this state is durable. SIGKILL skips the EXIT
  # trap, exactly as a power cut would, so the lock is left behind and the journal is all that remains.
  if [[ -n "${RESTORE_TEST_INTERRUPT_AFTER:-}" && "$RESTORE_TEST_INTERRUPT_AFTER" == "$1" ]]; then
    echo "restore-db: TEST: interrupted after '$1'"
    kill -KILL $$
  fi
}

close_journal() { # outcome
  local id; id="$(j_get id)"
  j_write "state=$1"
  echo "$(now_utc) $id $1" >>"$RESTORE_LOG"
  mkdir -p "$OPS_DIR/restore-history"
  mv -f "$JOURNAL" "$OPS_DIR/restore-history/restore-$id.json"
}

journal_open() { [[ -f "$JOURNAL" ]]; }

psql_admin() { docker compose exec -T postgres psql -U "$DB_USER" -d postgres -tA -v ON_ERROR_STOP=1 "$@"; }

db_exists() {
  [[ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$1';")" == "1" ]]
}

# Which of the journal's databases exist right now, as "name name …" in a fixed order.
db_set() {
  local n out=""
  for n in "$LIVE_DB" "$@"; do db_exists "$n" && out+="$n "; done
  printf '%s' "${out% }"
}

# ⚑ WRITERS: everything running except the database and the PDF converter. In an installation that is
# `app`, whose process also runs the job queue; listing what is actually running (instead of naming
# `app` alone) also catches a second app container, such as the CI stack's private-PDF instance.
running_writers() {
  local s out=""
  while IFS= read -r s; do
    [[ -n "$s" && "$s" != postgres && "$s" != gotenberg ]] && out+="$s "
  done < <(docker compose ps --services --status running 2>/dev/null || true)
  printf '%s' "${out% }"
}

stop_writers() { # services
  local services="$1" n i
  if [[ -n "$services" ]]; then
    echo "restore-db: stopping: $services"
    # shellcheck disable=SC2086
    docker compose stop $services
  fi
  echo "restore-db: blocking new connections to '$LIVE_DB' and ending any that remain"
  psql_admin -c "ALTER DATABASE \"$LIVE_DB\" ALLOW_CONNECTIONS false;" >/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LIVE_DB' AND pid <> pg_backend_pid();" >/dev/null
    n="$(psql_admin -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '$LIVE_DB';")"
    [[ "$n" == "0" ]] && { echo "restore-db: no connections remain to '$LIVE_DB'"; return 0; }
    sleep 2
  done
  die "connections to '$LIVE_DB' remain after 30 seconds; nothing was swapped. Run --resume to try again."
}

allow_connections() { psql_admin -c "ALTER DATABASE \"$1\" ALLOW_CONNECTIONS true;" >/dev/null; }

# ⚑ THE SWAP IS TWO RENAMES IN ONE TRANSACTION. ALTER DATABASE … RENAME is transactional in Postgres
# (unlike CREATE/DROP DATABASE): verified on the pinned 16.15 on 2026-10-21 and again by
# scripts/test-restore-db-stack.sh. If the second rename fails, psql stops, the transaction aborts and
# neither rename happened — there is no half-renamed state to recover from.
swap_databases() { # live_new_name incoming_name
  psql_admin <<SQL >/dev/null
BEGIN;
ALTER DATABASE "$LIVE_DB" RENAME TO "$1";
ALTER DATABASE "$2" RENAME TO "$LIVE_DB";
COMMIT;
SQL
}

# ⚑ THE EXPORT CACHE IS KEYED BY VERSION ID (`render:<generator>:version:<id>`), and ids are only
# unique within one database. After a swap, the restored database's sequences hand out ids whose cached
# DOCX/PDF bytes came from the OTHER database, so exports would serve another lesson plan's document.
# The app is stopped here, so emptying the cache races nothing; it refills on demand.
# A missing directory has nothing to invalidate. Any deletion error must leave writers stopped and
# the journal at swapped/undo-swapped, so --resume retries invalidation after the fault is repaired.
# BusyBox find (the Alpine app image) can return 0 when -delete fails, so verify the postcondition.
clear_export_cache() {
  echo "restore-db: emptying the export cache (it is keyed by version id, which the swap reuses)"
  docker compose run --rm --no-deps -T --entrypoint sh app -c \
    'd="${ARTIFACT_CACHE_DIR:-/var/cache/lesson3}"; if [ -d "$d" ]; then
       find "$d" -mindepth 1 -maxdepth 1 -type f -delete &&
       remaining="$(find "$d" -mindepth 1 -maxdepth 1 -type f -print -quit)" && [ -z "$remaining" ]
     fi' \
    >/dev/null || die "could not empty the export cache; the app remains stopped. Repair the cache filesystem, then run scripts/restore-db.sh --resume."
}

start_services() { # services
  local services="$1"
  [[ " $services " == *" app "* ]] || services="app${services:+ $services}"
  echo "restore-db: starting: $services"
  # shellcheck disable=SC2086
  docker compose up -d $services
}

wait_for_app() {
  local waited=0 limit="${RESTORE_APP_WAIT_SECONDS:-180}"
  while (( waited < limit )); do
    if docker compose exec -T app node -e \
      "fetch('http://localhost:3000/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      echo "restore-db: the app answers"
      return 0
    fi
    sleep 5; waited=$((waited + 5))
  done
  return 1
}

# The in-server check (app/scripts/restore-check.ts) in the migrate image, against DATABASE_URI.
# ⚑ The URI travels in the ENVIRONMENT (`-e DATABASE_URI` with no value takes it from this process),
# never on a command line, where `ps` would show the database password to every user on the host.
run_check() { # database version-id-or-empty
  local db="$1" version="$2" out
  out="$(DATABASE_URI="$(db_uri "$db")" RESTORE_CHECK_VERSION="$version" RESTORE_CHECK_PLAN="$(j_get checkPlan)" \
    docker compose run --rm --no-deps -T -e DATABASE_URI -e RESTORE_CHECK_VERSION -e RESTORE_CHECK_PLAN -e NODE_ENV=production \
    migrate npx payload run scripts/restore-check.ts 2>&1)" || { printf '%s\n' "$out" | sed 's/^/  /'; return 1; }
  printf '%s\n' "$out" | grep '^restore-check:' | sed 's/^/  /' || true
  CHECK_RESULT="$(printf '%s\n' "$out" | grep -E '^RESTORE_CHECK_(OK|NONE)' | tail -n1)"
  [[ -n "$CHECK_RESULT" ]]
}

db_uri() {
  local base; base="$(env_get DATABASE_URI)"
  [[ "$base" =~ ^(postgres(ql)?://[^/]+)/$LIVE_DB(\?.*)?$ ]] \
    || die "DATABASE_URI in .env does not end in '/$LIVE_DB'; cannot point the check at '$1' safely"
  printf '%s/%s%s' "${BASH_REMATCH[1]}" "$1" "${BASH_REMATCH[3]}"
}

print_status() {
  if ! journal_open; then echo "restore-db: no restore in progress (journal: $JOURNAL)"; return 0; fi
  local k
  echo "restore-db: restore journal ($JOURNAL)"
  for k in $J_KEYS; do printf '  %-13s %s\n' "$k" "$(j_get "$k")"; done
  case "$(j_get state)" in
    staging|migrating|checking|checked)
      echo "next: --resume reverses it (the live database was not changed); then restore again." ;;
    approved|writers-stopped|swapped|starting)
      echo "next: --resume completes the restore you confirmed." ;;
    provisional)
      echo "next: sign in, open a known lesson and export it; then --confirm. Or --undo." ;;
    live-check-failed)
      echo "next: --undo puts the previous database back. --resume repeats the start and the check." ;;
    accepted)
      echo "next: --discard-previous drops $(j_get previous). Until then, --undo is still possible." ;;
    undo-approved|undo-services-stopped|undo-backed-up|undo-swapped)
      echo "next: --resume completes the undo you confirmed." ;;
    undone)
      echo "next: --discard-previous drops $(j_get undone), the restored database you undid." ;;
  esac
}

# ─── Forward restore, from the confirmation on (shared by a fresh run and --resume) ──────────────────

do_swap_and_start() {
  local incoming previous services set
  incoming="$(j_get incoming)"; previous="$(j_get previous)"; services="$(j_get services)"

  if [[ "$(j_get state)" == approved ]]; then
    stop_writers "$services"
    set_state writers-stopped
  fi

  if [[ "$(j_get state)" == writers-stopped ]]; then
    set="$(db_set "$incoming" "$previous")"
    if [[ "$set" == "$LIVE_DB $incoming" ]]; then
      stop_writers ""   # a resumed run re-checks that nothing reconnected while it was away
      echo "restore-db: swapping '$incoming' in as '$LIVE_DB' (the current one becomes '$previous')"
      swap_databases "$previous" "$incoming"
    elif [[ "$set" == "$LIVE_DB $previous" ]]; then
      echo "restore-db: the catalog shows the swap already committed"
    else
      die "unexpected databases present ($set); expected '$LIVE_DB $incoming' or '$LIVE_DB $previous'. Not guessing — see docs/OPS.md."
    fi
    set_state swapped
  fi

  if [[ "$(j_get state)" == swapped || "$(j_get state)" == live-check-failed ]]; then
    allow_connections "$LIVE_DB"
    clear_export_cache
    set_state starting
  fi

  start_services "$services"
  if wait_for_app && run_check "$LIVE_DB" "$(j_get checkVersion)"; then
    set_state provisional
    echo "restore-db: the restored database is live and PROVISIONAL. The previous database is kept as '$previous'."
    echo "restore-db: now sign in, open a known lesson, export it as DOCX and PDF, then run: scripts/restore-db.sh --confirm"
    echo "restore-db: if anything is wrong instead: scripts/restore-db.sh --undo"
  else
    set_state live-check-failed
    echo "restore-db: STARTUP CHECK FAILED against the live database. Nothing further was done." >&2
    echo "restore-db: the previous database is intact as '$previous'. To put it back: scripts/restore-db.sh --undo" >&2
    echo "restore-db: to repeat the start and the check instead: scripts/restore-db.sh --resume" >&2
    exit 1
  fi
}

reverse_unconfirmed() {
  local incoming services
  incoming="$(j_get incoming)"; services="$(j_get services)"
  echo "restore-db: reversing the unconfirmed restore; the live database was not changed"
  if db_exists "$incoming"; then
    psql_admin -c "DROP DATABASE \"$incoming\" WITH (FORCE);" >/dev/null
    echo "restore-db: dropped '$incoming'"
  fi
  close_journal reversed
  echo "restore-db: reversed. Restore again when ready."
}

# A staged copy that fails a check is reversed on the spot: nothing live was touched, so there is
# nothing to decide, and leaving the journal open would only block the next attempt.
fail_staged() {
  echo "restore-db: REFUSED — $*" >&2
  reverse_unconfirmed >&2
  exit 1
}

# ─── Undo ────────────────────────────────────────────────────────────────────────────────────────────

do_undo_steps() {
  local previous undone services set state
  previous="$(j_get previous)"; undone="$(j_get undone)"; services="$(j_get services)"

  state="$(j_get state)"
  if [[ "$state" == undo-approved ]]; then
    # ⚑ STOP THE APP BEFORE THE UNDO BACKUP, not after: a backup taken while the app still runs misses
    # whatever is saved between the dump and the stop, which is the very work this backup exists for.
    # shellcheck disable=SC2086
    [[ -z "$services" ]] || docker compose stop $services
    set_state undo-services-stopped; state=undo-services-stopped
  fi

  if [[ "$state" == undo-services-stopped ]]; then
    echo "restore-db: taking a backup of the current database before undoing (work saved since the restore)"
    if ! "$REPO_DIR/scripts/backup-db.sh" --label "premigrate-prerestore-undo-$(j_get id)"; then
      start_services "$services"
      set_state "$(j_get undoFrom)"
      die "the pre-undo backup failed, so nothing was undone and the app was started again. Fix the backup destination, then run --undo again."
    fi
    set_state undo-backed-up; state=undo-backed-up
  fi

  if [[ "$state" == undo-backed-up ]]; then
    set="$(db_set "$previous" "$undone")"
    if [[ "$set" == "$LIVE_DB $previous" ]]; then
      stop_writers ""
      echo "restore-db: swapping '$previous' back in as '$LIVE_DB' (the restored one becomes '$undone')"
      swap_databases "$undone" "$previous"
    elif [[ "$set" == "$LIVE_DB $undone" ]]; then
      echo "restore-db: the catalog shows the undo swap already committed"
    else
      die "unexpected databases present ($set); expected '$LIVE_DB $previous' or '$LIVE_DB $undone'. Not guessing — see docs/OPS.md."
    fi
    set_state undo-swapped; state=undo-swapped
  fi

  if [[ "$state" == undo-swapped ]]; then
    allow_connections "$LIVE_DB"
    clear_export_cache
    start_services "$services"
    if wait_for_app; then
      echo "restore-db: the app answers on the previous database"
    else
      echo "restore-db: WARNING: the app did not answer within the wait; check 'docker compose logs app'" >&2
    fi
    set_state undone
    echo "restore-db: UNDONE. The previous database is live again. The restored one is kept as '$undone';"
    echo "restore-db: work saved while it was live is in the premigrate-prerestore-undo backup just taken."
    echo "restore-db: when satisfied: scripts/restore-db.sh --discard-previous"
  fi
}

# ─── Journal commands ────────────────────────────────────────────────────────────────────────────────

case "$MODE" in
  status) print_status; exit 0 ;;
  resume)
    take_lock
    journal_open || die "no restore in progress — nothing to resume"
    case "$(j_get state)" in
      staging|migrating|checking|checked) reverse_unconfirmed ;;
      approved|writers-stopped|swapped|starting|live-check-failed) do_swap_and_start ;;
      undo-approved|undo-services-stopped|undo-backed-up|undo-swapped) do_undo_steps ;;
      *) print_status ;;
    esac
    exit 0 ;;
  confirm)
    take_lock
    [[ "$(j_get state)" == provisional ]] \
      || die "--confirm needs a provisional restore (state: '$(j_get state)'); see --status"
    set_state accepted
    echo "restore-db: accepted. The previous database is still kept as '$(j_get previous)', and --undo"
    echo "restore-db: still works until you run --discard-previous."
    exit 0 ;;
  undo)
    take_lock
    state="$(j_get state)"
    case "$state" in
      provisional|live-check-failed|accepted) ;;
      undo-*) die "an undo is already under way (state '$state'); run --resume" ;;
      *) die "--undo is possible after a swap and before --discard-previous (state: '${state:-none}')" ;;
    esac
    previous="$(j_get previous)"
    echo "restore-db: UNDO puts '$previous' back as the live database."
    echo "restore-db: ⚠ WORK SAVED AFTER THE RESTORED DATABASE WENT LIVE WILL BE LOST BY UNDOING."
    echo "restore-db: Before undoing, this stops the app and takes a backup of the current database"
    echo "restore-db: (label premigrate-prerestore-undo-$(j_get id)), so that work is not lost silently."
    printf 'Type undo to continue: '
    answer=""; read -r answer <&3 || true
    [[ "$answer" == "undo" ]] || die "not confirmed; nothing was changed"
    services="$(j_get services)"; current="$(running_writers)"
    for s in $current; do [[ " $services " == *" $s "* ]] || services="${services:+$services }$s"; done
    set_state undo-approved "undoFrom=$state" "services=$services" \
      "undone=lesson3_undone_$(j_get id)"
    do_undo_steps
    exit 0 ;;
  discard-previous)
    take_lock
    case "$(j_get state)" in
      accepted) target="$(j_get previous)" ;;
      undone) target="$(j_get undone)" ;;
      provisional) die "run --confirm first, after you have signed in, opened a lesson and exported it" ;;
      *) die "nothing to discard (state: '$(j_get state)'); see --status" ;;
    esac
    echo "restore-db: this permanently drops '$target'. It cannot be undone."
    printf 'Type the database name (%s) to continue: ' "$target"
    answer=""; read -r answer <&3 || true
    [[ "$answer" == "$target" ]] || die "not confirmed; nothing was dropped"
    if db_exists "$target"; then
      psql_admin -c "DROP DATABASE \"$target\" WITH (FORCE);" >/dev/null
    fi
    close_journal closed
    echo "restore-db: dropped '$target'. The restore journal is closed (kept under out/ops/restore-history/)."
    exit 0 ;;
esac

# ─── Restore (drill, or the first half of a live replacement) ─────────────────────────────────────

need age
# Only a remote-backed run needs rclone and a destination; --local-file needs neither.
if [[ -z "$LOCAL_FILE" ]]; then
  need rclone
  [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]] || die "BACKUP_RCLONE_REMOTE is not set (or use --local-file)"
fi

if [[ "$MODE" == "list" ]]; then
  echo "restore-db: backups under ${BACKUP_RCLONE_REMOTE}/${STREAM:-}"
  rclone lsl "${BACKUP_RCLONE_REMOTE%/}/${STREAM:+$STREAM/}" --include "*.dump.age" | sort
  exit 0
fi

[[ -n "$FROM" || -n "$LOCAL_FILE" ]] \
  || die "specify --from <stream/name.dump.age> (see --list), or --local-file <path>"
[[ -n "${AGE_IDENTITY:-}" ]] || die "AGE_IDENTITY must point to the age private key file (held off-box)"
[[ -f "$AGE_IDENTITY" ]] || die "AGE_IDENTITY file not found: $AGE_IDENTITY"
# Validate the target name as a plain Postgres identifier BEFORE it is interpolated into DROP/CREATE
# DATABASE (the name is quoted there, but rejecting anything but [A-Za-z_][A-Za-z0-9_]* closes the
# identifier-injection door entirely — operator-only, but this runs with DB-owner privileges).
[[ "$INTO" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] || die "invalid target DB name: $INTO"
if [[ "$INTO" == "lesson3" && "$FORCE_PROD" -ne 1 ]]; then
  die "refusing to restore into live 'lesson3' without --force-prod (use a disposable target for drills)"
fi
# A drill drops and recreates its target, so it must never be pointed at a database a live
# replacement is holding.
[[ "$INTO" != lesson3_incoming_* && "$INTO" != lesson3_before_restore_* && "$INTO" != lesson3_undone_* ]] \
  || die "'$INTO' is a name the live-restore journal uses; choose another drill target"
LIVE=0
if [[ "$INTO" == "$LIVE_DB" ]]; then
  LIVE=1
  [[ -z "$CHECK_PLAN" || "$CHECK_PLAN" =~ ^[1-9][0-9]*$ ]] || die "--check-plan must be a lesson plan id"
  take_lock
  if journal_open; then die "a restore is already in progress (state '$(j_get state)'). Run --status to see it."; fi
fi

TMP="$(mktemp -d)"
ENC="$TMP/backup.dump.age"; PLAIN="$TMP/backup.dump"

SOURCE_LABEL="${LOCAL_FILE:-$FROM}"

# The backup's name carries the moment its data was taken; the live path needs it for the typed
# confirmation and to say plainly which work the restore leaves out.
if [[ "$LIVE" -eq 1 ]]; then
  BASE="$(basename "$SOURCE_LABEL")"
  [[ "$SOURCE_LABEL" =~ ^[A-Za-z0-9._/@+-]+$ ]] || die "the backup's name may contain only letters, digits and . _ / @ + -"
  [[ "$BASE" =~ -([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z ]] \
    || die "cannot read the backup's date from its name '$BASE'. Keep backup-db.sh's original file name (…-YYYYMMDDTHHMMSSZ….dump.age)."
  BACKUP_DATE="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]}"
  BACKUP_TIME="${BASH_REMATCH[4]}:${BASH_REMATCH[5]} UTC"
fi

if [[ -n "$LOCAL_FILE" ]]; then
  [[ -f "$LOCAL_FILE" ]] || die "--local-file does not exist: $LOCAL_FILE"
  echo "restore-db: using local file ${LOCAL_FILE}"
  # ⚑ POINT AT IT, DO NOT COPY IT. This used to `cp` the whole encrypted dump into $TMP for no reason:
  # nothing writes to $ENC, `age -d` only reads it, and the EXIT trap removes $TMP — never the caller's
  # file — so the copy bought a second multi-megabyte write and a way to run $TMP out of space.
  # ⚑ The DECRYPTED dump still lands in $TMP and is still removed by the trap; that is the part that
  # must not be left lying around.
  ENC="$LOCAL_FILE"
else
  echo "restore-db: fetching ${FROM}"
  rclone copyto "${BACKUP_RCLONE_REMOTE%/}/${FROM}" "$ENC" --no-traverse
fi

ENC_BYTES="$(wc -c <"$ENC" | tr -d '[:space:]')"
if [[ "$LIVE" -eq 1 ]]; then
  # The decrypted dump is the ciphertext's size less a few bytes of age framing.
  NEED_KB=$(( ENC_BYTES / 1024 + 65536 ))
  HAVE_KB="$(free_kb "$TMP")"
  [[ "$HAVE_KB" -ge "$NEED_KB" ]] \
    || die "not enough space for the decrypted backup in $TMP: need ${NEED_KB} KB, have ${HAVE_KB} KB. Set TMPDIR to a larger disk. Nothing was changed."
fi

echo "restore-db: decrypting"
if ! age -d -i "$AGE_IDENTITY" -o "$PLAIN" "$ENC"; then
  [[ "$LIVE" -eq 1 ]] \
    && die "the private key did not decrypt this backup (wrong key, or a damaged or truncated file). Nothing was changed."
  exit 1
fi

if [[ "$LIVE" -eq 1 ]]; then
  echo "restore-db: preflight —"
  PLAIN_BYTES="$(wc -c <"$PLAIN" | tr -d '[:space:]')"
  docker compose exec -T postgres pg_restore -l <"$PLAIN" >/dev/null \
    || die "pg_restore does not accept the decrypted file as a database dump. Nothing was changed."
  echo "  backup decrypts and is a pg_dump archive (${PLAIN_BYTES} bytes)"

  # ⚑ SPACE FOR BOTH DATABASES. The live one already occupies its space; the volume must also hold the
  # incoming copy. Its size is not known until restored, so estimate it as the larger of the live
  # database and a multiple of the dump (a restore after mass deletion brings back MORE than is live),
  # plus 10 % and 256 MB. The multiple is an estimate, not a measurement of a large corpus: compressed
  # text typically expands several-fold on restore, plus indexes. The fixed headroom covers an empty
  # schema's own size (12 MB measured on 2026-10-21, where a one-plan database dumped to 146 KB).
  LIVE_BYTES="$(psql_admin -c "SELECT pg_database_size('$LIVE_DB');")"
  EST_BYTES=$(( PLAIN_BYTES * ${RESTORE_DUMP_EXPANSION:-8} ))
  (( LIVE_BYTES > EST_BYTES )) && EST_BYTES="$LIVE_BYTES"
  NEED_KB=$(( EST_BYTES / 1024 * 11 / 10 + 262144 ))
  HAVE_KB="$(docker compose exec -T postgres df -Pk /var/lib/postgresql/data | awk 'NR==2 {print $4}')"
  [[ "$HAVE_KB" =~ ^[0-9]+$ ]] || die "could not read free space on the database volume"
  [[ "$HAVE_KB" -ge "$NEED_KB" ]] \
    || die "not enough space on the database volume for a second copy: need ${NEED_KB} KB, have ${HAVE_KB} KB. Nothing was changed."
  echo "  database volume has room for the incoming copy (need ${NEED_KB} KB, have ${HAVE_KB} KB)"

  if [[ -f "$REPO_DIR/VERSION" ]]; then
    INSTALLED="$(tr -d '[:space:]' <"$REPO_DIR/VERSION")"
  else
    INSTALLED="$(git -C "$REPO_DIR" describe --tags --always --dirty 2>/dev/null || true)"
  fi
  [[ "$INSTALLED" =~ ^[A-Za-z0-9._+-]+$ ]] || die "cannot tell which ARES Lesson Plans version is installed (no VERSION file, no git)"
  INSTALLED_MIGRATIONS="$(docker compose run --rm --no-deps -T -e RESTORE_CHECK_MODE=migrations \
    migrate npx payload run scripts/restore-check.ts 2>/dev/null | sed -n 's/^MIGRATION //p')" || true
  [[ -n "$INSTALLED_MIGRATIONS" ]] \
    || die "could not list the installed software's migrations from the migrate image. Nothing was changed."
  echo "  installed software: $INSTALLED ($(printf '%s\n' "$INSTALLED_MIGRATIONS" | wc -l | tr -d ' ') migrations)"

  ID="$(date -u +%Y%m%dT%H%M%SZ)"
  INTO="lesson3_incoming_$ID"
  j_write "id=$ID" "backup=$SOURCE_LABEL" "backupDate=$BACKUP_DATE" "backupTime=$BACKUP_TIME" \
    "incoming=$INTO" "previous=lesson3_before_restore_$ID" "installed=$INSTALLED" \
    "checkPlan=$CHECK_PLAN" "startedAt=$(now_utc)"
  set_state staging
fi

# A failure from here to the confirmation leaves the live database untouched; on the live path it also
# drops the staged copy and closes the journal, so the next attempt starts clean.
restore_die() { [[ "$LIVE" -ne 1 ]] || fail_staged "$*"; die "$*"; }

echo "restore-db: (re)creating target DB '$INTO'"
docker compose exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$INTO\";" -c "CREATE DATABASE \"$INTO\";" \
  || restore_die "could not create '$INTO'."

echo "restore-db: restoring into '$INTO'"
# Stream the plain dump into pg_restore running in the container.
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$INTO" --no-owner --clean --if-exists < "$PLAIN" \
  || restore_die "pg_restore reported errors restoring into '$INTO' (a truncated or incompatible backup?)."

echo "restore-db: restored ${SOURCE_LABEL} into '$INTO'"

# ⚑ THE VERIFICATION IS THE DRILL. Everything above only proves the bytes moved and pg_restore did not
# refuse them; these queries are the part that speaks to the corpus actually being there.
#
# ⚑ AND IT MUST BE ABLE TO FAIL. This block ended with `|| true`, so a verification query that errored
# — a missing table, a broken restore, a wrong database — still exited 0 and printed "OK" above it. A
# check that cannot fail is not a check, and this one guarded the only claim anybody cares about.
#
# ⚑ NOT JUST THE HEADLINE TABLES EITHER. `lesson_plans` and `lesson_bundle_versions` were the whole
# report, which cannot distinguish "the corpus came back" from "the two tables I happened to name came
# back". Roles, subject scoping, editing-access grants and the nested version content are the rest of
# what a school would lose, so they are counted too. This is still a representative check, not proof of
# every row — say so rather than implying otherwise.
# ⚑ THE TABLE LIST IS DERIVED, NOT HAND-MAINTAINED — and the hand-maintained version was ALREADY WRONG
# when this was written (2026-08-22). It named twelve tables and silently skipped `favorites`,
# `messages` and `edit_recovery`, which are registered collections holding real rows (1, 30 and 5 on the
# Rock). So the drill printed PASSED while never looking at three collections, and the write-up claimed
# "the corpus comes back". A list that must be edited in lockstep with `payload.config.ts` rots toward
# under-verification, and under-verification is the failure that looks like success.
#
# Asking the database instead means a new collection is covered the day it exists, with no script edit.
#
# ⚑ AND IT IS TWO ROUND TRIPS, NOT ONE PER TABLE. The previous shape spawned a `docker compose exec`
# per table; this asks for the table list once, then every count in a single query.
# ⚑ PRESENT IS A SCHEMA CHECK; NON-EMPTY IS A CONTENT CLAIM — and only `users` can make that claim for
# every installation (audit 2026-10-17). Every installation has at least one account: the first sign-up
# becomes its Site Administrator. Curriculum and lesson plans arrive later, so a backup taken before
# them is a real, recoverable backup with those tables empty — and the old rule, which required all
# five non-empty, told the operator "Do NOT treat this backup as recoverable" about it. So: all five
# must exist; `users` must have rows; an empty content table is reported as a NOTE that says what it
# means, rather than failed.
REQUIRED=(lesson_plans lesson_bundle_versions users subjects subject_grades)

psql_q() { docker compose exec -T postgres psql -U "$DB_USER" -d "$INTO" -tA -v ON_ERROR_STOP=1 -c "$1"; }

echo "restore-db: verification —"
TABLES="$(psql_q "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")" \
  || restore_die "RESTORE DRILL FAILED — could not list tables in '$INTO'; the restore is not usable."
[[ -n "$TABLES" ]] || restore_die "RESTORE DRILL FAILED — '$INTO' has no public tables at all."

# One UNION ALL over every table, so the whole corpus is counted in a single query.
COUNT_SQL=""
while IFS= read -r t; do
  [[ -n "$t" ]] || continue
  [[ -n "$COUNT_SQL" ]] && COUNT_SQL+=" UNION ALL "
  COUNT_SQL+="SELECT '$t' AS t, count(*) AS n FROM \"$t\""
done <<< "$TABLES"

COUNTS="$(psql_q "SELECT t||' '||n FROM ($COUNT_SQL) x ORDER BY t;")" \
  || restore_die "RESTORE DRILL FAILED — counting rows in '$INTO' failed; the restore is not usable."

FAILED=0
NONEMPTY=0
while IFS=' ' read -r t n; do
  [[ -n "$t" ]] || continue
  [[ "$n" -gt 0 ]] && NONEMPTY=$((NONEMPTY + 1))
  printf '  %-52s %s\n' "$t" "$n"
done <<< "$COUNTS"

# The gate: the hand-picked tables must be PRESENT (a schema the app can run on), and `users` must have
# rows (every installation does). Everything else is reported, because zero is legitimate elsewhere.
EMPTY_CONTENT=()
for t in "${REQUIRED[@]}"; do
  n="$(printf '%s\n' "$COUNTS" | awk -v k="$t" '$1==k {print $2}')"
  if [[ -z "$n" ]]; then
    echo "  FAIL  $t — table absent from the restored database"; FAILED=1
  elif [[ "$n" -eq 0 && "$t" == users ]]; then
    echo "  FAIL  users = 0 — every installation has at least one account"; FAILED=1
  elif [[ "$n" -eq 0 ]]; then
    EMPTY_CONTENT+=("$t")
  fi
done
if [[ "${#EMPTY_CONTENT[@]}" -gt 0 ]]; then
  echo "  NOTE  no rows in: ${EMPTY_CONTENT[*]}."
  echo "        That is expected for a new installation that had no curriculum or lesson plans when"
  echo "        this backup was taken. If it DID have them then, this backup does not contain them."
fi

if [[ "$FAILED" -ne 0 ]]; then
  [[ "$LIVE" -ne 1 ]] || fail_staged "the restored copy failed verification; the live database was not changed."
  die "RESTORE DRILL FAILED — decryption and pg_restore completed, but verification did not. Do NOT treat this backup as recoverable."
fi

if [[ "$LIVE" -ne 1 ]]; then
  echo "restore-db: RESTORE DRILL PASSED — ${SOURCE_LABEL} decrypted, restored into '$INTO', and every"
  echo "restore-db: table in the restored database counted (${NONEMPTY} of them non-empty). This is a"
  echo "restore-db: whole-schema row-count check, not a row-by-row comparison against live."
  exit 0
fi

# ─── Live replacement, continued: schema, migrate, check, confirm, swap ───────────────────────────

rm -f "$PLAIN"   # restored and counted; the decrypted dump has no further use

# ⚑ SCHEMA: THE BACKUP MUST BE THIS SOFTWARE'S PAST, NEVER ITS FUTURE. Its applied migrations must be
# exactly the first N of the installed list. A name the installed software does not know means the
# backup came from newer software — migrating cannot fix that and running on it would be undefined.
# (`dev` is the marker Payload's development push leaves; it is not a migration.)
echo "restore-db: schema check —"
BACKUP_MIGRATIONS="$(psql_q "SELECT name FROM payload_migrations WHERE name <> 'dev' ORDER BY id;")" \
  || fail_staged "the backup has no payload_migrations table; it is not an ARES Lesson Plans database this software can run."
UNKNOWN=""; COUNT=0
while IFS= read -r m; do
  [[ -n "$m" ]] || continue
  COUNT=$((COUNT + 1))
  printf '%s\n' "$INSTALLED_MIGRATIONS" | grep -Fxq "$m" || UNKNOWN+=" $m"
done <<< "$BACKUP_MIGRATIONS"
[[ -z "$UNKNOWN" ]] \
  || fail_staged "the backup is from NEWER software than is installed ($INSTALLED): it has migrations this software does not know:$UNKNOWN. Install the matching or a later release first. Nothing live was changed."
GAP=""
while IFS= read -r m; do
  [[ -n "$m" ]] || continue
  printf '%s\n' "$BACKUP_MIGRATIONS" | grep -Fxq "$m" || GAP+=" $m"
done < <(printf '%s\n' "$INSTALLED_MIGRATIONS" | head -n "$COUNT")
[[ -z "$GAP" ]] \
  || fail_staged "the backup's migrations are not a prefix of the installed ones (missing:$GAP). Not guessing; nothing live was changed."
PENDING=$(( $(printf '%s\n' "$INSTALLED_MIGRATIONS" | wc -l) - COUNT ))
echo "  backup has ${COUNT} of the installed migrations; ${PENDING} to apply"

set_state migrating
echo "restore-db: applying the installed migrations to '$INTO' only"
DATABASE_URI="$(db_uri "$INTO")" docker compose run --rm --no-deps -T -e DATABASE_URI migrate npx payload migrate \
  || fail_staged "migrating '$INTO' failed; the live database was not changed."

set_state checking
echo "restore-db: in-server check against '$INTO' (Local API read, DOCX, PDF) —"
docker compose up -d gotenberg >/dev/null
CHECK_RESULT=""
run_check "$INTO" "" \
  || fail_staged "the in-server check failed against '$INTO'; the live database was not changed."
CHECK_VERSION=""
[[ "$CHECK_RESULT" =~ version=([0-9]+) ]] && CHECK_VERSION="${BASH_REMATCH[1]}"
SERVICES="$(running_writers)"
set_state checked "checkVersion=$CHECK_VERSION" "services=$SERVICES"

PREVIOUS="$(j_get previous)"
cat <<EOF

restore-db: READY TO REPLACE THE LIVE DATABASE
  backup     ${SOURCE_LABEL}
             its data is from ${BACKUP_DATE} ${BACKUP_TIME}
  checked    $( [[ -n "$CHECK_VERSION" ]] && echo "lesson-plan version $CHECK_VERSION read and rendered as DOCX and PDF" || echo "no lesson plans in this backup; nothing to render" )
  this will  1. stop: app${SERVICES:+ (running now: $SERVICES)}
             2. block connections to '$LIVE_DB' and end any that remain
             3. in one transaction, rename '$LIVE_DB' to '$PREVIOUS' and the checked copy to '$LIVE_DB'
             4. empty the export cache, start the app, and repeat the check
  Work saved after ${BACKUP_DATE} ${BACKUP_TIME} is not in this backup. The current database is kept as
  '$PREVIOUS'; --undo puts it back until you run --discard-previous.

EOF
printf "Type the backup's date (%s) to continue: " "$BACKUP_DATE"
answer=""; read -r answer <&3 || true
if [[ "$answer" != "$BACKUP_DATE" ]]; then
  echo
  echo "restore-db: not confirmed."
  reverse_unconfirmed
  exit 1
fi

set_state approved
do_swap_and_start
