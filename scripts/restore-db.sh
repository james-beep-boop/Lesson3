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
# SAFETY: refuses to restore into the live 'lesson3' unless --force-prod is given. Default target is a
# disposable check DB, so a drill never risks the corpus.
set -euo pipefail

# Shared PATH + repo-root cd + env_get (reads .env keys without sourcing it). See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_RCLONE_REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
DB_USER="$(env_get BACKUP_DB_USER)"; DB_USER="${DB_USER:-lesson3}"
die() { echo "restore-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH — see docs/OPS.md setup"; }
need docker; need age

MODE=""; FROM=""; INTO="lesson3_restore_check"; FORCE_PROD=0; LOCAL_FILE=""
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
    *) die "unknown arg: $1" ;;
  esac
done

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

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ENC="$TMP/backup.dump.age"; PLAIN="$TMP/backup.dump"

SOURCE_LABEL="${FROM}"
if [[ -n "$LOCAL_FILE" ]]; then
  [[ -f "$LOCAL_FILE" ]] || die "--local-file does not exist: $LOCAL_FILE"
  SOURCE_LABEL="$LOCAL_FILE"
  echo "restore-db: using local file ${LOCAL_FILE}"
  cp "$LOCAL_FILE" "$ENC"
else
  echo "restore-db: fetching ${FROM}"
  rclone copyto "${BACKUP_RCLONE_REMOTE%/}/${FROM}" "$ENC" --no-traverse
fi
echo "restore-db: decrypting"
age -d -i "$AGE_IDENTITY" -o "$PLAIN" "$ENC"

echo "restore-db: (re)creating target DB '$INTO'"
docker compose exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$INTO\";" -c "CREATE DATABASE \"$INTO\";"

echo "restore-db: restoring into '$INTO'"
# Stream the plain dump into pg_restore running in the container.
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$INTO" --no-owner --clean --if-exists < "$PLAIN"

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
REQUIRED_TABLES=(lesson_plans lesson_bundle_versions users subjects subject_grades)
NESTED_TABLES=(
  users_assignments
  lesson_bundle_versions_lessons
  lesson_bundle_versions_lessons_framework
  lesson_bundle_versions_lessons_resource_links
  lesson_bundle_versions_final_explanation_sections
  lesson_bundle_versions_final_explanation_rubric
  lesson_bundle_versions_summary_table_lessons
)

count_rows() {
  docker compose exec -T postgres psql -U "$DB_USER" -d "$INTO" -tA -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM \"$1\";" 2>/dev/null | tr -d '[:space:]'
}

echo "restore-db: verification —"
FAILED=0
for t in "${REQUIRED_TABLES[@]}"; do
  n="$(count_rows "$t")" || n=""
  if [[ -z "$n" ]]; then
    echo "  FAIL  $t — query failed (table missing, or the restore is not usable)"; FAILED=1
  elif [[ "$n" -eq 0 ]]; then
    # An empty core table in a real backup means the dump restored but the content did not.
    echo "  FAIL  $t = 0 — a real backup is never empty here"; FAILED=1
  else
    printf '  ok    %-34s %s\n' "$t" "$n"
  fi
done
for t in "${NESTED_TABLES[@]}"; do
  n="$(count_rows "$t")" || n=""
  if [[ -z "$n" ]]; then
    echo "  FAIL  $t — query failed"; FAILED=1
  else
    # Zero is legitimate here (a bundle need not have resource links), so these are reported, not gated.
    printf '  ok    %-34s %s\n' "$t" "$n"
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  die "RESTORE DRILL FAILED — decryption and pg_restore completed, but verification did not. Do NOT treat this backup as recoverable."
fi

echo "restore-db: RESTORE DRILL PASSED — ${SOURCE_LABEL} decrypted, restored into '$INTO', and every"
echo "restore-db: verification query succeeded. This is a representative check of headline and nested"
echo "restore-db: tables, not a row-by-row comparison against live."
