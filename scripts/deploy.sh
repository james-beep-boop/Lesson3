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
# the git tree hash of gotenberg/ differs from the one recorded on the existing image (a build label —
# see docker-compose.yml). Why (2026-07-26): a bare `up -d --build` rebuilds every service, and
# gotenberg's Dockerfile installs ttf-mscorefonts-installer by fetching Microsoft fonts from an EXTERNAL
# mirror. That fetch failed mid-deploy, dpkg exited 100, compose aborted the whole run — and an app-only
# change (no gotenberg edits, no migration) did not ship. An unchanged sidecar's flaky third-party
# download must not be able to block shipping app code.
#
# The comparison is against the IMAGE, not git history, so it stays correct across retries: a failed
# build writes no label, so re-running rebuilds rather than silently reusing a stale sidecar.
#
# USAGE:  scripts/deploy.sh                          (run on the Rock, from the repo root)
#         ALLOW_UNBACKED_DEPLOY=1 scripts/deploy.sh  (deploy before backups are configured)
#         FORCE_SIDECAR_BUILD=1 scripts/deploy.sh    (rebuild gotenberg even if it matches)
#         SKIP_SIDECAR_BUILD=1 scripts/deploy.sh      (skip it even if it does NOT match — loud warning;
#                                                      for a known-unchanged sidecar when the font
#                                                      mirror is down)
#
# NOTE: this script pulls ITSELF. A change to deploy.sh therefore takes effect on the NEXT run, not the
# one that pulls it — bash has already read the old text. Re-run once after any deploy.sh change.
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

# --- gotenberg: rebuild only when its own tree differs from what the image was built FROM ----------
# Compared against PROVENANCE ON THE IMAGE, never against git history. An earlier version diffed
# `PREV_REF..HEAD -- gotenberg/` and was wrong in exactly the case this code exists for: after a failed
# sidecar build you re-run at the same commit, so the diff is empty, the stale image passes inspection,
# and the deploy silently ships the OLD sidecar. Because a failed build never writes the label, the
# tree-hash comparison is self-healing — a retry rebuilds. (Found in review, 2026-07-26.)
#
# `config --images <service>` resolves the project-prefixed name compose would use, so this does not
# hardcode `lesson3-gotenberg` and keeps working under a different COMPOSE_PROJECT_NAME.
GOTENBERG_IMAGE="$(docker compose config --images gotenberg 2>/dev/null | head -1)"
# The tree hash of gotenberg/ at the checked-out commit — changes iff anything in that directory does.
GOTENBERG_TREE="$(git rev-parse "HEAD:gotenberg" 2>/dev/null || echo unknown)"
export GOTENBERG_TREE   # consumed by the build label in docker-compose.yml
built_tree=""
if [[ -n "$GOTENBERG_IMAGE" ]] && docker image inspect "$GOTENBERG_IMAGE" >/dev/null 2>&1; then
  built_tree="$(docker image inspect "$GOTENBERG_IMAGE" \
    --format '{{index .Config.Labels "org.lesson3.sidecar-tree"}}' 2>/dev/null || true)"
else
  built_tree="<no image>"
fi

sidecar_reason=""
if [[ "${FORCE_SIDECAR_BUILD:-}" == "1" ]]; then
  sidecar_reason="FORCE_SIDECAR_BUILD=1"
elif [[ "$built_tree" != "$GOTENBERG_TREE" ]]; then
  # Covers a real gotenberg/ change, a missing/pruned image, AND an image predating this label. A
  # failure here SHOULD abort — we cannot prove the running sidecar matches the source.
  sidecar_reason="tree $GOTENBERG_TREE != built ${built_tree:-<unlabelled>}"
fi

if [[ -n "$sidecar_reason" ]] && [[ "${SKIP_SIDECAR_BUILD:-}" == "1" ]]; then
  # Deliberate, LOUD escape hatch for a known-unchanged sidecar when the external font mirror is down
  # (the incident that started all this). Never silent: you have to ask for it.
  echo "deploy: WARN skipping gotenberg build despite [$sidecar_reason] — SKIP_SIDECAR_BUILD=1" >&2
  echo "deploy: WARN the running sidecar is NOT proven to match gotenberg/ at $SHA" >&2
elif [[ -n "$sidecar_reason" ]]; then
  echo "deploy: building gotenberg ($sidecar_reason)"
  docker compose build gotenberg
else
  echo "deploy: skipping gotenberg build (image already built from this tree: $GOTENBERG_TREE)"
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
