#!/usr/bin/env bash
# Audit-only snapshot/reset of the explicitly configured disposable target.
set -euo pipefail
: "${AUDIT_TARGET_CONFIG:?Set this to the private, owner-only audit target configuration.}"
source "$AUDIT_TARGET_CONFIG"
: "${AUDIT_ROOT:?}" "${AUDIT_PROJECT:?}" "${AUDIT_PRIVATE_DIR:?}" "${AUDIT_OVERRIDE:?}" "${AUDIT_NOEMAIL_OVERRIDE:?}" "${AUDIT_SOURCE_TREE:?}"
[[ "$AUDIT_PROJECT" == ares-audit-* ]] || { echo 'Refusing a non-audit Compose project.' >&2; exit 1; }
[[ "$(git -C "$AUDIT_ROOT" branch --show-current)" == audit/* ]] || { echo 'Refusing a non-audit checkout.' >&2; exit 1; }
[[ "$(git -C "$AUDIT_ROOT" rev-parse HEAD:app/src)" == "$AUDIT_SOURCE_TREE" ]] || { echo 'Audit source-tree mismatch.' >&2; exit 1; }
private="$(realpath "$AUDIT_PRIVATE_DIR")"
lock="$private/target.lock"
owner="$(cat "$private/owner.token")"
mkdir "$lock" || { echo 'Target busy; reconcile the existing lock before continuing.' >&2; exit 75; }
printf '%s\n' "$owner" > "$lock/owner"
release() { if [[ "$(cat "$lock/owner" 2>/dev/null)" == "$owner" ]]; then rm "$lock/owner"; rmdir "$lock"; fi; }
trap release EXIT
cd "$AUDIT_ROOT"
compose=(docker compose -p "$AUDIT_PROJECT" -f docker-compose.yml -f docker-compose.test.yml -f "$AUDIT_OVERRIDE" -f "$AUDIT_NOEMAIL_OVERRIDE")
pg="$("${compose[@]}" ps -q postgres)"
[[ -n "$pg" && "$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$pg")" == "$AUDIT_PROJECT" ]] || { echo 'Database identity mismatch.' >&2; exit 1; }
snapshot="$private/reset-fixture.dump"
case "${1:-}" in
  snapshot)
    umask 077
    "${compose[@]}" exec -T postgres pg_dump -U lesson3 -Fc --no-owner --no-privileges lesson3 > "$snapshot"
    echo 'Snapshot saved to the private audit directory.'
    ;;
  reset)
    [[ -s "$snapshot" ]] || { echo 'No nonempty audit snapshot.' >&2; exit 1; }
    "${compose[@]}" stop app pdf-private
    "${compose[@]}" exec -T postgres psql -U lesson3 -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE lesson3 WITH (FORCE);' -c 'CREATE DATABASE lesson3;'
    "${compose[@]}" exec -T postgres pg_restore -U lesson3 -d lesson3 --exit-on-error --no-owner --no-privileges < "$snapshot"
    "${compose[@]}" up -d --no-build --wait app pdf-private
    echo 'Audit snapshot restored; disposable app and private PDF app are healthy.'
    ;;
  *) echo 'Usage: reset-test.sh snapshot|reset' >&2; exit 2 ;;
esac
