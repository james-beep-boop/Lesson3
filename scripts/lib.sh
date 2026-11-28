#!/usr/bin/env bash
#
# Shared helpers for the Lesson3 ops scripts (backup-db.sh, restore-db.sh, deploy.sh, heartbeat.sh).
# SOURCED, not executed: `source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"`. Keeps the safety-critical
# .env parsing, the cron PATH, and the repo-root cd in ONE place.

# Cron runs with a minimal PATH; make user-local binaries (age, rclone) and common dirs reachable.
export PATH="$HOME/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# cd to the repo root (this file lives in scripts/, so the root is one level up). Overridable via
# BACKUP_REPO_DIR. Doing it here means every ops script reads `.env` and runs compose from the right cwd.
REPO_DIR="${BACKUP_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR"

# Free space in KiB on the filesystem holding a path (backup-db.sh's space checks, restore-db.sh's staging).
free_kb() { df -Pk "$1" | awk 'NR==2 {print $4}'; }

# Read ONE key from .env WITHOUT sourcing it — a value with spaces or a stray word would otherwise be run
# as a shell command. Precedence: an already-set environment variable wins over the .env value;
# surrounding single/double quotes are stripped. Must be called from the repo root (lib.sh cd's there).
env_get() {
  local k="$1"; local v="${!k:-}"
  if [[ -z "$v" && -f .env ]]; then
    v="$(grep -E "^${k}=" .env | tail -n1 | cut -d= -f2-)"
    v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  fi
  printf '%s' "$v"
}

# The application and recovery tools use the same named volume. A database keeps this directory
# when PostgreSQL renames it, so swapping databases also selects the right supporting files.
supporting_files_volume() { # database OID, shell command
  local oid="$1" command="$2"
  [[ "$oid" =~ ^[0-9]+$ ]] || { echo "Invalid supporting files database OID" >&2; return 1; }
  docker compose run --rm --no-deps -T --entrypoint sh app -ec \
    'dir="${ARTIFACT_CACHE_DIR:-/var/cache/lesson3}/supporting-files/$1"; '"$command" sh "$oid"
}
