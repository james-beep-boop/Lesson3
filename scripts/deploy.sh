#!/usr/bin/env bash
#
# Deploy Lesson3 on the Rock with a pre-migration safety snapshot (SPEC §11 / readiness #9).
#
#   git pull  ->  pre-migration encrypted snapshot (premigrate/)  ->  build app+migrate  ->  up -d
#
# The one-shot `migrate` service applies pending migrations before `app` starts. A bad migration could
# corrupt data, so we snapshot FIRST — recoverable via scripts/restore-db.sh. NO SNAPSHOT, NO MIGRATE:
# if backups aren't configured the deploy REFUSES, so a destructive migration can't run with no restore
# point. Before backups are wired up, set ALLOW_UNBACKED_DEPLOY=1 to proceed explicitly (eyes open).
#
# ONLY THE IMAGES THAT CARRY APP SOURCE ARE REBUILT (`app`, `migrate`). `gotenberg` is rebuilt only when
# something under gotenberg/ actually changed, or when it has no image yet. Why (2026-07-26): a bare
# `up -d --build` rebuilds every service, and gotenberg's Dockerfile installs ttf-mscorefonts-installer
# by fetching Microsoft fonts from an EXTERNAL mirror. That fetch failed mid-deploy, dpkg exited 100,
# compose aborted the whole run — and an app-only change (no gotenberg edits, no migration) did not
# ship. An unchanged sidecar's flaky third-party download must not be able to block shipping app code.
#
# USAGE:  scripts/deploy.sh                          (run on the Rock, from the repo root)
#         ALLOW_UNBACKED_DEPLOY=1 scripts/deploy.sh  (deploy before backups are configured)
#         FORCE_SIDECAR_BUILD=1 scripts/deploy.sh    (also rebuild gotenberg, e.g. to refresh fonts)
set -euo pipefail

# Shared PATH + repo-root cd. See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

die() { echo "deploy: ERROR: $*" >&2; exit 1; }

echo "deploy: git pull"
# Remember where we were so we can tell whether the sidecar's build inputs actually moved.
PREV_REF="$(git rev-parse HEAD)"
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

# --- gotenberg: rebuild only when warranted (see the header) --------------------------------------
# `config --images <service>` resolves the project-prefixed name compose would use, so this does not
# hardcode `lesson3-gotenberg` and keeps working under a different COMPOSE_PROJECT_NAME.
GOTENBERG_IMAGE="$(docker compose config --images gotenberg 2>/dev/null | head -1)"
sidecar_reason=""
if [[ "${FORCE_SIDECAR_BUILD:-}" == "1" ]]; then
  sidecar_reason="FORCE_SIDECAR_BUILD=1"
elif [[ -z "$GOTENBERG_IMAGE" ]] || ! docker image inspect "$GOTENBERG_IMAGE" >/dev/null 2>&1; then
  # First deploy on this box, or the image was pruned — it must be built or `up` cannot start it.
  sidecar_reason="no existing image"
elif ! git diff --quiet "$PREV_REF" HEAD -- gotenberg/; then
  # Its own build inputs moved in this pull, so a stale image would be wrong. A failure here SHOULD
  # abort: you asked for the change.
  sidecar_reason="gotenberg/ changed in this pull"
fi

if [[ -n "$sidecar_reason" ]]; then
  echo "deploy: building gotenberg ($sidecar_reason)"
  docker compose build gotenberg
else
  echo "deploy: skipping gotenberg build (unchanged; reusing $GOTENBERG_IMAGE)"
fi

echo "deploy: building app + migrate"
docker compose build app migrate

# No --build here: the images we intend to refresh were just built above, so an unchanged sidecar's
# external font download is never on this path.
echo "deploy: docker compose up -d (migrate runs first)"
docker compose up -d

echo "deploy: migrate log tail:"
docker compose logs migrate --tail 8 || true
echo "deploy: app status:"
docker compose ps app
echo "deploy: OK at $SHA"
