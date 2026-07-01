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
#   - Uploaded with `rclone` to a Google Drive remote, one stream per label (grandfather-father-son):
#       daily/       nightly backups       (keep newest BACKUP_DAILY_KEEP,   default 7)
#       weekly/      weekly  backups       (keep newest BACKUP_WEEKLY_KEEP,  default 4)
#       monthly/     monthly backups       (keep newest BACKUP_MONTHLY_KEEP, default 12)
#       premigrate/  pre-deploy snapshots  (pruned after BACKUP_PREMIGRATE_RETENTION_DAYS, default 90)
#     daily/weekly/monthly prune by COUNT (keep newest N — exact, and robust to a missed run);
#     premigrate prunes by AGE (irregular per-deploy cadence). Cron schedules the three — see docs/OPS.md.
#   - On success, optionally pings HEALTHCHECK_BACKUP_URL (the monitoring dead-man's-switch).
#
# USAGE
#   scripts/backup-db.sh                       # nightly backup   -> daily/
#   scripts/backup-db.sh --label weekly        # weekly snapshot  -> weekly/   (cron: Sundays)
#   scripts/backup-db.sh --label monthly       # monthly snapshot -> monthly/  (cron: 1st of month)
#   scripts/backup-db.sh --label premigrate    # pre-deploy snap  -> premigrate/ (used by deploy.sh)
#
# CONFIG (from the repo .env, or the environment; see docs/OPS.md):
#   BACKUP_AGE_RECIPIENT             age1...  (required) public recipient key
#   BACKUP_RCLONE_REMOTE             e.g. drive:lesson3-backups  (required) rclone remote + base path
#   BACKUP_DAILY_KEEP                default 7    (newest N kept in daily/)
#   BACKUP_WEEKLY_KEEP               default 4    (newest N kept in weekly/)
#   BACKUP_MONTHLY_KEEP              default 12   (newest N kept in monthly/)
#   BACKUP_PREMIGRATE_RETENTION_DAYS default 90   (premigrate/ pruned by age, in days)
#   HEALTHCHECK_BACKUP_URL           optional; curled on success
#   BACKUP_DB_NAME / BACKUP_DB_USER  default lesson3 / lesson3
set -euo pipefail

# Shared PATH + repo-root cd + env_get (reads .env keys without sourcing it). See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_AGE_RECIPIENT="$(env_get BACKUP_AGE_RECIPIENT)"
BACKUP_RCLONE_REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
HEALTHCHECK_BACKUP_URL="$(env_get HEALTHCHECK_BACKUP_URL)"
DB_NAME="$(env_get BACKUP_DB_NAME)";    DB_NAME="${DB_NAME:-lesson3}"
DB_USER="$(env_get BACKUP_DB_USER)";    DB_USER="${DB_USER:-lesson3}"
DAILY_KEEP="$(env_get BACKUP_DAILY_KEEP)";     DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="$(env_get BACKUP_WEEKLY_KEEP)";   WEEKLY_KEEP="${WEEKLY_KEEP:-4}"
MONTHLY_KEEP="$(env_get BACKUP_MONTHLY_KEEP)"; MONTHLY_KEEP="${MONTHLY_KEEP:-12}"
PREMIGRATE_RETENTION_DAYS="$(env_get BACKUP_PREMIGRATE_RETENTION_DAYS)"; PREMIGRATE_RETENTION_DAYS="${PREMIGRATE_RETENTION_DAYS:-90}"

LABEL=""
[[ "${1:-}" == "--label" && -n "${2:-}" ]] && LABEL="$2"

die() { echo "backup-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH ($PATH) — see docs/OPS.md setup"; }
# Reject a retention typo (0 / negative / non-numeric). A bad value would otherwise mean "delete the
# WHOLE stream" (count-prune: REMOVE = total - 0) or crash `$(( ))` AFTER the dump is already uploaded.
positive_int() { [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "$1 must be a positive integer (got '$2')"; }

need docker; need age; need rclone
[[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] || die "BACKUP_AGE_RECIPIENT is not set"
[[ -n "${BACKUP_RCLONE_REMOTE:-}" ]] || die "BACKUP_RCLONE_REMOTE is not set"

# Map the label to a stream + its prune policy. daily/weekly/monthly keep the newest KEEP_COUNT dumps
# (count-based); premigrate keeps by age (KEEP_DAYS). Unknown labels are rejected (a typo guard so a
# fat-fingered cron can't silently spray dumps into a new, never-pruned stream).
KEEP_COUNT=""; KEEP_DAYS=""
case "$LABEL" in
  "")          STREAM="daily";      KEEP_COUNT="$DAILY_KEEP" ;;
  weekly)      STREAM="weekly";     KEEP_COUNT="$WEEKLY_KEEP" ;;
  monthly)     STREAM="monthly";    KEEP_COUNT="$MONTHLY_KEEP" ;;
  premigrate*) STREAM="premigrate"; KEEP_DAYS="$PREMIGRATE_RETENTION_DAYS" ;;
  *)           die "unknown --label '$LABEL' (use weekly | monthly | premigrate)" ;;
esac

# Validate the retention value actually selected for this run — BEFORE the dump/upload/prune. if/then
# (not `[[ ]] && cmd`) so a false test can't trip `set -e` on the premigrate path (where KEEP_COUNT="").
if [[ -n "$KEEP_COUNT" ]]; then positive_int "keep-count for '$STREAM'" "$KEEP_COUNT"; fi
if [[ -n "$KEEP_DAYS"  ]]; then positive_int "retention-days for '$STREAM'" "$KEEP_DAYS"; fi

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

# Prune this stream. Best-effort — a prune failure must never fail the backup itself (already uploaded).
STREAM_DIR="${BACKUP_RCLONE_REMOTE%/}/${STREAM}/"
if [[ -n "$KEEP_COUNT" ]]; then
  # Count-based: keep the newest KEEP_COUNT dumps, delete the rest. The filename embeds a sortable UTC
  # timestamp, so a lexical sort is chronological; the oldest (REMOVE) entries are pruned. Robust to a
  # missed run (unlike age windows): N runs -> N kept, regardless of gaps.
  mapfile -t FILES < <(rclone lsf "$STREAM_DIR" --include "${DB_NAME}-*.dump.age" 2>/dev/null | sort || true)
  REMOVE=$(( ${#FILES[@]} - KEEP_COUNT ))
  if (( REMOVE > 0 )); then
    for (( i = 0; i < REMOVE; i++ )); do
      rclone deletefile "${STREAM_DIR}${FILES[i]}" \
        && echo "backup-db: pruned ${STREAM}/${FILES[i]}" \
        || echo "backup-db: WARN could not prune ${FILES[i]} (backup itself succeeded)" >&2
    done
  else
    echo "backup-db: ${STREAM}/ holds ${#FILES[@]} dump(s) (keep ${KEEP_COUNT}) — nothing to prune"
  fi
else
  # Age-based (premigrate): keep dumps younger than KEEP_DAYS.
  rclone delete "$STREAM_DIR" --min-age "${KEEP_DAYS}d" --include "${DB_NAME}-*.dump.age" \
    && echo "backup-db: pruned ${STREAM}/ older than ${KEEP_DAYS}d" \
    || echo "backup-db: WARN prune step failed (backup itself succeeded)" >&2
fi

# Dead-man's-switch ping — ONLY the nightly `daily` run pings. HEALTHCHECK_BACKUP_URL is a single
# "did last night's backup run?" check tuned to a ~1-day period; if weekly/monthly/premigrate also
# pinged it, a successful weekly could reset the switch and MASK a failed daily. Give the retention
# streams their own checks if you want granular monitoring of them. Best-effort.
if [[ "$STREAM" == "daily" && -n "${HEALTHCHECK_BACKUP_URL:-}" ]]; then
  curl -fsS -m 15 --retry 3 "$HEALTHCHECK_BACKUP_URL" >/dev/null 2>&1 \
    && echo "backup-db: pinged heartbeat" \
    || echo "backup-db: WARN heartbeat ping failed" >&2
fi

echo "backup-db: OK"
