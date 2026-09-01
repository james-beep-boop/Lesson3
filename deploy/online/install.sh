#!/usr/bin/env bash
# Prepare and start a new Lesson3 local-server installation from a release bundle.
set -euo pipefail

die() { echo "install: ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required"; }

prepare_only=0
case "${1:-}" in
  "") ;;
  --prepare-only) prepare_only=1 ;;
  -h|--help)
    echo "Usage: [LESSON3_URL=http://server:3001] ./install.sh [--prepare-only]"
    exit 0
    ;;
  *) die "unknown argument '$1'" ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

[[ -f compose.yaml && -f .env.example && -f VERSION ]] \
  || die "incomplete release bundle (compose.yaml, .env.example and VERSION are required)"
[[ ! -e .env ]] \
  || die ".env already exists; resume with 'docker compose pull && docker compose up -d --no-build', or use update.sh for a newer release"
need openssl
need curl

if [[ "$prepare_only" -eq 0 ]]; then
  need docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required ('docker compose')"
fi

payload_secret="$(openssl rand -hex 32)"
postgres_password="$(openssl rand -hex 32)"
admin_url="${LESSON3_URL:-http://localhost:3001}"
health_url="http://127.0.0.1:3001/login"
[[ "$admin_url" =~ ^https?://[^[:space:]]+$ ]] \
  || die "LESSON3_URL must be an http(s) URL with no spaces"

# ADMIN_URL becomes the base for links in outbound email (password resets), and nothing later in this
# script ever visits it — the health check below deliberately probes 127.0.0.1. So a wrong host here
# installs CLEANLY and SILENTLY, and the first symptom is a teacher receiving a reset link that goes
# nowhere. `http://SERVER_LAN_IP:3001`, copied straight from the README, satisfies the syntax check
# above, which is exactly why these two extra checks exist.
rest="${admin_url#*://}"
case "$rest" in
  \[*) ;; # bracketed IPv6 literal: an address, not a name — nothing to validate
  *)
    admin_host="${rest%%[:/]*}"
    [[ -n "$admin_host" ]] || die "LESSON3_URL has no host"
    # An underscore cannot appear in a DNS hostname (RFC 1123), so this rejects the documented
    # placeholder without enumerating placeholder names, and without depending on any tooling.
    [[ "$admin_host" != *_* ]] || die \
      "LESSON3_URL host '$admin_host' is not a valid hostname. Replace SERVER_LAN_IP with this server's LAN IP, e.g. LESSON3_URL=http://192.168.1.50:3001"
    # Resolution is a WARNING, never fatal. What actually has to resolve is the name in a teacher's
    # browser, not on this server — a school may publish the name in its own DNS, or hand it out by
    # hosts file, and the server itself need not know it. Refusing to install in that case would break
    # a correct configuration to catch a typo, so this reports and continues.
    if [[ ! "$admin_host" =~ ^[0-9]+(\.[0-9]+){3}$ ]] && command -v getent >/dev/null 2>&1; then
      getent hosts "$admin_host" >/dev/null 2>&1 || echo \
        "install: WARNING: '$admin_host' does not resolve on this server — confirm it resolves for teachers' browsers" >&2
    fi
    ;;
esac

umask 077
tmp_env="$(mktemp "$ROOT/.env.XXXXXX")"
trap 'rm -f "$tmp_env"' EXIT
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    PAYLOAD_SECRET=*) printf 'PAYLOAD_SECRET=%s\n' "$payload_secret" ;;
    POSTGRES_PASSWORD=*) printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password" ;;
    DATABASE_URI=*)
      printf '%s\n' "${line//REPLACE_WITH_POSTGRES_PASSWORD/$postgres_password}"
      ;;
    ADMIN_URL=*) printf 'ADMIN_URL=%s\n' "$admin_url" ;;
    *) printf '%s\n' "$line" ;;
  esac
done <.env.example >"$tmp_env"
mv "$tmp_env" .env
trap - EXIT
chmod 600 .env
mkdir -p out/ops out/resource-library

echo "install: prepared $(cat VERSION) in $ROOT"
if [[ "$prepare_only" -eq 1 ]]; then
  echo "install: prepare-only requested; containers were not downloaded or started"
  exit 0
fi

echo "install: downloading container images"
docker compose pull
echo "install: starting Postgres, applying migrations, then starting the app"
docker compose up -d --no-build

for _ in $(seq 1 60); do
  if curl -fsS "$health_url" >/dev/null 2>&1; then
    echo "install: Lesson3 is ready at ${admin_url%/}/login"
    echo "install: create the first Site Administrator in the browser, then configure backups"
    exit 0
  fi
  sleep 5
done

docker compose logs --tail 100 >&2 || true
die "the app did not become ready within five minutes"
