# Shared destination guards for backup and school setup. Requires lib.sh, die/need/positive_int and
# KIND, DEST_ROOT, TMP, RESERVE_BYTES; callers never bypass identity, mount or free-space checks.
# What a USB destination is mounted from, recorded once and compared before every write and prune.
mount_identity() { findmnt -T "$DEST_ROOT" -n -o TARGET,SOURCE,FSTYPE,MAJ:MIN; }

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
    [[ -f "$DEST_ROOT/.lesson3-backup-volume" || "${PREPARE_USB:-0}" == 1 ]] || die 'USB destination needs a regular .lesson3-backup-volume sentinel'
    MOUNT_INFO="$(mount_identity)" || die 'cannot identify the USB filesystem'
    root_device="$(findmnt -T / -n -o MAJ:MIN)" || die 'cannot identify the root filesystem'
    [[ -n "$MOUNT_INFO" && -n "$root_device" && "${MOUNT_INFO##* }" != "$root_device" ]] || die 'USB destination is backed by the root filesystem'
  fi
  exec 9<"$DEST_ROOT" || die 'cannot hold the backup directory open'
  WRITE_ROOT=/proc/self/fd/9
}

verify_mount() {
  [[ "$KIND" == usb ]] || return 0
  local current
  current="$(mount_identity)" || die 'backup filesystem disappeared'
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
  [[ "$KIND" != remote ]] || return 0
  local available margin key="BACKUP_${KIND^^}_MIN_FREE_BYTES" description=disk
  [[ "$KIND" != usb ]] || description="backup drive"
  margin="$(env_get "$key")"; margin="${margin:-$RESERVE_BYTES}"
  positive_int "$key" "$margin"
  available="$(free_kb "$WRITE_ROOT")" || die 'cannot read free disk space'
  [[ "$available" =~ ^[0-9]+$ ]] || die 'cannot read free disk space'
  STAGE=space
  (( available * 1024 >= ${SIZE:-0} + margin )) || die "$description nearly full — not writing this backup"
  STAGE=destination
}
