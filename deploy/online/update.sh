#!/usr/bin/env bash
# Apply this release bundle to an existing bundle-based Lesson3 installation.
set -euo pipefail

die() { echo "update: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required"; }
atomic_copy() {
  cp -p "$1" "$2.update-tmp"
  mv -f "$2.update-tmp" "$2"
}
set_phase() {
  printf '%s\n' "$1" >"$PENDING/phase.tmp"
  mv -f "$PENDING/phase.tmp" "$PENDING/phase"
}
semver_gt() {
  local a_major a_minor a_patch b_major b_minor b_patch
  IFS=. read -r a_major a_minor a_patch <<<"${1#v}"
  IFS=. read -r b_major b_minor b_patch <<<"${2#v}"
  a_patch="${a_patch:-0}"
  b_patch="${b_patch:-0}"
  ((10#$a_major > 10#$b_major)) && return 0
  ((10#$a_major < 10#$b_major)) && return 1
  ((10#$a_minor > 10#$b_minor)) && return 0
  ((10#$a_minor < 10#$b_minor)) && return 1
  ((10#$a_patch > 10#$b_patch))
}

case "${1:-}" in
  -h|--help|"")
    echo "Usage: [ALLOW_UNBACKED_UPDATE=1] ./update.sh /absolute/path/to/lesson3"
    [[ -n "${1:-}" ]] && exit 0 || exit 2
    ;;
esac

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$1"
[[ "$TARGET" == /* ]] || die "installation path must be absolute"
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || die "installation directory not found: $1"
[[ "$TARGET" != "$SOURCE" ]] || die "extract the new bundle elsewhere, then pass the existing installation path"
bundle_files=(compose.yaml .env.example VERSION DEPLOYMENT.md update.sh)
for file in "${bundle_files[@]}" scripts/backup-db.sh scripts/restore-db.sh \
  scripts/prune-db.sh scripts/heartbeat.sh scripts/lib.sh; do
  [[ -f "$SOURCE/$file" ]] || die "new release bundle is incomplete: missing $file"
done
[[ -f "$TARGET/compose.yaml" && -f "$TARGET/.env" && -f "$TARGET/.env.example" \
  && -f "$TARGET/VERSION" && -x "$TARGET/scripts/backup-db.sh" ]] \
  || die "target is not a bundle-based Lesson3 installation"

# The lock protects both the snapshot and phase transitions from concurrent updaters. A killed
# process may leave it behind; never guess that a different updater (or its Compose child) is dead.
PENDING="$TARGET/.update-pending"
LOCK="$TARGET/.update-lock"
mkdir "$LOCK" 2>/dev/null || die "update lock exists at $LOCK; confirm no updater is running before removing it"
STAGE=""
cleanup() {
  local status=$?
  [[ -z "$STAGE" ]] || rm -rf "$STAGE"
  rmdir "$LOCK"
  if [[ "$status" != 0 && -d "$PENDING" ]]; then
    echo "update: pending update retained at $PENDING; rerun the original pending bundle to resume." >&2
    if [[ "$(cat "$PENDING/phase" 2>/dev/null)" == activating ]]; then
      echo "update: a migration may have run. No rollback was attempted; restore the paired pre-migration database before using old images." >&2
    fi
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

new_version="$(tr -d '[:space:]' <"$SOURCE/VERSION")"
old_version="$(tr -d '[:space:]' <"$TARGET/VERSION")"
[[ "$new_version" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
  || die "new release has invalid version '$new_version'"
[[ "$old_version" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
  || die "installed release has invalid version '$old_version'"
phase=staged
if [[ -e "$PENDING" ]]; then
  for file in phase previous/VERSION previous/compose.yaml previous/.env.example; do
    [[ -f "$PENDING/$file" ]] || die "pending update state is incomplete; missing $file"
  done
  for file in "${bundle_files[@]}"; do
    cmp -s "$SOURCE/$file" "$PENDING/bundle/$file" \
      || die "conflicting bundle: pending update requires the original $file (including image digests)"
  done
  diff -qr "$SOURCE/scripts" "$PENDING/bundle/scripts" >/dev/null \
    || die "conflicting bundle: pending update requires the original scripts"
  phase="$(cat "$PENDING/phase")"
  case "$phase" in staged|backed-up|activating) ;; *) die "invalid pending phase '$phase'" ;; esac
  [[ "$phase" == staged || -f "$PENDING/backup.log" ]] \
    || die "pending backup evidence is missing; inspect $PENDING before proceeding"
  previous_version="$(tr -d '[:space:]' <"$PENDING/previous/VERSION")"
  [[ "$previous_version" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
    || die "invalid previous VERSION in pending update"
  [[ "$old_version" == "$previous_version" || ( "$phase" == activating && "$old_version" == "$new_version" ) ]] \
    || die "installed VERSION conflicts with the pending update"
  old_version="$previous_version"
  echo "update: resuming $old_version -> $new_version (phase: $phase)"
elif [[ "$new_version" == "$old_version" ]]; then
  cmp -s "$SOURCE/compose.yaml" "$TARGET/compose.yaml" \
    || die "same version '$old_version' has different Compose/image identity; refusing replacement"
  die "target already reports version '$old_version'; no pending update to resume"
fi
semver_gt "$new_version" "$old_version" \
  || die "refusing downgrade from '$old_version' to '$new_version'"
[[ -d "$PENDING" || ! -e "$TARGET/releases/$old_version" ]] \
  || die "legacy recovery snapshot exists for $old_version; inspect the unfinished older update before proceeding"
recovery_dir="$TARGET/releases/$old_version-to-$new_version"
[[ ! -e "$recovery_dir" ]] || die "recovery record already exists at $recovery_dir; refusing to overwrite it"

missing_keys="$(comm -23 \
  <(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' "$SOURCE/.env.example" | sort -u) \
  <(sed -nE 's/^([A-Z][A-Z0-9_]*)=.*/\1/p' "$TARGET/.env" | sort -u))"
if [[ -n "$missing_keys" ]]; then
  echo "update: the existing .env is missing keys required by the new template:" >&2
  printf '  %s\n' $missing_keys >&2
  die "add the missing keys from the new .env.example, then rerun the update"
fi

need docker
need curl
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required ('docker compose')"

if [[ ! -d "$PENDING" ]]; then
  STAGE="$(mktemp -d "$TARGET/.update-stage.XXXXXX")"
  mkdir "$STAGE/bundle" "$STAGE/previous"
  for file in "${bundle_files[@]}"; do
    cp -p "$SOURCE/$file" "$STAGE/bundle/"
  done
  cp -Rp "$SOURCE/scripts" "$STAGE/bundle/scripts"
  cp -p "$TARGET/compose.yaml" "$TARGET/VERSION" "$TARGET/.env.example" "$STAGE/previous/"
  cp -Rp "$TARGET/scripts" "$STAGE/previous/scripts"
  [[ ! -f "$TARGET/DEPLOYMENT.md" ]] || cp -p "$TARGET/DEPLOYMENT.md" "$STAGE/previous/"
  printf '%s\n' staged >"$STAGE/phase"
  mv "$STAGE" "$PENDING"
  STAGE=""
fi

# Resolve relative mounts and env_file against the installation, not the staged bundle directory.
cd "$TARGET"
compose=(docker compose --project-directory "$TARGET" --env-file "$TARGET/.env")
echo "update: downloading $new_version images before activation"
"${compose[@]}" -f "$PENDING/bundle/compose.yaml" pull

if [[ "$phase" != activating ]]; then
  cmp -s "$TARGET/compose.yaml" "$PENDING/previous/compose.yaml" \
    || die "active Compose changed outside the pending update; refusing to take a misleading backup"
fi
if [[ "$phase" == staged ]]; then
  if grep -Eq '^BACKUP_AGE_RECIPIENT=.+$' .env && grep -Eq '^BACKUP_RCLONE_REMOTE=.+$' .env; then
    echo "update: taking encrypted pre-migration backup (record: $PENDING/backup.log)"
    # Preserve the original backup's filename/destination, even when routine backups later run.
    if ! scripts/backup-db.sh --label "premigrate-$new_version" >"$PENDING/backup.log" 2>&1; then
      cat "$PENDING/backup.log" >&2
      die "pre-migration backup failed; no activation attempted"
    fi
    cat "$PENDING/backup.log"
    [[ ! -f out/ops/backup-status.json ]] || cp -p out/ops/backup-status.json "$PENDING/backup-status.json"
  elif [[ "${ALLOW_UNBACKED_UPDATE:-}" == "1" ]]; then
    echo "update: WARNING: proceeding without a backup (ALLOW_UNBACKED_UPDATE=1)" >&2
    printf '%s\n' 'Explicitly allowed without a backup: ALLOW_UNBACKED_UPDATE=1' >"$PENDING/backup.log"
  else
    die "backups are not configured; configure them first or explicitly set ALLOW_UNBACKED_UPDATE=1"
  fi
  set_phase backed-up
fi

# Mark the conservative migration boundary BEFORE replacing anything. A retry can repair a partial
# file activation, but must never replace the original snapshot or take a post-migration backup.
set_phase activating
for file in compose.yaml .env.example DEPLOYMENT.md; do
  atomic_copy "$PENDING/bundle/$file" "$TARGET/$file"
done
for file in "$PENDING/bundle/scripts/"*; do
  atomic_copy "$file" "$TARGET/scripts/$(basename "$file")"
done
echo "update: applying migrations and starting $new_version"
"${compose[@]}" -f "$TARGET/compose.yaml" up -d --no-build --pull never \
  || die "startup failed; previous deployment files are in $PENDING/previous"

admin_url="$(grep -E '^ADMIN_URL=' .env | tail -n1 | cut -d= -f2-)"
health_url="http://127.0.0.1:3001/login"
deadline=$((SECONDS + 300))
for _ in $(seq 1 60); do
  remaining=$((deadline - SECONDS))
  ((remaining > 0)) || break
  if curl -fsS --max-time "$((remaining < 5 ? remaining : 5))" "$health_url" >/dev/null 2>&1; then
    atomic_copy "$PENDING/bundle/VERSION" "$TARGET/VERSION"
    mkdir -p "$TARGET/releases"
    mv "$PENDING" "$recovery_dir"
    echo "update: Lesson3 $new_version is ready at ${admin_url%/}/login"
    echo "update: original deployment files and backup evidence retained at $recovery_dir"
    exit 0
  fi
  remaining=$((deadline - SECONDS))
  ((remaining > 0)) || break
  sleep "$((remaining < 5 ? remaining : 5))"
done

"${compose[@]}" -f "$TARGET/compose.yaml" logs --tail 100 >&2 || true
die "the updated app did not become ready within five minutes; do not start the old app without evaluating migrations"
