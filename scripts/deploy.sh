#!/usr/bin/env bash
#
# Deploy Lesson3 on the Rock with a pre-migration safety snapshot (SPEC §11 / readiness #9).
#
#   git pull  ->  pre-migration encrypted snapshot (premigrate/)  ->  docker compose up -d --build
#
# The one-shot `migrate` service applies pending migrations before `app` starts. A bad migration could
# corrupt data, so we snapshot FIRST — recoverable via scripts/restore-db.sh. NO SNAPSHOT, NO MIGRATE:
# if backups aren't configured the deploy REFUSES, so a destructive migration can't run with no restore
# point. Before backups are wired up, set ALLOW_UNBACKED_DEPLOY=1 to proceed explicitly (eyes open).
#
# USAGE:  scripts/deploy.sh                          (run on the Rock, from the repo root)
#         ALLOW_UNBACKED_DEPLOY=1 scripts/deploy.sh  (deploy before backups are configured)
set -euo pipefail

# Shared PATH + repo-root cd. See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

die() { echo "deploy: ERROR: $*" >&2; exit 1; }

echo "deploy: git pull"
git pull --ff-only

SHA="$(git rev-parse --short HEAD)"
if [[ -f .env ]] && grep -q '^BACKUP_AGE_RECIPIENT=' .env && grep -q '^BACKUP_RCLONE_REMOTE=' .env; then
  echo "deploy: pre-migration snapshot (premigrate-$SHA)"
  scripts/backup-db.sh --label "premigrate-$SHA"
elif [[ "${ALLOW_UNBACKED_DEPLOY:-}" == "1" ]]; then
  echo "deploy: WARN backups not configured — proceeding WITHOUT a pre-migration snapshot (ALLOW_UNBACKED_DEPLOY=1)" >&2
else
  die "backups not configured (.env lacks BACKUP_AGE_RECIPIENT/BACKUP_RCLONE_REMOTE) — refusing to migrate without a restore point. Configure backups (docs/OPS.md) or re-run with ALLOW_UNBACKED_DEPLOY=1."
fi

echo "deploy: docker compose up -d --build (migrate runs first)"
docker compose up -d --build

echo "deploy: migrate log tail:"
docker compose logs migrate --tail 8 || true
echo "deploy: app status:"
docker compose ps app
echo "deploy: OK at $SHA"
