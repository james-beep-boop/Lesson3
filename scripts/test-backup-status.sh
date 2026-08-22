#!/usr/bin/env bash
#
# Branch cover for backup-db.sh's destination safety and success-record contract. The real backup
# script runs with docker/age/rclone stubbed, in a throwaway repo, so no daemon, database or remote is
# touched. This pins the two deployment shapes SPEC §11 permits:
#   * configured rclone remote (today Google Drive) — no local sentinel;
#   * absolute local path (rotated USB drive) — non-root mount + sentinel required BEFORE pg_dump.
set -uo pipefail

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
if [[ "\$1 \$2" == "compose exec" ]]; then printf 'postgres custom-format bytes'; fi
EOF

  cat >"$SANDBOX/home/bin/age" <<EOF
#!/usr/bin/env bash
echo "age \$*" >>"$SANDBOX/calls"
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
if [[ "\$1" == "copyto" && "\${FAIL_COPY:-}" == "1" ]]; then exit 9; fi
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
  chmod +x "$SANDBOX/home/bin/docker" "$SANDBOX/home/bin/age" \
    "$SANDBOX/home/bin/rclone" "$SANDBOX/home/bin/findmnt"
}

run_case() {
  env -i HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" \
    BACKUP_AGE_RECIPIENT="age1testrecipient" BACKUP_RCLONE_REMOTE="$1" \
    FAIL_COPY="${2:-0}" BACKUP_DB_NAME="${3:-}" PATH="$SANDBOX/home/bin:/usr/bin:/bin" \
    bash "$BACKUP" --label "${4:-premigrate-test}" >"$SANDBOX/output" 2>&1
  EXIT=$?
  CALLS="$(cat "$SANDBOX/calls")"
  OUTPUT="$(cat "$SANDBOX/output")"
  STATUS="$SANDBOX/repo/out/ops/backup-status.json"
}

# Same as run_case, but with the school's second recipient set — so the two-recipient cases can assert
# what reaches `age` without changing the signature every other case uses.
run_case_with_school() {
  env -i HOME="$SANDBOX/home" BACKUP_REPO_DIR="$SANDBOX/repo" \
    BACKUP_AGE_RECIPIENT="age1testrecipient" BACKUP_AGE_RECIPIENT_SCHOOL="$2" \
    BACKUP_RCLONE_REMOTE="$1" PATH="$SANDBOX/home/bin:/usr/bin:/bin" \
    bash "$BACKUP" --label "premigrate-test" >"$SANDBOX/output" 2>&1
  EXIT=$?
  CALLS="$(cat "$SANDBOX/calls")"
  OUTPUT="$(cat "$SANDBOX/output")"
  STATUS="$SANDBOX/repo/out/ops/backup-status.json"
}

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
check "success writes the status record" "expected $STATUS" "$([[ -f "$STATUS" ]] && echo 0 || echo 1)"
check "record names the actual remote" "expected destination in JSON" \
  "$(grep -Fq '"destination": "drive:lesson3-backups"' "$STATUS" && echo 0 || echo 1)"
check "record distinguishes premigration" "expected stream in JSON" \
  "$(grep -Fq '"stream": "premigrate"' "$STATUS" && echo 0 || echo 1)"
check "record uses the v1 contract" "expected version 1" \
  "$(grep -Fq '"version": 1' "$STATUS" && echo 0 || echo 1)"
check "record has a UTC completion time" "expected seconds-precision ISO UTC time" \
  "$(grep -Eq '"completedAt": "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z"' "$STATUS" && echo 0 || echo 1)"
check "record names the uploaded artifact" "expected encrypted backup filename" \
  "$(grep -Eq '"filename": "lesson3-[0-9]{8}T[0-9]{6}Z-premigrate-test\.dump\.age"' "$STATUS" && echo 0 || echo 1)"
check "record reports a positive encrypted size" "expected positive integer byte count" \
  "$(grep -Eq '"encryptedBytes": [1-9][0-9]*' "$STATUS" && echo 0 || echo 1)"
check "record follows upload" "expected uploaded log before recorded log" \
  "$(awk '/backup-db: uploaded/{u=NR} /backup-db: recorded success/{r=NR} END{exit !(u && r && u < r)}' "$SANDBOX/output" && echo 0 || echo 1)"
check "atomic temp is gone" "expected no partial status file" \
  "$(compgen -G "$SANDBOX/repo/out/ops/.backup-status.*" >/dev/null && echo 1 || echo 0)"

# 2. A missing/unmounted removable drive must abort before pg_dump, not write onto the root disk.
prepare_case
USB="$SANDBOX/usb/lesson3-backups"
run_case "$USB"
check "missing USB sentinel fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "missing USB fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"
check "missing USB leaves no status" "status must not exist" "$([[ ! -e "$STATUS" ]] && echo 0 || echo 1)"

prepare_case
run_case "relative/lesson3-backups"
check "relative local path fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "relative path fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"

prepare_case
run_case "$SANDBOX/usb/path:with-colon"
check "absolute path with colon stays local" "expected local validation failure" \
  "$([[ $EXIT -ne 0 && "$OUTPUT" == *"sentinel"* ]] && echo 0 || echo 1)"
check "absolute colon path fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"

prepare_case
run_case $'drive:lesson3-\bbackups'
check "unsupported JSON control fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "unsupported control fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"

prepare_case
run_case "drive:lesson3-backups" 0 $'lesson3-\bunsafe'
check "DB-name JSON control fails" "expected named validation error" \
  "$([[ $EXIT -ne 0 && "$OUTPUT" == *"BACKUP_DB_NAME"* ]] && echo 0 || echo 1)"
check "DB-name control fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"

prepare_case
run_case "drive:lesson3-backups" 0 "" $'premigrate-\bunsafe'
check "label JSON control fails" "expected named validation error" \
  "$([[ $EXIT -ne 0 && "$OUTPUT" == *"--label"* ]] && echo 0 || echo 1)"
check "label control fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"

prepare_case
USB="$SANDBOX/usb/lesson3-backups"
mkdir -p "$USB"; : >"$SANDBOX/not-a-volume"
ln -s "$SANDBOX/not-a-volume" "$USB/.lesson3-backup-volume"
run_case "$USB"
check "symlink USB sentinel fails" "expected non-zero exit" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "symlink sentinel fails before pg_dump" "docker must not run" \
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"

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
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"

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
  "$([[ "$CALLS" != *"docker "* ]] && echo 0 || echo 1)"

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
check "post-upload change leaves no status" "status must not advance" \
  "$([[ ! -e "$STATUS" ]] && echo 0 || echo 1)"

# 6. An upload failure must preserve the previous known-good record exactly.
prepare_case
mkdir -p "$SANDBOX/repo/out/ops"
printf '%s\n' '{"version":1,"sentinel":"previous-good"}' >"$SANDBOX/repo/out/ops/backup-status.json"
OLD="$(cat "$SANDBOX/repo/out/ops/backup-status.json")"
run_case "drive:lesson3-backups" 1
check "failed upload exits non-zero" "expected rclone failure" "$([[ $EXIT -ne 0 ]] && echo 0 || echo 1)"
check "failed upload preserves previous success" "status must remain byte-identical" \
  "$([[ -f "$STATUS" && "$(cat "$STATUS")" == "$OLD" ]] && echo 0 || echo 1)"

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

echo
printf 'backup status: %d passed, %d failed\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
