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
