#!/usr/bin/env bash
# Deterministic updater transactions. All Docker, HTTP, backup and sleep calls are local stubs.
set -euo pipefail

stub_fail() { echo "STUB FAILURE: $*" >&2; exit 90; }
case "$(basename "$0")" in
  docker)
    [[ "${1:-}" == compose ]] || stub_fail "unexpected docker command: $*"
    shift
    [[ "${1:-}" != version ]] || exit 0
    [[ "${1:-}" == --project-directory && "${2:-}" == "$TEST_TARGET" ]] \
      || stub_fail "wrong Compose project directory: $*"
    shift 2
    [[ "${1:-}" == --env-file && "${2:-}" == "$TEST_TARGET/.env" ]] \
      || stub_fail "wrong Compose environment: $*"
    shift 2
    [[ "${1:-}" == -f ]] || stub_fail 'Compose manifest must be explicit'
    manifest="$2"; shift 2
    operation="${1:-}"; shift
    printf '%s\n' "$operation" >>"$STUB_ROOT/calls"
    cmp -s "$manifest" "$TEST_NEW/compose.yaml" || stub_fail 'wrong images selected'
    case "$operation" in
      pull)
        [[ "$manifest" == "$TEST_TARGET/.update-pending/bundle/compose.yaml" ]] \
          || stub_fail 'pull was not staged'
        if [[ "$(cat "$TEST_TARGET/.update-pending/phase")" != activating ]]; then
          cmp -s "$TEST_TARGET/compose.yaml" "$TEST_ORIGINAL/compose.yaml" \
            || stub_fail 'active manifest changed before pull'
        fi
        [[ "$FAIL_STAGE" != pull ]] || exit 1
        ;;
      up)
        [[ "$manifest" == "$TEST_TARGET/compose.yaml" && "$*" == '-d --no-build --pull never' ]] \
          || stub_fail "unexpected activation: $manifest $*"
        [[ "$(cat "$TEST_TARGET/VERSION")" == "$TEST_RECORDED_VERSION" ]] \
          || stub_fail 'VERSION advanced before startup'
        [[ "$(cat "$TEST_TARGET/.update-pending/phase")" == activating ]] \
          || stub_fail 'migration boundary not recorded'
        [[ -f "$TEST_TARGET/.update-pending/backup.log" ]] || stub_fail 'missing backup evidence'
        printf '%s\n' migrated >"$STUB_ROOT/database"
        [[ "$FAIL_STAGE" != startup ]] || exit 1
        ;;
      logs) [[ "$*" == '--tail 100' ]] || stub_fail "unexpected logs: $*" ;;
      *) stub_fail "unexpected Compose operation: $operation" ;;
    esac
    exit 0
    ;;
  curl)
    [[ "${1:-}" == -fsS && "${2:-}" == --max-time && "${4:-}" == http://127.0.0.1:3001/login ]] \
      || stub_fail "unexpected health probe: $*"
    echo health >>"$STUB_ROOT/calls"
    [[ "$(cat "$TEST_TARGET/VERSION")" == "$TEST_RECORDED_VERSION" ]] \
      || stub_fail 'VERSION advanced before health succeeded'
    [[ "$FAIL_STAGE" != health ]] || exit 1
    exit 0
    ;;
  sleep) exit 0 ;;
  backup-db.sh)
    [[ "$PWD" == "$TEST_TARGET" ]] || stub_fail 'backup ran outside installation'
    echo backup >>"$STUB_ROOT/calls"
    [[ "$(cat "$STUB_ROOT/database")" == original ]] || stub_fail 'post-migration backup attempted'
    [[ "$FAIL_STAGE" != backup ]] || exit 1
    mkdir -p out/ops
    printf '%s\n' '{"filename":"original-premigrate.dump.age","destination":"remote:premigrate"}' \
      >out/ops/backup-status.json
    echo 'uploaded original-premigrate.dump.age to remote:premigrate'
    exit 0
    ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail() { echo "test-online-update: FAIL: $*" >&2; cat "$TMP/output" >&2; exit 1; }
mkdir -p "$TMP/bin" "$TMP/home"
for stub in docker curl sleep; do ln -s "$ROOT/scripts/test-online-update.sh" "$TMP/bin/$stub"; done

app_digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
migrate_digest="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
for version in v1.0 v1.1 v1.2; do
  "$ROOT/scripts/build-local-deploy-bundle.sh" "$version" "$TMP/$version" "$app_digest" "$migrate_digest" >/dev/null
  tar -C "$TMP/$version" -xzf "$TMP/$version/lesson3-online-deploy.tar.gz"
  cp "$ROOT/scripts/test-online-update.sh" "$TMP/$version/lesson3-deploy/scripts/backup-db.sh"
done
OLD="$TMP/v1.0/lesson3-deploy"
NEW="$TMP/v1.1/lesson3-deploy"
NEXT="$TMP/v1.2/lesson3-deploy"
cp -R "$NEW" "$TMP/conflicting"
sed 's/sha256:aaaaaaaa/sha256:cccccccc/g' "$NEW/compose.yaml" >"$TMP/conflicting/compose.yaml"

prepare() {
  CASE="$TMP/$1"
  mkdir -p "$CASE"
  TARGET="$CASE/installed lesson3"
  cp -R "$OLD" "$TARGET"
  cp "$TARGET/.env.example" "$TARGET/.env"
  printf '\nBACKUP_AGE_RECIPIENT=age1test\nBACKUP_RCLONE_REMOTE=remote:backups\n' >>"$TARGET/.env"
  mkdir "$CASE/original"
  cp -p "$TARGET/compose.yaml" "$TARGET/VERSION" "$TARGET/.env.example" "$TARGET/DEPLOYMENT.md" "$CASE/original/"
  cp -Rp "$TARGET/scripts" "$CASE/original/scripts"
  cp "$TARGET/.env" "$CASE/env"
  echo original >"$CASE/database"
  : >"$CASE/calls"
  : >"$TMP/output"
  PENDING="$TARGET/.update-pending"
  ARCHIVE="$TARGET/releases/v1.0-to-v1.1"
}
run_update() {
  local mode="$1" source="${2:-$NEW}"
  if env -i HOME="$TMP/home" PATH="$TMP/bin:/usr/bin:/bin" \
    STUB_ROOT="$CASE" TEST_TARGET="$TARGET" TEST_ORIGINAL="$CASE/original" \
    TEST_NEW="$source" FAIL_STAGE="$mode" TEST_RECORDED_VERSION="$(cat "$TARGET/VERSION")" \
    bash "$source/update.sh" "$TARGET" >"$TMP/output" 2>&1; then
    RESULT=0
  else
    RESULT=$?
  fi
  ! grep -q 'STUB FAILURE' "$TMP/output" || fail 'stub contract violated'
  [[ ! -e "$TARGET/.update-lock" ]] || fail 'updater left its lock behind'
  cmp -s "$TARGET/.env" "$CASE/env" || fail 'updater changed operator .env'
}
failed_with() {
  [[ "$RESULT" != 0 ]] || fail "update should fail: $1"
  grep -q "$1" "$TMP/output" || fail "missing failure diagnostic: $1"
}
count_is() {
  local count
  count="$(grep -c "^$1$" "$CASE/calls" || true)"
  [[ "$count" == "$2" ]] || fail "expected $2 $1 calls, got $count"
}
previous_unchanged() {
  diff -qr "$CASE/original" "$1/previous" >/dev/null || fail 'original deployment snapshot changed'
}
active_unchanged() {
  local file
  for file in compose.yaml VERSION .env.example DEPLOYMENT.md; do
    cmp -s "$TARGET/$file" "$CASE/original/$file" || fail "active $file changed before activation"
  done
  diff -qr "$TARGET/scripts" "$CASE/original/scripts" >/dev/null || fail 'active scripts changed before activation'
}
completed() {
  [[ "$RESULT" == 0 ]] || fail 'resume did not complete'
  [[ "$(cat "$TARGET/VERSION")" == v1.1 && ! -e "$PENDING" && -d "$ARCHIVE" ]] \
    || fail 'completion state incorrect'
  previous_unchanged "$ARCHIVE"
  cmp -s "$TARGET/compose.yaml" "$NEW/compose.yaml" || fail 'new Compose was not activated'
}

prepare pull-twice
for attempt in 1 2; do
  run_update pull
  failed_with 'pending update retained'
  active_unchanged
  previous_unchanged "$PENDING"
  [[ "$(cat "$PENDING/phase")" == staged ]] || fail 'failed pull advanced phase'
done
count_is pull 2
count_is backup 0
count_is up 0
run_update success
completed
count_is backup 1
[[ "$(sed -n '3,6p' "$CASE/calls")" == $'pull\nbackup\nup\nhealth' ]] || fail 'wrong activation order'
echo '  ok: two failed pulls preserve active files and immutable originals; retry succeeds'

for stage in startup health; do
  prepare "$stage-retry"
  for attempt in 1 2; do
    run_update "$stage"
    failed_with 'a migration may have run'
    [[ "$(cat "$TARGET/VERSION")" == v1.0 && "$(cat "$PENDING/phase")" == activating ]] \
      || fail 'failed activation reported a committed version'
    cmp -s "$TARGET/compose.yaml" "$NEW/compose.yaml" || fail 'implicitly rolled back to old images'
    previous_unchanged "$PENDING"
    if [[ "$attempt" == 1 ]]; then
      cp "$PENDING/backup.log" "$CASE/backup.log"
      cp "$PENDING/backup-status.json" "$CASE/backup-status.json"
      echo 'routine backup replaced status' >"$TARGET/out/ops/backup-status.json"
    fi
    cmp -s "$PENDING/backup.log" "$CASE/backup.log" || fail 'original backup log replaced'
    cmp -s "$PENDING/backup-status.json" "$CASE/backup-status.json" || fail 'original backup identity replaced'
  done
  count_is backup 1
  if [[ "$stage" == health ]]; then count_is health 120; count_is logs 2; fi
  calls_before="$(cat "$CASE/calls")"
  for conflict in "$TMP/conflicting" "$NEXT" "$OLD"; do
    run_update success "$conflict"
    failed_with 'conflicting bundle'
    [[ "$(cat "$CASE/calls")" == "$calls_before" ]] || fail 'conflicting bundle reached Docker'
    previous_unchanged "$PENDING"
  done
  run_update success
  completed
  count_is backup 1
  cmp -s "$ARCHIVE/backup.log" "$CASE/backup.log" || fail 'completion replaced original backup'
  cmp -s "$ARCHIVE/backup-status.json" "$CASE/backup-status.json" || fail 'completion replaced backup identity'
  run_update success
  failed_with 'no pending update to resume'
  run_update success "$TMP/conflicting"
  failed_with 'different Compose/image identity'
  previous_unchanged "$ARCHIVE"
  echo "  ok: $stage failures resume without a new backup or rollback; conflicting bundles rejected"
done

prepare backup-failure
run_update backup
failed_with 'pre-migration backup failed'
active_unchanged
previous_unchanged "$PENDING"
count_is up 0
run_update success
completed
count_is backup 2
echo '  ok: backup failure remains pre-activation and can retry'

prepare interrupted-activation
run_update startup
failed_with 'startup failed'
# Model interruption during file activation, then between the healthy VERSION write and archival.
cp "$OLD/compose.yaml" "$TARGET/compose.yaml"
run_update startup
failed_with 'startup failed'
printf '%s\n' v1.1 >"$TARGET/VERSION"
run_update success
completed
count_is backup 1
echo '  ok: partial activation and interrupted completion resume without replacing the snapshot'

prepare archive-conflict
mkdir -p "$ARCHIVE"
echo original >"$ARCHIVE/sentinel"
run_update success
failed_with 'recovery record already exists'
[[ "$(cat "$ARCHIVE/sentinel")" == original && ! -e "$PENDING" ]] || fail 'recovery archive overwritten'
count_is pull 0
active_unchanged
echo '  ok: existing recovery archive cannot be overwritten'

prepare legacy-failure
mkdir -p "$TARGET/releases/v1.0"
cp "$OLD/compose.yaml" "$TARGET/releases/v1.0/compose.yaml"
cp "$NEW/compose.yaml" "$TARGET/compose.yaml"
run_update success
failed_with 'legacy recovery snapshot exists'
[[ ! -e "$PENDING" ]] || fail 'legacy failed activation became a fresh rollback snapshot'
cmp -s "$OLD/compose.yaml" "$TARGET/releases/v1.0/compose.yaml" || fail 'legacy snapshot overwritten'
count_is pull 0
echo '  ok: legacy failed update is refused without replacing its recovery evidence'

prepare missing-evidence
run_update startup
failed_with 'startup failed'
rm "$PENDING/backup.log"
run_update success
failed_with 'pending backup evidence is missing'
count_is backup 1
count_is up 1
previous_unchanged "$PENDING"
echo '  ok: incomplete pending evidence fails closed instead of making another backup'

echo 'test-online-update: PASS'
