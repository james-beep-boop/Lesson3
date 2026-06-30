#!/usr/bin/env bash
#
# App-alive heartbeat (SPEC §11 / readiness #9 — monitoring). A PUSH / dead-man's-switch check, the
# right fit for a Tailscale-only box that an external pinger can't reach: the Rock pings OUT only when
# the app actually answers, and the monitoring provider alerts if the pings STOP (app down, box down,
# cron dead). Run from cron every few minutes.
#
#   HEALTHCHECK_APP_URL   (.env or env)  the provider ping URL (e.g. https://hc-ping.com/<uuid>)
#   HEARTBEAT_APP_URL     optional       what to probe for liveness (default http://localhost:3001/)
#
# Cron (crontab -e):
#   */5 * * * * /srv/lesson3/scripts/heartbeat.sh >> /srv/lesson3/out/heartbeat.log 2>&1
set -euo pipefail
export PATH="$HOME/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

REPO_DIR="${BACKUP_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR"

# Read a single key from .env without sourcing it (see backup-db.sh). Env wins over .env.
env_get() {
  local k="$1"; local v="${!k:-}"
  if [[ -z "$v" && -f .env ]]; then
    v="$(grep -E "^${k}=" .env | tail -n1 | cut -d= -f2-)"
    v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  fi
  printf '%s' "$v"
}

PING_URL="$(env_get HEALTHCHECK_APP_URL)"
PROBE_URL="${HEARTBEAT_APP_URL:-http://localhost:3001/}"

if [[ -z "$PING_URL" ]]; then
  echo "heartbeat: HEALTHCHECK_APP_URL not set — nothing to ping (see docs/OPS.md)"; exit 0
fi

# Liveness probe: any HTTP response (incl. the / -> 307 redirect to login) means the app is serving.
# `--fail` would treat 307 as success only with -L; we accept any status, so just check curl connects.
if curl -sS -m 10 -o /dev/null -w '%{http_code}' "$PROBE_URL" | grep -qE '^[1-5][0-9][0-9]$'; then
  curl -fsS -m 15 --retry 3 "$PING_URL" -o /dev/null \
    && echo "heartbeat: app responded — pinged OK" \
    || { echo "heartbeat: WARN ping failed (app was up)" >&2; exit 1; }
else
  echo "heartbeat: app did NOT respond at $PROBE_URL — NOT pinging (dead-man's-switch will alert)" >&2
  exit 1
fi
