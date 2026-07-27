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
# ONLY THE IMAGES THAT CARRY APP SOURCE ARE REBUILT (`app`, `migrate`). `gotenberg` rebuilds only when
# gotenberg/'s git tree hash differs from the label on the existing image — an unchanged sidecar's flaky
# external font download must not be able to block shipping app code (incident 2026-07-26). Mechanism:
# the block below. Operator guide and recovery path: docs/OPS.md -> Deploy.
#
# USAGE:  scripts/deploy.sh                          (run on the Rock, from the repo root)
#         ALLOW_UNBACKED_DEPLOY=1 scripts/deploy.sh  (deploy before backups are configured)
#         FORCE_SIDECAR_BUILD=1 scripts/deploy.sh    (rebuild gotenberg even if it already matches)
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
# `PREV_REF..HEAD -- gotenberg/` and was wrong in exactly the case this exists for: after a FAILED sidecar
# build you re-run at the same commit, so the diff is empty and the stale image would be reused. A failed
# build writes no label, so the tree-hash comparison self-heals instead.
#
# `config --images <service>` resolves the project-prefixed name compose would use, so this does not
# hardcode `lesson3-gotenberg` and survives a different COMPOSE_PROJECT_NAME.
GOTENBERG_IMAGE="$(docker compose config --images gotenberg 2>/dev/null | head -1)"

# The tree hash of gotenberg/ at the checked-out commit — changes iff anything in that directory does.
# `--verify -q` matters twice: a bare `rev-parse` echoes an unresolvable argument to STDOUT before
# failing, which would inject a stray line into the label; and an UNRESOLVED hash must never become a
# comparable value. Two "don't know"s comparing equal would assert provenance we do not have — the same
# not-observed-different-means-equal mistake the git-history version made.
GOTENBERG_TREE="$(git rev-parse --verify -q "HEAD:gotenberg" 2>/dev/null || true)"
[[ -n "$GOTENBERG_TREE" ]] || die "cannot resolve the gotenberg/ tree hash — refusing to reason about sidecar provenance"
export GOTENBERG_TREE   # consumed by the build label in docker-compose.yml

# Empty covers every "no recorded tree" case — no image, pruned image, or an image predating the label —
# and empty never equals a hash, so all of them rebuild, which is the safe default. One inspect call: a
# missing image simply exits non-zero.
built_tree="$(docker image inspect "$GOTENBERG_IMAGE" \
  --format '{{index .Config.Labels "org.lesson3.sidecar-tree"}}' 2>/dev/null || true)"

if [[ "${FORCE_SIDECAR_BUILD:-}" == "1" ]]; then
  echo "deploy: building gotenberg (FORCE_SIDECAR_BUILD=1)"
  docker compose build gotenberg
elif [[ "$built_tree" == "$GOTENBERG_TREE" ]]; then
  echo "deploy: skipping gotenberg build (image already built from this tree: $GOTENBERG_TREE)"
else
  echo "deploy: building gotenberg (tree $GOTENBERG_TREE != built ${built_tree:-<none recorded>})"
  docker compose build gotenberg
fi

echo "deploy: building app + migrate"
docker compose build app migrate

# `--no-build` makes the claim above TRUE. Plain `up -d` silently builds a service whose image is
# missing, so an absent sidecar would trigger the font fetch here — after the snapshot, and without the
# decision above ever saying so. Everything legitimate was built already; anything missing should fail
# loudly instead.
echo "deploy: docker compose up -d (migrate runs first)"
docker compose up -d --no-build

echo "deploy: migrate log tail:"
docker compose logs migrate --tail 8 || true
echo "deploy: app status:"
docker compose ps app
echo "deploy: OK at $SHA"
