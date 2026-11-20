#!/usr/bin/env bash
#
# Typing benchmark on the Rock: main against the current checkout (HEAD), on throwaway containers.
# (docs/PLAN-editing-typing-speed-2026-10-23.md §3.4; the procedure behind the DECISIONS benchmark
# entries of 2026-10-24 and 2026-11-06, as one script.)
#
# For each of the two commits it builds the `builder` and production images, starts its own Postgres
# (data on tmpfs) and app, migrates, seeds the local accounts and ingests one ARES plan. It then runs
# app/scripts/bench-typing.mjs at 1x CPU (the Rock's own CPU is the slow machine), three rounds per
# build, alternating main / HEAD, and prints the median ms/key of each build.
#
# ⚑ NEVER TOUCHES THE LIVE STACK. Every container and image it makes is named
# lesson3-perf-<run id>-…; it publishes no host port, creates no named volume and joins no existing
# network (each app shares only its own Postgres's network namespace). It reads the plan file and
# nothing else from /srv/lesson3. Everything it creates is removed on exit, also after a failure or
# Ctrl-C, including the Postgres image if this run had to pull it. Docker's build cache is shared with
# deploys and is left alone (the next deploy reuses it).
#
# Run it from a SEPARATE clone, never from the live /srv/lesson3 checkout:
#
#   scripts/bench-rock.sh [path/to/plan.js|plan.json]
#
# Without an argument it looks for the 12-lesson "Animal Transport" plan under
# /srv/lesson3/out/ares-data and then $HOME. Optional environment:
#   BENCH_BASE   the commit to compare against            default origin/main
#   BENCH_ROUNDS rounds per build                         default 3
#   BENCH_LESSON 0-based lesson row to type into          default 5 (bench-typing.mjs's default)
set -euo pipefail

die() { echo "bench-rock: ERROR: $*" >&2; exit 1; }
say() { echo "bench-rock: $*" >&2; }

command -v docker >/dev/null 2>&1 || die "docker is required"
command -v git >/dev/null 2>&1 || die "git is required"

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO"
[ "$REPO" != /srv/lesson3 ] || die "run this from a separate clone, not the live checkout /srv/lesson3"

BASE_REF="${BENCH_BASE:-origin/main}"
ROUNDS="${BENCH_ROUNDS:-3}"
LESSON="${BENCH_LESSON:-5}"

# --- The plan to type into ---------------------------------------------------------------------
PLAN="${1:-}"
if [ -z "$PLAN" ]; then
  for dir in /srv/lesson3/out/ares-data "$HOME"; do
    [ -d "$dir" ] || continue
    PLAN="$(find "$dir" -maxdepth 6 -type f \( -iname '*animal*transport*.js' -o -iname '*animal*transport*.json' \) \
      -not -path '*/node_modules/*' 2>/dev/null | sort | head -n 1 || true)"
    [ -n "$PLAN" ] && break
  done
  [ -n "$PLAN" ] || die "no Animal Transport plan found; pass the plan file as the first argument"
fi
[ -f "$PLAN" ] || die "plan file not found: $PLAN"
PLAN="$(cd "$(dirname "$PLAN")" && pwd)/$(basename "$PLAN")"
case "$PLAN" in *.js | *.json) ;; *) die "the plan must be a .js or .json ARES file: $PLAN" ;; esac

BASE_SHA="$(git rev-parse --verify "$BASE_REF^{commit}")" || die "cannot resolve $BASE_REF (git fetch origin first)"
HEAD_SHA="$(git rev-parse HEAD)"
[ "$BASE_SHA" != "$HEAD_SHA" ] || die "HEAD is $BASE_REF; check out the branch to compare first"

RUN="lesson3-perf-$(date +%Y%m%d-%H%M%S)-$$"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/$RUN.XXXXXX")"
CONTAINERS=()
IMAGES=()
WORKTREES=()

cleanup() {
  local status=$?
  set +e
  say "cleaning up $RUN"
  for c in "${CONTAINERS[@]}"; do docker rm -f -v "$c" >/dev/null 2>&1; done
  for i in "${IMAGES[@]}"; do docker image rm -f "$i" >/dev/null 2>&1; done
  for w in "${WORKTREES[@]}"; do git -C "$REPO" worktree remove --force "$w" >/dev/null 2>&1; done
  git -C "$REPO" worktree prune >/dev/null 2>&1
  rm -rf "$WORK"
  local left
  left="$(docker ps -aq --filter "name=$RUN" 2>/dev/null; docker images -q --filter "reference=$RUN-*" 2>/dev/null)"
  [ -z "$left" ] || say "WARNING: some $RUN containers or images are still present; remove them with docker rm/rmi"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

say "run id:  $RUN"
say "base:    $BASE_REF ($(git log -1 --format='%h %s' "$BASE_SHA"))"
say "head:    $(git log -1 --format='%h %s' "$HEAD_SHA")"
say "plan:    $PLAN"
say "lesson:  row $LESSON, $ROUNDS rounds per build, 1x CPU"

# --- Checkouts and images ----------------------------------------------------------------------
SECRET="$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')"
cat >"$WORK/bench.env" <<EOF
DATABASE_URI=postgres://lesson3:bench@localhost:5432/lesson3
PAYLOAD_SECRET=$SECRET
NODE_ENV=production
PORT=3000
ADMIN_URL=http://localhost:3000
GOTENBERG_URL=http://localhost:9
EOF

image() { # image <tag> <log name> <docker build args…>
  local tag="$1" log="$WORK/build-$2.log"
  shift 2
  IMAGES+=("$tag")
  docker build -t "$tag" "$@" >"$log" 2>&1 || { tail -n 30 "$log" >&2; die "docker build of $tag failed"; }
}

PG_IMAGE=postgres:16.16-alpine@sha256:1d5b02d3a9941fbd52437db4107f8c52d6297dac553ca1e5c299ebb3756b4857
if ! docker image inspect "$PG_IMAGE" >/dev/null 2>&1; then
  IMAGES+=("$PG_IMAGE") # pulled for this run only, so removed with the rest
fi

build() { # build <name> <sha>
  local name="$1" sha="$2" dir="$WORK/src-$1"
  git worktree add --quiet --detach "$dir" "$sha"
  WORKTREES+=("$dir")
  say "building $name ($sha): builder image"
  image "$RUN-$name-builder" "$name-builder" --target builder "$dir/app"
  say "building $name: production image"
  image "$RUN-$name-app" "$name-app" "$dir/app"
}
build base "$BASE_SHA"
build head "$HEAD_SHA"
say "building the browser runner (e2e stage, from head)"
image "$RUN-e2e" e2e --target e2e "$WORK/src-head/app"

# --- One stack per build -----------------------------------------------------------------------
psql_in() { docker exec "$1" psql -U lesson3 -d lesson3 -tAc "$2"; }

VERSION_ID=()
stack() { # stack <name>
  local name="$1" pg="$RUN-$1-pg" app="$RUN-$1-app" plan_in="/data/$(basename "$PLAN")"
  CONTAINERS+=("$pg")
  docker run -d --name "$pg" --memory 512m --cpus 1 --tmpfs /var/lib/postgresql/data:rw \
    -e POSTGRES_USER=lesson3 -e POSTGRES_PASSWORD=bench -e POSTGRES_DB=lesson3 \
    "$PG_IMAGE" >/dev/null
  local i
  # Over TCP: during initdb the image runs a socket-only temporary server that would answer early.
  for i in $(seq 60); do
    docker exec "$pg" pg_isready -h 127.0.0.1 -U lesson3 -d lesson3 >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$pg" pg_isready -h 127.0.0.1 -U lesson3 -d lesson3 >/dev/null 2>&1 || die "$name: Postgres did not start"
  say "$name: migrate, seed, ingest"
  local run=(docker run --rm --network "container:$pg" --env-file "$WORK/bench.env" --memory 1000m --cpus 2)
  "${run[@]}" "$RUN-$name-builder" npx payload migrate >"$WORK/$name-migrate.log" 2>&1 ||
    { tail -n 20 "$WORK/$name-migrate.log" >&2; die "$name: migrate failed"; }
  "${run[@]}" "$RUN-$name-builder" npx payload run scripts/seed-local-dev.ts >"$WORK/$name-seed.log" 2>&1 ||
    { tail -n 20 "$WORK/$name-seed.log" >&2; die "$name: seed failed"; }
  "${run[@]}" -v "$PLAN:$plan_in:ro" "$RUN-$name-builder" npx payload run scripts/ingest.ts -- "$plan_in" \
    >"$WORK/$name-ingest.log" 2>&1 || { tail -n 20 "$WORK/$name-ingest.log" >&2; die "$name: ingest failed"; }
  VERSION_ID+=("$(psql_in "$pg" 'select max(id) from lesson_bundle_versions')")
  CONTAINERS+=("$app")
  docker run -d --name "$app" --network "container:$pg" --env-file "$WORK/bench.env" \
    --memory 1500m --cpus 2 "$RUN-$name-app" >/dev/null
  for i in $(seq 120); do
    docker exec "$app" node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
      >/dev/null 2>&1 && return 0
    sleep 1
  done
  docker logs --tail 30 "$app" >&2
  die "$name: app did not answer on /login"
}
stack base
stack head
NAMES=(base head)

# --- Rounds ------------------------------------------------------------------------------------
declare -A MEDIANS=([base]="" [head]="")
for round in $(seq "$ROUNDS"); do
  for idx in 0 1; do
    name="${NAMES[$idx]}"
    psql_in "$RUN-$name-pg" 'delete from edit_recovery' >/dev/null
    say "round $round/$ROUNDS: $name (load $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || echo '?'))"
    out="$(docker run --rm --shm-size 1g --network "container:$RUN-$name-app" \
      -e BENCH_RATES=1 -e BENCH_VERSION="${VERSION_ID[$idx]}" -e BENCH_LESSON="$LESSON" \
      -e BENCH_LABEL="$name-$round" -v "$WORK/src-head/app/scripts:/app/scripts:ro" -w /app \
      "$RUN-e2e" node scripts/bench-typing.mjs 2>"$WORK/$name-$round.err" | tail -n 1)" ||
      { cat "$WORK/$name-$round.err" >&2; echo "$out" >&2; die "$name round $round: benchmark failed"; }
    echo "$out" >>"$WORK/results.jsonl"
    median="$(printf '%s' "$out" | sed -n 's/.*"medianMs":"\{0,1\}\([^,"}]*\).*/\1/p')"
    [ -n "$median" ] || { echo "$out" >&2; die "$name round $round: no median in the output"; }
    say "  median ${median} ms/key"
    MEDIANS[$name]+="$median "
  done
done

mid() { tr ' ' '\n' <<<"$1" | sed '/^$/d' | sed 's/^<16$/15/' | sort -n | awk '{a[NR]=$1} END {v=a[int((NR+1)/2)]; print (v==15 ? "<16" : v)}'; }

echo
echo "Typing benchmark on $(hostname), 1x CPU, $ROUNDS rounds each, lesson row $LESSON of $(basename "$PLAN")"
echo "  main ($(git rev-parse --short "$BASE_SHA")): median $(mid "${MEDIANS[base]}") ms/key   (rounds: ${MEDIANS[base]% })"
echo "  head ($(git rev-parse --short "$HEAD_SHA")): median $(mid "${MEDIANS[head]}") ms/key   (rounds: ${MEDIANS[head]% })"
echo "  Reference: patched 40 ms/key, unpatched 176-184 ms/key (DECISIONS 2026-11-06)."
