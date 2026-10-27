#!/usr/bin/env bash
# One Postgres dump + age encryption, independently copied to the server disk and USB/cloud.
# Disk: BACKUP_DISK_DIR (default /var/lib/lesson3-backups; explicit empty disables it).
# USB/cloud: BACKUP_RCLONE_REMOTE (optional). At least one destination is required.
# Records: out/ops/backup/<disk|usb|remote>/<stream>.json (v2); pre-3a files are moved there once.
# Usage: no label = daily; --label weekly|monthly|premigrate[-suffix]. See docs/OPS.md.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

source "$(dirname "${BASH_SOURCE[0]}")/lib/backup-common.sh"
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
  REMOTE_KIND="$(external_kind "$REMOTE")"
  TARGETS+=("$REMOTE_KIND"); ROOTS[$REMOTE_KIND]="$REMOTE"
fi

die() { FAIL_REASON="$*"; echo "backup-db: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH — see docs/OPS.md setup"; }

ISO_RE='[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z'

previous_group() { # key — the previous record's JSON value for that group, or null
  local file="$RECORD_FILE" line
  line="$(grep -m1 -E "^  \"$1\": (null|\{.*\}|\[.*\]),?\$" "$file" 2>/dev/null || true)"
  line="${line#  \"$1\": }"; line="${line%,}"
  printf '%s' "${line:-null}"
}

write_record() { # success|failure|notConnected
  local now since history success attempt tmp_dir seq
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # ⚑ ATTEMPT ORDER IS A NUMBER, NOT A TIME. Times are whole seconds, so a success and a failure can
  # share one, and the page must still know which came last (review 2026-10-21: a tie read as
  # "Succeeded" after a later failure). One counter for every stream, advanced only under the lock.
  seq="$(cat "$BACKUP_RECORD_DIR/.seq" 2>/dev/null || true)"
  [[ "$seq" =~ ^[0-9]{1,15}$ ]] || seq=0
  seq=$((seq + 1))
  printf '%s\n' "$seq" >"$BACKUP_RECORD_DIR/.seq.tmp" && mv -f "$BACKUP_RECORD_DIR/.seq.tmp" "$BACKUP_RECORD_DIR/.seq"
  since="$(grep -m1 -oE "\"recordingSince\": \"$ISO_RE\"" "$RECORD_FILE" 2>/dev/null \
    | grep -oE "$ISO_RE" || true)"
  since="${since:-$now}"
  history="$(previous_group history | grep -oE "$ISO_RE" || true)"
  success="$(previous_group lastSuccess)"
  if [[ "$1" == success ]]; then
    history="$(printf '%s\n%s\n' "$history" "$COVERS_UNTIL" | { grep -E "^$ISO_RE\$" || true; } | tail -n 31)"
    success="$(printf '{"seq": %s, "coversUntil": "%s", "completedAt": "%s", "filename": "%s", "encryptedBytes": %s, "destination": "%s"}' \
      "$seq" "$COVERS_UNTIL" "$now" "$(json_escape "$NAME" "backup filename")" "$SIZE" \
      "$(json_escape "$DEST_ROOT" "backup destination")")"
  fi
  attempt="$(printf '{"seq": %s, "at": "%s", "outcome": "%s"' "$seq" "$now" "$1")"
  if [[ "$1" == failure ]]; then
    attempt+=", \"stage\": \"$STAGE\", \"reason\": \"$(json_escape "$(printf '%s' "$2" | tr '\n\r\t' '   ' | cut -c1-300)" 'failure reason')\""
  elif [[ "$1" == notConnected ]]; then
    attempt+=', "reason": "The backup drive is not connected."'
  fi
  attempt+='}'
  history="$(printf '%s\n' "$history" | { grep -E "^$ISO_RE\$" || true; } | sed 's/.*/"&"/' | paste -sd, - | sed 's/,/, /g')"
  tmp_dir="${RECORD_FILE%/*}"
  mkdir -p "$tmp_dir"
  chmod 0755 "$tmp_dir"
  RECORD_TMP="$(mktemp "$tmp_dir/.$STREAM.XXXXXX")"
  printf '{\n  "version": 2,\n  "stream": "%s",\n  "recordingSince": "%s",\n  "lastSuccess": %s,\n  "lastAttempt": %s,\n  "history": [%s]\n}\n' \
    "$STREAM" "$since" "$success" "$attempt" "$history" >"$RECORD_TMP"
  chmod 0644 "$RECORD_TMP"
  mv -f "$RECORD_TMP" "$RECORD_FILE"
  RECORD_TMP=""
}

select_destination() {
  KIND="$1"; DEST_ROOT="${ROOTS[$KIND]}"
  RECORD_FILE="$BACKUP_RECORD_DIR/$KIND/$STREAM.json"
}

# Best effort: a failure to record must never mask the failure being recorded.
record_failure() { # exit-status
  write_record failure "${FAIL_REASON:-stopped during $STAGE (exit $1)}" 2>/dev/null || true
}

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 && "$LOCKED" -eq 1 && -n "$STREAM" ]]; then
    for target in "${TARGETS[@]}"; do
      [[ "${DONE[$target]:-0}" == 1 ]] && continue
      select_destination "$target"
      record_failure "$status"
    done
  fi
  [[ -z "$RECORD_TMP" ]] || rm -f "$RECORD_TMP"
  [[ -z "$TMP" ]] || rm -rf "$TMP"
}
trap cleanup EXIT

# A destination worker owns only its own record. Its error never prevents the other worker running.
destination_exit() {
  local status=$?
  [[ "$status" -eq 0 || "$STAGE" == done ]] || record_failure "$status"
  [[ -z "$RECORD_TMP" ]] || rm -f "$RECORD_TMP"
}

# Runs one destination's worker in its own subshell and leaves its status in RESULT. ⚑ Call it as a
# plain command, never as `isolated … || …`: bash ignores `set -e` throughout a `||` list, subshell
# included, so the worker would carry on past its first error.
isolated() { set +e; (set -e; "$@"); RESULT=$?; set -e; }

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
# Upgrade the compact groups emitted by the pre-3b writer, preserving success/history verbatim.
# Files already carrying lastAttempt are left alone. Malformed evidence stays unreadable.
upgrade_record() {
  local RECORD_FILE="$1" attempt group event at seq best_at='' best_seq='' outcome temporary line
  grep -q '^  "lastFailure": ' "$RECORD_FILE" || return 0
  grep -q '^  "lastAttempt": ' "$RECORD_FILE" && return 0
  attempt=null
  # Match the old reader's order: sequence when both exist, otherwise time; a time tie favours failure.
  for outcome in notConnected success failure; do
    case "$outcome" in
      notConnected) group=lastNotConnected ;;
      success) group=lastSuccess ;;
      failure) group=lastFailure ;;
    esac
    event="$(previous_group "$group")"
    [[ "$event" != null ]] || continue
    if [[ "$outcome" == success ]]; then
      at="$(grep -oE '\"completedAt\": \"'"$ISO_RE"'\"' <<<"$event" | grep -oE "$ISO_RE" || true)"
    else
      at="$(grep -oE '\"at\": \"'"$ISO_RE"'\"' <<<"$event" | grep -oE "$ISO_RE" || true)"
    fi
    [[ -n "$at" ]] || return 0
    seq="$(sed -nE 's/.*"seq": ([0-9]+).*/\1/p' <<<"$event")"
    [[ -z "$seq" || "$seq" =~ ^[1-9][0-9]{0,14}$ ]] || return 0
    if [[ -n "$best_at" ]]; then
      if [[ -n "$seq" && -n "$best_seq" ]]; then
        (( seq > best_seq )) || continue
      elif [[ "$at" < "$best_at" || ( "$at" == "$best_at" && "$outcome" != failure ) ]]; then
        continue
      fi
    fi
    best_at="$at"; best_seq="$seq"
    if [[ "$outcome" == success ]]; then
      attempt="{\"outcome\": \"success\", \"at\": \"$at\"${seq:+, \"seq\": $seq}}"
    else
      attempt="{\"outcome\": \"$outcome\", ${event#\{}"
    fi
  done
  temporary="$(mktemp "${RECORD_FILE%/*}/.upgrade.XXXXXX")"
  while IFS= read -r line; do
    case "$line" in
      '  "lastFailure": '*|'  "lastNotConnected": '*) continue ;;
    esac
    printf '%s\n' "$line"
    [[ "$line" != '{' ]] || printf '  "lastAttempt": %s,\n' "$attempt"
  done <"$RECORD_FILE" >"$temporary"
  chmod 0644 "$temporary"; sync -f "$temporary"
  mv -f "$temporary" "$RECORD_FILE"
}

# Move the old layout once, under the same lock as record writes. New evidence always wins;
# old duplicates are retained as an archive, never read as a fallback over a newer failure.
migrate_records() {
  local kind="${REMOTE_KIND:-}" file target directory
  if [[ -z "$kind" ]]; then
    kind=remote
    if grep -qE '"destination": "/' "$BACKUP_RECORD_DIR/"*.json "$REPO_DIR/out/ops/backup-status.json" 2>/dev/null; then kind=usb; fi
  fi
  for file in "$BACKUP_RECORD_DIR/"{daily,weekly,monthly,premigrate}.json "$REPO_DIR/out/ops/backup-status.json"; do
    [[ -f "$file" && ! -L "$file" ]] || continue
    directory="$BACKUP_RECORD_DIR/$kind"
    target="$directory/${file##*/}"
    if [[ -e "$target" ]]; then directory+='/pre3a'; target="$directory/${file##*/}"; fi
    mkdir -p "$directory"; chmod 0755 "$BACKUP_RECORD_DIR/$kind" "$directory"
    [[ ! -e "$target" ]] || die 'an archived pre-3a backup record already exists; not overwriting it'
    upgrade_record "$file"
    mv "$file" "$target"; chmod 0644 "$target"
  done
  # 3a already used destination folders. Upgrade those records before removing old-field readers.
  for file in "$BACKUP_RECORD_DIR/"{disk,usb,remote}/{daily,weekly,monthly,premigrate}.json; do
    [[ -f "$file" && ! -L "$file" ]] || continue
    upgrade_record "$file"
  done
}
migrate_records
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

source "$(dirname "${BASH_SOURCE[0]}")/lib/backup-destinations.sh"

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
  isolated prepare_destination "$target"; result=$RESULT
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
TEMP_AVAILABLE="$(free_kb "$TMP")"
[[ "$TEMP_AVAILABLE" =~ ^[0-9]+$ ]] || die 'cannot read staging disk space'
TEMP_RESERVE_KIB=$((RESERVE_BYTES / 1024))
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
  isolated copy_destination "$target"; result=$RESULT
  DONE[$target]=1
  if [[ "$result" -eq 0 ]]; then SUCCESS_COUNT=$((SUCCESS_COUNT+1)); else ANY_ERROR=1; fi
done
# An absent USB never turns a disk success into a failure; actual errors remain visible to automation.
if [[ "$ANY_ERROR" -eq 0 && "$SUCCESS_COUNT" -gt 0 && "$STREAM" == daily && -n "$HEALTHCHECK_BACKUP_URL" ]]; then
  curl -fsS -m 15 --retry 3 "$HEALTHCHECK_BACKUP_URL" >/dev/null 2>&1 || echo 'backup-db: WARN heartbeat ping failed' >&2
fi
[[ "$ANY_ERROR" -ne 0 ]] || echo 'backup-db: OK'
exit "$ANY_ERROR"
