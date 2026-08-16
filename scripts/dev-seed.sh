#!/usr/bin/env bash
#
# Seed the local development database with the known-password accounts and one lesson plan.
#
# The companion to `dev-server.sh`, and the reason it exists: AGENTS.md's Local stack recipe used to
# say `cd app && npx payload run scripts/seed-local-dev.ts`, which is a HOST npm invocation and so
# hits the same `EBADDEVENGINES` wall as the dev server did (see that script's header). The recipe
# was therefore broken at the seeding step while working at the serving step — you could start an app
# you had no accounts for.
#
# ⚑ WHY IT SHARES THE POSTGRES CONTAINER'S NETWORK NAMESPACE, which is the one genuinely surprising
# line here. `app/scripts/seed-local-dev.ts` refuses to run unless `DATABASE_URI` names a LOOPBACK
# host — it mints accounts with a known password, so it must be impossible to aim at a shared
# database (`app/scripts/lib/localDbGuard.ts`, pinned by its own unit spec). A container on the
# compose network reaches Postgres as `postgres:5432`, which that guard correctly rejects. Joining
# the Postgres container's own namespace instead makes `127.0.0.1:5432` genuinely BE Postgres, so the
# guard passes on a URI that is honestly local rather than one talked past it.
#
# Usage:  scripts/dev-seed.sh
set -euo pipefail

# Sourcing the prelude cds to the repo root — see its header.
# shellcheck source=scripts/lib/dev-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/dev-env.sh"

dev_require_env_file
PGPASSWORD_VALUE="$(dev_env_value POSTGRES_PASSWORD)"
if [ -z "$PGPASSWORD_VALUE" ]; then
  echo "error: .env has no POSTGRES_PASSWORD." >&2
  exit 1
fi

echo "› ensuring local Postgres is up and healthy"
dev_ensure_postgres
dev_ensure_deps_image

PG_CONTAINER="$("${DEV_COMPOSE[@]}" ps -q postgres)"

echo "› seeding"
# DATABASE_URI is overridden rather than taken from `.env` precisely because of the loopback guard
# above; everything else comes from the file, as in dev-server.sh.
dev_deps_mounts
docker run --rm \
  --network "container:${PG_CONTAINER}" \
  "${DEV_DEPS_MOUNTS[@]}" \
  --env-file .env \
  -e NODE_ENV=development \
  -e DATABASE_URI="postgres://lesson3:${PGPASSWORD_VALUE}@127.0.0.1:5432/lesson3" \
  -e ARTIFACT_CACHE_DIR=/tmp/artifact-cache \
  lesson3-deps npx payload run scripts/seed-local-dev.ts
