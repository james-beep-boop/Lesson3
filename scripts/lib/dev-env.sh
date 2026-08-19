# shellcheck shell=bash
#
# Shared prelude for the local-development container scripts (`dev-server.sh`, `dev-seed.sh`).
#
# Sourced, not executed. Deliberately NOT `scripts/lib.sh`: that one is the ops helper, and sourcing
# it brings a cron-shaped PATH and a `cd` honouring `BACKUP_REPO_DIR` — neither of which a dev script
# wants. Its `env_get` would be the right parser if anything here still parsed `.env`, and almost
# nothing does; see the `--env-file` note in `dev-server.sh`.
#
# ⚑ SOURCING THIS CDs TO THE REPO ROOT, exactly as `lib.sh:12-13` does for the ops family, and for the
# same reason: every helper below reads `.env`/`app/…` by relative path, so the root is a precondition
# of the file rather than a courtesy each caller performs. It used to be three hand-written copies of
# `cd "$(dirname "${BASH_SOURCE[0]}")/.."`, in the one script family whose headline documented trap is
# a bind mount resolving against the wrong cwd. (The lib.sh reasoning declined above covers the cron
# PATH, `BACKUP_REPO_DIR` and `env_get` — it never covered the root cd.)
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1

DEV_COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.local.yml)

dev_require_env_file() {
  if [ -f .env ]; then return 0; fi
  echo "error: no .env at the repo root." >&2
  echo "  It is gitignored and machine-local. Copy .env.example to .env and fill in" >&2
  echo "  PAYLOAD_SECRET and POSTGRES_PASSWORD (see the comments in that file)." >&2
  exit 1
}

# ⚑ `|| true` is load-bearing. Under `set -euo pipefail` a `grep` that matches nothing exits 1, the
# pipeline inherits that through `pipefail`, and a command substitution's status becomes the
# assignment's — so the script would die HERE rather than at whatever friendly check follows.
# Verified rather than assumed: without it the probe exits 1 and prints nothing at all.
dev_env_value() {
  grep -E "^$1=" .env | cut -d= -f2- || true
}

# One hash over EVERY INPUT TO THE INSTALL, driving BOTH the image and the node_modules volume below
# — so a change invalidates them together and neither can go stale behind the other.
#
# ⚑ THE DOCKERFILE IS IN THE HASH, and leaving it out was a real hole rather than a tidiness point.
# This function used to cover the two manifests only, while the image's install is also decided by
# the base image and the install command — both of which live in the Dockerfile — and by `.npmrc`
# (`legacy-peer-deps=true`, without which the install resolves differently or fails outright).
#
# Concretely: bump `FROM node:24.19.0-alpine` with no lockfile change and the hash did not move, so
# `dev_ensure_deps_image` skipped the rebuild AND the hash-keyed volume below went on serving a
# `node_modules` installed by the previous base. That is not hypothetical for this repo — #214 was
# exactly a Node major migration, and DECISIONS records a `lesson3-deps` that "went on answering as
# Node 22" afterwards. The hash now moves when the thing it is standing in for moves.
#
# `.npmrc` is optional in the Dockerfile's COPY (`.npmrc*`), so it is included only when present
# rather than making `cat` fail the script under `set -e`.
dev_deps_hash() {
  local inputs=(app/package.json app/package-lock.json app/Dockerfile)
  [ -f app/.npmrc ] && inputs+=(app/.npmrc)
  cat "${inputs[@]}" | shasum | cut -d' ' -f1
}

dev_ensure_postgres() {
  # `--wait` blocks until the healthcheck in docker-compose.yml passes. Without it `up -d` returns
  # when the container STARTS, and a cold Postgres races Payload's first connect.
  "${DEV_COMPOSE[@]}" up -d --wait postgres >/dev/null
  # ⚑ PART OF "the database is ready", not a courtesy each caller remembers. It began as a line in
  # `dev-server.sh` and `dev-seed.sh`, which is one call site per script and a third script away from
  # standing up a wedged database in silence — the condition is a property of the DATABASE, so it
  # belongs to the function that claims the database is usable. Cheap enough to be unconditional
  # (measured 43–60ms against the `up -d --wait` immediately above it) and it never blocks.
  dev_warn_stuck_transactions
}

# Warn when the database is already wedged, BEFORE handing the user a server that will hang on it.
#
# ⚑ WHY THIS EXISTS (2026-08-19, DECISIONS). A leftover app container had left two jobs-queue
# transactions `idle in transaction`; Payload's dev-mode schema push queued an `ALTER TABLE` behind
# them, and every request that initialises Payload then waited forever — accepted, zero bytes, 0% CPU.
# The dev server reported itself "Ready in 256ms" and looked healthy. Nothing in the stack said the
# word "lock", so the investigation went to the bind mount and to GC first, both wrong.
#
# The `idle_in_transaction_session_timeout` in `docker-compose.local.yml` now clears the CAUSE within
# two minutes. This covers what a timeout cannot: the window before it fires, and a pile-up whose root
# is something else entirely (a held `ALTER`, a stuck migrate service, a second app container mid-write).
#
# WARNS, never blocks. A transient blocked statement at startup is normal and a script that refused to
# start over one would be worse than the bug. Diagnosis is the scarce thing here, not enforcement.
dev_warn_stuck_transactions() {
  local report status
  # `-tAc` for a bare unaligned value: a NULL `string_agg` prints one newline, command substitution
  # strips it, so `report` is genuinely empty and the plain `-n` test below means what it looks like.
  #
  # ⚑ BOUNDED, because a diagnostic about hangs must not be able to hang. Nothing here waits on a lock
  # (`pg_stat_activity` and `pg_blocking_pids()` take none), so the server-side `lock_timeout` in
  # `docker-compose.local.yml` would never fire; `PGCONNECT_TIMEOUT` bounds a postmaster that will not
  # accept the connection and `statement_timeout` bounds the query itself.
  #
  # ⚑ NOT `timeout 10 …`, which was written first and would have been a self-inflicted wound: macOS
  # ships no `timeout` (nor `gtimeout` without coreutils), so on the one platform these dev scripts run
  # on it fails instantly — printing "could not check the database" on EVERY startup, in the exact voice
  # of a real warning. The residual risk it was reaching for (an unresponsive Docker daemon hanging
  # `compose exec`) is already covered one line earlier: `up -d --wait` would never have returned.
  #
  # ⚑ AND FAILURE IS REPORTED, not swallowed. `2>/dev/null || true` hid the loudest signal there is: a
  # pile-up bad enough to exhaust `max_connections` makes psql fail FAST with "too many clients", which
  # discarded looks identical to "found nothing" — silence in precisely the worst case. Still never
  # blocks; it just says which of the two happened.
  # ⚑ THE ASSIGNMENT IS THE `if` CONDITION, and that is load-bearing rather than stylistic. Both
  # callers run `set -euo pipefail`, under which a bare `report="$(failing-command)"` EXITS THE SHELL
  # before the next line can read `$?` — so a psql that could not run would have killed the dev server
  # it was only supposed to warn about, inverting this function's one promise. Inside an `if`
  # condition, errexit is suppressed and the else branch gets the status.
  #
  # ⚑ My own test of "warns, never blocks" missed it, and the reason is worth keeping: it invoked the
  # function from a shell WITHOUT errexit. Same shape as testing this file's earlier guard from zsh
  # when the scripts are bash — a guard exercised under conditions the caller does not use is untested.
  if report="$("${DEV_COMPOSE[@]}" exec -T -e PGCONNECT_TIMEOUT=5 \
    -e "PGOPTIONS=-c statement_timeout=5000" postgres \
    psql -U lesson3 -d lesson3 -tAc "
    SELECT string_agg(line, E'\n') FROM (
      SELECT format('  pid %s (%s) %s for %s — %s',
                    pid,
                    coalesce(host(client_addr), 'local'),
                    state,
                    date_trunc('second', now() - state_change),
                    left(regexp_replace(coalesce(query, ''), '\s+', ' ', 'g'), 60)) AS line
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND (
          (state LIKE 'idle in transaction%' AND state_change < now() - interval '30 seconds')
          OR cardinality(pg_blocking_pids(pid)) > 0
        )
      ORDER BY state_change
    ) AS t;" 2>&1)"; then
    status=0
  else
    status=$?
  fi

  if [ "$status" -ne 0 ]; then
    echo "⚠ Could not check the database for stuck sessions (exit $status). Not fatal — but if pages" >&2
    echo "  then hang rather than render slowly, start here rather than with the dev server:" >&2
    echo "  ${report:-（no output）}" >&2
    return 0
  fi

  [ -n "$report" ] || return 0

  echo "⚠ THE DATABASE HAS STUCK OR BLOCKED SESSIONS. Payload's dev schema push may hang behind them," >&2
  echo "  and every page request with it — a hang, not a slow render (0% CPU, no bytes sent)." >&2
  echo "$report" >&2
  echo "  Usual cause: another app container still attached to this database. Check with" >&2
  echo "    docker ps --filter network=\"$(dev_compose_network)\"" >&2
  echo "  and stop the stray one; sessions older than 2 minutes also time out on their own." >&2
}

# ⚑ REBUILD ONLY WHEN THE DEPENDENCIES CHANGED, keyed on the hash stamped as an image label.
#
# Both obvious alternatives are wrong. Reusing whatever image exists serves STALE dependencies after
# a lockfile change — not hypothetical: a `lesson3-deps` left over from before the Node 24 migration
# went on answering as Node 22 for exactly that reason. Rebuilding unconditionally and trusting the
# layer cache to be free was the other suggestion, and measurement refuses it: a fully-cached
# `--target deps` build is ~35s on this machine, which is an unacceptable tax on an inner-loop tool.
# The label comparison costs ~30ms and is exact.
dev_ensure_deps_image() {
  local want current
  want="$(dev_deps_hash)"
  current="$(docker image inspect lesson3-deps \
    --format '{{index .Config.Labels "lesson3.deps.hash"}}' 2>/dev/null || true)"
  [ "$want" = "$current" ] && return 0

  if [ -n "$current" ]; then
    echo "› dependencies changed since the lesson3-deps image was built — rebuilding"
  else
    echo "› building the lesson3-deps image (first run)"
  fi
  docker build --target deps -t lesson3-deps --label "lesson3.deps.hash=$want" ./app

  # ⚑ RECLAIM THE SUPERSEDED VOLUMES HERE, because this is the one moment they are PROVABLY stale:
  # the hash just moved, so every `lesson3_node_modules_*` other than the new one was populated from
  # an image that no longer exists under that name.
  #
  # Without this the note below ("old ones are garbage; `docker volume prune` reclaims them") is true
  # but manual, and each orphan is 877 MB. `dev-server.sh` already records this machine accumulating
  # 8 GB of exactly this. Widening the hash to the Dockerfile makes them appear MORE often — an edit
  # to the `runner` or `e2e` stage cannot change the install but does move the hash — so the leak had
  # to stop being a footnote. (Narrowing the hash to just the deps stage was the alternative and is
  # refused: slicing one stage out of a Dockerfile by text is fragile in precisely the way this hash
  # exists to avoid. Keying the volume on the built image's ID would be exact and is the better
  # long-term shape — recorded as a follow-up rather than done here, since it changes the caching
  # design rather than tidying it.)
  #
  # ⚑ `|| true` ON THE GREP IS LOAD-BEARING, and its absence broke CI on the first fresh runner.
  #
  # A `grep` matching nothing exits 1. Under `set -euo pipefail` that status propagates through the
  # pipeline and aborts the script — AFTER `docker build` has already succeeded, so the step fails
  # with a green build above it and no error of its own. A fresh runner has no
  # `lesson3_node_modules_*` volume yet, which is exactly the no-match case, and no developer machine
  # reproduces it because every developer machine has one. This is the SAME trap `dev_env_value`
  # documents twenty lines above; it was written under that comment and walked into anyway.
  #
  # Captured into a variable and tested for emptiness rather than piped straight into the loop, so
  # the no-match case is an explicit early return instead of a status that has to survive a pipeline.
  #
  # `|| true` on the removal too: a volume still referenced by a running container (a `dev-server.sh`
  # in another terminal) refuses removal, which is correct and must not fail an inner-loop build.
  #
  # A `while read` loop rather than `xargs -r`: `-r` is GNU-only — BSD/macOS `xargs` rejects it as an
  # illegal option, and with stderr suppressed the prune would have silently never run on the machine
  # that most needs it.
  local keep name existing
  keep="$(dev_node_modules_volume)"
  existing="$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep '^lesson3_node_modules_' || true)"
  [ -n "$existing" ] || return 0

  printf '%s\n' "$existing" | while read -r name; do
    [ "$name" = "$keep" ] && continue
    echo "› reclaiming superseded node_modules volume $name"
    docker volume rm "$name" >/dev/null 2>&1 || true
  done

  # Explicit, so the function's status is never whatever the last loop iteration happened to leave.
  # A genuine build failure has already aborted above under `set -e`; nothing here should fail the run.
  return 0
}

# ⚑ A NAMED volume, and the single biggest thing about these scripts' speed.
#
# `-v /app/node_modules` (anonymous) is the idiom the CI and probe recipes use, and it is right
# THERE: those are one-shot runs where the volume dies with `--rm`. For a dev server started many
# times a day it is a measured disaster — the image's node_modules is 877 MB / 66,283 files, and an
# anonymous volume is repopulated from scratch on every single start. Measured run→Ready:
# 5.9s with the anonymous volume, 0.5s with a named one. Roughly 92% of startup was that copy.
#
# Keyed to the dependency hash so it cannot go stale: new lockfile ⇒ new volume name ⇒ populated once
# from the freshly built image. Old ones are garbage; `docker volume prune` reclaims them.
dev_node_modules_volume() {
  echo "lesson3_node_modules_$(dev_deps_hash | cut -c1-12)"
}

# The mounts every deps-image container needs: the app source, the node_modules volume, the workdir.
#
# ⚑ THESE THREE LINES ARE WHERE THE ANONYMOUS-VOLUME DEFECT LIVED. They were written out separately
# in `in-deps.sh`, `dev-server.sh` and `dev-seed.sh`, and the named-volume fix reached some copies
# and not others — CI ran the slow form for months while the dev scripts ran the fast one. Sharing
# them from the layer that already owns the hash, the freshness check and the volume name is what
# makes the next fix reach every caller instead of the ones someone remembered.
#
# Sets an ARRAY rather than echoing a string: a path containing a space must survive, and word
# splitting an echoed mount list is how that breaks. Callers expand `"${DEV_DEPS_MOUNTS[@]}"`.
dev_deps_mounts() {
  DEV_DEPS_MOUNTS=(
    -v "$PWD/app:/app"
    -v "$(dev_node_modules_volume):/app/node_modules"
    -w /app
  )
}

# The compose network is DERIVED, not hardcoded. `lesson3_default` appears in no compose file — it is
# implicit in the project name, so a `COMPOSE_PROJECT_NAME` override silently breaks a literal.
# `scripts/deploy.sh` goes to the same trouble for the same reason.
dev_compose_network() {
  local container
  container="$("${DEV_COMPOSE[@]}" ps -q postgres)"
  docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$container"
}
