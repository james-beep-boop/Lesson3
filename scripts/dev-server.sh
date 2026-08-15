#!/usr/bin/env bash
#
# Start the Next.js dev server for local browser verification.
#
# WHY THIS RUNS IN A CONTAINER RATHER THAN ON THE HOST. Since the Node 24 migration (#214) the app
# declares `devEngines: node >=24.19.0 <25` with `onFail: error`, and npm enforces that on every
# invocation — so `npx next dev` on a host running any other major aborts before Next is reached:
#
#   npm error EBADDEVENGINES Invalid semver version ">=24.19.0 <25" does not match "v25.8.1"
#
# There is no host-side way around it: `./node_modules/.bin/next` would bypass npm, but populating
# `node_modules` needs `npm ci`, blocked by the same gate. #214 removed the Volta pin rather than
# adopt a host version manager, on the grounds that "Docker remains the reproducible authority on
# every host" (DECISIONS 2026-08-12); this is that decision applied to the dev server.
#
# Idempotent and safe to re-run: it brings up only what is missing.
#
# Usage:  scripts/dev-server.sh          (or via .claude/launch.json → "lesson3-dev")
#         PUBLIC_LIBRARY_ENABLED=1 SERVER_URL=http://localhost:3000 scripts/dev-server.sh
# Stop:   Ctrl-C
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/lib/dev-env.sh
source scripts/lib/dev-env.sh

dev_require_env_file
echo "› ensuring local Postgres is up and healthy (publishes 127.0.0.1:55432)"
dev_ensure_postgres
dev_ensure_deps_image

# A stale container from a previous run holds the port and the name. `-v` too, so the run's volumes
# go with it — without it a forced removal orphans them, and this machine had already accumulated
# 8 GB of exactly that.
docker rm -f -v lesson3-dev-server >/dev/null 2>&1 || true

echo "› starting Next dev on http://localhost:3000"
echo "  (sign in with the seeded local users — see AGENTS.md → Local stack)"

# ⚑ `--env-file .env` rather than a hand-picked list of `-e` flags. The root `.env` is the file the
# compose services themselves read, and it ALREADY carries the container-side
# `DATABASE_URI=…@postgres:5432/lesson3` — an earlier version of this script parsed POSTGRES_PASSWORD
# out of that same file in order to rebuild the line sitting two rows below it. Passing the file also
# supplies what the hand-written list had silently omitted (`GOTENBERG_URL`, so PDF preview works;
# `LOG_LEVEL`; the rate-limit knobs), and keeps this invocation inside the reach of the env-template
# parity guard instead of beside it.
#
# The three `-e` lines below are genuine overrides and beat `--env-file` regardless of flag order
# (verified). `NODE_ENV` matters most: the root `.env` says `production`, under which Payload runs
# migrate-mode with schema push off — the same trap AGENTS.md flags for the test-probe recipe.
#
# `--env VAR` with no `=` forwards the caller's value and is a true no-op when unset (verified), so
# the feature switches pass through without the unquotable `${VAR:+-e VAR="$VAR"}` idiom.
#
# `--init` so Ctrl-C reaches Next rather than being swallowed by PID 1.
exec docker run --rm --init --name lesson3-dev-server \
  --network "$(dev_compose_network)" \
  -p 3000:3000 \
  -v "$PWD/app:/app" \
  -v "$(dev_node_modules_volume):/app/node_modules" \
  -w /app \
  --env-file .env \
  -e NODE_ENV=development \
  -e ADMIN_URL=http://localhost:3000 \
  -e ARTIFACT_CACHE_DIR=/tmp/artifact-cache \
  --env PUBLIC_LIBRARY_ENABLED \
  --env SERVER_URL \
  lesson3-deps npx next dev -H 0.0.0.0
