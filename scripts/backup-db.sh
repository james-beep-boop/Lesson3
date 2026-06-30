#!/usr/bin/env bash
#
# Off-site, encrypted Postgres backup for Lesson3 (SPEC §11 / readiness #9).
#
#   pg_dump (in the postgres container)  ->  age -r <recipient>  ->  rclone copy to Google Drive
#
# DESIGN
#   - pg_dump runs INSIDE the postgres container (`docker compose exec postgres`), because Postgres is
#     internal-only (no host port) and pg_dump is absent on the host. Custom format (`-Fc`): compact +
#     supports selective `pg_restore`.
#   - Encrypted on the Rock with `age` to a RECIPIENT public key. The matching private identity is held
#     by the operator OFF the box, so a Rock compromise cannot decrypt past backups. The dump is opaque
#     to Google before it ever leaves the host.
#   - Uploaded with `rclone` to a Google Drive remote. Two streams under the remote:
#       daily/       nightly backups       (pruned after BACKUP_RETENTION_DAYS, default 30)
#       premigrate/  pre-deploy snapshots  (pruned after BACKUP_PREMIGRATE_RETENTION_DAYS, default 90)
#   - On success, optionally pings HEALTHCHECK_BACKUP_URL (the monitoring dead-man's-switch).
#
# USAGE
#   scripts/backup-db.sh                       # a nightly backup -> daily/
#   scripts/backup-db.sh --label premigrate    # a snapshot -> premigrate/ (used by deploy.sh)
#
# CONFIG (from the repo .env, or the environment; see docs/OPS.md):
#   BACKUP_AGE_RECIPIENT             age1...  (required) public recipient key
#   BACKUP_RCLONE_REMOTE             e.g. drive:lesson3-backups  (required) rclone remote + base path
#   BACKUP_RETENTION_DAYS            default 30
#   BACKUP_PREMIGRATE_RETENTION_DAYS default 90
#   HEALTHCHECK_BACKUP_URL           optional; curled on success
#   BACKUP_DB_NAME / BACKUP_DB_USER  default lesson3 / lesson3
set -euo pipefail

# Cron runs with a minimal PATH; make the user-local binaries (age, rclone) and common dirs reachable.
export PATH="$HOME/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

REPO_DIR="${BACKUP_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR"

# Read ONLY the keys we need from .env — do NOT `source` it (a value with spaces or a stray word would
# be run as a shell command). Precedence: an already-set environment variable wins over the .env value.
env_get() {
  local k="$1"; local v="${!k:-}"
  if [[ -z "$v" && -f .env ]]; then
    v="$(grep -E "^${k}=" .env | tail -n1 | cut -d= -f2-)"
    v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"   # strip surrounding quotes if any
  fi
  printf '%s' "$v"
}

BACKUP_AGE_RECIPIENT="$(env_get BACKUP_AGE_RECIPIENT)"
BACKUP_RCLONE_REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
HEALTHCHECK_BACKUP_URL="$(env_get HEALTHCHECK_BACKUP_URL)"
DB_NAME="$(env_get BACKUP_DB_NAME)";    DB_NAME="${DB_NAME:-lesson3}"
DB_USER="$(env_get BACKUP_DB_USER)";    DB_USER="${DB_USER:-lesson3}"
RETENTION_DAYS="$(env_get BACKUP_RETENTION_DAYS)";                       RETENTION_DAYS="${RETENTION_DAYS:-30}"
PREMIGRATE_RETENTION_DAYS="$(env_get BACKUP_PREMIGRATE_RETENTION_DAYS)"; PREMIGRATE_RETENTION_DAYS="${PREMIGRATE_RETENTION_DAYS:-90}"

LABEL=""
[[ "${1:-}" == "--label" && -n "${2:-}" ]] && LABEL="$2"

die() { echo "backup-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH ($PATH) — see docs/OPS.md setup"; }

need docker; need age; need rclone
[[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] || die "BACKUP_AGE_RECIPIENT is not set"
[[ -n "${BACKUP_RCLONE_REMOTE:-}" ]] || die "BACKUP_RCLONE_REMOTE is not set"

STREAM="daily"; KEEP_DAYS="$RETENTION_DAYS"
if [[ "$LABEL" == premigrate* ]]; then STREAM="premigrate"; KEEP_DAYS="$PREMIGRATE_RETENTION_DAYS"; fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${DB_NAME}-${TS}${LABEL:+-$LABEL}.dump.age"
DEST="${BACKUP_RCLONE_REMOTE%/}/${STREAM}/${NAME}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
LOCAL="$TMP/$NAME"

echo "backup-db: dumping '$DB_NAME' -> encrypt -> $DEST"

# pg_dump in the container (custom format), encrypt on the host. `set -o pipefail` makes a pg_dump
# failure fail the whole pipe rather than uploading a truncated/empty file.
docker compose exec -T postgres pg_dump -U "$DB_USER" -Fc "$DB_NAME" \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$LOCAL"

SIZE="$(wc -c < "$LOCAL")"
[[ "$SIZE" -gt 0 ]] || die "encrypted dump is empty — aborting (nothing uploaded)"
echo "backup-db: encrypted size ${SIZE} bytes"

rclone copyto "$LOCAL" "$DEST" --no-traverse
echo "backup-db: uploaded $DEST"

# Prune this stream by age. Tolerant of failure — a prune error must not fail the backup itself.
rclone delete "${BACKUP_RCLONE_REMOTE%/}/${STREAM}/" --min-age "${KEEP_DAYS}d" --include "${DB_NAME}-*.dump.age" \
  && echo "backup-db: pruned ${STREAM}/ older than ${KEEP_DAYS}d" \
  || echo "backup-db: WARN prune step failed (backup itself succeeded)" >&2

# Dead-man's-switch ping (item: monitoring). Best-effort.
if [[ -n "${HEALTHCHECK_BACKUP_URL:-}" ]]; then
  curl -fsS -m 15 --retry 3 "$HEALTHCHECK_BACKUP_URL" >/dev/null 2>&1 \
    && echo "backup-db: pinged heartbeat" \
    || echo "backup-db: WARN heartbeat ping failed" >&2
fi

echo "backup-db: OK"
