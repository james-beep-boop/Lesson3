#!/usr/bin/env bash
# Build the small, checksummed deployment artifact attached to a GitHub release.
set -euo pipefail

die() { echo "build-local-deploy-bundle: ERROR: $*" >&2; exit 1; }

VERSION="${1:-}"
OUTPUT_DIR="${2:-}"
APP_DIGEST="${3:-}"
MIGRATE_DIGEST="${4:-}"
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] \
  || die "version must be a release tag such as v0.77 or v1.2.3"
[[ -n "$OUTPUT_DIR" ]] \
  || die "usage: $0 v0.77 OUTPUT_DIR APP_DIGEST MIGRATE_DIGEST"
[[ "$APP_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "invalid application image digest"
[[ "$MIGRATE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "invalid migration image digest"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$(mkdir -p "$OUTPUT_DIR" && cd "$OUTPUT_DIR" && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
BUNDLE="$STAGE/lesson3-deploy"
mkdir -p "$BUNDLE/scripts" "$BUNDLE/out/ops" "$BUNDLE/out/resource-library"

sed \
  -e "s/__LESSON3_IMAGE_TAG__/$VERSION/g" \
  -e "s/__LESSON3_APP_DIGEST__/$APP_DIGEST/g" \
  -e "s/__LESSON3_MIGRATE_DIGEST__/$MIGRATE_DIGEST/g" \
  "$ROOT/deploy/online/compose.template.yaml" >"$BUNDLE/compose.yaml"
cp "$ROOT/.env.example" "$BUNDLE/.env.example"
cp "$ROOT/deploy/online/install.sh" "$ROOT/deploy/online/update.sh" "$BUNDLE/"
cp "$ROOT/docs/LOCAL-SERVER-DEPLOYMENT.md" "$BUNDLE/DEPLOYMENT.md"
cp "$ROOT/scripts/backup-db.sh" "$ROOT/scripts/restore-db.sh" "$ROOT/scripts/prune-db.sh" \
  "$ROOT/scripts/heartbeat.sh" "$ROOT/scripts/lib.sh" "$BUNDLE/scripts/"
printf '%s\n' "$VERSION" >"$BUNDLE/VERSION"
touch "$BUNDLE/out/ops/.gitkeep" "$BUNDLE/out/resource-library/.gitkeep"
chmod 0755 "$BUNDLE/install.sh" "$BUNDLE/update.sh" "$BUNDLE/scripts/"*.sh

archive="$OUTPUT_DIR/lesson3-online-deploy.tar.gz"
checksum="$archive.sha256"
tar -C "$STAGE" -czf "$archive" lesson3-deploy
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && sha256sum "$(basename "$archive")") >"$checksum"
else
  digest="$(shasum -a 256 "$archive" | awk '{print $1}')"
  printf '%s  %s\n' "$digest" "$(basename "$archive")" >"$checksum"
fi
echo "$archive"
echo "$checksum"
