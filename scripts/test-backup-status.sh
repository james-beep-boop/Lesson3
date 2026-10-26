#!/usr/bin/env bash
#
# Branch cover for backup-db.sh's destination safety and per-stream record contract (version 2, design
# A2/Part 3a: `out/ops/backup/<destination>/<stream>.json` — last success with `coversUntil`, last failure with its stage,
# the last 31 `coversUntil` values). The real backup
# script runs with docker/age/rclone stubbed, in a throwaway repo, so no daemon, database or remote is
# touched. This pins the two deployment shapes SPEC §11 permits:
#   * configured rclone remote (today Google Drive) — no local sentinel;
#   * absolute local path (rotated USB drive) — non-root mount + sentinel required BEFORE pg_dump.
set -uo pipefail
# Cron may run with a private umask; the app must still be able to read operational records.
umask 077

BACKUP="${BACKUP_SH:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-db.sh}"
pass=0 fail=0
SANDBOX=""

cleanup() { [[ -z "$SANDBOX" ]] || rm -rf "$SANDBOX"; }
trap cleanup EXIT

prepare_case() {
  cleanup
  SANDBOX="$(mktemp -d)"
  mkdir -p "$SANDBOX/home/bin" "$SANDBOX/repo"
  : >"$SANDBOX/calls"

  cat >"$SANDBOX/home/bin/docker" <<EOF
#!/usr/bin/env bash
echo "docker \$*" >>"$SANDBOX/calls"
if [[ " \$* " == *" psql "* ]]; then printf '%s\n' "\${TEST_INSTALLATION_ID-11111111-1111-1111-1111-111111111111}"; exit 0; fi
if [[ "\$1 \$2" == "compose exec" ]]; then
  [[ "\${FAIL_DUMP:-}" == "1" ]] && { echo "pg_dump: error: connection refused" >&2; exit 3; }
  printf 'postgres custom-format bytes'
fi
EOF

  cat >"$SANDBOX/home/bin/age" <<EOF
#!/usr/bin/env bash
echo "age \$*" >>"$SANDBOX/calls"
[[ "\${FAIL_AGE:-}" == "1" ]] && { cat >/dev/null; exit 4; }
out=""
while [[ \$# -gt 0 ]]; do
  [[ "\$1" == "-o" ]] && { out="\$2"; shift 2; continue; }
  shift
done
cat >"\$out"
EOF

  cat >"$SANDBOX/home/bin/rclone" <<EOF
#!/usr/bin/env bash
echo "rclone \$*" >>"$SANDBOX/calls"
if [[ "\$1" == copyto ]]; then
  case "\${FAIL_COPY:-}" in
    1) exit 9 ;;
    disk) [[ "\$3" != /proc/self/fd/* ]] || exit 9 ;;
    remote) [[ "\$3" != drive:* ]] || exit 9 ;;
  esac
fi
case "\$1" in
  lsf)
    if [[ " \$* " == *".lesson3-installation"* ]]; then
      [[ ! -f "$SANDBOX/remote-marker" ]] || echo '.lesson3-installation'
    elif [[ "\$2" == /proc/self/fd/* ]]; then
      for file in "\$2"lesson3-*.dump.age; do [[ ! -f "\$file" ]] || basename "\$file"; done
    fi ;;
  deletefile) [[ "\$2" != /proc/self/fd/* ]] || rm -f "\$2" ;;
  copy) cp "\$2/.lesson3-installation" "$SANDBOX/remote-marker" ;;
  cat) cat "$SANDBOX/remote-marker" ;;
  copyto)
    [[ "\$3" != /proc/self/fd/* ]] || { mkdir -p "\${3%/*}"; cp "\$2" "\$3"; }
    ;;

esac
exit 0
EOF

  cat >"$SANDBOX/home/bin/findmnt" <<EOF
#!/usr/bin/env bash
if [[ " \$* " == *" -o TARGET "* ]]; then
  printf '%s\n' "$SANDBOX/usb"
elif [[ " \$* " == *" -T / "* ]]; then
  printf '%s\n' "8:1"
else
  printf '%s\n' "$SANDBOX/usb /dev/test-usb ext4 8:17"
fi
EOF
  # The lock is exercised for real in the concurrency case at the end; here it always succeeds unless
  # a case asks for "another backup is running".
  cat >"$SANDBOX/home/bin/flock" <<EOF
#!/usr/bin/env bash
echo "flock \$*" >>"$SANDBOX/calls"
[[ "\${LOCK_HELD:-}" == "1" ]] && exit 1
exit 0
EOF
  chmod +x "$SANDBOX/home/bin/docker" "$SANDBOX/home/bin/age" \
    "$SANDBOX/home/bin/rclone" "$SANDBOX/home/bin/findmnt" "$SANDBOX/home/bin/flock"
}

run_case() {
  env -i BACKUP_DISK_DIR="" HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" \
    BACKUP_AGE_RECIPIENT="${RECIPIENT-age1testrecipient}" BACKUP_RCLONE_REMOTE="$1" \
    FAIL_COPY="${2:-0}" BACKUP_DB_NAME="${3:-}" PATH="$SANDBOX/home/bin:/usr/bin:/bin" \
    FAIL_DUMP="${FAIL_DUMP:-0}" FAIL_AGE="${FAIL_AGE:-0}" LOCK_HELD="${LOCK_HELD:-0}" \
    bash "$BACKUP" --label "${4:-premigrate-test}" >"$SANDBOX/output" 2>&1
  EXIT=$?
  CALLS="$(cat "$SANDBOX/calls")"
  OUTPUT="$(cat "$SANDBOX/output")"
  STATUS="$SANDBOX/repo/out/ops/backup/remote/premigrate.json"
  [[ "$1" != /* ]] || STATUS="$SANDBOX/repo/out/ops/backup/usb/premigrate.json"
}

# Same as run_case, but with the school's second recipient set — so the two-recipient cases can assert
# what reaches `age` without changing the signature every other case uses.
run_case_with_school() {
  env -i BACKUP_DISK_DIR="" HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" \
    BACKUP_AGE_RECIPIENT="age1testrecipient" BACKUP_AGE_RECIPIENT_SCHOOL="$2" \
    BACKUP_RCLONE_REMOTE="$1" PATH="$SANDBOX/home/bin:/usr/bin:/bin" \
    bash "$BACKUP" --label "premigrate-test" >"$SANDBOX/output" 2>&1
  EXIT=$?
  CALLS="$(cat "$SANDBOX/calls")"
  OUTPUT="$(cat "$SANDBOX/output")"
  STATUS="$SANDBOX/repo/out/ops/backup/remote/premigrate.json"
  [[ "$1" != /* ]] || STATUS="$SANDBOX/repo/out/ops/backup/usb/premigrate.json"
}

# Record helpers: one group per line, as backup-db.sh writes it.
group() { grep -m1 "^  \"$1\": " "$STATUS" 2>/dev/null; }
no_success() { [[ "$(group lastSuccess)" == '  "lastSuccess": null,' ]]; }
failed_at() { group lastFailure | grep -Fq "\"stage\": \"$1\""; }
ok() { "$@" && echo 0 || echo 1; }
ISO='[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z'

check() {
  if [[ "$3" == "0" ]]; then
    printf '  ok   %s\n' "$1"; pass=$((pass+1))
  else
    printf '  FAIL %s — %s\n' "$1" "$2"
    printf '       exit=%s\n       calls:\n%s\n       output:\n%s\n' "$EXIT" "$CALLS" "$OUTPUT"
    fail=$((fail+1))
  fi
}

echo "backup-db.sh destination + status contract:"

# 1. A configured remote is the online/Google Drive path. It needs no host sentinel.
prepare_case
run_case "drive:lesson3-backups"
check "configured remote succeeds" "expected zero exit" "$([[ $EXIT -eq 0 ]] && echo 0 || echo 1)"
check "success writes this stream's record" "expected $STATUS" "$([[ -f "$STATUS" ]] && echo 0 || echo 1)"
check "record names the actual remote" "expected destination in JSON" \
  "$(group lastSuccess | grep -Fq '"destination": "drive:lesson3-backups"' && echo 0 || echo 1)"
check "record is the premigration stream's" "expected stream in JSON" \
  "$(grep -Fq '"stream": "premigrate"' "$STATUS" && echo 0 || echo 1)"
check "record uses the v2 contract" "expected version 2" \
  "$(grep -Fq '"version": 2' "$STATUS" && echo 0 || echo 1)"
check "record says what the data covers" "expected coversUntil, a seconds-precision ISO UTC time" \
  "$(group lastSuccess | grep -Eq "\"coversUntil\": \"$ISO\"" && echo 0 || echo 1)"
check "record has a UTC completion time" "expected seconds-precision ISO UTC time" \
  "$(group lastSuccess | grep -Eq "\"completedAt\": \"$ISO\"" && echo 0 || echo 1)"
check "record names the uploaded artifact" "expected encrypted backup filename" \
  "$(group lastSuccess | grep -Eq '"filename": "lesson3-[0-9]{8}T[0-9]{6}Z-premigrate-test\.dump\.age"' && echo 0 || echo 1)"
check "record reports a positive encrypted size" "expected positive integer byte count" \
  "$(group lastSuccess | grep -Eq '"encryptedBytes": [1-9][0-9]*' && echo 0 || echo 1)"
check "record starts the history with this backup" "expected one coversUntil in history" \
  "$([[ "$(group history | grep -oE "$ISO" | wc -l | tr -d ' ')" == 1 ]] && echo 0 || echo 1)"
check "record notes when recording began" "expected recordingSince" \
  "$(grep -Eq "\"recordingSince\": \"$ISO\"" "$STATUS" && echo 0 || echo 1)"
check "status mount is readable by the app under a private umask" "expected traversable ops directory" \
  "$([[ $(ls -ld "$SANDBOX/repo/out/ops") == drwxr-xr-x* ]] && echo 0 || echo 1)"
check "a success leaves no failure" "expected lastFailure null" \
  "$([[ "$(group lastFailure)" == '  "lastFailure": null,' ]] && echo 0 || echo 1)"
check "record follows upload" "expected uploaded log before recorded log" \
  "$(awk '/backup-db: uploaded/{u=NR} /backup-db: recorded success/{r=NR} END{exit !(u && r && u < r)}' "$SANDBOX/output" && echo 0 || echo 1)"
check "atomic temp is gone" "expected no partial record file" \
  "$(compgen -G "$SANDBOX/repo/out/ops/backup/.premigrate.*" >/dev/null && echo 1 || echo 0)"
check "the version 1 file is no longer written" "backup-status.json must not appear" \
  "$([[ ! -e "$SANDBOX/repo/out/ops/backup-status.json" ]] && echo 0 || echo 1)"
check "the run took the lock" "flock must run" "$([[ "$CALLS" == *"flock -n 8"* ]] && echo 0 || echo 1)"

# 2. A missing/unmounted removable drive is neutral and never writes onto the root disk.
prepare_case
USB="$SANDBOX/usb/lesson3-backups"
run_case "$USB"
check "missing USB is neutral" "expected zero exit" "$([[ $EXIT -eq 0 ]] && echo 0 || echo 1)"
check "missing USB skips pg_dump" "pg_dump must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"
check "missing USB records no success" "lastSuccess must stay null" "$(ok no_success)"
check "missing USB is recorded separately from failure" "lastNotConnected must be set" "$(group lastNotConnected | grep -q '"seq":' && echo 0 || echo 1)"
check "missing USB reason is not connected" "reason must say not connected" \
  "$(group lastNotConnected | grep -q 'not connected' && echo 0 || echo 1)"

prepare_case
run_case "relative/lesson3-backups"
check "relative local path fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "relative path fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

prepare_case
run_case "$SANDBOX/usb/path:with-colon"
check "absolute path with colon stays local" "expected not connected" \
  "$([[ $EXIT -eq 0 && "$OUTPUT" == *"not connected"* ]] && echo 0 || echo 1)"
check "absent absolute colon path skips pg_dump" "pg_dump must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

prepare_case
run_case $'drive:lesson3-\bbackups'
check "unsupported JSON control fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "unsupported control fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

prepare_case
run_case "drive:lesson3-backups" 0 $'lesson3-\bunsafe'
check "DB-name JSON control fails" "expected named validation error" \
  "$([[ $EXIT -ne 0 && "$OUTPUT" == *"BACKUP_DB_NAME"* ]] && echo 0 || echo 1)"
check "DB-name control fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

prepare_case
run_case "drive:lesson3-backups" 0 "" $'premigrate-\bunsafe'
check "label JSON control fails" "expected named validation error" \
  "$([[ $EXIT -ne 0 && "$OUTPUT" == *"--label"* ]] && echo 0 || echo 1)"
check "label control fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

prepare_case
USB="$SANDBOX/usb/lesson3-backups"
mkdir -p "$USB"; : >"$SANDBOX/not-a-volume"
ln -s "$SANDBOX/not-a-volume" "$USB/.lesson3-backup-volume"
run_case "$USB"
check "symlink USB sentinel fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "symlink sentinel fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

prepare_case
USB="$SANDBOX/usb/lesson3-backups"
mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
cat >"$SANDBOX/home/bin/findmnt" <<'EOF'
#!/usr/bin/env bash
if [[ " $* " == *" -o TARGET "* ]]; then printf '/\n'; else printf '/ /dev/root ext4 8:1\n'; fi
EOF
chmod +x "$SANDBOX/home/bin/findmnt"
run_case "$USB"
check "root-filesystem destination fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "root destination fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

prepare_case
USB="$SANDBOX/usb/lesson3-backups"
mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
cat >"$SANDBOX/home/bin/findmnt" <<EOF
#!/usr/bin/env bash
if [[ " \$* " == *" -o TARGET "* ]]; then
  printf '%s\n' "$SANDBOX/usb"
elif [[ " \$* " == *" -T / "* ]]; then
  printf '%s\n' "8:1"
else
  printf '%s\n' "$SANDBOX/usb /dev/root-bind ext4 8:1"
fi
EOF
chmod +x "$SANDBOX/home/bin/findmnt"
run_case "$USB"
check "root-backed bind mount fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "root-backed bind fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

# 3. A mounted/identified USB drive uses the same encrypted rclone path and writes the same evidence.
prepare_case
USB="$SANDBOX/usb/lesson3-backups"
mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
run_case "$USB"
check "identified USB succeeds" "expected zero exit" "$([[ $EXIT -eq 0 ]] && echo 0 || echo 1)"
check "USB destination is recorded" "expected local destination in JSON" \
  "$(grep -Fq "\"destination\": \"$USB\"" "$STATUS" && echo 0 || echo 1)"

# 4. The filesystem identity is captured before the dump and checked again immediately before upload.
prepare_case
USB="$SANDBOX/usb/lesson3-backups"
mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"; : >"$SANDBOX/findmnt-count"
cat >"$SANDBOX/home/bin/findmnt" <<EOF
#!/usr/bin/env bash
if [[ " \$* " == *" -o TARGET "* ]]; then printf '%s\n' "$SANDBOX/usb"; exit 0; fi
if [[ " \$* " == *" -T / "* ]]; then printf '%s\n' "8:1"; exit 0; fi
n=0; [[ ! -s "$SANDBOX/findmnt-count" ]] || n=\$(cat "$SANDBOX/findmnt-count")
n=\$((n + 1)); printf '%s\n' "\$n" >"$SANDBOX/findmnt-count"
if [[ \$n -eq 1 ]]; then
  printf '%s\n' "$SANDBOX/usb /dev/test-usb ext4 8:17"
else
  printf '%s\n' "$SANDBOX/usb /dev/changed-usb ext4 8:18"
fi
EOF
chmod +x "$SANDBOX/home/bin/findmnt"
run_case "$USB"
check "changed USB identity fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "changed USB is not uploaded" "rclone copyto must not run" \
  "$([[ "$CALLS" != *"rclone copyto"* ]] && echo 0 || echo 1)"

# 5. The same identity is checked after copyto and before the success record advances.
prepare_case
USB="$SANDBOX/usb/lesson3-backups"
mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
cat >"$SANDBOX/home/bin/rclone" <<EOF
#!/usr/bin/env bash
echo "rclone \$*" >>"$SANDBOX/calls"
[[ "\$1" == "copyto" ]] && : >"$SANDBOX/upload-finished"
exit 0
EOF
cat >"$SANDBOX/home/bin/findmnt" <<EOF
#!/usr/bin/env bash
if [[ " \$* " == *" -o TARGET "* ]]; then printf '%s\n' "$SANDBOX/usb"; exit 0; fi
if [[ " \$* " == *" -T / "* ]]; then printf '%s\n' "8:1"; exit 0; fi
if [[ -e "$SANDBOX/upload-finished" ]]; then
  printf '%s\n' "$SANDBOX/usb /dev/changed-usb ext4 8:18"
else
  printf '%s\n' "$SANDBOX/usb /dev/test-usb ext4 8:17"
fi
EOF
chmod +x "$SANDBOX/home/bin/rclone" "$SANDBOX/home/bin/findmnt"
run_case "$USB"
check "post-upload mount change fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "post-upload check follows copyto" "rclone copyto must run first" \
  "$([[ "$CALLS" == *"rclone copyto"* ]] && echo 0 || echo 1)"
check "post-upload change records no success" "lastSuccess must stay null" "$(ok no_success)"
check "post-upload change is an upload failure" "lastFailure stage must be upload" "$(ok failed_at upload)"

# 6. An upload failure must keep the previous success exactly, and add the failure beside it.
prepare_case
mkdir -p "$SANDBOX/repo/out/ops/backup"
cat >"$SANDBOX/repo/out/ops/backup/premigrate.json" <<'JSON'
{
  "version": 2,
  "stream": "premigrate",
  "recordingSince": "2026-10-01T02:00:00Z",
  "lastSuccess": {"coversUntil": "2026-10-20T02:00:00Z", "completedAt": "2026-10-20T02:01:00Z", "filename": "previous \"good\".dump.age", "encryptedBytes": 7, "destination": "drive:lesson3-backups"},
  "lastFailure": null,
  "history": ["2026-10-19T02:00:00Z", "2026-10-20T02:00:00Z"]
}
JSON
OLD_SUCCESS="$(grep '"lastSuccess"' "$SANDBOX/repo/out/ops/backup/premigrate.json")"
run_case "drive:lesson3-backups" 1
check "failed upload exits non-zero" "expected rclone failure" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "failed upload keeps the previous success verbatim" "lastSuccess line must be byte-identical" \
  "$([[ "$(group lastSuccess)" == "$OLD_SUCCESS" ]] && echo 0 || echo 1)"
check "failed upload records an upload failure" "lastFailure stage must be upload" "$(ok failed_at upload)"
check "failed upload keeps the history" "two entries must remain" \
  "$([[ "$(group history)" == '  "history": ["2026-10-19T02:00:00Z", "2026-10-20T02:00:00Z"]' ]] && echo 0 || echo 1)"
check "failed upload keeps when recording began" "recordingSince must not move" \
  "$(grep -Fq '"recordingSince": "2026-10-01T02:00:00Z"' "$STATUS" && echo 0 || echo 1)"
OLD_FAILURE="$(group lastFailure)"

# 6b. The next success keeps that failure line (the reader compares times) and extends the history.
run_case "drive:lesson3-backups"
check "a later success keeps the failure verbatim" "lastFailure line must be byte-identical" \
  "$([[ "$(group lastFailure)" == "$OLD_FAILURE" ]] && echo 0 || echo 1)"
check "a later success appends to the history" "three entries expected" \
  "$([[ "$(group history | grep -oE "$ISO" | wc -l | tr -d ' ')" == 3 ]] && echo 0 || echo 1)"

# 6c. The history keeps the newest 31.
prepare_case
mkdir -p "$SANDBOX/repo/out/ops/backup"
H="$(for d in $(seq -w 1 31); do printf '"2026-08-%sT02:00:00Z", ' "$d"; done)"
printf '{\n  "version": 2,\n  "stream": "premigrate",\n  "recordingSince": "2026-08-01T02:00:00Z",\n  "lastSuccess": null,\n  "lastFailure": null,\n  "history": [%s]\n}\n' \
  "${H%, }" >"$SANDBOX/repo/out/ops/backup/premigrate.json"
run_case "drive:lesson3-backups"
check "history is capped at 31" "31 entries expected" \
  "$([[ "$(group history | grep -oE "$ISO" | wc -l | tr -d ' ')" == 31 ]] && echo 0 || echo 1)"
check "the oldest entry is the one dropped" "2026-08-01 must be gone, 2026-08-02 kept" \
  "$(group history | grep -q '2026-08-01T' && echo 1 || { group history | grep -q '2026-08-02T' && echo 0 || echo 1; })"

# 6d. Each stage that can fail is named in the record.
prepare_case
FAIL_DUMP=1 run_case "drive:lesson3-backups"
check "a pg_dump failure is recorded as dump" "lastFailure stage must be dump" "$(ok failed_at dump)"
check "a pg_dump failure uploads nothing" "rclone copyto must not run" \
  "$([[ "$CALLS" != *"rclone copyto"* ]] && echo 0 || echo 1)"
prepare_case
FAIL_AGE=1 run_case "drive:lesson3-backups"
check "an encryption failure is recorded as encrypt" "lastFailure stage must be encrypt" "$(ok failed_at encrypt)"
prepare_case
LOCK_HELD=1 run_case "drive:lesson3-backups"
check "a lock never freed fails the run" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "a run without the lock writes no record" "the holder owns the record" "$([[ ! -e "$STATUS" ]] && echo 0 || echo 1)"
check "a held lock waits before giving up" "flock -w must run" "$([[ "$CALLS" == *"flock -w"* ]] && echo 0 || echo 1)"
check "a held lock dumps nothing" "docker must not run" "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

# 6e. A setup failure is recorded — but only once the lock is held, never before (review 2026-10-21).
prepare_case
RECIPIENT="" run_case "drive:lesson3-backups"
check "a missing recipient fails the run" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "a missing recipient is recorded as setup" "lastFailure stage must be setup" "$(ok failed_at setup)"
check "it is recorded only after the lock was taken" "flock must come before the record" \
  "$([[ "$CALLS" == *"flock -n 8"* ]] && echo 0 || echo 1)"
prepare_case
LOCK_HELD=1 RECIPIENT="" run_case "drive:lesson3-backups"
check "a failure without the lock writes nothing" "no record may appear" "$([[ ! -e "$STATUS" ]] && echo 0 || echo 1)"

# 6e'. A bad retention setting is recorded too: the check runs after the lock (review 2026-10-22).
prepare_case
env -i BACKUP_DISK_DIR="" HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" BACKUP_AGE_RECIPIENT="age1testrecipient" \
  BACKUP_RCLONE_REMOTE="drive:lesson3-backups" BACKUP_WEEKLY_KEEP=0 PATH="$SANDBOX/home/bin:/usr/bin:/bin" \
  bash "$BACKUP" --label weekly >"$SANDBOX/output" 2>&1
EXIT=$?; CALLS="$(cat "$SANDBOX/calls")"; OUTPUT="$(cat "$SANDBOX/output")"
STATUS="$SANDBOX/repo/out/ops/backup/remote/weekly.json"
check "a bad retention setting fails the run" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "a bad retention setting is recorded as setup" "lastFailure stage must be setup" "$(ok failed_at setup)"
check "the record names the setting" "reason must mention keep-count" \
  "$(group lastFailure | grep -q 'keep-count' && echo 0 || echo 1)"
check "a bad retention setting dumps nothing" "docker must not run" "$([[ "$CALLS" != *"pg_dump "* ]] && echo 0 || echo 1)"

# 6f. Attempts are ordered by a number, not a time: whole seconds can tie (review 2026-10-21).
prepare_case
run_case "drive:lesson3-backups"
run_case "drive:lesson3-backups" 1
check "a success carries its attempt number" "seq 1 on the first success" \
  "$(group lastSuccess | grep -Fq '"seq": 1,' && echo 0 || echo 1)"
check "the next attempt's number is higher" "seq 2 on the failure that followed" \
  "$(group lastFailure | grep -Fq '"seq": 2,' && echo 0 || echo 1)"
run_case "drive:lesson3-backups" 0 "" "weekly"
check "one counter serves every stream" "the weekly success is attempt 3" \
  "$(grep -Fq '"seq": 3,' "$SANDBOX/repo/out/ops/backup/remote/weekly.json" && echo 0 || echo 1)"

# ── Two recipients (SPEC §11: an offline school must be able to recover without ARES) ──────────────
#
# ⚑ THE POINT IS WHAT REACHES `age`. The stub logs its argv, so these assert the actual recipient flags
# rather than that the script merely exited 0 — a second recipient silently dropped would leave every
# backup unrecoverable by the school while looking perfectly healthy, which is exactly the class of
# failure that only shows up during a recovery.
prepare_case
USB="$SANDBOX/usb"; mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
run_case_with_school "$USB" "age1schoolkey"
check "two recipients: succeeds" "expected exit 0" "$([[ $EXIT -eq 0 ]] && echo 0 || echo 1)"
check "two recipients: ARES key passed to age" "-r age1testrecipient must appear" \
  "$(grep -q -- "-r age1testrecipient" <<<"$CALLS" && echo 0 || echo 1)"
check "two recipients: school key passed to age" "-r age1schoolkey must appear" \
  "$(grep -q -- "-r age1schoolkey" <<<"$CALLS" && echo 0 || echo 1)"

prepare_case
USB="$SANDBOX/usb"; mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
run_case_with_school "$USB" "age1testrecipient"
check "duplicate recipient refused" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "duplicate recipient uploads nothing" "rclone must not run" \
  "$(grep -q "^rclone copyto" <<<"$CALLS" && echo 1 || echo 0)"

prepare_case
USB="$SANDBOX/usb"; mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
run_case_with_school "$USB" ""
check "one recipient still works" "expected exit 0" "$([[ $EXIT -eq 0 ]] && echo 0 || echo 1)"
check "one recipient passes exactly one -r" "only the ARES key" \
  "$([[ "$(grep -o -- "-r " <<<"$(grep '^age ' <<<"$CALLS")" | wc -l | tr -d ' ')" == "1" ]] && echo 0 || echo 1)"

# ── The --label error message (it cost the operator a run on 2026-08-22) ──────────────────────────
#
# ⚑ ASSERTING THE MESSAGE'S CONTENT, not just the refusal. The old text said
# "(use weekly | monthly | premigrate)" and omitted both that NO label means daily and that premigrate
# takes a suffix — so it named the valid inputs incorrectly, which is worse than naming none. These
# cases pin each of the four forms it now advertises, and the last one proves the suffix form the
# message promises is genuinely accepted rather than just documented.
prepare_case
USB="$SANDBOX/usb"; mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
run_case "$USB" 0 "" "manual-bad"
check "bad label refused" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
for form in daily weekly monthly premigrate; do
  check "bad-label message names '$form'" "message must list every valid form" \
    "$(grep -qi "$form" <<<"$OUTPUT" && echo 0 || echo 1)"
done
check "bad label uploads nothing" "rclone must not run" \
  "$(grep -q "^rclone copyto" <<<"$CALLS" && echo 1 || echo 0)"

prepare_case
USB="$SANDBOX/usb"; mkdir -p "$USB"; : >"$USB/.lesson3-backup-volume"
run_case "$USB" 0 "" "premigrate-two-recipient-check"
check "premigrate accepts a suffix" "expected exit 0" "$([[ $EXIT -eq 0 ]] && echo 0 || echo 1)"
check "suffixed premigrate records the premigrate stream" "stream must be premigrate" \
  "$(grep -q '"stream": "premigrate"' "$STATUS" && echo 0 || echo 1)"

# A bad label is not a stream, so it writes no record at all.
prepare_case
run_case "drive:lesson3-backups" 0 "" "manual-bad"
check "an unknown label writes no record" "no file under out/ops/backup" \
  "$([[ -z "$(ls "$SANDBOX/repo/out/ops/backup" 2>/dev/null)" ]] && echo 0 || echo 1)"

# ── Two runs at once, with the REAL lock ───────────────────────────────────────────────────────────
#
# ⚑ THE STUBBED flock ABOVE PROVES THE SCRIPT ASKS FOR THE LOCK; ONLY THE REAL ONE PROVES IT HOLDS. Two
# runs start together while the first is still dumping: the second must wait, both must succeed, and
# both must survive in the records — same stream (no lost update to its history) and different streams.
# macOS has no `flock`; CI's Ubuntu runner does, and on a Mac this file runs in the probe tools image
# (`scripts/lib/restore-probe-tools.Dockerfile`), which has it.
REAL_FLOCK="$(PATH=/usr/bin:/bin:/usr/sbin:/sbin command -v flock || true)"
if [[ -z "$REAL_FLOCK" ]]; then
  echo "  SKIP two runs at once — this host has no flock (CI runs it; on a Mac run this in the probe tools image)"
else
  prepare_case
  rm -f "$SANDBOX/home/bin/flock"
  ln -s "$REAL_FLOCK" "$SANDBOX/home/bin/flock"
  # The first run holds the lock while its dump takes two seconds.
  cat >"$SANDBOX/home/bin/docker" <<EOF
#!/usr/bin/env bash
echo "docker \$*" >>"$SANDBOX/calls"
if [[ " \$* " == *" psql "* ]]; then printf '11111111-1111-1111-1111-111111111111\n'; exit 0; fi
if [[ "\$1 \$2" == "compose exec" ]]; then
  [[ -e "$SANDBOX/dumping" ]] && echo "OVERLAP" >>"$SANDBOX/calls"
  : >"$SANDBOX/dumping"; sleep 2; rm -f "$SANDBOX/dumping"
  printf 'postgres custom-format bytes'
fi
EOF
  chmod +x "$SANDBOX/home/bin/docker"
  concurrent() { # label output-file
    env -i BACKUP_DISK_DIR="" HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" BACKUP_AGE_RECIPIENT="age1testrecipient" \
      BACKUP_RCLONE_REMOTE="drive:lesson3-backups" PATH="$SANDBOX/home/bin:/usr/bin:/bin" \
      bash "$BACKUP" --label "$1" >"$2" 2>&1
  }
  concurrent premigrate-first "$SANDBOX/out1" & P1=$!
  sleep 0.5
  concurrent premigrate-second "$SANDBOX/out2" & P2=$!
  concurrent weekly "$SANDBOX/out3" & P3=$!
  wait "$P1"; E1=$?; wait "$P2"; E2=$?; wait "$P3"; E3=$?
  OUTPUT="$(cat "$SANDBOX/out1" "$SANDBOX/out2" "$SANDBOX/out3")"; CALLS="$(cat "$SANDBOX/calls")"; EXIT="$E1/$E2/$E3"
  STATUS="$SANDBOX/repo/out/ops/backup/remote/premigrate.json"
  check "two at once: every run succeeds" "expected all exits 0" "$([[ "$EXIT" == 0/0/0 ]] && echo 0 || echo 1)"
  check "two at once: a later run waited for the lock" "expected the waiting message" \
    "$(grep -q "another backup is running; waiting" "$SANDBOX/out2" "$SANDBOX/out3" && echo 0 || echo 1)"
  check "two at once: the same stream kept both" "premigrate history must hold two entries" \
    "$([[ "$(group history | grep -oE "$ISO" | wc -l | tr -d ' ')" == 2 ]] && echo 0 || echo 1)"
  check "two at once: the other stream's record survives" "weekly.json must have a success" \
    "$(grep -q '"lastSuccess": {' "$SANDBOX/repo/out/ops/backup/remote/weekly.json" && echo 0 || echo 1)"
  check "two at once: all three dumps ran" "three pg_dump calls expected" \
    "$([[ "$(grep -c '^docker compose exec.*pg_dump' <<<"$CALLS")" == 3 ]] && echo 0 || echo 1)"
  check "two at once: the dumps never overlapped" "no dump may start while another runs" \
    "$([[ "$CALLS" != *OVERLAP* ]] && echo 0 || echo 1)"

  # A run that FAILS while another is succeeding must not undo that success (review 2026-10-21: an
  # early validation failure wrote its record before taking the lock, and a history of two became one).
  prepare_case
  rm -f "$SANDBOX/home/bin/flock"; ln -s "$REAL_FLOCK" "$SANDBOX/home/bin/flock"
  cat >"$SANDBOX/home/bin/docker" <<EOF
#!/usr/bin/env bash
echo "docker \$*" >>"$SANDBOX/calls"
if [[ " \$* " == *" psql "* ]]; then printf '11111111-1111-1111-1111-111111111111\n'; exit 0; fi
if [[ "\$1 \$2" == "compose exec" ]]; then sleep 2; printf 'postgres custom-format bytes'; fi
EOF
  chmod +x "$SANDBOX/home/bin/docker"
  mkdir -p "$SANDBOX/repo/out/ops/backup"
  printf '{\n  "version": 2,\n  "stream": "premigrate",\n  "recordingSince": "2026-10-01T02:00:00Z",\n  "lastSuccess": null,\n  "lastFailure": null,\n  "history": ["2026-10-20T02:00:00Z"]\n}\n' \
    >"$SANDBOX/repo/out/ops/backup/premigrate.json"
  concurrent premigrate-succeeds "$SANDBOX/out1" & P1=$!
  sleep 0.5
  env -i BACKUP_DISK_DIR="" HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" BACKUP_AGE_RECIPIENT="" \
    BACKUP_RCLONE_REMOTE="drive:lesson3-backups" PATH="$SANDBOX/home/bin:/usr/bin:/bin" \
    bash "$BACKUP" --label premigrate-fails >"$SANDBOX/out2" 2>&1; E2=$?
  wait "$P1"; E1=$?
  OUTPUT="$(cat "$SANDBOX/out1" "$SANDBOX/out2")"; CALLS="$(cat "$SANDBOX/calls")"; EXIT="$E1/$E2"
  STATUS="$SANDBOX/repo/out/ops/backup/remote/premigrate.json"
  check "fail during success: the success succeeds and the failure fails" "expected 0/1" \
    "$([[ "$EXIT" == 0/1 ]] && echo 0 || echo 1)"
  check "fail during success: the history keeps both entries" "two entries expected" \
    "$([[ "$(group history | grep -oE "$ISO" | wc -l | tr -d ' ')" == 2 ]] && echo 0 || echo 1)"
  check "fail during success: the success is kept" "lastSuccess must be set" \
    "$(group lastSuccess | grep -q '"seq": 1,' && echo 0 || echo 1)"
  check "fail during success: the failure is recorded after it" "the failure must be attempt 2" \
    "$(group lastFailure | grep -q '"seq": 2,' && echo 0 || echo 1)"
fi

# Part 3a: destinations are independent, while dump and encryption happen once.
run_dual() {
  env -i HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" \
    BACKUP_DISK_DIR="$SANDBOX/disk" BACKUP_RCLONE_REMOTE="$1" \
    BACKUP_AGE_RECIPIENT=age1testrecipient PATH="$SANDBOX/home/bin:/usr/bin:/bin" \
    BACKUP_DISK_MIN_FREE_BYTES="${TEST_MARGIN:-1}" FAIL_COPY="${TEST_COPY_FAILURE:-0}" \
    TEST_INSTALLATION_ID="${TEST_ID-11111111-1111-1111-1111-111111111111}" \
    bash "$BACKUP" ${TEST_LABEL:+--label "$TEST_LABEL"} >"$SANDBOX/output" 2>&1
  EXIT=$?; CALLS="$(cat "$SANDBOX/calls")"; OUTPUT="$(cat "$SANDBOX/output")"
  STATUS="$SANDBOX/repo/out/ops/backup/disk/daily.json"
}
prepare_case
run_dual 'drive:backups'
check 'disk and cloud both succeed' 'expected zero exit' "$([[ $EXIT -eq 0 ]] && echo 0 || echo 1)"
check 'two destinations use one pg_dump' 'expected one dump' "$([[ $(grep -c 'docker .*pg_dump' "$SANDBOX/calls") == 1 ]] && echo 0 || echo 1)"
check 'two destinations use one encryption' 'expected one age call' "$([[ $(grep -c '^age ' "$SANDBOX/calls") == 1 ]] && echo 0 || echo 1)"
check 'two destinations receive the same encrypted source' 'expected one source and two copies' \
  "$(awk '/^rclone copyto /{sources[$3]=1; n++} END{exit !(length(sources)==1 && n==2)}' "$SANDBOX/calls" && echo 0 || echo 1)"
check 'disk has its own success record' 'expected daily disk evidence' "$(group lastSuccess | grep -q '"seq":' && echo 0 || echo 1)"
check 'cloud has its own success record' 'expected daily cloud evidence' "$(grep -q '"lastSuccess": {"seq":' "$SANDBOX/repo/out/ops/backup/remote/daily.json" && echo 0 || echo 1)"
check 'disk marker contains the database identity' 'expected UUID' "$([[ $(cat "$SANDBOX/disk/.lesson3-installation") == 11111111-1111-1111-1111-111111111111 ]] && echo 0 || echo 1)"
check 'disk copied through its held directory' 'expected an actual encrypted file' "$(compgen -G "$SANDBOX/disk/daily/*.dump.age" >/dev/null && echo 0 || echo 1)"

prepare_case
run_dual "$SANDBOX/absent-usb"
check 'unplugged USB does not fail disk backup' 'expected zero exit' "$([[ $EXIT -eq 0 ]] && echo 0 || echo 1)"
check 'disk succeeds with unplugged USB' 'expected disk success' "$(group lastSuccess | grep -q '"seq":' && echo 0 || echo 1)"
check 'unplugged USB has a neutral record' 'expected notConnected and no failure' \
  "$(grep -q '"lastNotConnected": {"seq":' "$SANDBOX/repo/out/ops/backup/usb/daily.json" && grep -q '"lastFailure": null' "$SANDBOX/repo/out/ops/backup/usb/daily.json" && echo 0 || echo 1)"
check 'unplugged USB folder is not created' 'expected no directory on root filesystem' "$([[ ! -e "$SANDBOX/absent-usb" ]] && echo 0 || echo 1)"

prepare_case
mkdir -p "$SANDBOX/disk/daily"
printf '22222222-2222-2222-2222-222222222222\n' >"$SANDBOX/disk/.lesson3-installation"
printf 'old backup' >"$SANDBOX/disk/daily/lesson3-20200101T000000Z.dump.age"
run_dual 'drive:backups'
check 'foreign disk marker fails the run' 'expected nonzero after trying cloud' "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check 'foreign disk marker is not overwritten' 'expected foreign identity' "$([[ $(cat "$SANDBOX/disk/.lesson3-installation") == 22222222-2222-2222-2222-222222222222 ]] && echo 0 || echo 1)"
check 'foreign disk backups are untouched' 'expected only the original file' "$([[ $(ls "$SANDBOX/disk/daily" | wc -l) == 1 ]] && echo 0 || echo 1)"
check 'foreign disk does not prevent cloud backup' 'expected cloud success' "$(grep -q '"lastSuccess": {"seq":' "$SANDBOX/repo/out/ops/backup/remote/daily.json" && echo 0 || echo 1)"
check 'foreign disk is never pruned' 'expected no delete calls' "$([[ "$CALLS" != *'rclone delete'* ]] && echo 0 || echo 1)"

prepare_case
printf '22222222-2222-2222-2222-222222222222\n' >"$SANDBOX/remote-marker"
run_dual 'drive:backups'
check 'foreign cloud fails after disk succeeds' 'expected nonzero and disk success' "$([[ $EXIT -ne 0 ]] && group lastSuccess | grep -q '"seq":' && echo 0 || echo 1)"
check 'foreign cloud is never written or pruned' 'expected only disk copy' "$([[ $(grep -c '^rclone copyto' "$SANDBOX/calls") == 1 && "$CALLS" != *'rclone delete'* ]] && echo 0 || echo 1)"

prepare_case
mkdir -p "$SANDBOX/disk/daily"
printf 'old backup' >"$SANDBOX/disk/daily/lesson3-20200101T000000Z.dump.age"
run_dual ''
check 'unmarked old disk is adopted' 'expected success and installation marker' "$([[ $EXIT -eq 0 && -f "$SANDBOX/disk/.lesson3-installation" ]] && echo 0 || echo 1)"
check 'adoption preserves existing backups within retention' 'expected original backup' "$([[ -f "$SANDBOX/disk/daily/lesson3-20200101T000000Z.dump.age" ]] && echo 0 || echo 1)"

prepare_case
TEST_MARGIN=999999999999999 run_dual 'drive:backups'
check 'insufficient disk space is a real error' 'expected nonzero' "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check 'insufficient disk space is recorded' 'expected space failure' "$(ok failed_at space)"
check 'insufficient disk space does not stop cloud' 'expected cloud success' "$(grep -q '"lastSuccess": {"seq":' "$SANDBOX/repo/out/ops/backup/remote/daily.json" && echo 0 || echo 1)"

prepare_case
TEST_ID='' run_dual 'drive:backups'
check 'missing database identity refuses all writes' 'expected nonzero and no rclone call or disk' "$([[ $EXIT -ne 0 && "$CALLS" != *rclone* && ! -e "$SANDBOX/disk" ]] && echo 0 || echo 1)"

prepare_case
mkdir "$SANDBOX/disk"
printf '11111111-1111-1111-1111-111111111111\n' >"$SANDBOX/elsewhere"
ln -s "$SANDBOX/elsewhere" "$SANDBOX/disk/.lesson3-installation"
run_dual ''
check 'symlink installation marker is refused' 'expected nonzero without a dump' "$([[ $EXIT -ne 0 && "$CALLS" != *pg_dump* ]] && echo 0 || echo 1)"

prepare_case
TEST_COPY_FAILURE=disk run_dual 'drive:backups'
check 'disk copy failure does not stop the later cloud copy' 'expected nonzero and cloud success' \
  "$([[ $EXIT -ne 0 ]] && grep -q '"lastSuccess": {"seq":' "$SANDBOX/repo/out/ops/backup/remote/daily.json" && echo 0 || echo 1)"
check 'disk copy failure records the upload stage' 'expected disk upload failure' "$(ok failed_at upload)"

prepare_case
USB="$SANDBOX/usb/backups"
mkdir -p "$USB"; touch "$USB/.lesson3-backup-volume"
run_dual "$USB"
check 'disk and connected USB both succeed' 'expected zero and two actual archive copies' \
  "$([[ $EXIT -eq 0 && $(grep -c '^rclone copyto' "$SANDBOX/calls") == 2 ]] && compgen -G "$USB/daily/*.dump.age" >/dev/null && echo 0 || echo 1)"

prepare_case
cat >"$SANDBOX/home/bin/df" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *'/proc/self/fd/'* ]]; then
  printf 'Filesystem 1024-blocks Used Available Capacity Mounted\n/dev/test 100 99 1 99%% /\n'
else exec /usr/bin/df "$@"; fi
EOF
chmod +x "$SANDBOX/home/bin/df"
TEST_MARGIN=1000 run_dual 'drive:backups'
check 'space check includes encrypted size after preflight passes' 'expected disk space failure and only cloud copied' \
  "$([[ $EXIT -ne 0 && $(grep -c '^rclone copyto' "$SANDBOX/calls") == 1 ]] && failed_at space && echo 0 || echo 1)"

prepare_case
mkdir -p "$SANDBOX/disk/monthly"
for month in 01 02 03 04; do
  printf old >"$SANDBOX/disk/monthly/lesson3-2020${month}01T000000Z-monthly.dump.age"
done
TEST_LABEL=monthly run_dual ''
check 'disk monthly retention keeps three copies' 'expected newest three including this backup' \
  "$([[ $EXIT -eq 0 && $(ls "$SANDBOX/disk/monthly" | wc -l) == 3 && ! -e "$SANDBOX/disk/monthly/lesson3-20200101T000000Z-monthly.dump.age" && -e "$SANDBOX/disk/monthly/lesson3-20200401T000000Z-monthly.dump.age" ]] && echo 0 || echo 1)"

echo
printf 'backup status: %d passed, %d failed\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
