#!/usr/bin/env bash
#
# Retention pruning for Lesson3 bookkeeping tables (SPEC §11 retention policy, decided 2026-07-04).
#
# Two tables grow monotonically and are never trimmed by the app:
#   - `payload_jobs`         completed/failed background-job rows are kept for failure visibility
#   - `rate_limit_counters`  one row per (bucket, key) — includes every email recipient ever seen
#
# This deletes rows past their retention window, in ONE psql transaction, inside the postgres
# container (Postgres is internal-only — no host port). Idempotent + safe to re-run; a no-op once
# caught up. Cron it NIGHTLY beside the backup crons (see docs/OPS.md):
#
#   30 3 * * *  /srv/lesson3/scripts/prune-db.sh >> /srv/lesson3/out/prune.log 2>&1
#
# RETENTION (days; env-overridable — same fail-fast validation as backup-db.sh):
#   PRUNE_EXPORT_JOB_DAYS   default 14   completed generateVersionArtifact rows
#   PRUNE_EMAIL_JOB_DAYS    default 180  completed emailVersionArtifact + messagePing rows (egress audit trail)
#   PRUNE_FAILED_JOB_DAYS   default 90   any job row with has_error = true
#   PRUNE_RATE_LIMIT_DAYS   default 7    rate_limit_counters rows whose window has closed
#
# `payload_jobs_log` child rows cascade (ON DELETE cascade FK — verified in the add_payload_jobs
# migration), so deleting a parent job row cleans its log too. `generateVersionArtifact` /
# `emailVersionArtifact` / `messagePing` are the live task slugs; a completed row is one with
# `completed_at` set. Failed rows (`has_error`) are matched across ALL slugs by created_at so a
# stuck/never-completed failure is still eventually reclaimed.
set -euo pipefail

# Shared PATH + repo-root cd + env_get (reads .env keys without sourcing it). See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DB_NAME="$(env_get BACKUP_DB_NAME)";   DB_NAME="${DB_NAME:-lesson3}"
DB_USER="$(env_get BACKUP_DB_USER)";   DB_USER="${DB_USER:-lesson3}"
EXPORT_DAYS="$(env_get PRUNE_EXPORT_JOB_DAYS)";  EXPORT_DAYS="${EXPORT_DAYS:-14}"
EMAIL_DAYS="$(env_get PRUNE_EMAIL_JOB_DAYS)";    EMAIL_DAYS="${EMAIL_DAYS:-180}"
FAILED_DAYS="$(env_get PRUNE_FAILED_JOB_DAYS)";  FAILED_DAYS="${FAILED_DAYS:-90}"
RATE_DAYS="$(env_get PRUNE_RATE_LIMIT_DAYS)";    RATE_DAYS="${RATE_DAYS:-7}"

die() { echo "prune-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH — see docs/OPS.md setup"; }
# Reject a retention typo (0 / negative / non-numeric) BEFORE any DELETE — a bad value must never
# widen the window to "everything". Same guard idiom as backup-db.sh's positive_int.
positive_int() { [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "$1 must be a positive integer (got '$2')"; }

need docker
positive_int PRUNE_EXPORT_JOB_DAYS "$EXPORT_DAYS"
positive_int PRUNE_EMAIL_JOB_DAYS  "$EMAIL_DAYS"
positive_int PRUNE_FAILED_JOB_DAYS "$FAILED_DAYS"
positive_int PRUNE_RATE_LIMIT_DAYS "$RATE_DAYS"

# rate_limit_counters.window_start is epoch MILLISECONDS (lib/rateLimit.ts); compute the cutoff in ms.
RATE_CUTOFF_MS=$(( ( $(date -u +%s) - RATE_DAYS * 86400 ) * 1000 ))

echo "prune-db: pruning '$DB_NAME' (export ${EXPORT_DAYS}d, email ${EMAIL_DAYS}d, failed ${FAILED_DAYS}d, rate ${RATE_DAYS}d)"

# One transaction, ON_ERROR_STOP so a failure rolls back rather than half-pruning. Interpolated
# values are all integers this script computed (validated above / arithmetic) — no external strings.
docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DELETE FROM "payload_jobs"
  WHERE "task_slug" = 'generateVersionArtifact'
    AND "completed_at" IS NOT NULL
    AND "completed_at" < now() - interval '${EXPORT_DAYS} days';
DELETE FROM "payload_jobs"
  WHERE "task_slug" IN ('emailVersionArtifact', 'messagePing')
    AND "completed_at" IS NOT NULL
    AND "completed_at" < now() - interval '${EMAIL_DAYS} days';
DELETE FROM "payload_jobs"
  WHERE "has_error" = true
    AND "created_at" < now() - interval '${FAILED_DAYS} days';
DELETE FROM "rate_limit_counters"
  WHERE "window_start" < ${RATE_CUTOFF_MS};
COMMIT;
SQL

echo "prune-db: OK"
