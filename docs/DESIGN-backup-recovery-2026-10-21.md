# Backup and recovery — revised design (proposal)

**Status: PROPOSAL, not approved. Revision 2, 2026-10-21.** Nothing here is authorized for implementation
until the operator approves it. Revision 1 (`cc14977`) followed Codex's first review. This revision folds
in Codex's second review (five amendments plus the schedule point) and opens Phase B for decision now,
instead of leaving it to wait on the paused USB installer.

**What Phase A is, said plainly:** interim risk reduction. It makes restore safe and makes the page
truthful. It does **not** establish that a school can recover its working system. Only a demonstrated
Phase B recovery may be described that way, on the page or anywhere else.

## The question this design answers

**If the server dies, can the school get its working system back — and does the Manage page tell the
truth about that?**

**Acceptance test (Phase B's completion condition):** with the original server unavailable, the
designated person recovers using only the retained materials, signs in, opens a known lesson and exports
DOCX and PDF. For an offline school the test runs with no internet and no ARES help, and includes
obtaining a usable operating system, Docker, the recovery utilities, compatible images, the
configuration and the private key from those materials. Each run records the work lost (the time between
the backup's data and the failure) and the time to recover.

## What exists today (verified against `main`, 2026-10-21)

- `scripts/backup-db.sh` runs `pg_dump -Fc` inside the Postgres container, encrypts with `age` to one or
  two recipients (ARES, optional school; SPEC §11), and sends the file with `rclone` to Google Drive or a
  mounted removable drive. A removable destination must be a different device from `/` and carry a
  `.lesson3-backup-volume` sentinel. GFS retention: 7 daily, 4 weekly and 12 monthly by count;
  `premigrate/` by age.
- Pre-update snapshots are automatic (`scripts/deploy.sh`, `deploy/online/update.sh`). Routine
  backups depend on cron lines added by hand (`docs/OPS.md` step 5). The server cannot see whether they
  are installed.
- `out/ops/backup-status.json` (version 1) holds **only the latest success**. A `premigrate` snapshot
  overwrites the evidence of an earlier routine backup, and failures leave no record.
- *Manage → System* shows destination, school recovery key and most recent backup. The last is `ok` at
  **any age**, in ISO UTC, beside raw settings.
- `scripts/restore-db.sh --force-prod` **drops the live database first** (line 95) and runs
  `pg_restore` afterwards; it verifies only after that. Nothing checks the schema against the installed
  software, and nothing stops writers beyond `DROP` failing while connections are open.
- The database is the whole corpus (no collection stores files on disk; DOCX/PDF regenerate). A backup
  does not contain `.env`, the deployment files, the container images (pulled from `ghcr.io` by digest),
  or the `rclone` credentials needed to reach the backup storage.

Kept unchanged (DECISIONS 2026-10-04, SPEC §11): *Manage → System* is read-only and never starts a
backup or restore; private recovery keys never live on the server; Site Administrator is an application
role, not proof of server access or key custody.

## Phase A — interim risk reduction (two PRs; proposed for approval)

### A1 (PR 1). Restore never destroys the live database before the replacement is proven

`restore-db.sh --force-prod` becomes a staged, journaled replacement. Every step is idempotent and
recorded in `out/ops/restore-journal.json`, so a re-run after an interruption either completes or
reverses the operation, and never guesses.

1. **Preflight, before touching anything:** a backup file is named; the private key decrypts it; there is
   disk space for both databases plus the decrypted dump; the installed software's version is known.
2. **Stage:** restore into `lesson3_incoming_<UTC>`. Verify there: the existing all-table count check, then
   the schema check. The backup's `payload_migrations` must be equal to, or a strict prefix of, the
   installed software's migrations. A backup from newer software is refused. Then run the installed
   `migrate` image against the **incoming** database, so nothing unmigrated ever goes live.
3. **In-server check on the incoming database:** read a known lesson plan through Payload's Local API
   and render its DOCX and PDF (through the running Gotenberg), using a check that needs no password.
4. **Stop every writer:** print exactly what will happen and require a typed confirmation (the backup's
   date). `docker compose stop app`, which also stops background jobs. Then
   `ALTER DATABASE lesson3 ALLOW_CONNECTIONS false`, terminate any remaining backends, and confirm none
   remain.
5. **Swap atomically:**
   `BEGIN; ALTER DATABASE lesson3 RENAME TO lesson3_before_restore_<UTC>; ALTER DATABASE lesson3_incoming_<UTC> RENAME TO lesson3; COMMIT;`
   Verified on the pinned Postgres 16.15 on 2026-10-21: both renames commit together, so a half-renamed
   state cannot occur. Re-allow connections on the new `lesson3`.
6. **Start and confirm:** start the app and repeat the in-server check against the live system. The
   replacement is then **provisional**. The operator signs in, opens a known lesson, exports it, and runs
   `restore-db.sh --confirm`. Automation cannot sign in without someone's password, which is why this
   step is a person.
7. **Undo** (`restore-db.sh --undo`, allowed until `--discard-previous`): it says plainly that **work saved
   after the restored database went live will be lost by undoing**. Before reversing, it takes a
   `prerestore-undo` backup of the current database, so that work is not lost silently. It then stops
   writers again, swaps back in one transaction and restarts.
8. **Startup failure:** if step 6's automatic check fails, the script offers `--undo` and does nothing on
   its own.

**A1 tests** (isolated probe stack): refusals (no space, wrong key, newer schema); migration applied to the
incoming database only; writers blocked (a held connection is terminated, a new connection is refused);
interruption at each journal step, then a re-run completes or reverses; atomic swap; startup-failure
path; undo with post-swap work captured in the undo backup; `--discard-previous`.

### A2 (PR 2). Backup records: one per stream, locked, judged by what the data covers

- **One record file per stream** (`out/ops/backup/{daily,weekly,monthly,premigrate}.json`), each
  written atomically, so no process rewrites another stream's record. `backup-db.sh` holds an `flock`
  for the whole run, which also stops two backups running at once.
- Each success records `coversUntil` (when `pg_dump` began, the moment whose data the backup holds),
  `completedAt`, `filename`, `encryptedBytes` and `destination`. Each stream also keeps its
  **last failed attempt**: time, stage (dump / encrypt / upload / drive missing) and one line of reason,
  written by an exit trap.
- A small **observed history** (the last 31 `coversUntil` values for each routine stream) lets the page
  report what actually happened, not what a schedule intends.
- **Freshness is judged by `coversUntil`**, never by upload time, since a new upload can carry old data.
- **Transition:** the app reads version 1 until per-stream records exist. In between, and whenever history
  is shorter than the period being described, the page says **"Unknown — history incomplete"**, never
  "only pre-update snapshots".

### A3 (PR 2). The school's agreement, not a default

Two settings record an explicit agreement with the school. They are not picked by Lesson3:

- `BACKUP_MAX_DATA_LOSS` (for example `1d`): how much lost work is acceptable. A routine backup whose
  `coversUntil` is older than this makes the backup **overdue**. A weekly figure means accepting the loss
  of a week's work, and the Guide says so.
- `RECOVERY_TARGET_TIME` (for example `2d`): how quickly service must return. Phase A only displays
  it. Phase B's acceptance test measures against it.

Unset means **"Not agreed"**, shown as a problem to resolve, with no number filled in for the school.

### A4 (PR 2). Who recovers, recorded and not verified

`BACKUP_RECOVERY_CONTACT` (who, and how to reach them) and `BACKUP_KEY_HELD_BY` (where the school's
private key is kept) are server settings, shown as "Recorded as …". If unset, the page says so as a
problem.

### A5 (PR 2). The page: factual statements only, no overall "Protected"

The page states separate facts. Each statement has its own state: up to date / attention / unknown.

```
Backups
──────────────────────────────────────────────────────────────────
Backup up to date        Work saved before today, 2:00 AM (your time) is in a backup.
                         Agreed limit: no more than 1 day of work lost.
Routine backups          Recorded on 7 of the last 7 days.
Last attempt             Succeeded.
Full recovery            Not yet tested.  ⚠
Who recovers             Recorded as: <name, how to reach them>
School recovery key      Recorded as kept in: <place>

If you ever need to restore
  ⚠ Restoring replaces this server's data with the backup's. Work saved after the
    backup is lost. The current data is kept aside until someone removes it.
  Recovery is done on the server by the person above, with the private key —
  never from this page. Instructions: Guide → Backups and recovery.

▸ Technical details (for the server operator)
    Destination and setting names; each stream's last success (coversUntil,
    completedAt, file, size) and last failure; recipients with short fingerprints.
```

Other wording, chosen so that each line claims only what the records show:

- "Backup overdue — the newest backup holds work up to 9 days ago (agreed: 1 day)"
- "Last attempt failed at 2:00 AM: the backup drive is not connected"
- "No recent routine backup recorded"
- "Unknown — history incomplete"
- "Backup limit not agreed"

For a removable destination, the action line reads: "Connect the school's backup drive and run the
backup. Then take the drive away from the server." There is no "Backups run every night" anywhere: the
server cannot see the schedule, only its results. Times are local with a relative age; UTC appears
only under Technical details. **"Full recovery" shows "Not yet tested" until Phase B produces a recovery
receipt that met the acceptance test.**

### A6. Words stay in step

The Guide, `USER_GUIDE.md`, `docs/OPS.md` and SPEC §11 change in the same PR as the behaviour they
describe; the Guide parity tests enforce it.

**PR 2 gates:** status-reader unit tests (v1, v2, malformed, history shorter than the window, overdue
by `coversUntil`, every statement's states); concurrency test (two backup runs at once: the second waits
on the lock, and both records survive); exit-trap failure records; the full gate.

## Phase B — recoverability (open now; decisions below)

Phase B makes the retained materials sufficient to rebuild the working system on a clean machine, and
proves it with the acceptance test. It may share work with the USB installer but **does not wait for
it**. The main issues and the proposed answers:

1. **Owner and completion date.** Someone at ARES owns it. Completion means the acceptance test has
   passed: once for an online install, and once offline on a clean amd64 machine, run by a technician
   rather than a developer. *Operator decides owner and date.*
2. **The recovery kit = the release stick.** Restores migrate forward, so the kit needs software **at
   least as new as** the backup, not an exact match. One kit per release, written when that release is
   installed, therefore covers every backup taken on it. The kit holds:
   - the release bundle;
   - `docker save`d images for app, migrate, Gotenberg and Postgres, checked against the compose digest
     pins;
   - the Docker engine packages for the agreed Ubuntu version;
   - static `age` and `rclone` binaries;
   - `recover.sh` and the printed sheet.
   
   The update stick the installer design already proposes is the same artifact. Build it once.
3. **Operating system.** Ubuntu install media (one per kit, or a separately kept stick), plus a stated
   minimum amd64 machine. *Operator: confirm the Ubuntu version (also open in the installer plan), and
   say whether a teacher laptop may serve as a stopgap host.*
4. **Configuration: regenerate, do not copy.** Most of `.env` is either generated (`PAYLOAD_SECRET`,
   `POSTGRES_PASSWORD`) or a default. The installation id and all content live in the database. The kit
   records only the school-specific values (server address, SMTP, backup destination and recipients) in
   a small manifest, encrypted to the same recipients, and `recover.sh` generates fresh secrets. This
   avoids keeping a copy of live secrets. *To verify before relying on it:* that nothing stored needs
   the old `PAYLOAD_SECRET` (password hashes are salted PBKDF2 and do not; sessions and reset links
   become invalid, which is acceptable).
5. **Access to the backup storage.** Online, the `rclone` Google Drive credentials die with the server.
   A second, read-only credential must be kept with the key holder. Offline, the rotated drive is the
   storage, so "access" means physically having the off-site drive. *Operator: who holds the Drive
   credential for each online install.*
6. **The private key in an emergency.** The `age` identity is one line of text, so it can be printed
   (with a QR code) and kept in a sealed envelope in the school safe, plus ARES's copy. A passphrase
   protects against theft but risks a forgotten passphrase, which means total loss. *Proposal: no
   passphrase; use physical custody and the two recipients.* The kit and the key are never stored
   together. Each recovery test also checks the key: `age-keygen -y` must match the recorded fingerprint.
7. **Finding the new server.** Teachers reach the server by its LAN address or name (and ARES links use
   `ares.local`). A replacement machine must take over that address or name, or every bookmark breaks.
   `recover.sh` sets the hostname and the sheet covers the router reservation. *Easy to forget; it must
   be part of the acceptance test.*
8. **Who actually does it.** The technicians have modest skills (installer discussion, 2026-10-12). Hence
   one command, a printed one-page sheet, and plain progress messages, with the acceptance test run by
   such a technician.
9. **Proof that is visible.** After a test, `recover.sh` writes a recovery receipt (date, who, versions,
   work lost, time taken, pass/fail per acceptance step) to the backup destination. The next backup run
   reads it into the records, and only then does the page's "Full recovery" line change from
   "Not yet tested". The test repeats on the schedule in the school agreement (for example, once a term).

### Interim stopgap, until Phase B is complete (proposed to start now)

For each installation, the person responsible keeps the following **in two places away from the
server**, with the key never stored beside the kit:

- the school's private key, printed;
- for online installs, a read-only Drive credential;
- for offline installs, one current backup drive;
- the release bundle and saved images for the installed version, on a USB stick (written at each update);
- the school-specific configuration values, on paper.

This is manual and untested. The page still says "Full recovery: Not yet tested".

## Decisions needed from the operator

1. Approve Phase A as two PRs (A1 first, then A2–A6)?
2. For each school: the agreed maximum data loss and recovery time, or record them as "Not agreed".
3. Phase B owner and completion date.
4. The Ubuntu version, and the minimum replacement hardware.
5. Who holds the read-only Drive credential for online installs.
6. Key protection: physical custody without a passphrase (proposed), or a passphrase?
7. Start the interim stopgap now?
8. The demo server (the Rock): who is the recovery contact, and where is its key kept?

## Not in scope

No restore or "back up now" button (DECISIONS 2026-10-04 stands). No automatic restore. No change to
encryption, recipients or retention. No off-box monitoring service.

## Review notes

- Codex review 1 (2026-10-21) read an older checkout (`~/Documents/GitHub/Lesson3`, at #394); its findings
  were re-checked against current `main` and hold.
- Codex review 2 read this file at `cc14977` from GitHub. Accepted: no "Protected" in Phase A; a fuller
  restore contract (writers blocked, migrate incoming, real checks, interruption, undo semantics);
  statements limited to what the records show, including an unknown state; per-stream records with
  locking and `coversUntil` freshness; a Phase B owner and completion condition; an explicit school
  agreement instead of default schedules.
