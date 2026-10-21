# Backup and recovery — revised design (proposal)

**Status: PROPOSAL, not approved (2026-10-21).** Nothing here is authorized for implementation until the
operator approves Phase A. Phase B is a plan to be designed together with the on-hold USB installer
work. This replaces Claude's first 13-item proposal (chat, 2026-10-21), after a Codex review that
reframed it around one question.

## The question this design answers

**If the server dies, can the school get its working system back — and does the Manage page tell the
truth about that?**

The acceptance test for the whole design (Phase B's gate) is concrete: *with the original server
unavailable, the designated person recovers using only the retained materials, signs in, opens a known
lesson, and exports DOCX and PDF.* For an offline school the test runs with no internet and no ARES
help. Each run records how much work was lost (time between the backup and the failure) and how long
recovery took.

## What exists today (verified against `main`, 2026-10-21)

- `scripts/backup-db.sh`: `pg_dump -Fc` inside the Postgres container → `age` to one or two
  recipients (ARES, optional school; SPEC §11) → `rclone` to Google Drive or a mounted removable drive.
  A removable destination must be a different device from `/` and carry a `.lesson3-backup-volume`
  sentinel, so a missing drive fails instead of filling the boot disk. GFS retention: 7 daily, 4 weekly,
  12 monthly by count; `premigrate/` by age.
- Pre-update snapshots are automatic: `scripts/deploy.sh` and `deploy/online/update.sh` take a
  `premigrate` backup and abort the update if it fails. Nightly/weekly/monthly backups depend on cron
  lines the operator adds by hand (`docs/OPS.md` step 5); the installer does not add them.
- After a successful upload the script atomically writes `out/ops/backup-status.json` (version 1:
  `completedAt`, `stream`, `destination`, `filename`, `encryptedBytes`). It holds **only the latest
  success**, so a `premigrate` snapshot hides an earlier nightly one, and failures leave no trace.
- *Manage → System* shows three backup rows: destination, school recovery key, most recent successful
  backup. The last is `ok` at **any age**. Values are ISO UTC timestamps and raw settings
  (`drive:lesson3-backups`, `BACKUP_RCLONE_REMOTE`). It answers configuration questions, not "am I
  protected?".
- `scripts/restore-db.sh` defaults to a throwaway `lesson3_restore_check` database and verifies by
  counting every table (users must be non-zero). With `--force-prod` it **drops the live `lesson3`
  database first** (line 95) and then runs `pg_restore`; verification runs afterwards. A truncated or
  incompatible backup therefore destroys the live data before anything checks it. Nothing checks that
  the backup's schema (migrations) matches the installed software.
- The database is the whole corpus: no collection stores uploaded files on disk; DOCX/PDF are
  regenerated. But a backup does **not** contain `.env` (`PAYLOAD_SECRET`, `POSTGRES_PASSWORD`, the
  backup settings), the deployment files, or the container images. Images come from `ghcr.io` by
  digest, which an offline school cannot pull.

Unchanged decisions this design keeps (DECISIONS 2026-10-04, SPEC §11): *Manage → System* stays
read-only and never starts a backup or a restore; the private recovery keys never live on the server;
Site Administrator is an application role, not proof of server access or key custody.

## Phase A — make it honest and make restore safe (small; proposed for approval)

### A1. Restore never destroys the live database before the replacement is proven

`restore-db.sh --force-prod` becomes a staged swap:

1. Restore into a new database `lesson3_incoming_<UTC>`; never touch `lesson3` yet.
2. Verify it there: the existing all-table count check, **plus** a schema check. The backup's
   `payload_migrations` set must match what the installed software expects (equal, or a strict prefix
   that `migrate` can bring forward). A backup taken on newer software is refused with a plain message.
3. Refuse unless there is disk space for both databases (checked before step 1).
4. Require the app to be stopped (it already is in practice, since `DROP` fails with live connections).
   Print exactly what will happen and require a typed confirmation, e.g. the backup's date.
5. Swap by renaming: `lesson3` → `lesson3_before_restore_<UTC>`, then `lesson3_incoming_<UTC>` →
   `lesson3`. Start the app; run the health check (`/` → 307).
6. Keep `lesson3_before_restore_<UTC>` until someone deliberately removes it
   (`restore-db.sh --discard-previous <name>`). `restore-db.sh --undo` reverses the rename.

This is Codex's correction in concrete form: preserve the current database, validate the incoming one in
isolation, and make replacement an explicit, reversible step. It does not make every mistake reversible.
Restoring a backup that is valid but too old still loses that work; `--undo` covers it only until the
previous database is discarded.

### A2. Record each backup stream separately, failures too, and the moment the backup covers

`backup-status.json` version 2 keeps, **per stream** (`daily`, `weekly`, `monthly`, `premigrate`), the
last success and the last failed attempt. Each success records:

- `coversUntil`: when `pg_dump` started. That is the moment whose data the backup holds, which is what
  "work up to Tuesday 8 pm is protected" means.
- `completedAt`, `filename`, `encryptedBytes` and `destination`, as today.

A failure records time, stage (dump / encrypt / upload / drive missing) and one line of reason, and is
written by an exit trap, so a failed run is visible instead of silent. The app keeps reading version 1
until the script writes version 2 (forward-compatible reader). A malformed file is still `Unknown`,
never "no backups".

### A3. Overdue is measured against an agreed schedule, not inferred

New setting `BACKUP_EXPECTED_EVERY` (for example `1d` or `7d`) is the agreed tolerance for losing work.
Internet connectivity does not decide it. "Overdue" means no successful **scheduled** backup
(`daily`/`weekly`/`monthly`; `premigrate` does not count) within that interval plus a grace period.
When the setting is unset the page says the schedule has not been agreed, and does not pick a number for
the school.

### A4. A recovery contact, shown as recorded rather than verified

New settings `BACKUP_RECOVERY_CONTACT` (who recovers this system and how to reach them) and
`BACKUP_KEY_HELD_BY` (where the school's private key is kept, for example "Head teacher's safe").
The page shows them as "Recorded as …", because the server cannot check either. They are server
settings like every other row's, so the read-only rule holds. If unset, the page says so as a problem:
"Nobody is recorded as responsible for recovery."

### A5. The page answers four questions, and hides the technical details behind a fold

One **Backups** section replaces the three rows. Status badge: **Protected / Needs attention / Not
protected**, always with a one-line reason.

```
Backups                                              ● Protected
──────────────────────────────────────────────────────────────────
Is anything wrong?   No. Last scheduled backup finished 6 hours ago.
What is protected?   Work saved before today, 2:00 AM (your time).
What must I do?      Nothing today. Backups run every night to Google Drive.
Who can recover?     Recorded as: Jane Mwangi, IT office, 0712 …
                     School key recorded as: Head teacher's safe

If you ever need to restore
  ⚠ Restoring replaces this server's data with the backup's. Work saved after
    the backup is lost. The current data is kept aside until someone removes it.
  Recovery is done by the person above, on the server, with the private key —
  never from this page. Instructions: Guide → Backups and recovery.

▸ Technical details (for the server operator)
    Destination, setting names, per-stream last success and last failure,
    filename and size, recipients (ARES / school) with short fingerprints.
```

Example lines for the other states: "Backup overdue — last scheduled backup finished 9 days ago (agreed:
every 7 days)"; "Last backup attempt failed at 2:00 AM: the backup drive is not connected"; "Only
pre-update snapshots in the last 30 days — scheduled backups may not be set up". That last one is
reworded from the first proposal: with per-stream records it is now a fact, not a guess. Removable
destination, normal case: "What must I do? Connect the school's backup drive and run the backup. Then
take the drive away from the server."

Times are shown in the viewer's local time with a relative age; UTC appears only under Technical
details.

**Dropped from the first proposal, as Codex argued:** "last proven restorable" (today's check proves
the database restores, not that a replacement system works; Phase B replaces it with a real recovery
receipt); fingerprints and drive rotation as headline facts (technician evidence only; a different
drive id does not prove a drive left the building); free-space and "how far back" rows (technical
details at most).

### A6. Words stay in step

`USER_GUIDE.md` and `/guide` change in the same PR (the Guide parity tests enforce it), and so do
`docs/OPS.md` and SPEC §11.

**Phase A gates:** unit tests for the status reader (v1 and v2, malformed, overdue arithmetic, each
badge state); a script test for A1 covering refuse-without-space, refuse-newer-schema, swap, health
check and `--undo`, against the isolated probe stack; the existing backup and restore script tests; the
full gate. No new endpoint: the panel is server-rendered from facts. If one is added, it ships with
401/403/404 wire tests (CLAUDE.md).

## Phase B — a recovery package and a demonstrated recovery (plan; design with the installer)

A database dump cannot rebuild a dead server. Phase B makes the retained materials sufficient:

- **Recovery package**, produced with each backup or each release:
  - the database dump (exists);
  - `.env`, encrypted to the same recipients;
  - a manifest: Lesson3 version, image digests, migration head, `coversUntil`;
  - **per release, not nightly:** the matching release bundle and `docker save`d images, so an
    offline school can reinstall the same software. This is the same artifact the on-hold USB installer
    needs (memory: waiting on Mark's install script). Build it once for both purposes.
- **A guided recovery procedure** (`scripts/recover.sh`, plus a printed one-page sheet kept with the
  key). It covers a fresh machine: install from the package, restore through A1's staged path, start,
  and check. The sheet exists because the instructions must be available when the server is not.
- **A recovery receipt.** The drill runs off-box, where the key is, so the server cannot see it. The
  drill writes a small receipt to the backup destination. The next backup run reads it into the status
  file, and the page can then show "Last full recovery test: 3 Oct, by Jane — 40 minutes, 1 day of work
  at risk". The headline only says "recovery tested" for a drill that met the acceptance test above.
- **The acceptance test**, run on a clean machine (offline for an offline school), with lost-work and
  recovery-time recorded in DECISIONS. Repeat on a schedule the operator sets (for example once a term).

## Decisions needed from the operator

1. Approve Phase A as scoped (A1–A6)?
2. The default for `BACKUP_EXPECTED_EVERY`, online and offline. Proposed: online `1d`, offline `7d`;
   the school can tighten it.
3. Should `.env` go into the backup now (Phase A) as an encrypted second file, or wait for the Phase B
   package? Proposed: wait. On its own it does not make recovery possible, and it widens what a leaked
   key exposes.
4. Who is the recovery contact for the demo server (the Rock)?
5. Phase B timing: start with the USB installer when Mark's script arrives, or design it separately now?

## Not in scope

No restore or "back up now" button (DECISIONS 2026-10-04 stands). No automatic restore. No change to
encryption, recipients or retention. No off-box monitoring service.

## Review note

Codex's 2026-10-21 review read an older checkout (`~/Documents/GitHub/Lesson3`, at #394, 2026-10-14).
Its findings were re-checked against current `main` and hold. Future reviews should be pointed at the
current checkout.
