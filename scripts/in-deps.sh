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
# repopulated from the image on every single run — 877 MB / 66,283 files, measured at ~3.85s against
# ~0.25s for the named one. CI invokes this image six times per job and paid that copy every time;
# on a fresh runner the FIRST run still populates the volume, so the saving is the five after it,
# not six. The name is keyed to the dependency hash, so a change mints a new volume and it cannot go
# stale — and `dev_ensure_deps_image` reclaims the superseded ones, since each is 877 MB.
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
#   - CI's `test:e2e` step, which runs the `lesson3-e2e` image. ⚑ An `--image` flag is NOT the cheap
#     generalization it looks like: `deps` is `node:24.19.0-alpine` (musl) and `e2e` is
#     `node:24.19.0-bookworm` (glibc), while `dev_node_modules_volume` is keyed on the dependency
#     hash and nothing else — so the flag would mount an alpine `node_modules`, native addons
#     included, into the glibc runner. It is blocked on keying the volume by IMAGE rather than by
#     dependency hash, not on a second call site appearing. The anonymous volume there is also
#     correct: that step runs once per job, and the named volume's whole advantage is reuse.
#   - `dev-server.sh` and `dev-seed.sh`. Each passes six to eight genuinely bespoke flags (`-p`,
#     `--init`, `--name`, `--network container:…`), and both already `cd` to the root themselves, so
#     routing them through here would add an indirection and the `/repo` mount neither wants. The
#     part worth sharing — the three mount lines where the anonymous-volume defect actually lived —
#     is now `dev_deps_mounts` in `scripts/lib/dev-env.sh`, which all three call.
set -euo pipefail

# Sourcing the prelude is what puts us at the repo root — see its header. Referenced by this file's
# own path so the source itself does not depend on the cwd it is about to fix.
# shellcheck source=scripts/lib/dev-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/dev-env.sh"

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
# and only the first one is consumed — whatever remains is the command, `--` and all.
#
# ⚑ PASS-THROUGH PATHS ARE ROOT-RELATIVE. Sourcing the prelude moved us to the repo root, so a
# relative path inside a docker arg resolves against the ROOT, not against the caller's cwd:
# `--env-file .env` means the root `.env` wherever you invoked this from. That is what every caller
# wants, but it is worth stating rather than leaving as a happy accident — trap #1 above is the cwd
# trap, and this channel does not inherit the fix, it merely lands the same way. Absolute paths
# (`--env-file "$ROOT/.env"`) are equally fine and read more obviously.
docker_args=()
if [ $# -gt 0 ] && [ "${1#-}" != "$1" ]; then
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do
    docker_args+=("$1")
    shift
  done

  if [ $# -eq 0 ]; then
    echo "error: docker options were given without a '--' separator." >&2
    echo "  Use: scripts/in-deps.sh ${docker_args[*]} -- <command…>" >&2
    echo "  (A line that starts with a non-flag is taken as the command entire, so" >&2
    echo "   'scripts/in-deps.sh npm run lint' needs no separator.)" >&2
    exit 2
  fi
  shift # consume the separator itself
fi
cmd=("$@")

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

# ⚑ ONE FILE IS MOUNTED FROM OUTSIDE `app/`, NEVER THE WORKSPACE — and this is the line that has to
# keep that true, not the comment in `ci.yml` that asserts it.
#
# Mounting `$PWD` would put `.git` inside a container running third-party dev dependencies, and a
# checkout persists a GITHUB_TOKEN into `.git/config` by default, so the whole test process and
# anything in node_modules could read it. That property used to be self-evident because the mount
# list was inline in the CI step making the claim; consolidating here made it MORE consequential
# (one edit now falsifies it at five call sites), so the reasoning lives with the code.
#
# If a spec ever needs a second file from the root, add another single-file `:ro` mount. Do not
# widen this to a directory.
dev_deps_mounts
exec docker run --rm \
  "${DEV_DEPS_MOUNTS[@]}" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -e LESSON3_REPO_ROOT=/repo \
  ${docker_args[@]+"${docker_args[@]}"} \
  lesson3-deps "${cmd[@]}"
