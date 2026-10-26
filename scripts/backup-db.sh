#!/usr/bin/env bash
# One Postgres dump + age encryption, independently copied to the server disk and USB/cloud.
# Disk: BACKUP_DISK_DIR (default /var/lib/lesson3-backups; explicit empty disables it).
# USB/cloud: BACKUP_RCLONE_REMOTE (optional). At least one destination is required.
# Records: out/ops/backup/<disk|usb|remote>/<stream>.json (v2); old stream files are fallback evidence.
# Usage: no label = daily; --label weekly|monthly|premigrate[-suffix]. See docs/OPS.md.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Unlike ordinary options, an explicit empty destination disables it, including in the environment.
destination_setting() {
  local key="$1" fallback="$2"
  if [[ -v "$key" ]]; then printf '%s' "${!key}"
  elif [[ -f .env ]] && grep -qE "^${key}=" .env; then env_get "$key"
  else printf '%s' "$fallback"; fi
}
DISK_DIR="$(destination_setting BACKUP_DISK_DIR /var/lib/lesson3-backups)"
REMOTE="$(destination_setting BACKUP_RCLONE_REMOTE '')"
BACKUP_AGE_RECIPIENT="$(env_get BACKUP_AGE_RECIPIENT)"
BACKUP_AGE_RECIPIENT_SCHOOL="$(env_get BACKUP_AGE_RECIPIENT_SCHOOL)"
HEALTHCHECK_BACKUP_URL="$(env_get HEALTHCHECK_BACKUP_URL)"
DB_NAME="$(env_get BACKUP_DB_NAME)"; DB_NAME="${DB_NAME:-lesson3}"
DB_USER="$(env_get BACKUP_DB_USER)"; DB_USER="${DB_USER:-lesson3}"
BACKUP_RECORD_DIR="$REPO_DIR/out/ops/backup"
LOCK_WAIT="$(env_get BACKUP_LOCK_WAIT_SECONDS)"; LOCK_WAIT="${LOCK_WAIT:-3600}"
LABEL=""; [[ "${1:-}" != --label || -z "${2:-}" ]] || LABEL="$2"
STREAM=""; STAGE=setup; FAIL_REASON=""; LOCKED=0; RECORD_TMP=""; TMP=""
declare -A ROOTS DONE FDS MOUNTS
TARGETS=()
[[ -z "$DISK_DIR" ]] || { TARGETS+=(disk); ROOTS[disk]="$DISK_DIR"; }
if [[ -n "$REMOTE" ]]; then
  REMOTE_KIND=remote; [[ "$REMOTE" != /* && "$REMOTE" == *:* ]] || REMOTE_KIND=usb
  TARGETS+=("$REMOTE_KIND"); ROOTS[$REMOTE_KIND]="$REMOTE"
fi

die() { FAIL_REASON="$*"; echo "backup-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH — see docs/OPS.md setup"; }
positive_int() { [[ "$2" =~ ^[1-9][0-9]*$ ]] || die "$1 must be a positive integer (got '$2')"; }

reject_unsupported_json_controls() {
  local value="$1" field="$2" i control
  for ((i = 1; i <= 31; i++)); do
    case "$i" in 9|10|13) continue ;; esac
    printf -v control '%b' "\\$(printf '%03o' "$i")"
    [[ "$value" != *"$control"* ]] \
      || die "$field contains an unsupported control character"
  done
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


RECORD_TMP=""
ISO_RE='[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z'

previous_group() { # key — the previous record's JSON value for that group, or null
  local file="$SOURCE_RECORD" line
  line="$(grep -m1 -E "^  \"$1\": (null|\{.*\}|\[.*\]),?\$" "$file" 2>/dev/null || true)"
  line="${line#  \"$1\": }"; line="${line%,}"
  printf '%s' "${line:-null}"
}

write_record() { # success|failure|notConnected
  local now since history success failure disconnected tmp_dir seq
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # ⚑ ATTEMPT ORDER IS A NUMBER, NOT A TIME. Times are whole seconds, so a success and a failure can
  # share one, and the page must still know which came last (review 2026-10-21: a tie read as
  # "Succeeded" after a later failure). One counter for every stream, advanced only under the lock.
  seq="$(cat "$BACKUP_RECORD_DIR/.seq" 2>/dev/null || true)"
  [[ "$seq" =~ ^[0-9]{1,15}$ ]] || seq=0
  seq=$((seq + 1))
  printf '%s\n' "$seq" >"$BACKUP_RECORD_DIR/.seq.tmp" && mv -f "$BACKUP_RECORD_DIR/.seq.tmp" "$BACKUP_RECORD_DIR/.seq"
  since="$(grep -m1 -oE "\"recordingSince\": \"$ISO_RE\"" "$SOURCE_RECORD" 2>/dev/null \
    | grep -oE "$ISO_RE" || true)"
  since="${since:-$now}"
  history="$(previous_group history | grep -oE "$ISO_RE" || true)"
  success="$(previous_group lastSuccess)"
  failure="$(previous_group lastFailure)"
  disconnected="$(previous_group lastNotConnected)"
  if [[ "$1" == success ]]; then
    history="$(printf '%s\n%s\n' "$history" "$COVERS_UNTIL" | { grep -E "^$ISO_RE\$" || true; } | tail -n 31)"
    success="$(printf '{"seq": %s, "coversUntil": "%s", "completedAt": "%s", "filename": "%s", "encryptedBytes": %s, "destination": "%s"}' \
      "$seq" "$COVERS_UNTIL" "$now" "$(json_escape "$NAME" "backup filename")" "$SIZE" \
      "$(json_escape "$DEST_ROOT" "backup destination")")"
  elif [[ "$1" == notConnected ]]; then
    disconnected="$(printf '{"seq": %s, "at": "%s", "reason": "The backup drive is not connected."}' "$seq" "$now")"
  else
    failure="$(printf '{"seq": %s, "at": "%s", "stage": "%s", "reason": "%s"}' "$seq" "$now" "$STAGE" \
      "$(json_escape "$(printf '%s' "$2" | tr '\n\r\t' '   ' | cut -c1-300)" "failure reason")")"
  fi
  history="$(printf '%s\n' "$history" | { grep -E "^$ISO_RE\$" || true; } | sed 's/.*/"&"/' | paste -sd, - | sed 's/,/, /g')"
  tmp_dir="${RECORD_FILE%/*}"
  mkdir -p "$tmp_dir"
  chmod 0755 "$tmp_dir"
  RECORD_TMP="$(mktemp "$tmp_dir/.$STREAM.XXXXXX")"
  printf '{\n  "version": 2,\n  "stream": "%s",\n  "recordingSince": "%s",\n  "lastSuccess": %s,\n  "lastFailure": %s,\n  "lastNotConnected": %s,\n  "history": [%s]\n}\n' \
    "$STREAM" "$since" "$success" "$failure" "$disconnected" "$history" >"$RECORD_TMP"
  chmod 0644 "$RECORD_TMP"
  mv -f "$RECORD_TMP" "$RECORD_FILE"
  RECORD_TMP=""
}


select_destination() {
  KIND="$1"; DEST_ROOT="${ROOTS[$KIND]}"
  RECORD_FILE="$BACKUP_RECORD_DIR/$KIND/$STREAM.json"
  SOURCE_RECORD="$RECORD_FILE"
  # Only the external destination inherits pre-3a evidence, never the disk destination.
  if [[ "$KIND" != disk && ! -e "$RECORD_FILE" ]]; then SOURCE_RECORD="$BACKUP_RECORD_DIR/$STREAM.json"; fi
}

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 && "$LOCKED" -eq 1 && -n "$STREAM" ]]; then
    for target in "${TARGETS[@]}"; do
      [[ "${DONE[$target]:-0}" == 1 ]] && continue
      select_destination "$target"
      write_record failure "${FAIL_REASON:-stopped during $STAGE (exit $status)}" 2>/dev/null || true
    done
  fi
  [[ -z "$RECORD_TMP" ]] || rm -f "$RECORD_TMP"
  [[ -z "$TMP" ]] || rm -rf "$TMP"
}
trap cleanup EXIT

# A destination worker owns only its own record. Its error never prevents the other worker running.
destination_exit() {
  local status=$?
  if [[ "$status" -ne 0 && "$STAGE" != done ]]; then
    write_record failure "${FAIL_REASON:-stopped during $STAGE (exit $status)}" 2>/dev/null || true
  fi
  [[ -z "$RECORD_TMP" ]] || rm -f "$RECORD_TMP"
}

case "$LABEL" in
  '') STREAM=daily ;;
  weekly|monthly) STREAM="$LABEL" ;;
  premigrate*) STREAM=premigrate ;;
  *) die "unknown --label '$LABEL'. Valid: no --label at all (daily), weekly, monthly, or premigrate with an optional suffix (e.g. premigrate-\$SHA)" ;;
esac
need flock
positive_int BACKUP_LOCK_WAIT_SECONDS "$LOCK_WAIT"
mkdir -p "$BACKUP_RECORD_DIR"
# Only operational records are public to the read-only app mount, never backup archives.
chmod 0755 "$REPO_DIR/out/ops" "$BACKUP_RECORD_DIR"
exec 8>"$BACKUP_RECORD_DIR/.lock"
STAGE=lock
if ! flock -n 8; then
  echo "backup-db: another backup is running; waiting up to ${LOCK_WAIT}s for it to finish"
  flock -w "$LOCK_WAIT" 8 || die "another backup was still running after ${LOCK_WAIT}s"
fi
LOCKED=1; STAGE=setup
[[ "${#TARGETS[@]}" -gt 0 ]] || die 'set BACKUP_DISK_DIR and/or BACKUP_RCLONE_REMOTE'
for target in "${TARGETS[@]}"; do reject_unsupported_json_controls "${ROOTS[$target]}" 'backup destination'; done
reject_unsupported_json_controls "$DB_NAME" BACKUP_DB_NAME
reject_unsupported_json_controls "$LABEL" --label
for tool in docker age rclone cmp; do need "$tool"; done
[[ -n "$BACKUP_AGE_RECIPIENT" ]] || die 'BACKUP_AGE_RECIPIENT is not set'
AGE_RECIPIENT_ARGS=(-r "$BACKUP_AGE_RECIPIENT")
if [[ -n "$BACKUP_AGE_RECIPIENT_SCHOOL" ]]; then
  [[ "$BACKUP_AGE_RECIPIENT_SCHOOL" != "$BACKUP_AGE_RECIPIENT" ]] || die 'BACKUP_AGE_RECIPIENT_SCHOOL is the same key as BACKUP_AGE_RECIPIENT — that grants no independent recovery'
  AGE_RECIPIENT_ARGS+=(-r "$BACKUP_AGE_RECIPIENT_SCHOOL")
fi
TMP="$(mktemp -d)"
# Never invent an identity or infer it from a folder name. A failed read permits no destination write.
INSTALLATION_ID="$(docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT installation_id FROM system_settings LIMIT 1;')" \
  || die 'cannot read this installation ID from the database'
[[ "$INSTALLATION_ID" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]] \
  || die 'the database has no valid installation ID; not writing backups'
mkdir "$TMP/marker"
printf '%s\n' "$INSTALLATION_ID" >"$TMP/marker/.lesson3-installation"

retention() {
  KEEP_COUNT=''; KEEP_DAYS=''
  if [[ "$STREAM" == premigrate ]]; then
    KEEP_DAYS="$(env_get BACKUP_PREMIGRATE_RETENTION_DAYS)"; KEEP_DAYS="${KEEP_DAYS:-90}"
    positive_int 'retention-days for premigrate' "$KEEP_DAYS"
  else
    local key="BACKUP_${STREAM^^}_KEEP" fallback
    case "$STREAM" in daily) fallback=7 ;; weekly) fallback=4 ;; monthly) fallback=12 ;; esac
    if [[ "$KIND" == disk ]]; then
      key="BACKUP_DISK_${STREAM^^}_KEEP"
      [[ "$STREAM" != monthly ]] || fallback=3
    fi
    KEEP_COUNT="$(env_get "$key")"; KEEP_COUNT="${KEEP_COUNT:-$fallback}"
    positive_int "keep-count for '$STREAM' ($key)" "$KEEP_COUNT"
  fi
}

not_connected() {
  echo 'backup-db: USB backup drive is not connected'
  write_record notConnected
  STAGE=done
  exit 10
}

# Linux's open directory fd anchors local writes, even if a mount is lazily removed during a copy.
open_local() {
  [[ "$DEST_ROOT" == /* ]] || die 'local backup destination must be an absolute path'
  [[ ! -L "$DEST_ROOT" ]] || die 'local backup destination must not be a symlink'
  if [[ "$KIND" == disk ]]; then
    (umask 077; mkdir -p "$DEST_ROOT") || die 'cannot create the disk backup directory'
    MOUNT_INFO=''
  else
    [[ -d "$DEST_ROOT" ]] || not_connected
    [[ ! -L "$DEST_ROOT/.lesson3-backup-volume" ]] || die 'USB sentinel must not be a symlink'
    need findmnt
    local mount_target root_device
    mount_target="$(findmnt -T "$DEST_ROOT" -n -o TARGET)" || not_connected
    if [[ -z "$mount_target" || "$mount_target" == / ]]; then
      [[ ! -e "$DEST_ROOT/.lesson3-backup-volume" ]] || die 'USB destination is on the root filesystem'
      not_connected
    fi
    [[ -f "$DEST_ROOT/.lesson3-backup-volume" ]] || die 'USB destination needs a regular .lesson3-backup-volume sentinel'
    MOUNT_INFO="$(findmnt -T "$DEST_ROOT" -n -o TARGET,SOURCE,FSTYPE,MAJ:MIN)" || die 'cannot identify the USB filesystem'
    root_device="$(findmnt -T / -n -o MAJ:MIN)" || die 'cannot identify the root filesystem'
    [[ -n "$MOUNT_INFO" && -n "$root_device" && "${MOUNT_INFO##* }" != "$root_device" ]] || die 'USB destination is backed by the root filesystem'
  fi
  exec 9<"$DEST_ROOT" || die 'cannot hold the backup directory open'
  WRITE_ROOT=/proc/self/fd/9
}

verify_mount() {
  [[ "$KIND" == usb ]] || return 0
  local current
  current="$(findmnt -T "$DEST_ROOT" -n -o TARGET,SOURCE,FSTYPE,MAJ:MIN)" || die 'backup filesystem disappeared'
  [[ "$current" == "$MOUNT_INFO" ]] || die "local backup destination's mounted filesystem changed during backup"
}

check_marker() {
  local marker="$WRITE_ROOT/.lesson3-installation" stored
  if [[ "$KIND" == remote ]]; then
    rclone cat "$marker" --count 38 >"$TMP/read-marker-$KIND" || die 'cannot read the destination installation marker'
    marker="$TMP/read-marker-$KIND"
  else
    [[ -f "$marker" && ! -L "$marker" ]] || die 'installation marker must be a regular, non-symlink file'
  fi
  if ! cmp -s "$TMP/marker/.lesson3-installation" "$marker"; then
    stored="$(head -c 80 "$marker")"
    [[ "$stored" =~ ^[[:xdigit:]-]{36}$ ]] || stored='unreadable marker'
    die "This backup destination belongs to another installation ($stored). Not writing to or pruning it."
  fi
}

claim_marker() {
  local marker="$WRITE_ROOT/.lesson3-installation" listing temporary
  if [[ "$KIND" == remote ]]; then
    rclone mkdir "$WRITE_ROOT" || die 'cannot open the remote backup destination'
    listing="$(rclone lsf "$WRITE_ROOT" --max-depth 1 --files-only --include '/.lesson3-installation')" || die 'cannot list the destination installation marker'
    if [[ -z "$listing" ]]; then
      # Directory copy, not copyto: copyto bypasses --immutable in the installed rclone.
      rclone copy "$TMP/marker" "$WRITE_ROOT" --include '/.lesson3-installation' --immutable --checksum \
        || die 'cannot claim the remote backup destination'
    fi
  elif [[ ! -e "$marker" && ! -L "$marker" ]]; then
    temporary="$(mktemp "$WRITE_ROOT/.lesson3-installation.XXXXXX")" || die 'cannot prepare the installation marker'
    if ! cp "$TMP/marker/.lesson3-installation" "$temporary"; then rm -f "$temporary"; die 'cannot write the installation marker'; fi
    # A hard link publishes a complete marker without ever replacing another writer's claim.
    ln "$temporary" "$marker" 2>/dev/null || true
    rm -f "$temporary"
  fi
  check_marker
}

check_space() {
  [[ "$KIND" == disk ]] || return 0
  local available margin
  margin="$(env_get BACKUP_DISK_MIN_FREE_BYTES)"; margin="${margin:-268435456}"
  positive_int BACKUP_DISK_MIN_FREE_BYTES "$margin"
  available="$(df -Pk "$WRITE_ROOT" | awk 'NR==2 {print $4}')" || die 'cannot read free disk space'
  [[ "$available" =~ ^[0-9]+$ ]] || die 'cannot read free disk space'
  STAGE=space
  (( available * 1024 >= ${SIZE:-0} + margin )) || die 'disk nearly full — not writing this backup'
  STAGE=destination
}

prepare_destination() (
  select_destination "$1"; STAGE=setup; FAIL_REASON=''; trap destination_exit EXIT
  retention
  STAGE=destination
  WRITE_ROOT="$DEST_ROOT"; MOUNT_INFO=''
  [[ "$KIND" == remote ]] || open_local
  check_space
  claim_marker
  verify_mount
  printf '%s' "$MOUNT_INFO" >"$TMP/mount-$KIND"
  STAGE=done
)

READY=(); ANY_ERROR=0
for target in "${TARGETS[@]}"; do
  set +e
  (set -e; prepare_destination "$target")
  result=$?
  set -e
  if [[ "$result" -eq 0 ]]; then
    if [[ "$target" != remote ]]; then
      if ! exec {destination_fd}<"${ROOTS[$target]}"; then
        select_destination "$target"; STAGE=destination
        write_record failure 'cannot hold the backup directory open'; DONE[$target]=1; ANY_ERROR=1; continue
      fi
      FDS[$target]="$destination_fd"
    fi
    MOUNTS[$target]="$(cat "$TMP/mount-$target")"
    READY+=("$target")
  else
    DONE[$target]=1
    [[ "$result" -eq 10 ]] || ANY_ERROR=1
  fi
done
if [[ "${#READY[@]}" -eq 0 ]]; then
  [[ "$ANY_ERROR" -ne 0 ]] || echo 'backup-db: no connected destination; no backup written'
  exit "$ANY_ERROR"
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${DB_NAME}-${TS}${LABEL:+-$LABEL}.dump.age"
LOCAL="$TMP/$NAME"
COVERS_UNTIL="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Bound the encrypted staging file too: the destination check alone cannot protect /tmp's disk.
# Bash's file-size limit is inherited by age and stops it before it consumes the free-space reserve.
STAGE=encrypt
TEMP_AVAILABLE="$(df -Pk "$TMP" | awk 'NR==2 {print $4}')"
[[ "$TEMP_AVAILABLE" =~ ^[0-9]+$ ]] || die 'cannot read staging disk space'
TEMP_RESERVE_KIB=262144
(( TEMP_AVAILABLE > TEMP_RESERVE_KIB )) || die 'disk nearly full — no room to stage an encrypted backup'
TEMP_LIMIT_KIB=$((TEMP_AVAILABLE - TEMP_RESERVE_KIB))
STAGE=dump
set +e
docker compose exec -T postgres pg_dump -U "$DB_USER" -Fc "$DB_NAME" | (ulimit -f "$TEMP_LIMIT_KIB" && exec age "${AGE_RECIPIENT_ARGS[@]}" -o "$LOCAL")
PIPE=("${PIPESTATUS[@]}")
set -e
[[ "${PIPE[0]}" -eq 0 ]] || die "pg_dump failed (exit ${PIPE[0]}) — nothing uploaded"
STAGE=encrypt
[[ "${PIPE[1]}" -eq 0 ]] || die "age could not encrypt the dump (exit ${PIPE[1]}) — nothing uploaded"
SIZE="$(wc -c <"$LOCAL" | tr -d '[:space:]')"
[[ "$SIZE" -gt 0 ]] || die 'encrypted dump is empty — nothing uploaded'

verify_destination() { verify_mount; check_marker; }
copy_destination() (
  select_destination "$1"; STAGE=destination; FAIL_REASON=''; trap destination_exit EXIT
  umask 077
  WRITE_ROOT="$DEST_ROOT"; MOUNT_INFO="${MOUNTS[$KIND]}"
  [[ "$KIND" == remote ]] || WRITE_ROOT="/proc/self/fd/${FDS[$KIND]}"
  retention
  verify_destination
  check_space
  STAGE=upload
  rclone copyto "$LOCAL" "${WRITE_ROOT%/}/$STREAM/$NAME" --no-traverse || die 'backup copy failed'
  verify_destination
  echo "backup-db: uploaded ${DEST_ROOT%/}/$STREAM/$NAME"
  STAGE=record
  write_record success
  STAGE=done
  echo "backup-db: recorded success in $RECORD_FILE"
  # Pruning is best effort only after a durable success, and never on an unverified destination.
  STAGE=destination
  verify_destination
  local stream_dir="${WRITE_ROOT%/}/$STREAM/" remove i
  if [[ -n "$KEEP_COUNT" ]]; then
    mapfile -t files < <(rclone lsf "$stream_dir" --include "${DB_NAME}-*.dump.age" 2>/dev/null | sort || true)
    remove=$(( ${#files[@]} - KEEP_COUNT ))
    for ((i=0; i<remove; i++)); do
      verify_destination
      rclone deletefile "${stream_dir}${files[i]}" || echo 'backup-db: WARN could not prune an old backup' >&2
    done
  else
    rclone delete "$stream_dir" --min-age "${KEEP_DAYS}d" --include "${DB_NAME}-*.dump.age" || echo 'backup-db: WARN prune step failed' >&2
  fi
  STAGE=done
)
SUCCESS_COUNT=0
for target in "${READY[@]}"; do
  set +e
  (set -e; copy_destination "$target")
  result=$?
  set -e
  DONE[$target]=1
  if [[ "$result" -eq 0 ]]; then SUCCESS_COUNT=$((SUCCESS_COUNT+1)); else ANY_ERROR=1; fi
done
# An absent USB never turns a disk success into a failure; actual errors remain visible to automation.
if [[ "$ANY_ERROR" -eq 0 && "$SUCCESS_COUNT" -gt 0 && "$STREAM" == daily && -n "$HEALTHCHECK_BACKUP_URL" ]]; then
  curl -fsS -m 15 --retry 3 "$HEALTHCHECK_BACKUP_URL" >/dev/null 2>&1 || echo 'backup-db: WARN heartbeat ping failed' >&2
fi
[[ "$ANY_ERROR" -ne 0 ]] || echo 'backup-db: OK'
exit "$ANY_ERROR"
