#!/usr/bin/env bash
#
# Deploy Lesson3 on the Rock with a pre-migration safety snapshot (SPEC §11 / readiness #9).
#
#   git pull  ->  pre-migration encrypted snapshot (premigrate/)  ->  docker compose up -d --build
#
# The one-shot `migrate` service applies pending migrations before `app` starts. A bad migration could
# corrupt data, so we snapshot FIRST — recoverable via scripts/restore-db.sh. If the snapshot fails the
# deploy aborts (no snapshot, no migrate), unless BACKUP not yet configured (then it warns + continues,
# so the deploy path works before backups are wired up).
#
# USAGE:  scripts/deploy.sh            (run on the Rock, from the repo root)
set -euo pipefail

# Shared PATH + repo-root cd. See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

echo "deploy: git pull"
git pull --ff-only

SHA="$(git rev-parse --short HEAD)"
if [[ -f .env ]] && grep -q '^BACKUP_AGE_RECIPIENT=' .env && grep -q '^BACKUP_RCLONE_REMOTE=' .env; then
  echo "deploy: pre-migration snapshot (premigrate-$SHA)"
  scripts/backup-db.sh --label "premigrate-$SHA"
else
  echo "deploy: WARN backups not configured (.env lacks BACKUP_*) — skipping pre-migration snapshot" >&2
fi

echo "deploy: docker compose up -d --build (migrate runs first)"
docker compose up -d --build

echo "deploy: migrate log tail:"
docker compose logs migrate --tail 8 || true
echo "deploy: app status:"
docker compose ps app
echo "deploy: OK at $SHA"
