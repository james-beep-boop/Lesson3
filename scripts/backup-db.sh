#!/usr/bin/env bash
#
# Encrypted Postgres backup for Lesson3 (SPEC §11 / readiness #9).
#
#   pg_dump (in the postgres container)  ->  age -r <recipient>  ->  rclone copy to remote/local storage
#
# DESIGN
#   - pg_dump runs INSIDE the postgres container (`docker compose exec postgres`), because Postgres is
#     internal-only (no host port) and pg_dump is absent on the host. Custom format (`-Fc`): compact +
#     supports selective `pg_restore`.
#   - Encrypted on the Rock with `age` to a RECIPIENT public key. The matching private identity is held
#     by the operator OFF the box, so a Rock compromise cannot decrypt past backups. The dump is opaque
#     to Google before it ever leaves the host.
#   - Uploaded with `rclone` to either a configured remote (today Google Drive) or an absolute path on
#     a removable drive, one stream per label (grandfather-father-son):
#       daily/       nightly backups       (keep newest BACKUP_DAILY_KEEP,   default 7)
#       weekly/      weekly  backups       (keep newest BACKUP_WEEKLY_KEEP,  default 4)
#       monthly/     monthly backups       (keep newest BACKUP_MONTHLY_KEEP, default 12)
#       premigrate/  pre-deploy snapshots  (pruned after BACKUP_PREMIGRATE_RETENTION_DAYS, default 90)
#     daily/weekly/monthly prune by COUNT (keep newest N — exact, and robust to a missed run);
#     premigrate prunes by AGE (irregular per-deploy cadence). Cron schedules the three — see docs/OPS.md.
#   - A local path MUST resolve onto a separately backed mounted filesystem and already contain a
#     regular, non-symlink `.lesson3-backup-volume`. The script keeps the destination directory open
#     and checks the mount identity around upload, so an absent or changed USB drive cannot fill the
#     boot disk.
#   - After upload, atomically writes `out/backup-status.json`. The app mounts `out/` read-only and
#     reports that durable success evidence in Manage → System; failed uploads never advance it.
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
#   BACKUP_RCLONE_REMOTE             e.g. drive:lesson3-backups OR /media/lesson3-backups (required)
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
BACKUP_STATUS_FILE="$REPO_DIR/out/backup-status.json"

LABEL=""
[[ "${1:-}" == "--label" && -n "${2:-}" ]] && LABEL="$2"

die() { echo "backup-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH ($PATH) — see docs/OPS.md setup"; }
# Reject a retention typo (0 / negative / non-numeric). A bad value would otherwise mean "delete the
# WHOLE stream" (count-prune: REMOVE = total - 0) or crash `$(( ))` AFTER the dump is already uploaded.
positive_int() { [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "$1 must be a positive integer (got '$2')"; }

# Bash strings cannot contain NUL. Reject every other JSON control character that we do not explicitly
# escape below, before pg_dump starts; an operator typo must not upload a backup and then fail while
# recording its success.
reject_unsupported_json_controls() {
  local value="$1" i control
  for ((i = 1; i <= 31; i++)); do
    case "$i" in 9|10|13) continue ;; esac
    printf -v control "\\$(printf '%03o' "$i")"
    [[ "$value" != *"$control"* ]] \
      || die "BACKUP_RCLONE_REMOTE contains an unsupported control character"
  done
}

# rclone treats `remote:path` as a configured backend and a plain path as the local backend. Local
# destinations are intentionally stricter: relative paths are ambiguous under cron. A separately
# backed mount, its stable identity and a sentinel on that volume together prove writes are not falling
# through to the server's root disk. FD 9 keeps an ordinary unmount from succeeding while the script
# is running.
LOCAL_MOUNT_INFO=""
validate_destination() {
  [[ "$BACKUP_RCLONE_REMOTE" != /* && "$BACKUP_RCLONE_REMOTE" == *:* ]] && return 0
  [[ "$BACKUP_RCLONE_REMOTE" == /* ]] \
    || die "local BACKUP_RCLONE_REMOTE must be an absolute path (got '$BACKUP_RCLONE_REMOTE')"
  local sentinel="${BACKUP_RCLONE_REMOTE%/}/.lesson3-backup-volume"
  [[ -f "$sentinel" && ! -L "$sentinel" ]] \
    || die "local backup destination is not identified — expected a regular, non-symlink sentinel at $sentinel"
  need findmnt
  local mount_target root_device destination_device
  mount_target="$(findmnt -T "$BACKUP_RCLONE_REMOTE" -n -o TARGET)" \
    || die "cannot resolve the filesystem mounted at $BACKUP_RCLONE_REMOTE"
  [[ -n "$mount_target" && "$mount_target" != "/" ]] \
    || die "local backup destination is on the root filesystem, not a mounted removable volume"
  LOCAL_MOUNT_INFO="$(findmnt -T "$BACKUP_RCLONE_REMOTE" -n -o TARGET,SOURCE,FSTYPE,MAJ:MIN)" \
    || die "cannot identify the filesystem mounted at $BACKUP_RCLONE_REMOTE"
  [[ -n "$LOCAL_MOUNT_INFO" ]] || die "empty mount identity for $BACKUP_RCLONE_REMOTE"
  destination_device="${LOCAL_MOUNT_INFO##* }"
  root_device="$(findmnt -T / -n -o MAJ:MIN)" || die "cannot identify the root filesystem"
  [[ -n "$root_device" && "$destination_device" != "$root_device" ]] \
    || die "local backup destination is backed by the root filesystem, not a separate volume"
  exec 9<"$BACKUP_RCLONE_REMOTE" \
    || die "cannot hold the local backup destination open during backup"
}

verify_local_mount_unchanged() {
  [[ -z "$LOCAL_MOUNT_INFO" ]] && return 0
  local current
  current="$(findmnt -T "$BACKUP_RCLONE_REMOTE" -n -o TARGET,SOURCE,FSTYPE,MAJ:MIN)" \
    || die "local backup destination disappeared before upload completed"
  [[ "$current" == "$LOCAL_MOUNT_INFO" ]] \
    || die "local backup destination's mounted filesystem changed during backup"
}

json_escape() {
  local value="$1"
  reject_unsupported_json_controls "$value"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

# The upload is the success boundary. This record is replaced atomically afterwards, so a reader sees
# either the previous complete success or the new one — never a half-written JSON document.
write_backup_status() {
  local completed_at="$1" status_dir
  status_dir="$(dirname "$BACKUP_STATUS_FILE")"
  mkdir -p "$status_dir"
  STATUS_TMP="$(mktemp "$status_dir/.backup-status.XXXXXX")"
  printf '{\n  "version": 1,\n  "completedAt": "%s",\n  "stream": "%s",\n  "destination": "%s",\n  "filename": "%s",\n  "encryptedBytes": %s\n}\n' \
    "$(json_escape "$completed_at")" \
    "$(json_escape "$STREAM")" \
    "$(json_escape "$BACKUP_RCLONE_REMOTE")" \
    "$(json_escape "$NAME")" \
    "$SIZE" >"$STATUS_TMP"
  chmod 0644 "$STATUS_TMP"
  mv -f "$STATUS_TMP" "$BACKUP_STATUS_FILE"
  STATUS_TMP=""
  echo "backup-db: recorded success in $BACKUP_STATUS_FILE"
}

need docker; need age; need rclone
[[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] || die "BACKUP_AGE_RECIPIENT is not set"
[[ -n "${BACKUP_RCLONE_REMOTE:-}" ]] || die "BACKUP_RCLONE_REMOTE is not set"
reject_unsupported_json_controls "$BACKUP_RCLONE_REMOTE"
validate_destination

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
TMP="$(mktemp -d)"; STATUS_TMP=""
trap 'rm -rf "$TMP"; [[ -z "$STATUS_TMP" ]] || rm -f "$STATUS_TMP"' EXIT
LOCAL="$TMP/$NAME"

echo "backup-db: dumping '$DB_NAME' -> encrypt -> $DEST"

# pg_dump in the container (custom format), encrypt on the host. `set -o pipefail` makes a pg_dump
# failure fail the whole pipe rather than uploading a truncated/empty file.
docker compose exec -T postgres pg_dump -U "$DB_USER" -Fc "$DB_NAME" \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$LOCAL"

SIZE="$(wc -c < "$LOCAL" | tr -d '[:space:]')"
[[ "$SIZE" -gt 0 ]] || die "encrypted dump is empty — aborting (nothing uploaded)"
echo "backup-db: encrypted size ${SIZE} bytes"

verify_local_mount_unchanged
rclone copyto "$LOCAL" "$DEST" --no-traverse
verify_local_mount_unchanged
echo "backup-db: uploaded $DEST"
write_backup_status "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

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
