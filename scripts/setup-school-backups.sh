#!/usr/bin/env bash
# Approved Part 3b: resumable school backup setup. Password/private identity stay in memory;
# only the password-locked identity is written. Run interactively on the installation's Linux host.
set +x  # Even an inherited xtrace must never log a password.
set +a
unset PASSWORD REPLY SUGGESTION AGE_OUTPUT WORDS number
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
source "$SCRIPT_DIR/lib/backup-common.sh"
source "$SCRIPT_DIR/lib/backup-destinations.sh"
source "$SCRIPT_DIR/lib/backup-password.sh"

die() { echo "setup-school-backups: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required; see OPS.md"; }
for tool in docker age age-keygen script flock rclone findmnt sync; do need "$tool"; done
[[ -f .env ]] || die 'no .env; run this from an installed Lesson Plan Editor bundle'
exec 6<>/dev/tty || die 'an interactive terminal is required'
STATE_DIR="$REPO_DIR/out/ops/.school-backup-setup"
mkdir -p "$STATE_DIR"; chmod 0755 "$REPO_DIR/out/ops"; chmod 0700 "$STATE_DIR"
exec 7>"$STATE_DIR/.lock"
flock -n 7 || die 'school backup setup is already running'
TMP="$(mktemp -d)"; PASSWORD=''; AGE_OUTPUT=''; STAGE=setup
cleanup() { unset PASSWORD AGE_OUTPUT; rm -rf "$TMP"; }
trap cleanup EXIT

# One durable file per checkpoint; none contains a password or an unlocked identity.
remember() {
  local file="$STATE_DIR/$1" temporary
  temporary="$(mktemp "$STATE_DIR/.step.XXXXXX")"
  printf '%s\n' "$2" >"$temporary"; sync -f "$temporary"
  mv -f "$temporary" "$file"; sync -f "$STATE_DIR"
}
checkpoint() {
  remember "$1" done
  echo "setup-school-backups: $1 complete"
}
setting() {
  local key="$1" value="$2" temporary line
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* && "$value" != *\"* && "$value" != *\'* && "$value" != *'#'* && "$value" != *'\'* ]] \
    || die "$key contains a character the .env format cannot preserve"
  temporary="$(mktemp "$REPO_DIR/.env.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" == "$key="* ]] || printf '%s\n' "$line"
  done <.env >"$temporary"
  printf '%s=%s\n' "$key" "$value" >>"$temporary"
  sync -f "$temporary"; mv -f "$temporary" .env; sync -f "$REPO_DIR"
}
as_root() { if [[ "$EUID" -eq 0 ]]; then "$@"; else sudo "$@"; fi; }
# The external destination's guards read KIND/DEST_ROOT/WRITE_ROOT/MOUNT_INFO (lib/backup-destinations.sh).
select_external() {
  KIND="$(external_kind "$REMOTE")"; DEST_ROOT="$REMOTE"; WRITE_ROOT="$REMOTE"; MOUNT_INFO=''
}
ask() { printf '%s' "$1" >&6; IFS= read -r REPLY <&6 || die 'terminal input ended'; }
secret() { printf '%s' "$1" >&6; IFS= read -r -s REPLY <&6 || die 'terminal input ended'; printf '\n' >&6; }

DB_USER="$(env_get BACKUP_DB_USER)"; DB_USER="${DB_USER:-lesson3}"
DB_NAME="$(env_get BACKUP_DB_NAME)"; DB_NAME="${DB_NAME:-lesson3}"
INSTALLATION_ID="$(docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT installation_id FROM system_settings LIMIT 1;')" \
  || die 'cannot read the installation ID'
[[ "$INSTALLATION_ID" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]] || die 'no valid database installation ID'
if [[ -f "$STATE_DIR/installation-id" ]]; then
  [[ "$(cat "$STATE_DIR/installation-id")" == "$INSTALLATION_ID" ]] || die 'setup state belongs to another installation'
else remember installation-id "$INSTALLATION_ID"; fi
SCHOOL_NAME="$(docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT coalesce(school_name, 'School not named') FROM system_settings LIMIT 1;")"
DISK_DIR="$(destination_setting BACKUP_DISK_DIR /var/lib/lesson3-backups)"
[[ "$DISK_DIR" == /* ]] || die 'school setup requires an absolute BACKUP_DISK_DIR'
if [[ -f "$STATE_DIR/disk-dir" ]]; then
  [[ "$(cat "$STATE_DIR/disk-dir")" == "$DISK_DIR" ]] || die 'BACKUP_DISK_DIR changed during setup; restore its recorded setting before resuming'
else remember disk-dir "$DISK_DIR"; fi
[[ "$REPO_DIR" != *%* && "$REPO_DIR" != *$'\n'* ]] || die 'the installation path cannot contain a newline or cron percent sign'
[[ -n "$(env_get BACKUP_AGE_RECIPIENT)" ]] || die 'configure ARES’s BACKUP_AGE_RECIPIENT first'

if [[ ! -f "$STATE_DIR/external-dir" ]]; then
  REMOTE="$(destination_setting BACKUP_RCLONE_REMOTE '')"
  ask 'Is a USB backup drive connected? [y/N]: '
  case "$REPLY" in
    y|Y|yes|YES)
      ask 'Absolute backup folder on the mounted USB drive: '
      [[ "$REPLY" == /* ]] || die 'the USB folder must be an absolute path on the mounted drive'
      REMOTE="$REPLY" ;;
    n|N|no|NO|'') [[ "$REMOTE" != /* ]] || REMOTE='' ;;
    *) die 'answer y or n' ;;
  esac
  remember external-dir "$REMOTE"
fi
REMOTE="$(cat "$STATE_DIR/external-dir")"
setting BACKUP_DISK_DIR "$DISK_DIR"
setting BACKUP_RCLONE_REMOTE "$REMOTE"
# School setup normally runs as the operator. Elevate only creation of the protected host folder
# and installation of the root-owned cron file; the cron itself runs as this operator.
if [[ ! -d "$DISK_DIR" ]]; then
  mkdir -p "$DISK_DIR" 2>/dev/null || sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$DISK_DIR"
fi
mkdir "$TMP/marker"
printf '%s\n' "$INSTALLATION_ID" >"$TMP/marker/.lesson3-installation"
KIND=disk; DEST_ROOT="$DISK_DIR"; open_local; check_space; claim_marker
if [[ -n "$REMOTE" ]]; then
  select_external
  if [[ "$KIND" == usb ]]; then
    [[ -d "$REMOTE" ]] || die 'connect the selected USB drive before resuming setup'
    # Only here may the drive lack its sentinel: setup writes it just below.
    PREPARE_USB=1 open_local; check_space
  fi
  claim_marker; verify_mount
  if [[ "$KIND" == usb ]]; then
    [[ -f "$WRITE_ROOT/.lesson3-backup-volume" ]] || : >"$WRITE_ROOT/.lesson3-backup-volume"
    sync -f "$WRITE_ROOT"
  fi
fi
[[ -f "$STATE_DIR/destinations" ]] || checkpoint destinations

CANONICAL_KEY="$DISK_DIR/school-recovery-key.age"
STAGED_KEY="$DISK_DIR/.school-recovery-key.age.staged"
KEY_FILE="$CANONICAL_KEY"
EXISTING_RECIPIENT="$(env_get BACKUP_AGE_RECIPIENT_SCHOOL)"
if [[ ! -e "$KEY_FILE" && ! -e "$STAGED_KEY" && ( -f "$STATE_DIR/key" || -f "$STATE_DIR/recipient" ) ]]; then
  die 'the saved locked key is missing. Recover school-recovery-key.age from the backup drive; no new key was created'
fi
# A new setup may rotate an older school key (operator decision). Record the old public
# recipient before creating anything, so an interrupted run can finish that same rotation.
if [[ ! -e "$KEY_FILE" && ! -e "$STAGED_KEY" && -n "$EXISTING_RECIPIENT" ]]; then
  [[ -f "$STATE_DIR/previous-recipient" ]] || remember previous-recipient "$EXISTING_RECIPIENT"
  echo 'setup-school-backups: a new school key will be made. Older backups still need the earlier school key or ARES.'
fi
[[ ! -L "$KEY_FILE" && ! -L "$STAGED_KEY" ]] || die 'the recovery key must not be a symlink'
for candidate in "$KEY_FILE" "$STAGED_KEY"; do
  [[ ! -e "$candidate" || -f "$candidate" ]] || die 'the recovery key must be a regular file'
done
exec 5>"$DISK_DIR/.lesson3-school-key.lock"
flock -n 5 || die 'another setup is using this disk backup folder'
[[ -f "$KEY_FILE" || ! -f "$STAGED_KEY" ]] || KEY_FILE="$STAGED_KEY"
if [[ -f "$KEY_FILE" ]]; then
  secret 'Backup password to resume setup: '; PASSWORD="$REPLY"; REPLY=''
else
  mapfile -t WORDS < <(cut -f2 "$SCRIPT_DIR/vendor/eff_large_wordlist.txt")
  [[ "${#WORDS[@]}" -eq 7776 ]] || die 'the EFF word list is missing or damaged'
  SUGGESTION=''
  for ((i=0; i<4; i++)); do
    # Rejection sampling avoids modulo bias; use the OS random source, never bash RANDOM.
    while :; do
      number="$(od -An -N4 -tu4 /dev/urandom)"; number="${number//[[:space:]]/}"
      (( number < 4294967296 / 7776 * 7776 )) && break
    done
    SUGGESTION+="${SUGGESTION:+-}${WORDS[number % 7776]}"
  done
  printf '\nRECOVERY SHEET — suggested backup password: %s\nWrite this down; this sheet is never saved.\n' "$SUGGESTION" >&6
  ask 'Use the suggested password? [Y/n]: '
  case "$REPLY" in
    y|Y|yes|YES|'') PASSWORD="$SUGGESTION" ;;
    n|N|no|NO)
      secret 'Choose a backup password (at least 12 characters): '; PASSWORD="$REPLY"
      secret 'Type your chosen password again: '; [[ "$REPLY" == "$PASSWORD" ]] || die 'passwords did not match' ;;
    *) die 'answer y or n' ;;
  esac
  unset SUGGESTION WORDS
  [[ "${#PASSWORD}" -ge 12 && "$PASSWORD" != *[[:cntrl:]]* ]] || die 'use at least 12 characters without control characters'
  secret 'Type the written backup password back to confirm it: '
  [[ "$REPLY" == "$PASSWORD" ]] || die 'the written password did not match; no key was created'
  REPLY=''
  # Keep incomplete encryption off disk. Only complete, authenticated, armored ciphertext is
  # published, after fsync. A power cut before publication cannot orphan any existing backups.
  with_backup_password bash -o pipefail -c 'age-keygen 2>/dev/null | age -p -a' \
    || die 'key encryption did not finish; run setup again'
  [[ "$AGE_OUTPUT" == *'-----BEGIN AGE ENCRYPTED FILE-----'*'-----END AGE ENCRYPTED FILE-----'* ]] || die 'key encryption returned no locked identity'
  CIPHERTEXT="${AGE_OUTPUT#*-----BEGIN AGE ENCRYPTED FILE-----}"
  CIPHERTEXT="-----BEGIN AGE ENCRYPTED FILE-----${CIPHERTEXT%%-----END AGE ENCRYPTED FILE-----*}-----END AGE ENCRYPTED FILE-----"
  KEY_TEMP="$(mktemp "$DISK_DIR/.school-recovery-key.XXXXXX")"
  printf '%s\n' "$CIPHERTEXT" | tr -d '\r' >"$KEY_TEMP"
  unset CIPHERTEXT; AGE_OUTPUT=''
  sync -f "$KEY_TEMP"
  ln "$KEY_TEMP" "$STAGED_KEY" || die 'a complete staged key already exists; it was not replaced'
  rm -f "$KEY_TEMP"; sync -f "$DISK_DIR"
  KEY_FILE="$STAGED_KEY"
  # The staged key is complete and durable before publishing its recipient.
  echo 'setup-school-backups: key-staged complete'
fi
[[ ! -L "$KEY_FILE" ]] || die 'the recovery key must not be a symlink'
with_backup_password bash -o pipefail -c 'age -d "$1" | age-keygen -y' _ "$KEY_FILE" \
  || die 'that password did not unlock the saved school key; no key was replaced'
RECIPIENT="$(printf '%s' "$AGE_OUTPUT" | tr -d '\r' | grep -oE 'age1[0-9a-z]{40,100}' | tail -n1)" || die 'could not read the school public key'
[[ -n "$RECIPIENT" ]] || die 'could not read the school public key'
AGE_OUTPUT=''
if [[ -n "$EXISTING_RECIPIENT" && "$EXISTING_RECIPIENT" != "$RECIPIENT" ]]; then
  [[ ! -f "$STATE_DIR/recipient" && -f "$STATE_DIR/previous-recipient" && "$(cat "$STATE_DIR/previous-recipient")" == "$EXISTING_RECIPIENT" ]] \
    || die 'the configured school key changed during setup; no key was replaced'
fi
if [[ "$KEY_FILE" == "$STAGED_KEY" ]]; then
  ln "$STAGED_KEY" "$CANONICAL_KEY" || die 'a recovery key already exists; it was not replaced'
  rm -f "$STAGED_KEY"; sync -f "$DISK_DIR"; KEY_FILE="$CANONICAL_KEY"
fi
chmod 0600 "$KEY_FILE"
[[ -f "$STATE_DIR/key-created-at" ]] || remember key-created-at "$(date -u -r "$KEY_FILE" +%Y-%m-%dT%H:%M:%SZ)"
# Copies are ciphertext only. An existing different identity is never overwritten.
if [[ -n "$REMOTE" && ! -f "$STATE_DIR/key" ]]; then
  select_external
  [[ "$KIND" == remote ]] || open_local
  verify_mount; check_marker
  if [[ "$KIND" == usb ]]; then
    if [[ -e "$WRITE_ROOT/school-recovery-key.age" || -L "$WRITE_ROOT/school-recovery-key.age" ]]; then
      [[ -f "$WRITE_ROOT/school-recovery-key.age" && ! -L "$WRITE_ROOT/school-recovery-key.age" ]] || die 'the USB recovery key must be a regular file'
      cmp -s "$KEY_FILE" "$WRITE_ROOT/school-recovery-key.age" || die 'the USB already has a different recovery key'
    else
      KEY_COPY="$(mktemp "$WRITE_ROOT/.school-recovery-key.XXXXXX")"
      cp "$KEY_FILE" "$KEY_COPY"; sync -f "$KEY_COPY"
      ln "$KEY_COPY" "$WRITE_ROOT/school-recovery-key.age" || die 'the USB recovery key changed while copying'
      rm -f "$KEY_COPY"; sync -f "$WRITE_ROOT"
    fi
  else
    # Directory copy honours immutable checks; copyto does not on the installed rclone.
    mkdir "$TMP/key"; cp "$KEY_FILE" "$TMP/key/school-recovery-key.age"
    rclone copy "$TMP/key" "$WRITE_ROOT" --include '/school-recovery-key.age' --immutable --checksum
  fi
fi
[[ -f "$STATE_DIR/key" ]] || checkpoint key
setting BACKUP_AGE_RECIPIENT_SCHOOL "$RECIPIENT"
if [[ ! -f "$STATE_DIR/recipient" ]]; then
  # System reads env settings from the app process. Recreate only that service on its installed
  # image, so the new key and final receipt are reported immediately; never build or pull images.
  docker compose up -d --no-deps --no-build --pull never --wait app
  checkpoint recipient
fi

if [[ ! -f "$STATE_DIR/schedule" ]]; then
  CRON_DIR="${BACKUP_CRON_DIR:-/etc/cron.d}"
  CRON_USER="$(id -un)"; [[ "$CRON_USER" =~ ^[a-zA-Z0-9_.-]+$ ]] || die 'unsupported cron user name'
  printf -v COMMAND '%q ' "$REPO_DIR/scripts/backup-db.sh"
  printf -v LOG_FILE '%q' "$REPO_DIR/out/backup.log"
  cat >"$TMP/cron" <<CRON
# Lesson Plan Editor school backups: installed by setup-school-backups.sh
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
0 2 * * * $CRON_USER ${COMMAND}>> $LOG_FILE 2>&1
10 2 * * 0 $CRON_USER ${COMMAND}--label weekly >> $LOG_FILE 2>&1
20 2 1 * * $CRON_USER ${COMMAND}--label monthly >> $LOG_FILE 2>&1
CRON
  as_root install -d -m 0755 "$CRON_DIR"
  as_root install -o root -g root -m 0644 "$TMP/cron" "$CRON_DIR/lesson3-backups"
  [[ "$CRON_DIR" != /etc/cron.d ]] || as_root systemctl enable --now cron
  checkpoint schedule
fi

if [[ ! -f "$STATE_DIR/backup" ]]; then
  "$SCRIPT_DIR/backup-db.sh" || die 'first backup failed; fix the destination and resume setup'
  FILENAME="$(sed -n 's/.*"filename": "\([^"]*\)".*/\1/p' "$REPO_DIR/out/ops/backup/disk/daily.json" | head -n1)"
  [[ "$FILENAME" == *.dump.age && "$FILENAME" != */* ]] || die 'the first disk backup was not recorded'
  remember backup-file "$FILENAME"; checkpoint backup
fi
FILENAME="$(cat "$STATE_DIR/backup-file")"
CHECK_DB="lesson3_setup_${INSTALLATION_ID//-/}"
if [[ ! -f "$STATE_DIR/drill" ]]; then
  # Restore's existing safe drill path performs real decrypt/pg_restore/schema/content/DOCX/PDF checks.
  export AGE_IDENTITY="$KEY_FILE"
  with_backup_password bash "$SCRIPT_DIR/restore-db.sh" --local-file "$DISK_DIR/daily/$FILENAME" --into "$CHECK_DB" \
    || die 'first restore drill failed; resume setup after fixing the cause'
  [[ "$AGE_OUTPUT" == *'RESTORE DRILL PASSED'* ]] || die 'the first restore drill did not report success'
  AGE_OUTPUT=''
  docker compose exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$CHECK_DB\";" >/dev/null
  checkpoint drill
fi
[[ -f "$STATE_DIR/completed-at" ]] || remember completed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[[ -f "$STATE_DIR/completed" ]] || checkpoint completed
CREATED_AT="$(cat "$STATE_DIR/key-created-at")"
# Read-only public receipt for Manage. No password or private key, even encrypted, enters out/ops.
RECEIPT_TMP="$(mktemp "$REPO_DIR/out/ops/.backup-setup.XXXXXX")"
printf '{"version":1,"installationId":"%s","recipient":"%s","keyCreatedAt":"%s","completedAt":"%s"}\n' \
  "$INSTALLATION_ID" "$RECIPIENT" "$CREATED_AT" "$(cat "$STATE_DIR/completed-at")" >"$RECEIPT_TMP"
chmod 0644 "$RECEIPT_TMP"; sync -f "$RECEIPT_TMP"
mv -f "$RECEIPT_TMP" "$REPO_DIR/out/ops/backup-setup.json"; sync -f "$REPO_DIR/out/ops"
printf '\nRECOVERY SHEET — Lesson Plan Editor\nSchool: %s\nInstallation ID: %s\nDisk backups: %s\nUSB/cloud backups: %s\nLocked school key: school-recovery-key.age (beside the backups)\nBackup password: %s\n\n1. Plug in the backup drive.\n2. From this installation, run:\n   AGE_IDENTITY=/path/to/school-recovery-key.age scripts/restore-db.sh --local-file /path/to/backup.dump.age --into lesson3 --force-prod\n3. Type the backup password when asked, then follow the restore checks and confirmation.\n\nKeep this sheet away from the server. ARES’s recovery key still opens the backups.\n' \
  "$SCHOOL_NAME" "$INSTALLATION_ID" "$DISK_DIR" "${REMOTE:-not configured}" "$PASSWORD" >&6
unset PASSWORD REPLY
