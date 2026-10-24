#!/usr/bin/env bash
#
# The live-replacement restore (design A1) against a REAL, isolated stack: Postgres 16.15, the migrate
# and app images, and Gotenberg, laid out like a release-bundle installation in a throwaway directory.
# Nothing is stubbed below the scripts' own process: the renames, the terminations, the migrations, the
# Local API read and the DOCX/PDF render all happen for real.
#
# ⚑ NEVER A LIVE INSTALLATION. Everything runs under its own Compose project (lesson3-restore-probe)
# with its own volumes and no published ports, from a sandbox with its own .env, compose file, keys and
# backup directory. The project name is written into the sandbox's compose file AND passed in the
# environment, and the script refuses to start if anything already runs under that name.
#
# The ops scripts run in a small tools image (scripts/lib/restore-probe-tools.Dockerfile: bash 5,
# docker compose, age, rclone) against the host's Docker daemon, so a Mac with bash 3.2 and no age
# runs them the way an Ubuntu server does.
#
# USAGE (from anywhere; images are built from this checkout's app/ first, one at a time):
#   docker build --target builder -t lesson3-restore-probe-migrate ./app
#   docker build -t lesson3-restore-probe-app ./app
#   scripts/test-restore-db-stack.sh
# Override the images with RESTORE_PROBE_APP_IMAGE / RESTORE_PROBE_MIGRATE_IMAGE (CI reuses its own).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="lesson3-restore-probe"
APP_IMAGE="${RESTORE_PROBE_APP_IMAGE:-lesson3-restore-probe-app}"
MIGRATE_IMAGE="${RESTORE_PROBE_MIGRATE_IMAGE:-lesson3-restore-probe-migrate}"
TOOLS_IMAGE="lesson3-restore-probe-tools"
pass=0 fail=0
OUTPUT="" EXIT=0

say() { echo "── $*"; }
die() { echo "test-restore-db-stack: ERROR: $*" >&2; exit 1; }

docker image inspect "$APP_IMAGE" >/dev/null 2>&1 || die "image $APP_IMAGE not found (see USAGE)"
docker image inspect "$MIGRATE_IMAGE" >/dev/null 2>&1 || die "image $MIGRATE_IMAGE not found (see USAGE)"
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")" ]] \
  || die "containers already exist under project $PROJECT; remove them first (docker compose -p $PROJECT down -v)"
docker build -q -t "$TOOLS_IMAGE" -f "$ROOT/scripts/lib/restore-probe-tools.Dockerfile" "$ROOT/scripts/lib" >/dev/null \
  || die "could not build the tools image"

# A real path (macOS /var → /private/var), so the daemon and the tools container agree on it.
SANDBOX="$(cd "$(mktemp -d)" && pwd -P)"
teardown() {
  T docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  # Files written by containers may belong to other users; remove them from inside one.
  docker run --rm -v "$SANDBOX:$SANDBOX" "$TOOLS_IMAGE" rm -rf "$SANDBOX" >/dev/null 2>&1 || true
  rm -rf "$SANDBOX" 2>/dev/null || true
}
trap teardown EXIT

# T <command…>: run in the tools container, in the sandbox, as the installation's operator would.
# --init so the script is not PID 1 (PID 1 ignores the SIGKILL the interruption tests rely on).
T() {
  docker run --rm -i --init \
    -v /var/run/docker.sock:/var/run/docker.sock -v "$SANDBOX:$SANDBOX" -w "$SANDBOX" \
    -e COMPOSE_PROJECT_NAME="$PROJECT" -e RCLONE_CONFIG_PROBE_TYPE=local \
    -e AGE_IDENTITY="$SANDBOX/keys/identity" -e RESTORE_APP_WAIT_SECONDS=240 \
    ${T_ENV:+$T_ENV} "$TOOLS_IMAGE" "$@"
}
dc() { T docker compose "$@"; }
sql() { dc exec -T postgres psql -U lesson3 -d "$1" -tAc "$2" 2>&1; }
restore() { # stdin-answer args… — runs restore-db.sh, captures OUTPUT and EXIT
  OUTPUT="$(printf '%s\n' "$1" | T bash scripts/restore-db.sh "${@:2}" 2>&1)"; EXIT=$?
}
check() {
  local name="$1"; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   $name"
  else fail=$((fail + 1)); echo "FAIL $name"; printf '%s\n' "$OUTPUT" | tail -n 40 | sed 's/^/     /'; fi
}
has() { [[ "$OUTPUT" == *"$1"* ]]; }
ok_exit() { [[ "$EXIT" -eq 0 ]]; }
bad_exit() { [[ "$EXIT" -ne 0 ]]; }
eq() { [[ "$1" == "$2" ]] || { echo "     expected '$2', got '$1'"; return 1; }; }
state() { sed -n 's/^  "state": "\(.*\)",$/\1/p' "$SANDBOX/out/ops/restore-journal.json" 2>/dev/null; }
jkey() { sed -n "s/^  \"$1\": \"\\(.*\\)\",\\{0,1\\}\$/\\1/p" "$SANDBOX/out/ops/restore-journal.json" 2>/dev/null; }
bad_lock_message() { [[ "$OUTPUT" != *"another restore-db.sh is running"* ]]; }
no_journal() { [[ ! -f "$SANDBOX/out/ops/restore-journal.json" ]]; }
count_blocked() { # db sql — read a database that refuses connections, then refuse them again
  sql postgres "ALTER DATABASE \"$1\" ALLOW_CONNECTIONS true;" >/dev/null
  sql "$1" "$2"
  sql postgres "ALTER DATABASE \"$1\" ALLOW_CONNECTIONS false;" >/dev/null
}
plans() { sql lesson3 "SELECT count(*) FROM lesson_plans;"; }
dbs() { sql postgres "SELECT string_agg(datname, ' ' ORDER BY datname) FROM pg_database WHERE datname LIKE 'lesson3%';"; }
seed() { # title
  dc run --rm --no-deps -T -v "$SANDBOX/probe-seed.ts:/app/scripts/probe-seed.ts:ro" \
    -e PROBE_TITLE="$1" -e NODE_ENV=production migrate npx payload run scripts/probe-seed.ts >/dev/null 2>&1
}

# ─── Sandbox: a bundle-shaped installation ───────────────────────────────────────────────────────────
say "sandbox $SANDBOX"
mkdir -p "$SANDBOX/scripts" "$SANDBOX/out/ops" "$SANDBOX/out/resource-library" "$SANDBOX/keys" "$SANDBOX/backups"
cp "$ROOT/scripts/restore-db.sh" "$ROOT/scripts/backup-db.sh" "$ROOT/scripts/lib.sh" "$SANDBOX/scripts/"
echo "v0.0.0-probe" >"$SANDBOX/VERSION"
sed -E \
  -e "s#^name: lesson3\$#name: $PROJECT#" \
  -e "s#image: ghcr.io/james-beep-boop/lesson3-migrate:.*#image: $MIGRATE_IMAGE#" \
  -e "s#image: ghcr.io/james-beep-boop/lesson3-app:.*#image: $APP_IMAGE#" \
  -e '/^    ports:$/d' -e '/- "3001:3000"/d' \
  "$ROOT/deploy/online/compose.template.yaml" >"$SANDBOX/compose.yaml"
grep -q "^name: $PROJECT\$" "$SANDBOX/compose.yaml" || die "sandbox compose did not take the probe project name"
! grep -q '3001' "$SANDBOX/compose.yaml" || die "sandbox compose still publishes a port"

T age-keygen -o "$SANDBOX/keys/identity" 2>/dev/null
T age-keygen -o "$SANDBOX/keys/wrong" 2>/dev/null
RECIPIENT="$(T age-keygen -y "$SANDBOX/keys/identity")"
cat >"$SANDBOX/.env" <<EOF
DATABASE_URI=postgres://lesson3:probe_password@postgres:5432/lesson3
POSTGRES_PASSWORD=probe_password
PAYLOAD_SECRET=restore_probe_only_throwaway_secret
NODE_ENV=production
ADMIN_URL=http://localhost:3001
SERVER_URL=
GOTENBERG_URL=http://gotenberg:3000
GOTENBERG_TIMEOUT_MS=120000
ARTIFACT_CACHE_DIR=/var/cache/lesson3
JOBS_AUTORUN_CRON=0 0 1 1 *
BACKUP_AGE_RECIPIENT=$RECIPIENT
BACKUP_RCLONE_REMOTE=probe:$SANDBOX/backups
EOF

cat >"$SANDBOX/probe-seed.ts" <<'EOF'
// One lesson plan with an Official version, plus (first time only) a Site Administrator.
import config from '@payload-config'
import { getPayload } from 'payload'
import { createUserVerified, minimalBundleContent } from '../tests/helpers/fixtures'

const payload = await getPayload({ config })
const title = process.env.PROBE_TITLE || 'Probe plan'
const find = async (collection: 'subjects' | 'subject-grades', where: object, data: object) =>
  (await payload.find({ collection, where: where as never, limit: 1, overrideAccess: true })).docs[0] ??
  (await payload.create({ collection, data: data as never, overrideAccess: true }))
const subject = await find('subjects', { name: { equals: 'Biology' } }, { name: 'Biology' })
const sg = await find('subject-grades', { subject: { equals: subject.id } }, { subject: subject.id, grade: 10 })
if ((await payload.count({ collection: 'users' })).totalDocs === 0) {
  await createUserVerified(payload, {
    name: 'Probe admin', email: 'probe-admin@restore.test', password: 'probe-only-1234', roles: ['siteAdmin'],
  } as never)
}
const plan = await payload.create({ collection: 'lesson-plans', data: { title, subjectGrade: sg.id }, overrideAccess: true })
const content = minimalBundleContent()
const version = await payload.create({
  collection: 'lesson-bundle-versions',
  data: { lessonPlan: plan.id, subjectGrade: sg.id, semver: '1.0.0', title: `${title} v1.0.0`, ...content,
    meta: { ...content.meta, subject: 'Biology', grade: 10, substrand_name: title } } as never,
  overrideAccess: true,
})
await payload.update({ collection: 'lesson-plans', id: plan.id, data: { officialVersion: version.id }, overrideAccess: true })
process.exit(0)
EOF

say "stack up (postgres, gotenberg, migrate, app)"
dc up -d --wait postgres >/dev/null 2>&1 || die "postgres did not start"
dc up -d gotenberg >/dev/null 2>&1 || die "gotenberg did not start"
dc run --rm --no-deps -T migrate >/dev/null 2>&1 || die "initial migrate failed"
seed "Probe plan A" || die "seeding plan A failed"
dc up -d app >/dev/null 2>&1 || die "app did not start"

# ─── Backups to restore from ─────────────────────────────────────────────────────────────────────────
say "backups: current schema (plan A only), older schema, newer schema"
T bash scripts/backup-db.sh >/dev/null 2>&1 || die "backup-db.sh failed"
B1="$(ls "$SANDBOX/backups/daily/" | head -n1)"
[[ -n "$B1" ]] || die "no backup written"
cp "$SANDBOX/backups/daily/$B1" "$SANDBOX/$B1"
B1_DATE="$(echo "$B1" | sed -E 's/.*-([0-9]{4})([0-9]{2})([0-9]{2})T.*/\1-\2-\3/')"
seed "Probe plan B (after the backup)" || die "seeding plan B failed"
eq "$(plans)" 2 || die "expected two live plans"

# Variants made from a copy of the live database, then dumped and encrypted like a real backup.
variant() { # file-name sql
  sql postgres "DROP DATABASE IF EXISTS probe_variant;" >/dev/null
  sql postgres "CREATE DATABASE probe_variant;" >/dev/null
  dc exec -T postgres sh -c 'pg_dump -U lesson3 -Fc lesson3 | pg_restore -U lesson3 -d probe_variant --no-owner' >/dev/null 2>&1
  sql probe_variant "$2" >/dev/null
  dc exec -T postgres pg_dump -U lesson3 -Fc probe_variant | T age -r "$RECIPIENT" -o "$SANDBOX/$1"
  sql postgres "DROP DATABASE probe_variant;" >/dev/null
}
OLD="lesson3-20261001T000000Z-older-schema.dump.age"
# One migration behind = the NEWEST migration undone. ⚑ Update this when a newer migration lands, or the
# backup has a gap instead of a missing tail and the restore (rightly) refuses it as "not a prefix".
LATEST_MIGRATION='20261024_094011_native_lock_scope'
ONE_MIGRATION_BEHIND="ALTER TABLE payload_locked_documents_rels ADD COLUMN favorites_id integer, ADD COLUMN messages_id integer, ADD COLUMN edit_recovery_id integer, ADD COLUMN discussion_topics_id integer, ADD COLUMN discussion_replies_id integer, ADD COLUMN discussion_participation_id integer; DELETE FROM payload_migrations WHERE name = '$LATEST_MIGRATION';"
NEW="lesson3-20261002T000000Z-newer-schema.dump.age"
variant "$OLD" "$ONE_MIGRATION_BEHIND"
variant "$NEW" "INSERT INTO payload_migrations (name, batch) VALUES ('29991231_000000_from_the_future', 99);"

# ─── The property the swap rests on, re-verified on this Postgres ────────────────────────────────────
say "transactional rename on $(sql postgres "SHOW server_version;")"
sql postgres "CREATE DATABASE probe_rename_a;" >/dev/null
OUTPUT="$(dc exec -T postgres psql -U lesson3 -d postgres -v ON_ERROR_STOP=1 2>&1 <<'SQL'
BEGIN;
ALTER DATABASE probe_rename_a RENAME TO probe_rename_b;
ALTER DATABASE probe_rename_missing RENAME TO probe_rename_a;
COMMIT;
SQL
)"
check "a failed second rename rolls back the first" eq "$(sql postgres "SELECT string_agg(datname, ' ') FROM pg_database WHERE datname LIKE 'probe_rename%';")" probe_rename_a
sql postgres "DROP DATABASE probe_rename_a;" >/dev/null

# ─── Refusals: nothing live changes ──────────────────────────────────────────────────────────────────
say "refusals"
BEFORE_DBS="$(dbs)"
T_ENV="-e AGE_IDENTITY=$SANDBOX/keys/wrong" restore "" --local-file "$B1" --into lesson3 --force-prod
check "wrong key is refused" bad_exit
check "wrong key says the key did not decrypt" has "did not decrypt"
check "wrong key leaves no journal" no_journal
check "wrong key leaves the databases as they were" eq "$(dbs)" "$BEFORE_DBS"

T_ENV="--tmpfs /small:size=64k -e TMPDIR=/small" restore "" --local-file "$B1" --into lesson3 --force-prod
check "no space for the decrypted dump is refused" has "not enough space for the decrypted backup"
check "no tmp space leaves no journal" no_journal

T_ENV="-e RESTORE_DUMP_EXPANSION=100000000" restore "" --local-file "$B1" --into lesson3 --force-prod
check "no space on the database volume is refused" has "not enough space on the database volume"
check "no volume space leaves the databases as they were" eq "$(dbs)" "$BEFORE_DBS"

restore "" --local-file "$NEW" --into lesson3 --force-prod
check "a backup from newer software is refused" has "NEWER software"
check "the newer backup names the unknown migration" has "29991231_000000_from_the_future"
check "the refused copy is dropped" eq "$(dbs)" "$BEFORE_DBS"
check "the refused restore closes its journal" no_journal
check "live still has both plans after the refusals" eq "$(plans)" 2

restore "" --discard-previous
check "--discard-previous with nothing to discard is refused" bad_exit

# ─── Pre-confirmation interruptions are reversed ─────────────────────────────────────────────────────
for step in staging migrating checking; do
  say "interrupt after '$step', then --resume"
  T_ENV="-e RESTORE_TEST_INTERRUPT_AFTER=$step" restore "" --local-file "$B1" --into lesson3 --force-prod
  check "[$step] the run was interrupted" eq "$(state)" "$step"
  restore "" --resume
  check "[$step] resume reverses it" has "reversing the unconfirmed restore"
  check "[$step] the staged copy is gone" eq "$(dbs)" "$BEFORE_DBS"
  check "[$step] the journal is closed" no_journal
  check "[$step] live is untouched" eq "$(plans)" 2
done

say "older-schema backup: migrate the INCOMING database only; interrupt after 'checked'"
# Make live one migration behind as well, so a migrate that touched it would be visible.
sql lesson3 "$ONE_MIGRATION_BEHIND" >/dev/null
T_ENV="-e RESTORE_TEST_INTERRUPT_AFTER=checked" restore "" --local-file "$OLD" --into lesson3 --force-prod
INCOMING="$(jkey incoming)"
check "[checked] the run reached the confirmation" eq "$(state)" checked
check "[checked] the schema check counted the pending migration" has "1 to apply"
check "[checked] the in-server check rendered DOCX and PDF" has "rendered PDF through Gotenberg"
check "[checked] incoming got the migration" eq "$(sql "$INCOMING" "SELECT count(*) FROM payload_migrations WHERE name = '$LATEST_MIGRATION';")" 1
check "[checked] incoming got its schema change" eq "$(sql "$INCOMING" "SELECT count(*) FROM information_schema.columns WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'favorites_id';")" 0
check "[checked] live did NOT get the migration" eq "$(sql lesson3 "SELECT count(*) FROM payload_migrations WHERE name = '$LATEST_MIGRATION';")" 0
check "[checked] live did NOT get the schema change" eq "$(sql lesson3 "SELECT count(*) FROM information_schema.columns WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'favorites_id';")" 1
check "[checked] the lock file survives the kill" test -f "$SANDBOX/out/ops/.restore.lock"
restore "" --resume
check "[checked] the kill left no lock to clear" bad_lock_message
check "[checked] resume reverses it" eq "$(dbs)" "$BEFORE_DBS"
dc run --rm --no-deps -T migrate >/dev/null 2>&1 || die "re-migrating live failed"

say "declining the typed confirmation"
restore "not-the-date" --local-file "$B1" --into lesson3 --force-prod
check "a wrong date is not a confirmation" has "not confirmed"
check "declining reverses the staged copy" eq "$(dbs)" "$BEFORE_DBS"
check "declining leaves live untouched" eq "$(plans)" 2

# ─── Writers blocked, atomic swap, then undo with post-swap work ─────────────────────────────────────
say "held connection; interrupt after 'writers-stopped'"
dc exec -d -T postgres psql -U lesson3 -d lesson3 -c "SELECT pg_sleep(600);" >/dev/null
sleep 2
check "a connection is being held" eq "$(sql postgres "SELECT count(*) FROM pg_stat_activity WHERE datname = 'lesson3' AND query LIKE '%pg_sleep%' AND pid <> pg_backend_pid();")" 1
T_ENV="-e RESTORE_TEST_INTERRUPT_AFTER=writers-stopped" restore "$B1_DATE" --local-file "$B1" --into lesson3 --force-prod
PREVIOUS="$(jkey previous)"; INCOMING="$(jkey incoming)"
check "[writers-stopped] the run stopped there" eq "$(state)" writers-stopped
check "[writers-stopped] the held connection was terminated" eq "$(sql postgres "SELECT count(*) FROM pg_stat_activity WHERE datname = 'lesson3';")" 0
OUTPUT="$(sql lesson3 "SELECT 1;")"
check "[writers-stopped] a new connection is refused" has "not currently accepting connections"
check "[writers-stopped] the app is stopped" eq "$(dc ps --services --status running | grep -c '^app$')" 0
restore "" --resume
check "[writers-stopped] resume completes to provisional" eq "$(state)" provisional
check "[writers-stopped] the live check rendered again" has "rendered PDF through Gotenberg"
check "swap: live is now the backup (one plan)" eq "$(plans)" 1
check "swap: the previous database refuses connections" eq "$(sql postgres "SELECT datallowconn FROM pg_database WHERE datname = '$PREVIOUS';")" f
check "swap: the previous database is kept with both plans" eq "$(count_blocked "$PREVIOUS" "SELECT count(*) FROM lesson_plans;")" 2
check "swap: exactly lesson3 and the previous database exist" eq "$(dbs)" "lesson3 $PREVIOUS"
check "swap: the app is running again" eq "$(dc ps --services --status running | grep -c '^app$')" 1

restore "" --discard-previous
check "--discard-previous before --confirm is refused" has "run --confirm first"

say "post-swap work, then --undo interrupted after 'undo-backed-up'"
sql lesson3 "UPDATE lesson_plans SET title = 'Work saved after the restore went live';" >/dev/null
T_ENV="-e RESTORE_TEST_INTERRUPT_AFTER=undo-backed-up" restore "undo" --undo
check "[undo] the warning says post-restore work will be lost" has "WORK SAVED AFTER THE RESTORED DATABASE WENT LIVE WILL BE LOST BY UNDOING"
check "[undo-backed-up] the undo stopped there" eq "$(state)" undo-backed-up
UNDO_BACKUP="$(ls "$SANDBOX/backups/premigrate/" 2>/dev/null | grep prerestore-undo | head -n1)"
check "[undo-backed-up] a prerestore-undo backup was taken" test -n "$UNDO_BACKUP"
restore "" --resume
check "[undo-backed-up] resume completes the undo" eq "$(state)" undone
check "undo: the previous database is live again (two plans)" eq "$(plans)" 2
UNDONE="$(jkey undone)"
check "undo: the restored database is kept aside" eq "$(dbs)" "lesson3 $UNDONE"
cp "$SANDBOX/backups/premigrate/$UNDO_BACKUP" "$SANDBOX/$UNDO_BACKUP"
restore "" --local-file "$UNDO_BACKUP" --into probe_undo_check
check "undo backup: it restores (drill path)" has "RESTORE DRILL PASSED"
check "undo backup: it holds the post-swap work" eq "$(sql probe_undo_check "SELECT count(*) FROM lesson_plans WHERE title = 'Work saved after the restore went live';")" 1
sql postgres "DROP DATABASE probe_undo_check;" >/dev/null
restore "$UNDONE" --discard-previous
check "--discard-previous after undo drops the undone database" eq "$(dbs)" "lesson3"
check "--discard-previous closes the journal" no_journal
check "the closed journal is kept in history" test -n "$(ls "$SANDBOX/out/ops/restore-history/")"

# ─── The remaining interruption points, each completed by --resume, each followed by an undo ─────────
for pair in "approved undo-approved" "swapped undo-services-stopped" "starting undo-swapped"; do
  fwd="${pair% *}"; back="${pair#* }"
  say "interrupt after '$fwd', resume; then undo interrupted after '$back', resume"
  T_ENV="-e RESTORE_TEST_INTERRUPT_AFTER=$fwd" restore "$B1_DATE" --local-file "$B1" --into lesson3 --force-prod
  check "[$fwd] the run stopped there" eq "$(state)" "$fwd"
  restore "" --resume
  check "[$fwd] resume completes to provisional" eq "$(state)" provisional
  check "[$fwd] live is the backup" eq "$(plans)" 1
  T_ENV="-e RESTORE_TEST_INTERRUPT_AFTER=$back" restore "undo" --undo
  check "[$back] the undo stopped there" eq "$(state)" "$back"
  restore "" --resume
  check "[$back] resume completes the undo" eq "$(state)" undone
  check "[$back] the previous database is live" eq "$(plans)" 2
  restore "$(jkey undone)" --discard-previous
  check "[$back] discarded and closed" no_journal
done

# ─── Startup failure: offer --undo, never act alone ──────────────────────────────────────────────────
say "startup failure after the swap"
T_ENV="-e RESTORE_TEST_INTERRUPT_AFTER=swapped" restore "$B1_DATE" --local-file "$B1" --into lesson3 --force-prod
PREVIOUS="$(jkey previous)"
sql lesson3 "DROP TABLE lesson_bundle_versions CASCADE;" >/dev/null   # break the swapped-in database
restore "" --resume
check "startup failure exits non-zero" bad_exit
check "startup failure is reported" has "STARTUP CHECK FAILED"
check "startup failure offers --undo" has "scripts/restore-db.sh --undo"
check "startup failure records its state" eq "$(state)" live-check-failed
check "startup failure undoes nothing on its own" eq "$(dbs)" "lesson3 $PREVIOUS"
restore "undo" --undo
check "after a startup failure, --undo puts the previous database back" eq "$(plans)" 2
restore "$(jkey undone)" --discard-previous

# ─── The plain path: no interruption, --confirm, --discard-previous ──────────────────────────────────
say "uninterrupted restore, --confirm, --discard-previous"
dc exec -T app sh -c 'echo stale > "$ARTIFACT_CACHE_DIR/probe-stale.bin"'
restore "$B1_DATE" --local-file "$B1" --into lesson3 --force-prod --check-plan 1
PREVIOUS="$(jkey previous)"
check "restore completes" ok_exit
check "it ends provisional and says what to do" has "restore-db.sh --confirm"
check "the export cache was emptied" eq "$(dc exec -T app sh -c 'ls "$ARTIFACT_CACHE_DIR" | grep -c probe-stale.bin')" 0
check "the timeline was logged" test -s "$SANDBOX/out/ops/restore.log"
restore "" --confirm
check "--confirm accepts it" eq "$(state)" accepted
restore "wrong" --discard-previous
check "--discard-previous needs the database name typed" eq "$(dbs)" "lesson3 $PREVIOUS"
restore "$PREVIOUS" --discard-previous
check "--discard-previous drops the previous database" eq "$(dbs)" "lesson3"
check "live is the backup" eq "$(plans)" 1

# ─── The drill path is unchanged ─────────────────────────────────────────────────────────────────────
restore "" --local-file "$B1" --into lesson3_restore_check
check "the drill still passes" has "RESTORE DRILL PASSED"
check "the drill leaves no journal" no_journal

echo "restore-db live replacement (stack): $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
