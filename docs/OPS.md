# Operations runbook (the Rock)

Production-hardening ops for Lesson3 (SPEC §11 / readiness #9). Covers **backups**, **restore**,
**deploy**, **structured logging**, and **monitoring**. The Rock is the single Docker-compose box
(`app` on :3001, `postgres` + `gotenberg` internal-only); repo at `/srv/lesson3`. All commands run on
the Rock unless noted.

---

## Proof-of-concept PDF link library

Lesson prose can link to internet addresses and to PDFs in one flat directory on the Rock. This is a
read-only demonstration, not file management: Lesson3 never writes, renames, replaces or deletes the
files. The Compose app receives only this mount:

```text
/srv/lesson3/out/resource-library  ->  /var/lib/lesson3-resources (read-only)
```

One-time setup after pulling the feature:

1. Keep `PDF_LIBRARY_DIR=/var/lib/lesson3-resources` in the Rock's `.env` (the canonical
   `.env.example` carries it).
2. Copy a few PDFs into `/srv/lesson3/out/resource-library/` on the Rock. Use a flat directory,
   ordinary `.pdf` filenames, and files no larger than 25 MiB. Hidden files, subdirectories,
   symlinks, other extensions, and content without a PDF signature are not offered.
3. Run the normal `scripts/deploy.sh`; no database migration is involved. The app container must be
   recreated to receive the new read-only mount and environment value.
4. Sign in through the standard public HTTPS app address, open a lesson version for editing, and use
   *Insert link*. Selecting a Rock PDF inserts an absolute URL using that browser origin.

All authenticated roles may open these PDFs. An exported Word/PDF link therefore works remotely when
the reader is already signed in to the same public app; sign-in-and-return for a reader whose session
has expired is outside this proof of concept. Do not rename or overwrite a demonstration PDF after a
lesson links to it: the URL is stable only while the filename and bytes stay stable.

⚠ The database backup does **not** include `out/resource-library`. For this proof of concept, retain
the source PDFs elsewhere and be prepared to copy them back. A production resource library needs an
explicit backup/versioning policy before these files become records of value.

---

## Backups (encrypted, to Google Drive or a rotated removable drive)

`pg_dump` (in the postgres container) → `age` encrypt (on the host) → `rclone` to the configured
destination. Internet-connected installations use Google Drive; offline schools may use rotated USB
drives. Four streams under either destination, grandfather-father-son retention: `daily/` (keep newest
`BACKUP_DAILY_KEEP`, default 7), `weekly/` (`BACKUP_WEEKLY_KEEP`, default 4), and `monthly/`
(`BACKUP_MONTHLY_KEEP`, default 12) — these prune by **count** (newest N; exact and robust to a missed
run) — plus `premigrate/` (pre-deploy snapshots, pruned by **age**, `BACKUP_PREMIGRATE_RETENTION_DAYS`,
default 90). Scripts: `scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/deploy.sh`.

### One-time setup

1. **Binaries (no sudo — installed to `~/bin`):** `age`, `age-keygen`, `rclone` (arm64). See the install
   block at the bottom of this section if they are not already present (`command -v age rclone`).

2. **Encryption key — generate on your MAC, not the Rock** (so the private key never touches the box):
   ```bash
   age-keygen -o ~/lesson3-backup.key     # prints "Public key: age1..."
   ```
   - Store `~/lesson3-backup.key` (the PRIVATE identity) somewhere safe and durable — a password manager
     plus one more copy. **If you lose it, every backup is unrecoverable.** Do NOT put it on the Rock.
   - Take the printed `age1...` PUBLIC key → it goes in the Rock's `.env` as `BACKUP_AGE_RECIPIENT`.

   ⚑ **SECOND RECIPIENT — do this for any installation that may be offline** (decided 2026-08-22,
   SPEC §11). Generate a second keypair that the SCHOOL keeps, and put its public key in the Rock's
   `.env` as `BACKUP_AGE_RECIPIENT_SCHOOL`. `backup-db.sh` then encrypts to both, and **either identity
   can decrypt independently** — no key is shared, and a school with no internet can restore without
   ARES. The school's private identity goes somewhere durable and off-box (a safe; not the server).
   ⚑ Forward-only: dumps written before you set it stay readable only by ARES. ⚑ The two keys must
   differ — the script refuses a duplicate, since it would grant no independent recovery.
   Manage → System's "Backup recovery" row reports which state an installation is in.

3. **Choose and prepare the destination.**

   **Google Drive (headless OAuth):** on your **Mac** (has a browser):

   ```bash
   rclone authorize "drive"               # opens a browser; prints a token JSON blob
   ```

   On the **Rock**, `rclone config` → new remote named `drive`, type `drive`, and when asked
   "Use auto config?" answer **n**, then paste the token from the Mac. Make a base folder, e.g.
   `lesson3-backups`, in that Drive. The remote+path becomes
   `BACKUP_RCLONE_REMOTE=drive:lesson3-backups`.

   **Rotated USB drive (offline installation):** mount each drive at the same absolute path, create the
   backup directory on the mounted volume, and put the sentinel inside it once per drive:

   ```bash
   mkdir -p /media/lesson3-backup/lesson3-backups
   touch /media/lesson3-backup/lesson3-backups/.lesson3-backup-volume
   ```

   Then use `BACKUP_RCLONE_REMOTE=/media/lesson3-backup/lesson3-backups`. A plain local path must be
   absolute, resolve onto a mount backed by a different device from `/`, and contain that
   regular, non-symlink sentinel **before** `pg_dump`; otherwise the script aborts. It keeps the
   destination directory open and checks the mount identity around upload, so an absent or changed
   drive cannot silently redirect a dump onto the boot disk. (`findmnt`, supplied by `util-linux`, is
   required for local destinations.)
   Put the drive somewhere physically separate after the run and rotate it with another prepared drive.

4. **`.env` on the Rock** — add:

   ```dotenv
   BACKUP_AGE_RECIPIENT=age1xxxxxxxx...
   # Choose ONE:
   BACKUP_RCLONE_REMOTE=drive:lesson3-backups
   # BACKUP_RCLONE_REMOTE=/media/lesson3-backup/lesson3-backups
   # optional overrides: BACKUP_DAILY_KEEP, BACKUP_WEEKLY_KEEP, BACKUP_MONTHLY_KEEP, BACKUP_PREMIGRATE_RETENTION_DAYS
   # optional (monitoring): HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<uuid>
   ```

   These are read by the scripts only; they are NOT app config (the app ignores them).

5. **Cron — nightly + weekly + monthly** (`crontab -e`; the box is `America/Los_Angeles`, so these fire
   at 02:00 Pacific). Nightly → `daily/`, Sundays → `weekly/`, the 1st of the month → `monthly/`:
   ```
   # Lesson3 DB backups — GFS retention (7 daily / 4 weekly / 12 monthly)
   0  2 * * *  /srv/lesson3/scripts/backup-db.sh                 >> /srv/lesson3/out/backup.log 2>&1
   10 2 * * 0  /srv/lesson3/scripts/backup-db.sh --label weekly  >> /srv/lesson3/out/backup.log 2>&1
   20 2 1 * *  /srv/lesson3/scripts/backup-db.sh --label monthly >> /srv/lesson3/out/backup.log 2>&1
   ```

### Retention pruning (SPEC §11 retention policy)

`scripts/prune-db.sh` trims the two monotonically-growing bookkeeping tables (`payload_jobs`,
`rate_limit_counters`); it is idempotent, transactional, and a no-op once caught up. Windows are
env-overridable in `.env` (`PRUNE_EXPORT_JOB_DAYS` 14, `PRUNE_EMAIL_JOB_DAYS` 180,
`PRUNE_FAILED_JOB_DAYS` 90, `PRUNE_RATE_LIMIT_DAYS` 7). Runs nightly, after the backup so a
pre-prune snapshot always exists:

```cron
# Lesson3 retention prune (completed export jobs 14d / email+ping jobs 180d / failed 90d / rate counters 7d)
30 3 * * *  /srv/lesson3/scripts/prune-db.sh >> /srv/lesson3/out/prune.log 2>&1
```

Manual/dry check: run `scripts/prune-db.sh` once by hand and read `out/prune.log` (it prints the
windows it applied); counts before/after via
`docker compose exec postgres psql -U lesson3 -d lesson3 -c "SELECT count(*) FROM payload_jobs;"`.

### Run / verify

- Manual backup: `scripts/backup-db.sh` (writes to `daily/`).
- List backups: `scripts/restore-db.sh --list` (or `--list daily` / `--list premigrate`).
- Successful uploads atomically replace `out/ops/backup-status.json`; failed uploads leave the previous
  success untouched. Manage → System reads that directory through a read-only container mount and
  shows the UTC completion time, stream/type and actual destination. ⚑ `out/ops`, not `out` — `out/`
  holds unrelated host artifacts and is deliberately NOT mounted (narrowed 2026-08-21 after the deploy
  verification found the wider mount). If an installation still has an old `out/backup-status.json`, it
  is orphaned and can be deleted; the next backup or deploy writes the new location.
- **Manage → System also shows the destination as its own row**, computed from `BACKUP_RCLONE_REMOTE`
  and present whether or not a backup has ever succeeded — so a USB installation can confirm where
  backups *would* go while setting up. It reads "A removable drive" or "A cloud location" with the raw
  value beneath. ⚑ Reported, never chosen: a dropdown could not prepare a drive or write `.env`, so it
  would look live and produce refusing backups.
- ⚑ **A green row is not proof of a recurring schedule — read the stream/type.** `deploy.sh` takes a
  `premigrate` snapshot on every deploy, so a box with no cron at all will still show a recent
  successful backup, labelled **Premigration**. That is why the row names the stream: a healthy
  installation shows **Daily**. A `Premigration` row on its own means "the last thing that backed this
  database up was a deploy", which is a real backup but not a schedule.
- ⚑ **And no row of any kind proves the backup is RESTORABLE.** The record says an upload succeeded, not
  that the ciphertext decrypts or that `pg_restore` accepts it. Only the drill below establishes that,
  and nothing on this screen can substitute for having run it.

### ⚑ CI: the rate limiter's state persists across runs

A gate failure in `tests/int/authRateLimit.int.spec.ts` — or an e2e failing with "Sign-ups are
temporarily paused" — may be environmental rather than yours. Confirmed 2026-08-27: that int case failed
on a docs-only PR and passed on a re-run of the identical commit.

**Re-run the failed job before reading a failure as yours.** A pass on the same SHA is the answer. The
local remedy for the same symptom is below (clear the `Global:all` `rate_limit_counters` rows); CI has no
equivalent yet, which is why a red gate here currently needs interpreting rather than acting on.

### Restore drill (do this periodically — an untested backup is not a backup)

⚑ **BRING THE CIPHERTEXT TO THE KEY, NOT THE KEY TO THE CIPHERTEXT.** The private `age` identity is held
off-box (SPEC §11: schools hold the public key; ARES retains the identity), and the backup is encrypted,
so the encrypted file is the safe thing to move. Run the drill on the machine that holds the identity,
with the file copied there:

```bash
# 1. get one encrypted backup to the machine holding the identity (7 MB)
rclone cat drive:lesson3-backups/daily/lesson3-<TS>.dump.age > /tmp/drill.dump.age
#    …or, from a machine with no rclone remote configured, over ssh from the server:
#    ssh Rock5b 'PATH=$HOME/bin:$PATH rclone cat drive:lesson3-backups/daily/lesson3-<TS>.dump.age' > /tmp/drill.dump.age

# 2. run the drill against it. Needs a local Compose stack with `postgres` up.
AGE_IDENTITY=~/lesson3-backup.key \
  scripts/restore-db.sh --local-file /tmp/drill.dump.age --into lesson3_restore_check

# 3. drop the disposable database, and delete the copy
docker compose exec -T postgres psql -U lesson3 -d postgres -c 'DROP DATABASE lesson3_restore_check;'
rm -f /tmp/drill.dump.age
```

`--local-file` skips `rclone` and `BACKUP_RCLONE_REMOTE` entirely; `restore-db.sh` reaches Postgres via
`docker compose exec`, so it restores into whatever stack you run it from — on a workstation that is the
dev stack, which is already the disposable target a drill wants. The decrypted dump only ever exists in a
`mktemp -d` directory removed by the script's `EXIT` trap.

⚑ **The script prints `RESTORE DRILL PASSED` only if verification succeeded**, and exits non-zero
otherwise. It counts **every table in the restored database** — 29 of them at the time of writing — and
gates on a short hand-picked list that must be present and non-empty (`lesson_plans`,
`lesson_bundle_versions`, `users`, `subjects`, `subject_grades`); zero rows elsewhere is legitimate, so
those are reported rather than failed.

⚑ **The list is derived from the database, not maintained by hand, and the hand-maintained version was
already wrong.** It named twelve tables and silently skipped `favorites`, `messages` and `edit_recovery`
— registered collections with real rows — so the drill printed PASSED without ever looking at them. A
list that has to be edited in lockstep with `payload.config.ts` rots toward under-verification, which is
the failure that looks like success. It also used to print two counts followed by `|| true`, so a failed
verification still exited 0.

⚑ **Do NOT copy the identity onto the server for a drill.** It is unnecessary now that `--local-file`
exists, it puts the one irreplaceable secret on the box custody is designed to keep it off, and `shred`
cannot reliably promise erasure on the SSD it would land on.

Real disaster recovery into live: `--into lesson3 --force-prod`, app down first. That is also the only
situation where bringing the identity to the server is justified — a genuine restore, not a rehearsal.

### ⚑ Last drill: 2026-08-22 — PASSED, and what that does and does not establish

| Established | How |
|---|---|
| The held identity matches the backups | `age-keygen -y` on the identity equals the Rock's `BACKUP_AGE_RECIPIENT`. ⚑ The single check most worth repeating: a mismatched key makes every backup permanently unreadable and looks fine until the day it matters |
| The ciphertext is intact and authentic | `age` decryption **succeeded**. This is authenticated encryption, so it is far stronger evidence than comparing a downloaded file's length against `rclone lsl` — equal length proves only equal length |
| `pg_restore` accepts the dump | restored into a disposable database with no errors |
| The corpus comes back | every table in the restored database was counted — 29 tables, 25 of them non-empty — and the headline figures matched live: 85 lesson plans, 85 versions, 7 users, 7 subjects, 7 subject-grades, 4 editing-access grants, 728 lessons, 3,640 framework rows, 3,640 resource links, 30 messages, 5 edit-recovery rows |
| Nightly backups are being produced | seven consecutive `daily/` files, 2026-08-16 → 08-22, at 02:00 local |

**What it does not establish, stated so nobody rounds it up:**

- **Not a row-by-row comparison.** Matching counts across twelve tables is a strong representative check,
  not proof that every field of every record survived. Broader corpus comparison is future work.
- **Not proof that `cron` produced those files.** Seven files at 02:00 is evidence consistent with the
  nightly schedule; it does not exclude another scheduler or manual runs.
- **Nothing about USB destinations.** This drill used a Drive backup. A rotated-USB installation should
  run its own drill from the drive.
- **Nothing about the offline-recovery gap** — see SPEC §11: a school with no internet cannot decrypt its
  own backups, because the identity is not theirs to hold.

### Installing age + rclone to ~/bin (arm64, no sudo)

```bash
mkdir -p ~/bin
# age + age-keygen
curl -fsSL https://github.com/FiloSottile/age/releases/latest/download/age-$(curl -fsSL \
  https://api.github.com/repos/FiloSottile/age/releases/latest | grep -oP '"tag_name":\s*"\K[^"]+')-linux-arm64.tar.gz \
  | tar -xz -C /tmp && mv /tmp/age/age /tmp/age/age-keygen ~/bin/
# rclone
curl -fsSL https://downloads.rclone.org/rclone-current-linux-arm64.zip -o /tmp/rclone.zip \
  && cd /tmp && unzip -oq rclone.zip && mv rclone-*-linux-arm64/rclone ~/bin/ && cd -
# Ensure ~/bin is on PATH for interactive shells (the scripts add it themselves for cron):
grep -q 'HOME/bin' ~/.profile || echo 'export PATH="$HOME/bin:$PATH"' >> ~/.profile
```

---

## Deploy (with pre-migration snapshot)

Use `scripts/deploy.sh` instead of a bare `docker compose up`: it pulls, takes a `premigrate-<sha>`
snapshot, builds, then `docker compose up -d` (the one-shot `migrate` runs first). **No snapshot, no
migrate:** if backups aren't configured yet it REFUSES (so a destructive migration can't run with no
restore point). To deploy before backups are wired, run `ALLOW_UNBACKED_DEPLOY=1 scripts/deploy.sh`
explicitly.

**Only the images carrying app source are rebuilt** (`app`, `migrate`). `gotenberg` is rebuilt only when
the git tree hash of `gotenberg/` differs from the one recorded on the existing image (a build label, see
`docker-compose.yml`) — the script prints which branch it took. Because the comparison is against the
**image** rather than git history, it stays correct across retries: a failed build writes no label, so
re-running rebuilds instead of silently reusing a stale sidecar.

`FORCE_SIDECAR_BUILD=1` rebuilds it even when it matches (e.g. to refresh the bundled fonts). That is
also the RECOVERY path: `gotenberg/Dockerfile` pins the base by digest and the font package by version, so
the sidecar reproduces from source. There is no old image to fall back to — don't plan on one.

The font install **retries with backoff (5 attempts) and then asserts the package configured and Arial is
actually registered**, so a flaky mirror no longer fails the build on first contact. That retry is the real
fix; the skip logic above only keeps an *unchanged* sidecar off the deploy path. There is deliberately no
"skip a mismatched sidecar" flag: skipping a genuinely changed sidecar would ship app code against a
mismatched image, and for a missing image it wouldn't even work (`up -d --no-build` fails loudly instead of
silently building it).

> **Provenance is currently MATCHED** (verified 2026-07-27, Rock at `5cfd4eb`): `gotenberg/` tree
> `d7c32515…` equals the label on the running image, so `deploy.sh` skips the font build — the steady state
> this mechanism exists to produce. `fc-list` reports 9 Arial faces in that image.
>
> History, for when the same situation recurs: the image originally predated the label entirely, which
> would have forced a rebuild through the un-retried mirror; the label was stamped onto the existing layers
> with a metadata-only build (`FROM lesson3-gotenberg` + `LABEL`) to avoid it — legitimate because
> `gotenberg/` had not changed since that image was built. Adding the font retry then moved the tree, so
> the gate correctly mismatched and rebuilt on the next deploy. That build succeeded on its first attempt,
> which is the retry's first real exercise. Note a `LABEL` is itself a config change, so the image ID moves
> (`54e3ad0b…` → …); what stays fixed is the runtime configuration — user, entrypoint, cmd, exposed port.

> Schema-change caveat unchanged: regenerate types/migrations on the Rock when the schema shifts (the
> local Payload CLI breaks on newer Node) — see `docs/NEXT-SESSION.md` "Deploy".

### After any deploy touching edit recovery: verify the cascade on THIS box

Registering the `edit-recovery` collection made two hooks run on **every version delete and every user
delete**, against a table only its migration creates. CI covers the behaviour and `docker-compose.yml`
gates `app` on `migrate` completing, so the ordinary deploy path cannot ship the app without the
schema. What neither can see is one particular database that has drifted, been restored from a stale
dump, or been migrated by hand — which is what this checks.

Read-only, safe on a live box at any time:

```bash
cd /srv/lesson3 && docker compose run --rm migrate npx payload run scripts/verify-edit-recovery-cascade.ts
```

It reports the table, the compound unique index the fencing protocol depends on, and that both cascade
queries execute against real rows.

`APPLY=1` additionally runs the full drill — create a throwaway version, seed a real recovery row,
delete it through Payload, confirm the row went with it. ⚑ **That WRITES to production data.** It
cleans up after itself including after a failed assertion, but it does briefly put a
`ZZ_DEPLOY_VERIFY_` version on a real plan, so run it when nobody is browsing. `APPLY=1` must go
inside the container with `-e`, as above:

```bash
cd /srv/lesson3 && docker compose run --rm -e APPLY=1 migrate npx payload run scripts/verify-edit-recovery-cascade.ts
```

Exits non-zero on any failed check, so it can gate a script.

### One-off: clear stored editor collapse preferences

Run ONCE after deploying the collapsed-by-default editor rows (2026-07-25). Without it the change is
invisible to everyone who has opened the version editor before — `initCollapsed` is the last of three
fallbacks in Payload's `isRowCollapsed`, and the stored-preferences tier is gated on mere existence, so
any account with saved field preferences never consults it and its rows render expanded.

Run it from the **`migrate` service**, not `app`. The prod `app` image is a minimal Next standalone
without the Payload CLI or `scripts/` source (see the comment on the `migrate` service in
`docker-compose.yml`); `migrate` is built from the Dockerfile's `builder` stage, so it has both. Run
from the repo root, where the compose file lives:

```bash
cd /srv/lesson3 && docker compose run --rm migrate npx payload run scripts/clear-editor-collapse-prefs.ts
```

Reports only. To actually write, pass `APPLY=1` **into the container with `-e`** — a shell prefix would
only set it for the local docker CLI, not for the process inside:

```bash
cd /srv/lesson3 && docker compose run --rm -e APPLY=1 migrate npx payload run scripts/clear-editor-collapse-prefs.ts
```

Idempotent and safe to repeat. New preferences accumulate again as soon as anyone toggles a row — that
is intended.

⚠ **Run it when nobody is editing, and have anyone with the editor open reload afterwards.** The script
reads each preference document, strips the collapse state, and writes the snapshot back, so a
preference saved between those two steps is lost. Worse, an already-open tab holds Payload's in-memory
preference cache and can write the old collapse values straight back after you finish. A quiet moment
plus a reload avoids both; neither is a data-integrity risk (this is UI state), just a wasted run.

It is **surgical**: it strips only `value.fields[<path>].collapsed` and preserves every other stored
preference. It touches only `collection-lesson-bundle-versions-*` keys, so saved LIST columns and sort
order are unaffected. Safe to keep and re-use after go-live — there is no disposable-test-data
assumption baked into it.

**Verify both ways:** a fresh account proves the default works; an account that had used the editor
before proves the clear did. Testing only the fresh one reports success on a no-op.

---

## Structured logging

Payload's `payload.logger` is a **pino** instance — logs are structured JSON. We log errors through it
WITH context (e.g. `generateVersionArtifact` export-job failures), and the level is env-tunable
(`LOG_LEVEL` in `.env`, default `info`). The container log stream is **bounded + rotated by Docker's
json-file driver** (`docker-compose.yml`: `max-size 10m`, `max-file 5` per service) so it can't fill the
disk and recent history is retained.

Deliberately **no error-tracking SaaS** (Sentry etc.): keeps everything on-box, no new dep, nothing to
scrub. *(Amended 2026-07-05, Phase 5 A4: the CAPABILITY now exists and is env-gated — see "Error
tracking" below — but it is **OFF, with no backend chosen**, so this paragraph still describes the
running system. Logs remain the primary on-box stream; with `SENTRY_DSN` unset nothing changes.)* Trade-offs we accept: **no client-side (browser) error capture** —
post-mortems are by grepping the JSON logs; liveness is the heartbeat below, where one is configured.

- Tail live: `docker compose logs -f app` · errors only: `docker compose logs app | grep '"level":50'`
  (`50`=error, `60`=fatal).
- Rotation keeps ~5×10 MB per service; logs reset on container recreation (`up --build`). Durable
  cross-deploy log archival (ship to a file/volume) is a noted follow-up — not built (kept simple).

---

## Error tracking — OFF, optional, no backend chosen (SPEC §11)

The capability shipped in Phase 5 A4 and is **off by default**: the release bundle's `.env.example`
carries `SENTRY_DSN=` empty, and while it is empty every call in `lib/errorTracking.ts` is a no-op. That
is a statement about the shipped default, not a survey of installations — any deployment that sets the
variable turns tracking on. **Nothing needs doing to keep it
that way**, and a local school installation does not need it: Docker's JSON logs cover post-mortems, and
the push heartbeat below covers liveness **once it is set up**. ⚑ That heartbeat is operator setup and is
**not configured on the Rock today** (no `HEALTHCHECK_*` keys in `.env`, no heartbeat cron — verified
2026-09-01), so liveness is currently unmonitored there. Do not read "logs plus heartbeat" as a
description of the running system.

**Two candidate backends have been considered and NEITHER is adopted** (2026-09-01):

- **Self-hosted GlitchTip — rejected.** It would sit on the same box as the app it watches, so a dead
  Rock takes the alerting with it, exactly when it is needed. The drafted stack is preserved in closed
  PR #330 if that trade is ever worth making.
- **Hosted Sentry — not adopted, deliberately deferred.** It solves shared fate but sends error data off
  the box to a third party and needs internet. For a school deployment that is a data-governance
  decision, and it is not a deployment prerequisite, so it stays unmade until something needs it.

⚑ **If it is ever enabled, do not promise what the code cannot deliver.** The context payloads carry ids
and route paths only (`versionId`, `userId`, `messageId`, `kind`, `path`, `routePath`) — but the
exception's own **message and stack** are transmitted, and there is no client-side `beforeSend` scrubber.
An SMTP failure in `passwordResetEmail` can plausibly carry a recipient address inside the error text.
So "no personal data leaves" would be false; the honest claim is that headers and bodies are never
attached. Scrubbing, if it is ever needed, has to happen in the SDK before transmission, not after.

**Entirely opt-in via env** (same pattern as SMTP/backups): with `SENTRY_DSN` unset, every call is a
no-op and the app runs exactly as before. What reports when enabled:

- Unhandled errors in renders / route handlers / server actions (Next `onRequestError` →
  `src/instrumentation.ts`), with route context only — request headers/bodies are deliberately
  dropped, so auth cookies are never attached to a report.
- Job failures (`generateVersionArtifact`, `emailVersionArtifact`, `messagePing`) at their existing
  catch/log seams. ⚑ The **context** we attach is ids only — but the exception's own message and stack
  go with it, unscrubbed, so "no email addresses" is NOT a property of the report. A nodemailer failure
  in `passwordResetEmail` can carry the recipient address in the error text.

**Operator setup (one-time):**
1. **Only if you have decided to enable it** (see above — the default is off): create a project at any
   Sentry-protocol endpoint, hosted or self-hosted, and copy its DSN.
2. Add to the app `.env`: `SENTRY_DSN=https://…` (+ optional `SENTRY_ENVIRONMENT`, default
   `production`).
3. `docker compose up -d app` and confirm a test error arrives (e.g. hit a route that throws in a
   staging window, or temporarily lower a rate limit and watch the event).

No client-side (browser) capture — server-only by design; revisit only if real users report
UI-only failures the server never sees.

---

## Monitoring (push-based heartbeat)

The Rock is Tailscale-only, so we use a **push** (dead-man's-switch) check rather than an external
pinger: the Rock pings OUT on a schedule; if pings stop, the provider alerts. Same mechanism covers
"did the nightly backup run?".

- Provider: a free Healthchecks.io (or similar) check → gives a ping URL.
### One-time setup
1. Create TWO checks at the provider → two ping URLs.
2. In `.env`: `HEALTHCHECK_BACKUP_URL=...` and `HEALTHCHECK_APP_URL=...`.
3. Cron (`crontab -e`):
   ```
   */5 * * * * /srv/lesson3/scripts/heartbeat.sh >> /srv/lesson3/out/heartbeat.log 2>&1
   ```
   (The nightly backup cron already pings the backup check via `backup-db.sh`.)

- **Backup heartbeat:** `backup-db.sh` pings `HEALTHCHECK_BACKUP_URL` on success. Set the check's period
  to ~1 day + a grace window so a missed nightly backup alerts.
- **App-alive heartbeat:** `scripts/heartbeat.sh` probes the app (`HEARTBEAT_APP_URL`, default
  `http://localhost:3001/`) and pings `HEALTHCHECK_APP_URL` ONLY when the app responds — so if the app or
  the box is down, the pings stop and the provider alerts. Set that check's period to ~5–15 min + grace.

---

## Email (SMTP + deliverability)

Outgoing mail — password resets, signup verification, and the content-free "you have a message" ping
— is **opt-in via env**: with `SMTP_HOST` unset the app boots and logs "Email attempted without being
configured" instead of sending (fine for dev). Setting the SMTP vars turns on real delivery. No code,
no migration — it's `.env` + a redeploy. Config lives in `app/src/payload.config.ts` (the
`nodemailerAdapter` block); port 465 selects implicit TLS automatically (`secure: port === 465`).

**Production sender: DreamHost, domain `kenyalessons.org`.** Send from a dedicated mailbox (e.g.
`notifications@kenyalessons.org`) rather than a human `admin@`, and ideally forward that mailbox to
`admin@` so bounces/replies aren't lost. The `.env` block:

```
SMTP_HOST=smtp.dreamhost.com
SMTP_PORT=465
SMTP_USER=notifications@kenyalessons.org
SMTP_PASS=<mailbox password — .env only, never committed>
EMAIL_FROM_ADDRESS=notifications@kenyalessons.org   # keep == SMTP_USER (SPF/DKIM alignment)
EMAIL_FROM_NAME=ARES Lesson Plans                    # display name; this env OVERRIDES the app default
```

DreamHost routes outbound through MailChannels and DKIM-signs automatically — nothing to enable.
`EMAIL_FROM_ADDRESS` must match `SMTP_USER` (a real mailbox; an alias can't authenticate), or
SPF/DKIM alignment breaks.

**Email links (reset + verify) come from `ADMIN_URL`** (fallback `SERVER_URL`), via
`lib/emailLinkBase`. **If BOTH are unset the links render RELATIVE** (`/reset-password?token=…`) and
are unusable from a mail client — hit for real 2026-07-18 when a `.env` edit dropped `ADMIN_URL` and
every reset email shipped a dead link. On the internal host `ADMIN_URL` is the Tailscale URL (clickable
on-tailnet only); **before real users, set it (or `SERVER_URL`) to the PUBLIC URL** or every reset /
verification link points somewhere only tailnet devices can reach. Always send one real reset email
after changing email config and confirm the link is absolute.

**Deliverability — verified 2026-07-18 via DNS (DNS + mail both at DreamHost):**
- **MX** → `mx1/mx2.dreamhost.com` ✓
- **SPF** → `v=spf1 mx include:netblocks.dreamhost.com include:relay.mailchannels.net -all` ✓ (strict)
- **DKIM** → live, auto-published, selector `dreamhost` (`dreamhost._domainkey.kenyalessons.org`) ✓
- **DMARC** → add a TXT record, host `_dmarc`, value
  `v=DMARC1; p=none; rua=mailto:admin@kenyalessons.org` (monitor-only; tighten to
  `p=quarantine`/`reject` later once reports confirm legit mail passes).

**Verify after deploy:** trigger a real email (forgot-password on a known account, or a fresh signup's
verification link) and confirm it lands in the inbox and reads `ARES Lesson Plans
<notifications@kenyalessons.org>`; in Gmail's "Show original" both `SPF` and `DKIM` show **PASS**. A
mail-tester.com run scores SPF/DKIM/DMARC in one shot.

**Not changed on the client (deliberate):** the forgot-password form shows the same "check your inbox"
whether or not the account exists — intentional anti-enumeration (Payload 200s unknown emails). Do NOT
"fix" it to surface send errors: a 5xx only occurs for a KNOWN email, so that would reintroduce an
existence oracle. If a failed *send* must be handled honestly, do it server-side (don't surface send
failures as 5xx), not in the client. See DECISIONS 2026-07-17/18.

## Going public (pre-VPS checklist — Phase 5, 2026-07-05)

The audit's pre-exposure checklist, in execution order. The host-independent code (items marked ✓)
shipped in Phase 5 Track A; what remains here is **operator configuration on the public host**.
`SERVER_URL` is the single public-posture switch: setting it enables strict CSRF AND (when https)
Secure auth cookies AND the empty-users boot guard — the checklist can't be half-applied.

**Standing decisions (2026-07-05, error tracker amended 2026-09-01):** error tracker = **none chosen,
capability OFF** (self-hosted GlitchTip rejected on shared-fate grounds, hosted Sentry deferred as an
external data flow — see "Error tracking" above); `tokenExpiration`
stays 2h under public exposure (ratified — strict CSRF + Secure cookies + SameSite=Lax + auth rate
limits + IdleLogout are the compensating controls); Subject-Admin uniqueness = grant-path lock
(structural index deferred; trigger = assignment write paths multiplying).

1. **TLS + reverse proxy (host decision executes here).** Terminate TLS in front (Caddy is the
   low-config option; nginx/Cloudflare fine too). The proxy must forward `Host` and
   `X-Forwarded-Proto: https`. On a public host, bind port 3001 to loopback or block it at the host/
   cloud firewall so clients cannot bypass the proxy. (The base Compose file intentionally keeps
   3001 reachable for the supported private Tailscale/offline deployment.)
   **A hard request-body ceiling is mandatory at this layer**: application `Content-Length` checks
   are bypassable by an omitted/false header or chunked transfer. The largest legitimate endpoint is
   the Site-Admin batch upload (`262,406,144` bytes including framing), so set a global ceiling just
   above it (for example nginx `client_max_body_size 252m;`). Keep the endpoint's smaller application
   checks as defense in depth. Caddy's `request_body { max_size ... }` is acceptable only on Caddy
   v2.10+ (where that directive is currently experimental); validate the installed version before
   using it. Verify both a declared-length and chunked request over the public URL receive `413`
   before reaching application logs.

   Minimal nginx shape (add the host's certificate/listen configuration separately):

   ```nginx
   server {
       client_max_body_size 252m;

       location / {
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Proto https;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_pass http://127.0.0.1:3001;
       }
   }
   ```
2. **Edge rate limiting** at that proxy — connection/request throttles in front of the app-level
   Postgres limiter (which stays; it's the inner wall). Start conservative (e.g. Caddy
   `rate_limit`/nginx `limit_req` ~10 r/s per IP with burst, tighter on `/api/users/login` and
   `/api/users/forgot-password`) and tune from logs.
3. **Seed users BEFORE DNS points at the box.** On an empty DB, Payload's unauthenticated
   first-register hands Site Admin to the FIRST visitor (verified live 2026-07-05). ✓ The app now
   REFUSES to boot with `SERVER_URL` set and zero users. Either restore a backup first, create the
   admin while unexposed (boot without `SERVER_URL`, register, then set it), or run ONE deliberate
   bootstrap boot with `ALLOW_FIRST_USER_BOOTSTRAP=1` and unset it after registering.
4. **Set `SERVER_URL=https://…` in `.env`** → strict CSRF (Payload Origin/Sec-Fetch allowlist,
   Codex #1) + ✓ Secure auth cookies derive automatically (lib/publicPosture.ts). Note the
   documented trade-off: browsers that send neither Origin nor Sec-Fetch-Site on same-origin
   requests (older Safari ≤16.x) get bounced to login under strict CSRF — acceptable for public
   exposure, revisit only if real users hit it.
5. **Error tracking — decide first (see "Error tracking" above; nothing is adopted today).** If you do
   adopt one, set `SENTRY_DSN` and confirm a test event actually arrives, rather than trusting that the
   variable is set.
6. **Verify, over the public URL:**
   - `curl -sD- https://…/login` → `Content-Security-Policy` with a fresh `'nonce-…'` per
     request ✓ (shipped: middleware CSP), `Set-Cookie` on login carries `Secure`.
   - `test:http` against the public base (`E2E_BASE_URL=https://…`) — the suite asserts the CSP,
     auth gates, and rate limits over the wire.
   - Backups + heartbeat crons live (sections above); Gotenberg image digest-pinned ✓.
7. **Local ARES-server deployments** (SPEC's offline box): keep `SERVER_URL` EMPTY (or http) —
   they stay on the internal posture (Lax-cookie CSRF, no Secure flag over plaintext) by design.
