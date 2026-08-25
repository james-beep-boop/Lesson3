#!/usr/bin/env bash
# Apply this release bundle to an existing bundle-based Lesson3 installation.
set -euo pipefail

die() { echo "update: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required"; }
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
[[ -f "$SOURCE/compose.yaml" && -f "$SOURCE/.env.example" && -f "$SOURCE/VERSION" ]] \
  || die "new release bundle is incomplete"
[[ -f "$TARGET/compose.yaml" && -f "$TARGET/.env" && -f "$TARGET/.env.example" \
  && -f "$TARGET/VERSION" && -x "$TARGET/scripts/backup-db.sh" ]] \
  || die "target is not a bundle-based Lesson3 installation"

new_version="$(tr -d '[:space:]' <"$SOURCE/VERSION")"
old_version="$(tr -d '[:space:]' <"$TARGET/VERSION")"
[[ "$new_version" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
  || die "new release has invalid version '$new_version'"
[[ "$old_version" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
  || die "installed release has invalid version '$old_version'"
[[ -n "$new_version" && "$new_version" != "$old_version" ]] \
  || die "target already reports version '$old_version'"
semver_gt "$new_version" "$old_version" \
  || die "refusing downgrade from '$old_version' to '$new_version'"

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

if grep -Eq '^BACKUP_AGE_RECIPIENT=.+$' "$TARGET/.env" \
  && grep -Eq '^BACKUP_RCLONE_REMOTE=.+$' "$TARGET/.env"; then
  echo "update: taking encrypted pre-migration backup"
  (cd "$TARGET" && scripts/backup-db.sh --label "premigrate-$new_version")
elif [[ "${ALLOW_UNBACKED_UPDATE:-}" == "1" ]]; then
  echo "update: WARNING: proceeding without a backup (ALLOW_UNBACKED_UPDATE=1)" >&2
else
  die "backups are not configured; configure them first or explicitly set ALLOW_UNBACKED_UPDATE=1"
fi

recovery_dir="$TARGET/releases/$old_version"
mkdir -p "$recovery_dir"
cp -p "$TARGET/compose.yaml" "$TARGET/VERSION" "$TARGET/.env.example" "$recovery_dir/"

cp -p "$SOURCE/compose.yaml" "$SOURCE/.env.example" \
  "$SOURCE/DEPLOYMENT.md" "$TARGET/"
mkdir -p "$TARGET/scripts"
cp -p "$SOURCE/scripts/"* "$TARGET/scripts/"

cd "$TARGET"
echo "update: downloading $new_version images"
docker compose pull
cp -p "$SOURCE/VERSION" "$TARGET/VERSION"
echo "update: applying migrations and starting $new_version"
if ! docker compose up -d --no-build; then
  echo "update: startup failed. Previous deployment files are in $recovery_dir." >&2
  echo "update: a migration may have run; restore the pre-migration database before running old images." >&2
  exit 1
fi

admin_url="$(grep -E '^ADMIN_URL=' .env | tail -n1 | cut -d= -f2-)"
health_url="http://127.0.0.1:3001/login"
for _ in $(seq 1 60); do
  if curl -fsS "$health_url" >/dev/null 2>&1; then
    echo "update: Lesson3 $new_version is ready at ${admin_url%/}/login"
    exit 0
  fi
  sleep 5
done

docker compose logs --tail 100 >&2 || true
die "the updated app did not become ready within five minutes; do not start the old app without evaluating migrations"
