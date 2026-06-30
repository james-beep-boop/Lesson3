#!/usr/bin/env bash
#
# Restore a Lesson3 Postgres backup produced by backup-db.sh (SPEC §11 / readiness #9).
#
#   rclone copy from Drive  ->  age -d -i <identity>  ->  pg_restore into a target DB
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
export PATH="$HOME/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

REPO_DIR="${BACKUP_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR"

# Read ONLY the keys we need from .env — do NOT `source` it (see backup-db.sh). Env wins over .env.
env_get() {
  local k="$1"; local v="${!k:-}"
  if [[ -z "$v" && -f .env ]]; then
    v="$(grep -E "^${k}=" .env | tail -n1 | cut -d= -f2-)"
    v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  fi
  printf '%s' "$v"
}

BACKUP_RCLONE_REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
DB_USER="$(env_get BACKUP_DB_USER)"; DB_USER="${DB_USER:-lesson3}"
die() { echo "restore-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH — see docs/OPS.md setup"; }
need docker; need age; need rclone
[[ -n "${BACKUP_RCLONE_REMOTE:-}" ]] || die "BACKUP_RCLONE_REMOTE is not set"

MODE=""; FROM=""; INTO="lesson3_restore_check"; FORCE_PROD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) MODE="list"; shift; STREAM="${1:-}"; [[ "$STREAM" == -* ]] && STREAM=""; [[ -n "$STREAM" ]] && shift || true ;;
    --from) FROM="${2:?--from needs a path}"; shift 2 ;;
    --into) INTO="${2:?--into needs a db name}"; shift 2 ;;
    --force-prod) FORCE_PROD=1; shift ;;
    *) die "unknown arg: $1" ;;
  esac
done

if [[ "$MODE" == "list" ]]; then
  echo "restore-db: backups under ${BACKUP_RCLONE_REMOTE}/${STREAM:-}"
  rclone lsl "${BACKUP_RCLONE_REMOTE%/}/${STREAM:+$STREAM/}" --include "*.dump.age" | sort
  exit 0
fi

[[ -n "$FROM" ]] || die "specify --from <stream/name.dump.age> (see --list)"
[[ -n "${AGE_IDENTITY:-}" ]] || die "AGE_IDENTITY must point to the age private key file (held off-box)"
[[ -f "$AGE_IDENTITY" ]] || die "AGE_IDENTITY file not found: $AGE_IDENTITY"
if [[ "$INTO" == "lesson3" && "$FORCE_PROD" -ne 1 ]]; then
  die "refusing to restore into live 'lesson3' without --force-prod (use a disposable target for drills)"
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ENC="$TMP/backup.dump.age"; PLAIN="$TMP/backup.dump"

echo "restore-db: fetching ${FROM}"
rclone copyto "${BACKUP_RCLONE_REMOTE%/}/${FROM}" "$ENC" --no-traverse
echo "restore-db: decrypting"
age -d -i "$AGE_IDENTITY" -o "$PLAIN" "$ENC"

echo "restore-db: (re)creating target DB '$INTO'"
docker compose exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$INTO\";" -c "CREATE DATABASE \"$INTO\";"

echo "restore-db: restoring into '$INTO'"
# Stream the plain dump into pg_restore running in the container.
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$INTO" --no-owner --clean --if-exists < "$PLAIN"

echo "restore-db: OK — restored ${FROM} into '$INTO'"
echo "restore-db: sanity counts:"
docker compose exec -T postgres psql -U "$DB_USER" -d "$INTO" -tAc \
  "SELECT 'lesson_plans='||count(*) FROM lesson_plans UNION ALL SELECT 'versions='||count(*) FROM lesson_bundle_versions;" || true
