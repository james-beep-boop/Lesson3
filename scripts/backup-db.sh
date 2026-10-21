#!/usr/bin/env bash
#
# Encrypted Postgres backup for Lesson3 (SPEC §11 / readiness #9).
#
#   pg_dump (in the postgres container)  ->  age -r <recipient…>  ->  rclone copy to remote/local storage
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
#   - A local path MUST resolve onto a mount backed by a different device from `/` and contain a
#     regular, non-symlink `.lesson3-backup-volume`. The script keeps the destination directory open
#     and checks the mount identity around upload, so an absent or changed USB drive cannot fill the
#     boot disk.
#   - Records every run in ONE FILE PER STREAM, `out/ops/backup/<stream>.json` (version 2, design A2,
#     `docs/DESIGN-backup-recovery-2026-10-21.md`): the last success (with `coversUntil`, the moment
#     `pg_dump` began, so the moment whose data the backup holds), the last failure (time, stage, one
#     line of reason, written by an exit trap), and the last 31 `coversUntil` values. Each file is
#     replaced atomically, so no run rewrites another stream's record. The app mounts `out/ops`
#     read-only and reports these on Manage → System → Backups. A failed run never advances a success.
#   - Holds an `flock` for the whole run, so two backups never run at once; the second waits.
#     `out/ops/backup-status.json` (version 1) is no longer written; the app reads it only until the
#     first per-stream record exists.
#   - On success, optionally pings HEALTHCHECK_BACKUP_URL (the monitoring dead-man's-switch).
#
# USAGE
#   scripts/backup-db.sh                       # nightly backup   -> daily/
#   scripts/backup-db.sh --label weekly        # weekly snapshot  -> weekly/   (cron: Sundays)
#   scripts/backup-db.sh --label monthly       # monthly snapshot -> monthly/  (cron: 1st of month)
#   scripts/backup-db.sh --label premigrate    # pre-deploy snap  -> premigrate/ (used by deploy.sh)
#
# CONFIG (from the repo .env, or the environment; see docs/OPS.md):
#   BACKUP_AGE_RECIPIENT             age1...  (required) ARES's public recipient key
#   BACKUP_AGE_RECIPIENT_SCHOOL      age1...  (optional) the SCHOOL's own public recipient key
#   BACKUP_RCLONE_REMOTE             e.g. drive:lesson3-backups OR /media/lesson3-backups (required)
#   BACKUP_DAILY_KEEP                default 7    (newest N kept in daily/)
#   BACKUP_WEEKLY_KEEP               default 4    (newest N kept in weekly/)
#   BACKUP_MONTHLY_KEEP              default 12   (newest N kept in monthly/)
#   BACKUP_PREMIGRATE_RETENTION_DAYS default 90   (premigrate/ pruned by age, in days)
#   HEALTHCHECK_BACKUP_URL           optional; curled on success
#   BACKUP_LOCK_WAIT_SECONDS         default 3600 (how long a run waits for another to finish)
#   BACKUP_DB_NAME / BACKUP_DB_USER  default lesson3 / lesson3
set -euo pipefail

# Shared PATH + repo-root cd + env_get (reads .env keys without sourcing it). See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_AGE_RECIPIENT="$(env_get BACKUP_AGE_RECIPIENT)"
BACKUP_AGE_RECIPIENT_SCHOOL="$(env_get BACKUP_AGE_RECIPIENT_SCHOOL)"
BACKUP_RCLONE_REMOTE="$(env_get BACKUP_RCLONE_REMOTE)"
HEALTHCHECK_BACKUP_URL="$(env_get HEALTHCHECK_BACKUP_URL)"
DB_NAME="$(env_get BACKUP_DB_NAME)";    DB_NAME="${DB_NAME:-lesson3}"
DB_USER="$(env_get BACKUP_DB_USER)";    DB_USER="${DB_USER:-lesson3}"
DAILY_KEEP="$(env_get BACKUP_DAILY_KEEP)";     DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="$(env_get BACKUP_WEEKLY_KEEP)";   WEEKLY_KEEP="${WEEKLY_KEEP:-4}"
MONTHLY_KEEP="$(env_get BACKUP_MONTHLY_KEEP)"; MONTHLY_KEEP="${MONTHLY_KEEP:-12}"
PREMIGRATE_RETENTION_DAYS="$(env_get BACKUP_PREMIGRATE_RETENTION_DAYS)"; PREMIGRATE_RETENTION_DAYS="${PREMIGRATE_RETENTION_DAYS:-90}"
BACKUP_RECORD_DIR="$REPO_DIR/out/ops/backup"
LOCK_WAIT="$(env_get BACKUP_LOCK_WAIT_SECONDS)"; LOCK_WAIT="${LOCK_WAIT:-3600}"

LABEL=""
[[ "${1:-}" == "--label" && -n "${2:-}" ]] && LABEL="$2"

# ⚑ A FAILURE IS RECORDED, NOT JUST PRINTED. Cron mails stderr to nobody on most servers, so a backup
# that fails every night looks, on the page, exactly like one that was never set up. `die` keeps the
# reason and the EXIT trap writes it to this stream's record with the stage it reached.
STREAM=""; STAGE="setup"; FAIL_REASON=""
die() { FAIL_REASON="$*"; echo "backup-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH ($PATH) — see docs/OPS.md setup"; }
# Reject a retention typo (0 / negative / non-numeric). A bad value would otherwise mean "delete the
# WHOLE stream" (count-prune: REMOVE = total - 0) or crash `$(( ))` AFTER the dump is already uploaded.
positive_int() { [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "$1 must be a positive integer (got '$2')"; }

# Bash strings cannot contain NUL. Reject every other JSON control character that we do not explicitly
# escape below, before pg_dump starts; an operator typo must not upload a backup and then fail while
# recording its success.
reject_unsupported_json_controls() {
  local value="$1" field="$2" i control
  for ((i = 1; i <= 31; i++)); do
    case "$i" in 9|10|13) continue ;; esac
    printf -v control '%b' "\\$(printf '%03o' "$i")"
    [[ "$value" != *"$control"* ]] \
      || die "$field contains an unsupported control character"
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
  local value="$1" field="$2"
  reject_unsupported_json_controls "$value" "$field"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

# ─── Per-stream records (version 2) ──────────────────────────────────────────────────────────────────
#
# One line per field group, so a run can carry the OTHER group forward verbatim (a success keeps the
# last failure and vice versa) without parsing or re-escaping JSON in bash: the copied line is exactly
# the text a previous run wrote. The reader compares times, so an old failure beside a newer success
# reads as "the last attempt succeeded".
RECORD_TMP=""
ISO_RE='[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z'

previous_group() { # key — the previous record's JSON value for that group, or null
  local file="$BACKUP_RECORD_DIR/$STREAM.json" line
  line="$(grep -m1 -E "^  \"$1\": (null|\{.*\}|\[.*\]),?\$" "$file" 2>/dev/null || true)"
  line="${line#  \"$1\": }"; line="${line%,}"
  printf '%s' "${line:-null}"
}

write_record() { # success|failure
  local now since history success failure tmp_dir
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  since="$(grep -m1 -oE "\"recordingSince\": \"$ISO_RE\"" "$BACKUP_RECORD_DIR/$STREAM.json" 2>/dev/null \
    | grep -oE "$ISO_RE" || true)"
  since="${since:-$now}"
  history="$(previous_group history | grep -oE "$ISO_RE" || true)"
  success="$(previous_group lastSuccess)"
  failure="$(previous_group lastFailure)"
  if [[ "$1" == success ]]; then
    history="$(printf '%s\n%s\n' "$history" "$COVERS_UNTIL" | { grep -E "^$ISO_RE\$" || true; } | tail -n 31)"
    success="$(printf '{"coversUntil": "%s", "completedAt": "%s", "filename": "%s", "encryptedBytes": %s, "destination": "%s"}' \
      "$COVERS_UNTIL" "$now" "$(json_escape "$NAME" "backup filename")" "$SIZE" \
      "$(json_escape "$BACKUP_RCLONE_REMOTE" "BACKUP_RCLONE_REMOTE")")"
  else
    failure="$(printf '{"at": "%s", "stage": "%s", "reason": "%s"}' "$now" "$STAGE" \
      "$(json_escape "$(printf '%s' "$2" | tr '\n\r\t' '   ' | cut -c1-300)" "failure reason")")"
  fi
  history="$(printf '%s\n' "$history" | { grep -E "^$ISO_RE\$" || true; } | sed 's/.*/"&"/' | paste -sd, - | sed 's/,/, /g')"
  tmp_dir="$BACKUP_RECORD_DIR"
  mkdir -p "$tmp_dir"
  RECORD_TMP="$(mktemp "$tmp_dir/.$STREAM.XXXXXX")"
  printf '{\n  "version": 2,\n  "stream": "%s",\n  "recordingSince": "%s",\n  "lastSuccess": %s,\n  "lastFailure": %s,\n  "history": [%s]\n}\n' \
    "$STREAM" "$since" "$success" "$failure" "$history" >"$RECORD_TMP"
  chmod 0644 "$RECORD_TMP"
  mv -f "$RECORD_TMP" "$BACKUP_RECORD_DIR/$STREAM.json"
  RECORD_TMP=""
}

# The EXIT trap: clean up, and if this run failed after its stream was known, say so in the record.
on_exit() {
  local status=$?
  [[ -z "${TMP:-}" ]] || rm -rf "$TMP"
  [[ -z "$RECORD_TMP" ]] || rm -f "$RECORD_TMP"
  # Not after `done`: the upload and its record already succeeded, and pruning is best-effort.
  # Not at `lock` either: a run that never got the lock must not write a record the holder may be
  # writing at that moment — its replace could undo the holder's success.
  if [[ "$status" -ne 0 && -n "$STREAM" && "$STAGE" != done && "$STAGE" != lock ]]; then
    write_record failure "${FAIL_REASON:-stopped with exit status $status during $STAGE}" 2>/dev/null \
      && echo "backup-db: recorded the failure in $BACKUP_RECORD_DIR/$STREAM.json" >&2 || true
  fi
  exit "$status"
}
trap on_exit EXIT

# Map the label to a stream + its prune policy. daily/weekly/monthly keep the newest KEEP_COUNT dumps
# (count-based); premigrate keeps by age (KEEP_DAYS). Unknown labels are rejected (a typo guard so a
# fat-fingered cron can't silently spray dumps into a new, never-pruned stream).
KEEP_COUNT=""; KEEP_DAYS=""
case "$LABEL" in
  "")          STREAM="daily";      KEEP_COUNT="$DAILY_KEEP" ;;
  weekly)      STREAM="weekly";     KEEP_COUNT="$WEEKLY_KEEP" ;;
  monthly)     STREAM="monthly";    KEEP_COUNT="$MONTHLY_KEEP" ;;
  premigrate*) STREAM="premigrate"; KEEP_DAYS="$PREMIGRATE_RETENTION_DAYS" ;;
  # ⚑ THE MESSAGE NAMES ALL FOUR FORMS, INCLUDING THE TWO IT USED TO OMIT. It read
  # "(use weekly | monthly | premigrate)", which is incomplete in both directions: it never said that
  # NO label means a daily, and it never said `premigrate` accepts a SUFFIX — which is how `deploy.sh`
  # itself stamps the SHA (`--label premigrate-$SHA`). Someone reading the old message could not tell
  # that `premigrate-two-recipient-check` was legal, and the operator lost a run to exactly that
  # (2026-08-22). An error that lists the valid inputs incorrectly is worse than one that lists none.
  *)           die "unknown --label '$LABEL'. Valid: no --label at all (daily), weekly, monthly, or premigrate with an optional suffix (e.g. premigrate-\$SHA)" ;;
esac

# Validate the retention value actually selected for this run — BEFORE the dump/upload/prune. if/then
# (not `[[ ]] && cmd`) so a false test can't trip `set -e` on the premigrate path (where KEEP_COUNT="").
if [[ -n "$KEEP_COUNT" ]]; then positive_int "keep-count for '$STREAM'" "$KEEP_COUNT"; fi
if [[ -n "$KEEP_DAYS"  ]]; then positive_int "retention-days for '$STREAM'" "$KEEP_DAYS"; fi

need docker; need age; need rclone; need flock
[[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] || die "BACKUP_AGE_RECIPIENT is not set"

# ⚑ ONE BACKUP AT A TIME, FOR THE WHOLE RUN. A weekly cron line and a deploy's premigrate snapshot can
# start together; two runs would race to prune the same remote and to replace records. The second waits
# (the kernel releases the lock if the first dies, so a crash cannot leave it held).
STAGE="lock"
positive_int "BACKUP_LOCK_WAIT_SECONDS" "$LOCK_WAIT"
mkdir -p "$BACKUP_RECORD_DIR"
exec 8>"$BACKUP_RECORD_DIR/.lock"
if ! flock -n 8; then
  echo "backup-db: another backup is running; waiting up to ${LOCK_WAIT}s for it to finish"
  flock -w "$LOCK_WAIT" 8 || die "another backup was still running after ${LOCK_WAIT}s"
fi
STAGE="setup"

# ⚑ TWO RECIPIENTS, SO AN OFFLINE SCHOOL CAN RECOVER WITHOUT ARES (operator decision 2026-08-22,
# SPEC §11). `age` encrypts to any number of recipients and EITHER identity decrypts independently, so
# adding the school's key costs one flag and no key sharing: ARES keeps its identity, the school keeps
# its own, and neither needs the other's.
#
# The gap this closes: with a single ARES recipient, a school with no internet could back up perfectly
# and still not restore — their server dies, they hold a USB drive of correct encrypted dumps, and the
# only thing that can read them is elsewhere. Recovery became a physical shipping problem during an
# outage. Verified on 2026-08-22 that the restore path itself works by bringing the ciphertext to the
# key; an offline school has no equivalent move, which is what made this worth changing.
#
# ⚑ FORWARD-ONLY, and deliberately so: existing backups stay decryptable by the ARES identity exactly as
# before. Only dumps written after this runs carry the second recipient, so there is no migration and no
# re-encryption of history.
AGE_RECIPIENT_ARGS=(-r "$BACKUP_AGE_RECIPIENT")
if [[ -n "${BACKUP_AGE_RECIPIENT_SCHOOL:-}" ]]; then
  # ⚑ REFUSE A DUPLICATE. Pasting the same key into both variables produces a backup that looks
  # two-recipient and grants nobody new the ability to decrypt — the independence is the entire point,
  # and a silent no-op here would be discovered during a recovery.
  [[ "$BACKUP_AGE_RECIPIENT_SCHOOL" != "$BACKUP_AGE_RECIPIENT" ]] \
    || die "BACKUP_AGE_RECIPIENT_SCHOOL is the same key as BACKUP_AGE_RECIPIENT — that grants no independent recovery"
  AGE_RECIPIENT_ARGS+=(-r "$BACKUP_AGE_RECIPIENT_SCHOOL")
fi
[[ -n "${BACKUP_RCLONE_REMOTE:-}" ]] || die "BACKUP_RCLONE_REMOTE is not set"
reject_unsupported_json_controls "$BACKUP_RCLONE_REMOTE" "BACKUP_RCLONE_REMOTE"
reject_unsupported_json_controls "$DB_NAME" "BACKUP_DB_NAME"
reject_unsupported_json_controls "$LABEL" "--label"
STAGE="destination"
validate_destination

TS="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${DB_NAME}-${TS}${LABEL:+-$LABEL}.dump.age"
DEST="${BACKUP_RCLONE_REMOTE%/}/${STREAM}/${NAME}"
TMP="$(mktemp -d)"
LOCAL="$TMP/$NAME"

echo "backup-db: dumping '$DB_NAME' -> encrypt -> $DEST"

# ⚑ `coversUntil` IS TAKEN HERE, BEFORE pg_dump STARTS. The dump is a consistent snapshot from (about)
# this moment, so this is the newest instant whose work the backup is guaranteed to hold. Freshness is
# judged by it, never by upload time: a slow or retried upload of an old dump is still old data.
COVERS_UNTIL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# pg_dump in the container (custom format), encrypt on the host. A pg_dump failure must fail the run
# rather than upload a truncated file; PIPESTATUS also says WHICH half failed, for the record.
STAGE="dump"
set +e
docker compose exec -T postgres pg_dump -U "$DB_USER" -Fc "$DB_NAME" \
  | age "${AGE_RECIPIENT_ARGS[@]}" -o "$LOCAL"
PIPE=("${PIPESTATUS[@]}")
set -e
[[ "${PIPE[0]}" -eq 0 ]] || die "pg_dump failed (exit ${PIPE[0]}) — nothing uploaded"
STAGE="encrypt"
[[ "${PIPE[1]}" -eq 0 ]] || die "age could not encrypt the dump (exit ${PIPE[1]}) — nothing uploaded"

SIZE="$(wc -c < "$LOCAL" | tr -d '[:space:]')"
STAGE="dump"
[[ "$SIZE" -gt 0 ]] || die "encrypted dump is empty — aborting (nothing uploaded)"
echo "backup-db: encrypted size ${SIZE} bytes"

STAGE="destination"
verify_local_mount_unchanged
STAGE="upload"
rclone copyto "$LOCAL" "$DEST" --no-traverse || die "upload to $DEST failed"
verify_local_mount_unchanged
echo "backup-db: uploaded $DEST"
STAGE="record"
write_record success
STAGE="done"
echo "backup-db: recorded success in $BACKUP_RECORD_DIR/$STREAM.json"

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
