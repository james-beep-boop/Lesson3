#!/usr/bin/env bash
#
# Start the Next.js dev server for local browser verification.
#
# WHY THIS RUNS IN A CONTAINER RATHER THAN ON THE HOST. Since the Node 24 migration (#214), the app
# declares `devEngines: node >=24.19.0 <25` with `onFail: error`, and npm enforces that on every
# invocation. On a host running any other major — Node 25 on the current development Mac — `npx next
# dev` therefore aborts before Next is even reached:
#
#   npm error EBADDEVENGINES Invalid semver version ">=24.19.0 <25" does not match "v25.8.1"
#
# There is no way around it from the host: `./node_modules/.bin/next` would bypass npm, but
# populating `node_modules` needs `npm ci`, which is blocked by the same gate. And #214 deliberately
# removed the Volta pin rather than adopt a host version manager, on the grounds that "Docker remains
# the reproducible authority on every host". This script is that decision applied to the dev server.
#
# It is deliberately idempotent and safe to re-run: it brings up only what is missing.
#
# Usage:  scripts/dev-server.sh        (or via .claude/launch.json → "lesson3-dev")
# Stop:   Ctrl-C, or `docker rm -f lesson3-dev-server`
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
CONTAINER="lesson3-dev-server"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.local.yml)

if [ ! -f .env ]; then
  echo "error: no .env at the repo root." >&2
  echo "  It is gitignored and machine-local. Copy .env.example to .env and fill in" >&2
  echo "  PAYLOAD_SECRET and POSTGRES_PASSWORD (see the comments in that file)." >&2
  exit 1
fi

# The dev server runs INSIDE the compose network, so it reaches Postgres as `postgres:5432` — not the
# 127.0.0.1:55432 that `app/.env` uses for host-side tools. Both are correct for their own consumer;
# taking the values from the root .env is what keeps this one consistent with the containers.
PGPASSWORD_VALUE="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
SECRET_VALUE="$(grep -E '^PAYLOAD_SECRET=' .env | cut -d= -f2-)"
if [ -z "$PGPASSWORD_VALUE" ] || [ -z "$SECRET_VALUE" ]; then
  echo "error: .env is missing POSTGRES_PASSWORD or PAYLOAD_SECRET." >&2
  exit 1
fi

echo "› ensuring local Postgres is up (publishes 127.0.0.1:55432)"
"${COMPOSE[@]}" up -d postgres >/dev/null

if ! docker image inspect lesson3-deps >/dev/null 2>&1; then
  echo "› building the lesson3-deps image (first run only)"
  docker build --target deps -t lesson3-deps ./app
fi

# A stale container from a previous run holds the port and the name.
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

echo "› starting Next dev on http://localhost:${PORT}"
echo "  (sign in with the seeded local users — see AGENTS.md → Local stack)"

# --init so Ctrl-C reaches Next rather than being swallowed by PID 1.
# The anonymous volume on /app/node_modules keeps the image's dependency tree visible underneath the
# bind mount of the source — without it the mount hides node_modules and nothing resolves.
exec docker run --rm --init --name "$CONTAINER" \
  --network lesson3_default \
  -p "${PORT}:3000" \
  -v "$ROOT/app:/app" \
  -v /app/node_modules \
  -w /app \
  -e NODE_ENV=development \
  -e DATABASE_URI="postgres://lesson3:${PGPASSWORD_VALUE}@postgres:5432/lesson3" \
  -e PAYLOAD_SECRET="${SECRET_VALUE}" \
  -e ADMIN_URL="http://localhost:${PORT}" \
  -e ARTIFACT_CACHE_DIR=/tmp/artifact-cache \
  ${PUBLIC_LIBRARY_ENABLED:+-e PUBLIC_LIBRARY_ENABLED="$PUBLIC_LIBRARY_ENABLED"} \
  ${SERVER_URL:+-e SERVER_URL="$SERVER_URL"} \
  lesson3-deps npx next dev -H 0.0.0.0
