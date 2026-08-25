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
