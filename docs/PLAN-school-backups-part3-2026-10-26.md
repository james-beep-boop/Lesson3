# Part 3 — Backups for school machines (implementation plan)

**Status: PROPOSAL for operator approval, 2026-10-26. No code is written.** Build part 3 of
`docs/DESIGN-school-commissioning-and-updates-2026-10-26.md` (§8). Needs no test machine: everything
below runs in the existing restore/backup stack tests. Commissioning (part 5) will call the setup command
this part adds; until then a technician or operator runs it by hand.

Proposed as **two PRs**: 3a (the backup script and its records) and 3b (setup, the password-locked key,
and what Manage → System says).

## What a school gets

- **Backups that start themselves.** The schedule is installed by one setup command, not hand-written
  cron lines (`docs/OPS.md` step 5 today).
- **A backup on the server's own disk, always.** Protects against a bad update, an accidental deletion or
  a corrupted database. It does **not** survive disk failure, theft, fire, or a reinstall wipe, and the
  page says so in those words.
- **A backup on a USB drive, when the school has one.** The better protection: it can leave the
  building. It needs someone to plug the drive in and take it away; the page says when that is overdue.
- **A backup password instead of a key file.** Recovery needs a backup and the password. ARES's own key
  still opens every backup as the safety net.
- **No backup folder can be shared by two schools** (the copied-image failure in the design's §2).

## Existing pieces it builds on (checked against `main` at `879cba0`)

- `scripts/backup-db.sh`: `pg_dump` in the Postgres container → `age` to one or two recipients
  (`BACKUP_AGE_RECIPIENT` = ARES, `BACKUP_AGE_RECIPIENT_SCHOOL` = school) → `rclone` to **one**
  destination (`BACKUP_RCLONE_REMOTE`). A local destination must be a separate device from `/` with a
  `.lesson3-backup-volume` sentinel. GFS streams with count/age pruning, an `flock`, and **per-stream**
  records in `out/ops/backup/<stream>.json` (Phase A, A2).
- `lib/backupStatus.ts`: the pure derivation behind Manage → System → Backups — factual statements only,
  each `ok` / `attention` / `unknown`, never an overall "protected".
- `scripts/restore-db.sh`: the staged, journaled restore; decrypts with `age -d -i "$AGE_IDENTITY"`.
  `age` natively accepts a **passphrase-protected identity file** there and asks for the passphrase.

## PR 3a — the script and its records

1. **Two destinations, each optional, at least one required.**
   - `BACKUP_DISK_DIR` (new): a directory on the server's own disk, default `/var/lib/lesson3-backups`,
     **outside Docker's volumes** so removing containers or volumes cannot take the backups with it.
     It is the one place a same-device destination is allowed; the separate-device rule for removable
     drives is unchanged.
   - `BACKUP_RCLONE_REMOTE` (existing): the USB drive's mount point (or a cloud remote).
   - One `pg_dump` and one encryption per run; the encrypted file is then copied to each destination.
     A destination that fails does not stop the other.
2. **A missing USB drive is "not connected", not a failure.** The run records it and carries on to the
   disk. Whether that matters is judged by age (step 4), because a drive that is rightly kept away from
   the server will often be absent at 02:00.
3. **Per-destination records.** `out/ops/backup/<destination>/<stream>.json` with destination `disk` or
   `usb` (or `remote` for a cloud remote), same version-2 format. Transition: an existing
   `out/ops/backup/<stream>.json` is read as the `usb`/`remote` destination's record until that
   destination writes its own; the app keeps reading version 1 as it does today.
4. **Freshness per destination.** `BACKUP_MAX_DATA_LOSS` (existing agreement) applies to the disk backup.
   New `BACKUP_USB_MAX_AGE` (default `7d`) says how old the newest USB backup may be before it is
   "overdue — plug in the backup drive".
5. **Disk retention and space.** The disk keeps fewer copies (proposed 7 daily, 4 weekly, 3 monthly,
   settable). Before writing, the script checks free space for the new file plus a margin and, if short,
   records "disk nearly full" instead of filling the server's disk.
6. **One installation per destination.** On first use the script writes `.lesson3-installation` at the
   destination's root, holding this installation's ID (read from the database through the Postgres
   container). Afterwards it **refuses to write to or prune** any destination whose marker names a
   different installation: *"This backup drive belongs to another installation (…). Not writing to it."*
   An existing destination with Lesson3 backups but no marker is adopted (it predates the marker).
7. **Tests (stack, extending `scripts/test-backup-status.sh` and the restore stack):** both destinations
   written by one run; USB absent → disk still written, USB "not connected"; a foreign marker → refused,
   nothing pruned; adoption of an unmarked destination; disk-space refusal; per-destination records; the
   app's reader with old and new record layouts; restore from each destination.

## PR 3b — setup, the backup password, and the page

1. **`scripts/setup-school-backups.sh`** — the one command a technician (or commissioning) runs:
   1. Asks whether there is a USB drive; if so, prepares it (the sentinel and the marker).
   2. **Backup password.** Suggests four random words (e.g. *river-lantern-mango-seven*) from a vendored
      word list, or accepts the technician's own of at least 12 characters, typed twice. Then it asks
      the technician to **type it back** to show they have written it down; nothing is locked with it
      before that.
   3. Creates the school's key pair with `age-keygen`. The private half is immediately **locked with the
      password** (`age -p`), and the locked copy is written to the disk backup folder and the USB drive.
      The unlocked private half is never written to disk.
   4. Writes the public half to `.env` as `BACKUP_AGE_RECIPIENT_SCHOOL`. ARES's recipient
      (`BACKUP_AGE_RECIPIENT`) is unchanged and the same at every school, by design.
   5. Installs the schedule as `/etc/cron.d/lesson3-backups` (daily, weekly, monthly), runs the first
      backup, and **restores it into a throwaway database** to prove it works (the existing drill path).
   6. Prints the **recovery sheet**: school name, installation ID, where the backups are, the password,
      and the three recovery steps. ⚑ The password appears **only on this sheet** — never in any file,
      log or receipt.
   - **Resumable** (design §7d): it records each finished step; a re-run after a power cut continues,
     reuses the key already made, and never makes a second key that would orphan backups already taken.
2. **Restore with the password.** `restore-db.sh` accepts the locked key as `AGE_IDENTITY` (`age` asks for
   the password); `OPS.md` and the recovery sheet say: *plug in the drive, run the restore, type the
   password.* ARES's own key still works as before.
3. **Manage → System → Backups** states each destination separately, e.g.:
   - *"Disk backup: up to date — work saved before today, 2:00 AM is in a backup. This backup is on the
     server's own disk and will not survive if the disk fails or the server is reinstalled."*
   - *"USB backup: overdue — the newest is 9 days old. Plug in the backup drive."* /
     *"USB backup: none set up. Add a USB drive for a backup that can leave the building."*
   - *"School recovery key: password-locked (set up 26 Oct 2026)."*
   No overall "protected", as today. A fresh disk backup never hides an overdue USB one.
4. **Tests:** the setup script end to end in the stack (word-list suggestion, typed-back check, key
   locked, recipient written, cron file installed, first backup, drill); resume after a kill at each
   step reuses the key; restore with the locked key and the right password, and refusal with a wrong
   one (the passphrase is supplied through a pseudo-terminal, since `age` reads it only from a
   terminal); the status derivation for every per-destination state; the recovery sheet never written to
   disk.

## SPEC and docs in the same PRs

SPEC §11 (two destinations; disk honesty; per-destination freshness; the installation marker; the
password-locked school key and that the password is never stored), `docs/OPS.md` (setup and restore
steps replace the hand-written key and cron steps for school installs), the Guide's backup section, and
`docs/DESIGN-backup-recovery-2026-10-21.md` (cross-reference: Phase B's recovery uses the same locked
key and markers).

## Open for the operator

1. **USB habit.** The plan assumes the drive normally stays plugged in, is backed up to nightly, and is
   taken away when someone can (weekly at best), with "overdue" after **7 days**. Is 7 days right for
   schools, or longer?
2. **Disk retention:** 7 daily, 4 weekly, 3 monthly copies on the server's own disk. Fine?
3. **Word list.** The four-word suggestion needs a word list in the repository. Proposed: the EFF large
   word list (7,776 common English words, CC BY 3.0, credited in `NOTICE`). Four words from it, locked
   with `age`'s slow password hashing, are strong enough for a school backup.

## Size

3a about two days; 3b about two days. Both are mostly shell and stack tests, plus the status derivation.
