#!/usr/bin/env bash
#
# Generate a local .env from .env.example with fresh random secrets.
# Run once per machine. .env is gitignored — never commit it.
#
# Fills in PAYLOAD_SECRET, POSTGRES_PASSWORD, and the password placeholder in
# DATABASE_URI; everything else keeps its .env.example default (all optional
# settings have safe defaults for a local/demo stack).
#
# Usage: scripts/create-env.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -f .env ]; then
  echo "error: .env already exists. Remove it first if you want to regenerate." >&2
  exit 1
fi

PAYLOAD_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# Write through a restricted temp file so secrets are never world-readable,
# even briefly. umask 077 → file mode 0600.
TMP=$(mktemp .env.tmp.XXXXXX)
chmod 600 "${TMP}"
sed \
  -e "s|^PAYLOAD_SECRET=.*|PAYLOAD_SECRET=${PAYLOAD_SECRET}|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" \
  -e "s|REPLACE_WITH_POSTGRES_PASSWORD|${POSTGRES_PASSWORD}|g" \
  .env.example > "${TMP}"
mv "${TMP}" .env

echo "Created .env."
echo "  PAYLOAD_SECRET  — random 32-byte hex"
echo "  POSTGRES_PASSWORD — random 16-byte hex"
echo "  DATABASE_URI    — points at the compose-internal postgres service (correct for docker compose up)"
echo "See docker-compose.local.yml for host-side access on 127.0.0.1:55432 (needed for app/.env)."
