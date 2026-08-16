#!/usr/bin/env bash
#
# Run a command inside the pinned `lesson3-deps` container — the one place that knows how.
#
# WHY THIS EXISTS. The `docker run … lesson3-deps …` shape was written out by hand in CI, in
# AGENTS.md, in `docs/NEXT-SESSION.md` and in the dev scripts — and it carries three traps that a
# reader has to re-avoid at every call site:
#
#   1. `-v "$PWD/app:/app"` is only correct from the repo root. Run it from inside `app/` and Docker
#      CREATES the missing bind source `app/app/`, Next prefers that root-level `./app` over
#      `./src/app`, and `next build` emits a build with ZERO application routes and exits 0. Git
#      cannot track an empty directory, so nothing notices. AGENTS.md calls this "the trap that
#      destroyed a working day". Here the root is derived from this file's own location, so the
#      wrapper is cwd-independent by construction.
#   2. `npm run test:unit` needs the ROOT `.env.example` mounted, or six `envTemplateParity` cases
#      fail for reasons that have nothing to do with the change under test. That mount was in CI and
#      in no other copy of the shape, so it was missing exactly where a human would type it from
#      memory. It is unconditional here — one read-only file costs nothing when unused.
#   3. A stale image answers happily. A `lesson3-deps` left over from before the Node 24 migration
#      went on serving Node 22 for weeks. `dev_ensure_deps_image` compares a lockfile hash stamped as
#      an image label (~30ms) and rebuilds only on a real change.
#
# ⚑ AND ONE THING THAT IS A FIX, NOT A MOVE: the node_modules mount is the hash-keyed NAMED volume,
# where every hand-written copy used an anonymous `-v /app/node_modules`. An anonymous volume is
# repopulated from the image on every single run — 877 MB / 66,283 files, measured at 5.4s of a 5.9s
# startup. CI runs this image six times per job and paid that copy six times. The named volume is
# keyed to the dependency hash, so a lockfile change mints a new one and it cannot go stale.
#
# Usage:
#   scripts/in-deps.sh                              # just ensure the image is built and current
#   scripts/in-deps.sh npm run lint                 # run a command
#   scripts/in-deps.sh --network none -- npm run test:unit
#   scripts/in-deps.sh --network lesson3_default --env-file .env -- npm run test:int
#
# Everything before a literal `--` is passed to `docker run`; everything after is the command. With
# no `--`, all arguments are the command. The separator exists because the alternative — an
# `IN_DEPS_ARGS` string — would need deliberate word-splitting under `set -u`, and a quoting bug in a
# wrapper is worse than the duplication it removes.
#
# NOT COVERED, deliberately:
#   - CI's `test:e2e` step, which runs the `lesson3-e2e` image (glibc + chromium, a different build
#     target). Parameterising the image for one call site would be speculative generality; when a
#     second e2e invocation appears, add an `--image` flag then.
#   - `dev-server.sh` and `dev-seed.sh`. Each passes six to eight genuinely bespoke flags (`-p`,
#     `--init`, `--name`, `--network container:…`), so routing them through here would save one line
#     and add an indirection. They already share the parts that matter — the hash, the image
#     freshness check and the named volume — via `scripts/lib/dev-env.sh`, which is this file's
#     source too.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/lib/dev-env.sh
source scripts/lib/dev-env.sh

# ⚑ THE FIRST ARGUMENT DECIDES WHETHER A SEPARATOR IS EVEN LOOKED FOR, and that is not a nicety.
#
# Splitting naively on "the first `--`" is wrong for a shape this repo uses constantly:
#
#   scripts/in-deps.sh npm run test:e2e -- --reporter=line
#
# There the `--` belongs to npm, not to us. A naive split hands `npm run test:e2e` to `docker run` as
# options and runs `--reporter=line` as the command — a silent misparse that fails with a confusing
# docker error rather than the real one.
#
# So: docker flags always begin with `-`. If the first argument does not, there are no docker args,
# the whole line is the command, and no separator scanning happens. If it does, a `--` is REQUIRED,
# and only the first one is consumed.
docker_args=()
cmd=()

if [ $# -eq 0 ]; then
  : # image-only mode; both arrays stay empty
elif [ "${1#-}" = "$1" ]; then
  cmd=("$@")
else
  seen_separator=false
  for arg in "$@"; do
    if [ "$seen_separator" = false ]; then
      if [ "$arg" = "--" ]; then
        seen_separator=true
      else
        docker_args+=("$arg")
      fi
      continue
    fi
    cmd+=("$arg")
  done

  if [ "$seen_separator" = false ]; then
    echo "error: docker options were given without a '--' separator." >&2
    echo "  Use: scripts/in-deps.sh ${docker_args[*]} -- <command…>" >&2
    echo "  (A line that starts with a non-flag is taken as the command entire, so" >&2
    echo "   'scripts/in-deps.sh npm run lint' needs no separator.)" >&2
    exit 2
  fi
fi

# ⚑ Checked, not assumed, because a MISSING bind source is the failure this wrapper exists to prevent
# — Docker creates it as an empty DIRECTORY rather than erroring, and `envTemplateParity` would then
# report a malformed template instead of an absent one.
if [ ! -f .env.example ]; then
  echo "error: no .env.example at the repo root ($PWD)." >&2
  echo "  It is tracked, so this means the checkout is incomplete or the root was resolved wrong." >&2
  exit 1
fi

dev_ensure_deps_image

# No command ⇒ the caller only wanted the image ensured (CI's build step, and a cheap warm-up).
if [ ${#cmd[@]} -eq 0 ]; then
  exit 0
fi

exec docker run --rm \
  -v "$PWD/app:/app" \
  -v "$(dev_node_modules_volume):/app/node_modules" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -e LESSON3_REPO_ROOT=/repo \
  -w /app \
  ${docker_args[@]+"${docker_args[@]}"} \
  lesson3-deps "${cmd[@]}"
