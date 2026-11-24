#!/usr/bin/env bash
#
# PDF comparison for a Gotenberg upgrade, on the Rock: the sidecar image from main against the one in
# the current checkout (HEAD), converting the same DOCX files with both.
# (The procedure behind the DECISIONS Gotenberg entries of 2026-11-10 and 2026-11-11, as one script.)
#
# Builds gotenberg/ from both commits, starts each with the production command and limits, sends every
# DOCX the way app/src/generator/docxToPdf.ts does (one `files` part to /forms/libreoffice/convert),
# and compares per document: page count, `pdftotext -layout` text, and every page rendered at 96 DPI.
# Prints one line per document and a summary with total conversion times.
#
# ⚑ NEVER TOUCHES THE LIVE STACK. Everything it makes is named lesson3-gtcmp-<run id>…: two
# Gotenberg containers, one tools container and one private network of its own. No host port is
# published and no volume is created; the DOCX folder is mounted read-only. Everything is removed on
# exit, also after a failure or Ctrl-C. Docker's build cache is shared with deploys and is left alone.
#
# Run it from a SEPARATE clone, never from the live /srv/lesson3 checkout:
#
#   scripts/compare-gotenberg-rock.sh [folder with .docx files]     default /srv/lesson3/out
#
# Optional environment: BENCH_BASE, the commit to compare against (default origin/main).
set -euo pipefail

die() { echo "compare-gotenberg: ERROR: $*" >&2; exit 1; }
say() { echo "compare-gotenberg: $*" >&2; }

command -v docker >/dev/null 2>&1 || die "docker is required"
REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO"
[ "$REPO" != /srv/lesson3 ] || die "run this from a separate clone, not the live checkout /srv/lesson3"

DOCX_DIR="${1:-/srv/lesson3/out}"
[ -d "$DOCX_DIR" ] || die "no such folder: $DOCX_DIR"
DOCX_DIR="$(cd "$DOCX_DIR" && pwd)"
COUNT="$(find "$DOCX_DIR" -maxdepth 1 -type f -name '*.docx' | wc -l)"
[ "$COUNT" -gt 0 ] || die "no .docx files directly in $DOCX_DIR"

BASE_REF="${BENCH_BASE:-origin/main}"
BASE_SHA="$(git rev-parse --verify "$BASE_REF^{commit}")" || die "cannot resolve $BASE_REF"
HEAD_SHA="$(git rev-parse HEAD)"
[ "$(git rev-parse "$BASE_SHA:gotenberg")" != "$(git rev-parse "$HEAD_SHA:gotenberg")" ] ||
  die "gotenberg/ is identical in $BASE_REF and HEAD; nothing to compare"

RUN="lesson3-gtcmp-$(date +%Y%m%d-%H%M%S)-$$"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/$RUN.XXXXXX")"
CONTAINERS=()
IMAGES=()
WORKTREES=()
NETWORK=""

cleanup() {
  local status=$?
  set +e
  say "cleaning up $RUN"
  for c in "${CONTAINERS[@]}"; do docker rm -f -v "$c" >/dev/null 2>&1; done
  [ -z "$NETWORK" ] || docker network rm "$NETWORK" >/dev/null 2>&1
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

say "run id: $RUN"
say "base:   $BASE_REF ($(git log -1 --format='%h %s' "$BASE_SHA"))"
say "head:   $(git log -1 --format='%h %s' "$HEAD_SHA")"
say "input:  $COUNT DOCX in $DOCX_DIR"

for name in base head; do
  sha="$BASE_SHA"; [ "$name" = head ] && sha="$HEAD_SHA"
  dir="$WORK/src-$name"
  git worktree add --quiet --detach "$dir" "$sha"
  WORKTREES+=("$dir")
  say "building the $name sidecar image (fonts download included)"
  IMAGES+=("$RUN-$name")
  docker build -t "$RUN-$name" "$dir/gotenberg" >"$WORK/build-$name.log" 2>&1 ||
    { tail -n 30 "$WORK/build-$name.log" >&2; die "docker build of the $name image failed"; }
done

NETWORK="$RUN-net"
docker network create --internal "$NETWORK" >/dev/null
for name in base head; do
  CONTAINERS+=("$RUN-$name")
  docker run -d --name "$RUN-$name" --network "$NETWORK" --memory 1024m --cpus 2 "$RUN-$name" \
    gotenberg --api-timeout=120s --api-disable-download-from=true --webhook-disable=true \
    --pdf-disable-routes=true --pdf-disable-stages=true >/dev/null
done

# The tools run in the head image (Debian, has apt), as root, with poppler added. The internal network
# has no internet, so poppler is installed before the container joins it.
CONTAINERS+=("$RUN-tools")
docker run -d --name "$RUN-tools" --user root --entrypoint sleep -v "$DOCX_DIR:/in:ro" "$RUN-head" infinity >/dev/null
say "installing poppler-utils in the tools container"
docker exec "$RUN-tools" sh -c 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends poppler-utils curl >/dev/null' ||
  die "could not install poppler-utils"
docker network connect "$NETWORK" "$RUN-tools"

cat >"$WORK/compare.sh" <<'EOF'
#!/bin/bash
set -uo pipefail
base="http://$1-base:3000"; head="http://$1-head:3000"
for u in "$base" "$head"; do
  for i in $(seq 90); do curl -fsS "$u/health" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS "$u/health" >/dev/null || { echo "ERROR: $u did not become healthy"; exit 1; }
done
mkdir -p /tmp/c && cd /tmp/c
docs=0; same=0; pages=0; samepages=0; tb=0; th=0
for f in /in/*.docx; do
  n="$(basename "$f" .docx)"; docs=$((docs+1))
  for side in base head; do
    u="$base"; [ "$side" = head ] && u="$head"
    s=$(date +%s%N)
    if ! curl -fsS -o "$side.pdf" -F "files=@$f;filename=document.docx" "$u/forms/libreoffice/convert"; then
      echo "DIFF  $n: $side conversion failed"; continue 2
    fi
    ms=$(( ($(date +%s%N) - s) / 1000000 ))
    if [ "$side" = base ]; then tb=$((tb+ms)); mb=$ms; else th=$((th+ms)); mh=$ms; fi
  done
  pb=$(pdfinfo base.pdf | awk '/^Pages:/{print $2}'); ph=$(pdfinfo head.pdf | awk '/^Pages:/{print $2}')
  pdftotext -layout base.pdf base.txt; pdftotext -layout head.pdf head.txt
  text=same; cmp -s base.txt head.txt || text=different
  rm -f b-*.ppm h-*.ppm
  pdftoppm -r 96 base.pdf b; pdftoppm -r 96 head.pdf h
  diffpages=""; sp=0
  for bp in b-*.ppm; do
    hp="h-${bp#b-}"
    if [ -f "$hp" ] && cmp -s "$bp" "$hp"; then sp=$((sp+1)); else diffpages="$diffpages ${bp#b-}"; fi
  done
  pages=$((pages+pb)); samepages=$((samepages+sp))
  if [ "$pb" = "$ph" ] && [ "$text" = same ] && [ -z "$diffpages" ]; then
    same=$((same+1)); echo "same  $n: $pb pages ($mb ms → $mh ms)"
  else
    echo "DIFF  $n: pages $pb → $ph, text $text, differing page images:${diffpages:- none} ($mb ms → $mh ms)"
  fi
done
echo "SUMMARY $docs $same $pages $samepages $tb $th"
EOF

say "converting and comparing"
docker cp "$WORK/compare.sh" "$RUN-tools:/tmp/compare.sh" >/dev/null
docker exec "$RUN-tools" bash /tmp/compare.sh "$RUN" | tee "$WORK/out.txt" | grep -v '^SUMMARY' >&2 ||
  die "the comparison did not finish"
read -r _ docs same pages samepages tb th < <(grep '^SUMMARY' "$WORK/out.txt") || die "the comparison did not finish"

echo
echo "Gotenberg PDF comparison on $(hostname): $docs DOCX from $DOCX_DIR"
echo "  base: $(git log -1 --format=%h "$BASE_SHA") ($(sed -n 's/^FROM gotenberg\/gotenberg:\([^@]*\).*/\1/p' "$WORK/src-base/gotenberg/Dockerfile" | tail -n 1))"
echo "  head: $(git log -1 --format=%h "$HEAD_SHA") ($(sed -n 's/^FROM gotenberg\/gotenberg:\([^@]*\).*/\1/p' "$WORK/src-head/gotenberg/Dockerfile" | tail -n 1))"
echo "  identical documents: $same of $docs; identical page images: $samepages of $pages (base page count)"
echo "  total conversion time: base $((tb / 1000)).$(( (tb % 1000) / 100 )) s, head $((th / 1000)).$(( (th % 1000) / 100 )) s"
