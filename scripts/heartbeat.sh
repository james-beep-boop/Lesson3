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

# Shared PATH + repo-root cd + env_get (reads .env keys without sourcing it). See scripts/lib.sh.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PING_URL="$(env_get HEALTHCHECK_APP_URL)"
PROBE_URL="${HEARTBEAT_APP_URL:-http://localhost:3001/}"

if [[ -z "$PING_URL" ]]; then
  echo "heartbeat: HEALTHCHECK_APP_URL not set — nothing to ping (see docs/OPS.md)"; exit 0
fi

# Liveness probe: accept ONLY a healthy 2xx/3xx (the normal `/` is a 307 redirect to login). A 4xx/5xx
# (e.g. Payload/Postgres broken → 500) is NOT healthy, so we DON'T ping — the dead-man's-switch then
# alerts instead of monitoring falsely reporting green. A connection failure → empty code → also not ok.
CODE="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$PROBE_URL" || true)"
if [[ "$CODE" =~ ^[23][0-9][0-9]$ ]]; then
  curl -fsS -m 15 --retry 3 "$PING_URL" -o /dev/null \
    && echo "heartbeat: app healthy ($CODE) — pinged OK" \
    || { echo "heartbeat: WARN ping failed (app was up)" >&2; exit 1; }
else
  echo "heartbeat: app UNHEALTHY at $PROBE_URL (status '${CODE:-no response}') — NOT pinging (dead-man's-switch will alert)" >&2
  exit 1
fi
