# Operations manual

This manual has two parts.

- **Part 1 is for the school technician**: backups, checking a backup, recovering lost data, and
  preparing a machine for another school. It is written in plain steps.
- **Part 2 is the technical reference for the ARES operator**: how each script works, the developer's
  own server, monitoring, email and going public.

To install the program, update it, or create the first administrator, use **DEPLOYMENT.md** in the
installation folder ([online copy](https://github.com/james-beep-boop/Lesson3/blob/main/docs/LOCAL-SERVER-DEPLOYMENT.md)).
Its "Words used in this manual" section explains terms such as *terminal*, *installation folder* and
*`.env` file*.

---

# Part 1 — For the school technician

Run every command in a terminal on the server, from the installation folder (normally
`/srv/lesson3`), with the same server login you used to install. **If a command shows an error, stop
and keep the exact message.** Do not start a new installation over the old one: an unfinished restore
or update has its own way to carry on, described below.

Keep these three things apart:

- the **ARES Lesson Plans sign-in password** — what people type in the browser;
- the **backup password** — on the school's recovery sheet; it unlocks the backups;
- the **secrets in `.env`** — used by the program itself. Never change them, and never copy them to
  another school.

| What you need to do | Go to |
| --- | --- |
| Set up a school's backups for the first time | [Set up backups](#school-setup-password-locked-recovery-key) |
| Make a backup now, or change the backup time | [Make a backup now](#routine-backup) |
| Keep the backups working after a program update | [After a program update](#upgrading-an-older-backup-arrangement) |
| Check that a backup can really be restored | [Check a backup](#check-a-backup) |
| Put back lost or damaged data | [Recover lost data](#recover-lost-data) |
| Set up another school from a copy of this one | [Prepare a machine for another school](#preparing-a-machine-for-another-school--give-it-its-own-installation-id) |
| Nobody can sign in as an administrator | "Recover an administrator without email" in DEPLOYMENT.md |

## How backups work

Every night the program makes one **locked (encrypted) copy** of everything: lesson plans and all their
versions, accounts, roles, messages and drafts. It saves that copy in up to two places:

- **On the server's own disk** (normally the folder `/var/lib/lesson3-backups`). This copy helps after
  a mistake, such as a bad update or a deleted lesson. **It is lost if the disk breaks, the server is
  stolen or burned, or the server is wiped and reinstalled.**
- **On the school's USB backup drive** (or, for some schools, an online store). Leave the drive plugged
  in so the nightly backup reaches it. When someone can, take it to another building, and plug it back
  in when it returns. A copy kept away from the server can survive if the server is stolen or damaged.

Each place keeps several copies: the last 7 daily, 4 weekly and a few monthly ones (3 on the disk, 12
on the USB drive or online), plus a copy made before each program update. Older copies are deleted
automatically.

New backups can be opened by two keys: ARES's own key, and the **school's recovery key**, which is
locked with the backup password on the recovery sheet. (Backups made before a school key was set up
may need an earlier key, or ARES.) The locked school key is saved beside the backups as
`school-recovery-key.age`.

Each backup place is marked with this installation's identity. The program **refuses to write to a
place marked for another school**, so one school's drive cannot overwrite another's backups.

## Set up backups
<a id="school-setup-password-locked-recovery-key"></a>

Do this once for each school. The short version is "Set up backups" in DEPLOYMENT.md; this is what
the setup does, step by step.

**Before you start:**

1. The program is installed and working.
2. ARES's public recovery key is in `.env` as `BACKUP_AGE_RECIPIENT=age1…`.
3. The backup tools are installed. On Ubuntu 24.04:
   `sudo apt-get update && sudo apt-get install age rclone cron util-linux coreutils`.
4. The school's USB drive is plugged in and **mounted** (opened by Linux) as its own drive, not as part
   of the server's main disk, and it has an empty folder for the backups. Setup does not format or mount
   drives.

**Run it** (with the same login that will own the nightly backups):

```bash
cd /srv/lesson3
scripts/setup-school-backups.sh
```

**What it does and asks:**

1. It asks whether a USB drive is connected and, if so, the full path of the backup folder on it.
2. It suggests a backup password of four random words, or lets you type your own of at least 12
   characters (twice). **Write the password on paper.** Then type it back from the paper: no key is made
   until this matches.
3. It makes the school's recovery key and **locks it with the password**. Only the locked key is ever
   saved, beside the disk backups and on the USB drive.
4. It may ask for your `sudo` password, to make the disk backup folder and to install the nightly
   schedule (the file `/etc/cron.d/lesson3-backups`). The backups run as your login, not as `root`.
5. It restarts the program once so it reads the new settings. This interrupts it for a moment.
6. It makes the first backup and checks it by restoring it into a test copy of the database, which it
   then deletes.
7. Only then does it show the **recovery sheet**: the school name, the installation ID, where the
   backups are, the backup password, and the three steps to recover. **Copy it onto paper and keep it
   away from the server.** The password is never saved in any file or log.

**If setup stops** (a power cut, or an error you then fix): run the same command again and type the
**same** password. It skips the steps already done and reuses the key it already made. A wrong
password never replaces the saved key.

If the school already had a school key from an older, manual setup, this setup may make a **new** one.
Backups made before that still need the earlier school key, or ARES; the new password cannot open them.

When setup has finished, **Manage → System → Backups** shows a line for each backup place and
**School recovery key: Password-locked (set up …)**.

## Make a backup now
<a id="routine-backup"></a>

You do not need to do this normally: backups run every night at 02:00, by the server's clock (weekly
copies on Sunday at 02:10, monthly copies on the 1st at 02:20). Make one by hand when you want the USB
drive to have today's work before taking it away.

1. If **this school's** USB drive is away, plug it in. It must be mounted in the same place as during
   setup.
2. Run `cd /srv/lesson3 && scripts/backup-db.sh`.
3. Open **Manage → System → Backups**. Check the time of the newest **USB backup** as well as the
   **Disk backup**: a new disk copy does not mean the USB copy was updated.
4. When someone can, take the drive to another building. Keep the recovery sheet in a different place
   from the drive.

**What the messages mean:**

| You see | What it means | What to do |
| --- | --- | --- |
| `backup-db: OK` | Every connected place was backed up. | Nothing. |
| "USB backup drive is not connected" | The drive is away. The disk copy can still be made. | Nothing now, but bring the drive back before it is overdue (30 days unless your school set another limit). |
| "backup drive nearly full" or "disk nearly full" | There is not enough free space. The other place may still have been backed up. | Ask ARES before deleting anything from the drive. |
| "belongs to another installation" | This drive or folder is another school's. Nothing was written to it. | Use this school's own drive. **Do not delete the marker file** to make the message go away. |
| Any other error | One place failed, even if the other worked. | Send the exact message to ARES. Do not change keys or reinstall. |

**To change the backup time** (for example, if the server is switched off at night): open the
schedule with `sudo nano /etc/cron.d/lesson3-backups`. Each backup line starts with two numbers, the
minute and the hour (`0 2` means 02:00). Change them to a time when the server is on, keeping the
weekly and monthly lines a few minutes later than the daily one. Save and close; the schedule notices
the change by itself.

## After a program update
<a id="upgrading-an-older-backup-arrangement"></a>

A program update does **not** need a new school key or another run of setup. Keep the recovery key,
the backup drive and the schedule you already have, and follow the `OPS.md` of the newly installed
version.

Servers set up before the school-backup tools have no disk backup folder. After updating, their
backups carry on as before (to USB or online) and simply skip the disk copy; **Manage → System →
Backups** shows **Disk backup: None set up**. Choose one:

- **Keep both a disk copy and the USB or online copy** (recommended). Make the disk folder, using the
  same login that runs the backups:

  ```bash
  sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" /var/lib/lesson3-backups
  ```

  and keep `BACKUP_DISK_DIR=/var/lib/lesson3-backups` in `.env` (or the folder you chose).
- **Keep only the USB or online copy:** nothing needs doing, but you can add the line
  `BACKUP_DISK_DIR=` (with nothing after `=`) to `.env` to say so. Leave `BACKUP_RCLONE_REMOTE` and the
  recovery keys as they are.

Then run `cd /srv/lesson3 && scripts/backup-db.sh` and check each line in **Manage → System →
Backups**. The first backup moves old backup records into the new layout by itself. Until that first
backup, an old record can show as unknown. The backups themselves and their keys are not changed.

If the school later runs the new setup command, ask ARES to check the old schedule, so the same backup
does not run twice each night.

## Check a backup
<a id="check-a-backup"></a>

A backup that has never been restored might not work. This check restores one backup into a **test
copy** of the database and checks it. It does **not** touch the school's live data.

You need the backup drive (or the disk backup folder) and the backup password from the recovery
sheet. From the installation folder, run (change both paths to the real ones, and `BACKUP.dump.age` to
a real backup file name; do not rename the file):

```bash
AGE_IDENTITY=/media/lesson3-backup/lesson3-backups/school-recovery-key.age \
  scripts/restore-db.sh --local-file /media/lesson3-backup/lesson3-backups/daily/BACKUP.dump.age \
  --into lesson3_restore_check
```

Type the backup password when it asks. **What you should see:** `RESTORE DRILL PASSED` near the end.
Then delete the test copy:

```bash
docker compose exec -T postgres dropdb -U lesson3 lesson3_restore_check
```

All three are needed: the backup file, the locked key `school-recovery-key.age`, and the password.
ARES's own key can also open the same backup. Never change `--into lesson3_restore_check` to the live
database to "try" a recovery; use [Recover lost data](#recover-lost-data) instead.

Passing this check shows that this backup restores on this server. It does not change **Full
recovery: Not yet tested**, which needs a whole machine rebuilt from its backups.

## Recover lost data
<a id="recover-lost-data"></a>

Recovery **replaces everything** in ARES Lesson Plans with the contents of one backup. Work saved
after that backup is lost. Do this only when data is really lost or damaged, and agree it with the
school's administrator first.

**Before you start**, look at **School recovery key** in **Manage → System → Backups**:

- **Password-locked (set up …)** — you need the backup drive (with the backup file and
  `school-recovery-key.age`) and the password from the recovery sheet. Follow the steps below.
- **School recovery key configured** — the school keeps an unlocked key somewhere safe, away from the
  server (the Backups page shows where, if it was recorded). That key is not on the drive. The steps are under "Restore
  into the live database" in Part 2; ask ARES for help if you need it.
- **Recovery needs ARES** — only ARES can open the backups. Contact ARES.

**Steps** (from the installation folder, with the program left running; the script stops it at the
right moment):

1. Plug in the backup drive and find the backup you want in its `daily`, `weekly` or `monthly` folder.
   The date and time in the file name are when the backup was taken.
2. Run the command from the recovery sheet, with the real paths:

   ```bash
   AGE_IDENTITY=/path/to/school-recovery-key.age \
     scripts/restore-db.sh --local-file /path/to/backup.dump.age --into lesson3 --force-prod
   ```

   Type the backup password when it asks.
3. The script first checks the backup thoroughly **without touching the live data**. If anything is
   wrong, it stops and nothing has changed.
4. It then shows exactly what it will do and asks you to **type the backup's date** (for example
   `2026-10-27`). This is your last chance to stop.
5. It stops the program, swaps in the restored data, keeps the old data aside, starts the program again
   and checks it.
6. **Check it yourself:** sign in, open a lesson you know, and download it as Word and as PDF. If it is
   right, record that you checked it:

   ```bash
   scripts/restore-db.sh --confirm
   ```

7. Some days later, when the school is happy, delete the old data that was kept aside. It asks you to
   type the old database's name:

   ```bash
   scripts/restore-db.sh --discard-previous
   ```

**To undo** a recovery (until you run step 7): `scripts/restore-db.sh --undo`, then type `undo`. This
puts the old data back. **Anything saved since the recovery is lost by undoing**, although the script
makes a backup of it first.

**If the recovery was interrupted** (for example a power cut): run `scripts/restore-db.sh --status` to
see where it stopped, then `scripts/restore-db.sh --resume` to finish it safely. Only one recovery can
run at a time.

## Prepare a machine for another school
<a id="preparing-a-machine-for-another-school--give-it-its-own-installation-id"></a>

Every installation has its own **installation ID** (shown in **Manage → System**). It is stored in the
database.

- **Putting a school's own backup onto a replacement machine:** this keeps the school's ID, which is
  correct. Do nothing.
- **Copying a prepared database to set up a different school** (for example, one with the lesson plans
  already uploaded): the new school would have the same ID as the first, and the same people, saved
  versions, messages and forum posts. The reset gives all of them new IDs, so everything on the copy
  becomes this school's own. On the new machine, after copying, stop the program first (the reset
  refuses while it is running):

  ```bash
  cd /srv/lesson3 && docker compose stop app
  ```

  Look at what would change (this changes nothing):

  ```bash
  cd /srv/lesson3 && docker compose run --rm migrate npx payload run scripts/reset-installation-id.ts
  ```

  then make the change and start the program again:

  ```bash
  cd /srv/lesson3 && docker compose run --rm -e APPLY=1 migrate npx payload run scripts/reset-installation-id.ts
  cd /srv/lesson3 && docker compose up -d
  ```

  If it says other connections are open, a nightly backup may be running: wait a few minutes and run
  it again. Check that **Manage → System** shows the new ID. **Never do this after restoring a
  school's own backup.**

---

# Part 2 — Technical reference (ARES operator)

The rest of this manual is the operator's reference. New school installations use the release bundle
described in DEPLOYMENT.md; the **Deploy** section below is specifically for the developer-managed Rock
source checkout. A Site administrator's browser login does not grant a server login.

## Optional PDF link library

Lesson prose can link to internet addresses and to PDFs in one flat directory on the Rock. This is a
read-only folder, not file management: ARES Lesson Plans never writes, renames, replaces or deletes the
files. The Compose app receives only this mount:

```text
/srv/lesson3/out/resource-library  ->  /var/lib/lesson3-resources (read-only)
```

One-time setup after pulling the feature:

1. Set `PDF_LIBRARY_DIR=/var/lib/lesson3-resources` in the Rock's `.env` to enable authenticated
   PDF opening. Both templates leave the folder commented out. **Existing installations with this
   setting keep sign-in required after upgrade.** Leave it unset on ARES installations and paste
   ARES `/modules/` addresses instead. To deliberately publish the folder, separately set
   `PDF_LIBRARY_PUBLIC=1`; this makes eligible files available to anyone who can reach the site,
   independently of `PUBLIC_LIBRARY_ENABLED`. The default is `0`; an absent setting also stays
   authenticated. Do not set it to `1` until the operator has reviewed the folder for publication.
2. Copy a few PDFs into `/srv/lesson3/out/resource-library/` on the Rock. Use a flat directory,
   ordinary `.pdf` filenames, and files no larger than 25 MiB. Hidden files, subdirectories,
   symlinks, other extensions, and content without a PDF signature are not offered.
3. Run the normal `scripts/deploy.sh`; no database migration is involved. The app container must be
   recreated to receive the new read-only mount and environment value.
4. Sign in through the standard public HTTPS app address, open a lesson version for editing, and use
   *Insert link*. Selecting a Rock PDF inserts an absolute URL using that browser origin.

Opening a configured PDF requires an account unless `PDF_LIBRARY_PUBLIC=1`; listing filenames
always requires sign-in. Filename tokens are not secrets. Disabling Explore does not revoke an
explicitly published PDF folder. To require sign-in again, remove the publication opt-in or set it
to `0`, then recreate the app container; already downloaded copies cannot be recalled. Existing
public-exposure security configuration and the Going public checklist still apply on an internet
host. Do not rename or overwrite a linked PDF: the URL is stable only while the filename and bytes
stay stable.

⚠ The database backup does **not** include `out/resource-library`. Retain
the source PDFs elsewhere and be prepared to copy them back. A production resource library needs an
explicit backup/versioning policy before these files become records of value.

---

## Backups (encrypted, to server disk and USB or cloud)

`scripts/backup-db.sh` takes one `pg_dump` through the Postgres container and encrypts it once with
`age`. It independently copies those encrypted bytes to `BACKUP_DISK_DIR` (default
`/var/lib/lesson3-backups`) and, when configured, `BACKUP_RCLONE_REMOTE` (USB or cloud).
An explicit empty destination disables it; at least one must be enabled. The **default** folder is
skipped with a note, not an error, until it exists and while no disk backup has ever succeeded there:
it needs root to create, and servers set up before disk copies have none (2026-10-27). Manage then
reports "Disk backup: None set up". A chosen folder, or a default one that has already held a backup,
must work. Existing cloud-only installs can also set `BACKUP_DISK_DIR=` to stop the note. Keep the disk folder outside
Docker volumes. It may be on the server's root device; a USB destination may not.
**The disk copy will not survive disk failure, theft, fire or a reinstall wipe.**

A real destination error makes the command exit nonzero **after trying both destinations**. An
unplugged USB drive is a neutral "not connected", so the disk backup can succeed while it is away.
Do not mistake this for an off-site copy: take the USB drive away when possible.

Each destination holds `daily/`, `weekly/`, `monthly/`, and `premigrate/`. Disk count retention is
7/4/3 (overrides `BACKUP_DISK_DAILY_KEEP`, `BACKUP_DISK_WEEKLY_KEEP`,
`BACKUP_DISK_MONTHLY_KEEP`); external count retention is 7/4/12 (`BACKUP_DAILY_KEEP`,
`BACKUP_WEEKLY_KEEP`, `BACKUP_MONTHLY_KEEP`). Premigrate retention is age-based, default 90 days
(`BACKUP_PREMIGRATE_RETENTION_DAYS`). Disk space must cover the encrypted copy plus a 256 MiB
margin (`BACKUP_DISK_MIN_FREE_BYTES`). USB also checks the encrypted size plus a 256 MiB reserve
(`BACKUP_USB_MIN_FREE_BYTES`); shortage records "the backup drive is nearly full" before copying.
A full destination does not prevent the other copy. The staging file is size-limited to preserve 256 MiB on its filesystem too.

The first run writes `.lesson3-installation` at each destination root using the database's installation
UUID. Old unmarked backups are adopted. A marker for another installation **refuses writes and
pruning**. Do not remove or replace a foreign marker to make the check pass: select that school's own
backup folder. Invalid markers also refuse writes; a failed database identity read permits no copies.

### Manual setup for existing online installations

1. **Binaries (no sudo — installed to `~/bin`):** `age`, `age-keygen`, `rclone` (arm64). See the install
   block at the bottom of this section if they are not already present (`command -v age rclone`).

2. **Encryption key — generate on your MAC, not the Rock** (so the private key never touches the box):
   ```bash
   age-keygen -o ~/lesson3-backup.key     # prints "Public key: age1..."
   ```
   - Store `~/lesson3-backup.key` (the PRIVATE identity) somewhere safe and durable — a password manager
     plus one more copy. **Backups encrypted only for this identity need it to recover.** Do NOT put this unlocked key on
     the Rock. When a separate school key is configured below, either matching key can open new backups.
   - Take the printed `age1...` PUBLIC key → it goes in the Rock's `.env` as `BACKUP_AGE_RECIPIENT`.

   ⚑ **SECOND RECIPIENT — do this for any installation that may be offline** (decided 2026-08-22,
   SPEC §11). Generate a second keypair that the SCHOOL keeps, and put its public key in the Rock's
   `.env` as `BACKUP_AGE_RECIPIENT_SCHOOL`. `backup-db.sh` then encrypts to both, and **either identity
   can decrypt independently** — no key is shared, and a school with no internet can restore without
   ARES. The school's private identity goes somewhere durable and off-box (a safe; not the server).
   ⚑ Forward-only: dumps written before you set it stay readable only by ARES. ⚑ The two keys must
   differ — the script refuses a duplicate, since it would grant no independent recovery.
   Manage → System → Backups' "School recovery key" statement reports which state an installation
   is in, and where `BACKUP_KEY_HELD_BY` says the private key is kept.

3. **Prepare the destinations.** Ensure the operator running cron can create/write the disk folder
   (for example, have an administrator create `/var/lib/lesson3-backups` owned by that operator with
   mode `0700`). Configure a USB or cloud destination as well when available.

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
   regular, non-symlink sentinel **before** `pg_dump`. An absent drive is recorded as not connected;
   an unsafe connected destination is refused while the disk destination is still attempted. It keeps the
   destination directory open and checks the mount identity around upload, so an absent or changed
   drive cannot silently redirect a dump onto the boot disk. (`findmnt`, supplied by `util-linux`, is
   required for local destinations.)
   Put the drive somewhere physically separate after the run and rotate it with another prepared drive.

4. **`.env` on the Rock** — add:

   ```dotenv
   BACKUP_AGE_RECIPIENT=age1xxxxxxxx...
   BACKUP_DISK_DIR=/var/lib/lesson3-backups
   BACKUP_USB_MAX_AGE=30d
   # Optional external destination; choose ONE:
   BACKUP_RCLONE_REMOTE=drive:lesson3-backups
   # BACKUP_RCLONE_REMOTE=/media/lesson3-backup/lesson3-backups
   # optional overrides: BACKUP_DAILY_KEEP, BACKUP_WEEKLY_KEEP, BACKUP_MONTHLY_KEEP, BACKUP_PREMIGRATE_RETENTION_DAYS
   # optional (monitoring): HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<uuid>
   ```

   Retention and encryption are acted on by the scripts. The app reads destination, age and school
   recipient settings only to report their state. New school installations should use the setup
   command above rather than generating school keys or writing cron lines by hand.

5. **Cron — nightly + weekly + monthly** (`crontab -e`; the box is `America/Los_Angeles`, so these fire
   at 02:00 Pacific). Nightly → `daily/`, Sundays → `weekly/`, the 1st of the month → `monthly/`:
   ```
   # ARES Lesson Plans DB backups — GFS retention (7 daily / 4 weekly / 12 monthly)
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
# ARES Lesson Plans retention prune (completed export jobs 14d / email+ping jobs 180d / failed 90d / rate counters 7d)
30 3 * * *  /srv/lesson3/scripts/prune-db.sh >> /srv/lesson3/out/prune.log 2>&1
```

Manual/dry check: run `scripts/prune-db.sh` once by hand and read `out/prune.log` (it prints the
windows it applied); counts before/after via
`docker compose exec postgres psql -U lesson3 -d lesson3 -c "SELECT count(*) FROM payload_jobs;"`.

### Run / verify

- Manual backup: `scripts/backup-db.sh` (writes to `daily/`).
- List external backups: `scripts/restore-db.sh --list` (or `--list daily` / `--list premigrate`).
  For disk-only recovery, use `BACKUP_RCLONE_REMOTE=/var/lib/lesson3-backups scripts/restore-db.sh --list`.
  Restore a disk file with `scripts/restore-db.sh --local-file /var/lib/lesson3-backups/daily/<file> --into lesson3_test`
  for a drill; the live replacement flags below are unchanged.
- **Records, one per destination and stream (Part 3a).** Every attempted destination writes
  `out/ops/backup/<disk|usb|remote>/<stream>.json` (`daily`, `weekly`, `monthly`, `premigrate`), replaced atomically:
  - **`lastSuccess`**, with `coversUntil` (the moment `pg_dump` began, so the newest work the backup is
    sure to hold), `completedAt`, file, size and destination;
  - **`seq`** on every attempt: one counter for all streams, advanced under the lock, so
    the page knows which attempt came last even when two share a second;
  - **`lastAttempt`**: time, sequence and `outcome` (`success`, `failure`, `notConnected`);
    failures include stage (`setup`, `destination`, `dump`, `encrypt`, `upload`, `record`, `space`)
    and one line of reason. Before writing backups, the script converts the separate old
    failure/not-connected fields into the newest attempt, preserving success and history. This includes
    records already in destination folders; the app reads only `lastAttempt`;
  - **`history`**: the last 31 `coversUntil` values, and `recordingSince`.

  A failed attempt keeps the stream's last success and history; a later success replaces the
  previous attempt. `backup-db.sh` holds an `flock` on `out/ops/backup/.lock` for the whole run;
  a second run waits (`BACKUP_LOCK_WAIT_SECONDS`, default 3600). A run that gives up waiting writes
  nothing. On the first new-script run, old `backup/<stream>.json` and version-1 `backup-status.json`
  are **moved** into the external destination's folder under that lock. Where a newer stream file
  already exists, the old duplicate is archived under `pre3a/`, never used to revive older success.
  The app reads only the destination folders, including relocated version-1 evidence; no directory
  inheritance remains. `out/ops`, not `out`, is mounted into the app read-only.
- **Manage → System → Backups** turns those records into separate statements, each up to date,
  attention or unknown. There is no overall "Protected":
  - **Backup up to date:** each destination's newest *routine* `coversUntil`; disk/cloud use
    `BACKUP_MAX_DATA_LOSS`, USB uses `BACKUP_USB_MAX_AGE` (default `30d`). Fresh disk never hides
    overdue USB. Malformed records never revive archived evidence;
  - **Routine backups:** how many of the last 7 days had one;
  - **Last attempt:** each destination’s newest success, failure or neutral not-connected event;
  - **Agreed recovery time:** `RECOVERY_TARGET_TIME`;
  - **Full recovery:** "Not yet tested" until Phase B;
  - **Who recovers:** `BACKUP_RECOVERY_CONTACT`;
  - **School recovery key:** "Password-locked (set up …)" from the matching setup receipt, or the
    earlier manual-key status with `BACKUP_KEY_HELD_BY`;
  - **Restore:** while a restore journal is open.

  Times are the viewer's local time with a relative age; UTC, the destination, every stream's last
  success and failure, and the school key's short fingerprint are under *Technical details*.
- **The agreement settings are the school's, not the program's.** `BACKUP_MAX_DATA_LOSS` and
  `RECOVERY_TARGET_TIME` take `12h`, `1d` or `1w`; unset, the page says "Not agreed" (operator decision
  2026-10-21: every school is "Not agreed" until it agrees). `BACKUP_RECOVERY_CONTACT` (who, and how to
  reach them) and `BACKUP_KEY_HELD_BY` (where the private key is kept) are shown as "Recorded as …",
  unverified. For online installs the Site Administrator holds the read-only backup-storage
  credential (operator decision 2026-10-21). The app reads these at start, like every System setting. After changing them in a bundle
  installation, run `docker compose up -d --no-deps --no-build --pull never --wait app` to recreate
  the app with the new values; a plain restart keeps its old environment.
- ⚑ **A pre-update snapshot is not a schedule.** `deploy.sh` and `update.sh` take a `premigrate` backup
  on every deploy, so a box with no cron at all still has recent successes — which is why "Backup up to
  date" and "Routine backups" count only `daily`, `weekly` and `monthly`.
- ⚑ **And no statement proves a backup is RESTORABLE.** A record says an upload succeeded, not that the
  ciphertext decrypts or that `pg_restore` accepts it. Only the drill below establishes that for one
  backup, and only Phase B's acceptance test can change "Full recovery: Not yet tested".

### Isolated HTTP/browser test stacks

`npm run test:http` and the legacy-named `npm run test:rock` write and delete test records. They
require an isolated app/database and must never target the live Rock or another live deployment.
A folder from a normal installation is not a substitute for the mandatory committed PDF fixture.

Load `docker-compose.yml` plus `docker-compose.test.yml` under a disposable project name (AGENTS.md
has the isolation rules). The override starts the ordinary app with `PDF_LIBRARY_PUBLIC=1`, and
an internal-only `pdf-private` service running the same production build with the publication flag
unset. Both mount `public-wire.pdf` read-only; neither mode's authorization test skips. The private
service publishes no host port and shares only the disposable test database/cache. The existing CI
Stack up command already loads this override; no workflow edit is needed for these two modes.

### CI and local test rate-limit state

A failure in `tests/int/authRateLimit.int.spec.ts` or "Sign-ups are temporarily paused" can be
caused by test-environment limits, but a successful retry alone does not establish the cause.
Current CI uses an isolated database per job; it does not preserve database counters across runs.

Check the failing bucket, fixture configuration and counter state. A long-lived local test database
can accumulate counters across suites; recreate only the disposable test database or use the
scoped local reset documented in AGENTS.md. `app/test.env` deliberately carries **no** signup-budget
override: trusted Local-API fixture creates are classified by `overrideAccess` and do not spend the
budget. Never add headroom to a runner that can reach a shared database, and never clear production
counters merely to make a test pass. The 2026-08-27 same-commit retry incident remains history, not
proof of persistence.

### Restore drill (do this periodically — an untested backup is not a backup)

For the school's **password-locked** `school-recovery-key.age`, use the drill command in
[Check a backup](#check-a-backup) in Part 1 and type the recovery-sheet password when
asked. That locked file can stay beside the backups. The workstation procedure below is for an
**unlocked private identity** kept off the server. Neither drill replaces the live school database.

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
gates on two things: a short hand-picked list must be **present** (`lesson_plans`,
`lesson_bundle_versions`, `users`, `subjects`, `subject_grades`), and `users` must have rows, because
every installation has at least one administrator account. Zero rows elsewhere is reported, not failed.
⚑ **An empty curriculum or lesson-plan table is a NOTE, not a failure** (corrected 2026-10-17): a backup
of a new installation taken before any curriculum was added is a real, recoverable backup, and the old
rule called it unrecoverable. The note says what it means: if the installation *had* lesson plans when
the backup was taken, this backup does not contain them. Branch cover: `scripts/test-restore-db.sh`.

⚑ **The list is derived from the database, not maintained by hand, and the hand-maintained version was
already wrong.** It named twelve tables and silently skipped `favorites`, `messages` and `edit_recovery`
— registered collections with real rows — so the drill printed PASSED without ever looking at them. A
list that has to be edited in lockstep with `payload.config.ts` rots toward under-verification, which is
the failure that looks like success. It also used to print two counts followed by `|| true`, so a failed
verification still exited 0.

⚑ **Do NOT copy an unlocked private identity onto the server for a drill.** It is unnecessary now that `--local-file`
exists, it puts an unlocked secret on the box custody is designed to keep it off, and `shred`
cannot reliably promise erasure on the SSD it would land on.

### Restore into the live database (staged; design A1, 2026-10-21)

A genuine restore, not a rehearsal, is the only situation where bringing the identity to the server is
justified. Run it on the server, from the installation directory, with the app **left running** — the
script stops it at the right moment:

```bash
AGE_IDENTITY=/path/to/lesson3-backup.key \
  scripts/restore-db.sh --from daily/lesson3-<TS>.dump.age --into lesson3 --force-prod
# (or --local-file /path/to/lesson3-<TS>.dump.age; keep backup-db.sh's file name — the date in it is
#  what you will type to confirm. Optional: --check-plan <lesson plan id> picks the plan it renders.)
```

⚑ **The live database is never dropped by a restore.** Until 2026-10-21 `--force-prod` ran
`DROP DATABASE lesson3` before `pg_restore` and checked only afterwards, so a truncated or incompatible
backup destroyed the live data before anything had looked at it. Now:

1. **Preflight, touching nothing:** the backup is named and carries its date; there is room in the
   temporary directory for the decrypted dump; the key decrypts it (authenticated, so a truncated file
   fails here); `pg_restore` accepts it; the database volume has room for a second copy (the larger of
   the live database and 8 × the dump, plus 10 % and 256 MB — an estimate, not a measurement on a large
   corpus; `RESTORE_DUMP_EXPANSION` changes the multiple); the installed version and its
   migration list are known.
2. **Stage** into `lesson3_incoming_<UTC>`: the drill's all-table count check; then the schema check —
   the backup's `payload_migrations` must be the installed software's first N migrations. A backup from
   **newer** software is refused. Then the installed `migrate` image runs against the **incoming**
   database only.
3. **In-server check** on the incoming database: `app/scripts/restore-check.ts`, run in the `migrate`
   image, reads a lesson plan through Payload's Local API and renders its DOCX and PDF (through
   Gotenberg). No password; nothing is written. A backup with no lesson plans says rendering was not
   exercised.
4. **Typed confirmation** — the backup's date. The script prints exactly what it will do first.
5. **Stop writers:** stops every running service except `postgres` and `gotenberg` (the app, and with it
   the job queue), sets `ALLOW_CONNECTIONS false` on `lesson3`, ends remaining connections, and checks
   none remain.
6. **Swap in one transaction:** `lesson3` → `lesson3_before_restore_<UTC>`, the incoming copy → `lesson3`.
   Both renames commit together or neither does. The old database keeps refusing connections.
7. **Empty the export cache** (it is keyed by version id, and the restored database will reuse ids whose
   cached files came from the old one), **start the app**, and repeat the check against the live system.
   If cache deletion fails, the app stays stopped and the journal remains `swapped`. Fix the cache's
   permissions or filesystem fault, then run `scripts/restore-db.sh --resume`; it retries invalidation
   before startup. Undo uses the same gate and remains `undo-swapped` until invalidation succeeds.

Any refusal or failure in steps 1–4 leaves the live database exactly as it was and drops the incoming copy.

**The result is provisional.** Sign in, open a known lesson, export it as DOCX and PDF, then:

```bash
scripts/restore-db.sh --confirm            # records that a person checked it
scripts/restore-db.sh --discard-previous   # later: drops lesson3_before_restore_<UTC> (type its name)
```

**Undo** — until `--discard-previous`, `scripts/restore-db.sh --undo` puts the previous database back.
⚑ **Work saved after the restored database went live is lost by undoing.** So the undo stops the app,
then takes a backup of the current database with `backup-db.sh --label premigrate-prerestore-undo-<UTC>`
(stopping first, so the backup holds every write), and only then swaps back in one transaction and
restarts. The restored database is kept as `lesson3_undone_<UTC>` until `--discard-previous`. If that
backup fails, nothing is undone and the app is started again.

**If the automatic check after the swap fails**, the script says so, offers `--undo` (or `--resume` to
repeat the start and check), and does nothing else on its own.

**Interrupted?** Every step is recorded in `out/ops/restore-journal.json` before the next begins, with a
timeline in `out/ops/restore.log`. Run `scripts/restore-db.sh --status` to see it and
`scripts/restore-db.sh --resume` to finish. Before the typed confirmation, resume **reverses** (drops the
incoming copy; nothing live had changed). After it, resume **completes** what was confirmed — whether
the swap committed is read from Postgres's catalog, not inferred. An undo resumes the same way. One
run at a time holds a kernel `flock` on `out/ops/.restore.lock`; the kernel releases it however the
run ends, so a killed run leaves nothing to clear. A closed journal is kept under
`out/ops/restore-history/`. Only one restore can be open at a time.

Branch cover: `scripts/test-restore-db.sh` (stubbed, CI). The real thing, against an isolated stack
laid out like a release-bundle installation — swap, terminated and refused connections, migrate on the
incoming copy only, every interruption point, startup failure, undo with post-swap work in the undo
backup, `--discard-previous`: `scripts/test-restore-db-stack.sh`.

⚑ **What this does not establish.** A passing restore shows that this backup, on this server, came
back and rendered one lesson. It is not evidence that the installation could be rebuilt on another
machine — that is Phase B's acceptance test (`docs/DESIGN-backup-recovery-2026-10-21.md`), and until it
has passed nothing may describe an installation as recoverable.

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

**Developer-managed Rock source checkout only.** For a school installed from a release bundle, use
its `update.sh` and **Update to a later release** in `DEPLOYMENT.md`; do not use this procedure.

Use `scripts/deploy.sh` instead of a bare `docker compose up`: it pulls, takes a `premigrate-<sha>`
snapshot, builds, then `docker compose up -d --no-build` (the one-shot `migrate` runs first), and waits
up to five minutes for `http://127.0.0.1:3001/login`. It prints `deploy: OK` only after that probe succeeds. **No snapshot, no
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

Do not copy a previously recorded sidecar hash into an operating decision. The script measures the
current checkout and installed image every run, then prints whether it skipped or rebuilt Gotenberg.
The 2026-07-27 metadata-only provenance recovery remains historical context in `DECISIONS.md`; it is
not evidence about the image currently installed on a particular box.

Schema changes must arrive on `main` with generated types and migrations committed. Generate them in
the pinned Node 24 dependency container before merge (`scripts/in-deps.sh -- npm run generate:types`
and the repository's migration workflow); the normal Rock deploy applies committed migrations through
the `migrate` service. Do not improvise host-Node Payload code generation on the production box.

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

### Background jobs stopped: reset the scheduler's statistics

**Symptoms:** nothing runs from the job queue. Uncached exports never finish, emailed exports and
password-reset emails never arrive, and drafts stop expiring. The app log repeats
`Error in job queue cron job handler` every few seconds, usually with a date-parsing message.

**Cause:** Payload keeps scheduler metadata in a hidden `payload-jobs-stats` record. Its timer
schedules work *before* running the queue on each tick. If that metadata is malformed, scheduling
throws first and the queue never runs. Restarting does not help, because the value lives in the
database. Since 2026-10-24 the API refuses all writes to that record (audit F-C22-001,
`app/src/access/generatedSurfaces.ts`), so a malformed value can only come from a database edit or
a Payload defect.

**Fix:** clear the statistics. The scheduler rebuilds them on its next tick, and queued work then
runs. Nothing else is lost, because the record holds only "when did each schedule last fire". Run from
the repo root:

```bash
cd /srv/lesson3 && docker compose exec postgres psql -U lesson3 -d lesson3 \
  -c "UPDATE payload_jobs_stats SET stats = NULL;"
```

**Verify:** within a few seconds the log error stops and `Running N jobs` lines appear. A pending
export completes. Then, as a Site Administrator, `GET /api/globals/payload-jobs-stats` shows fresh
`lastScheduledRun` times.

**Afterwards, find out how the value got there.** The API cannot write it, so check recent
database access and the Payload version before closing the incident.

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
   the Site-Admin batch upload (`209,977,344` bytes including framing: 200 MiB of JSON plus 256 KiB),
   so set a global ceiling just above it (for example nginx `client_max_body_size 201m;`; an existing
   `252m` from before 2026-10-11 still works). Keep the endpoint's smaller application
   checks as defense in depth. Caddy's `request_body { max_size ... }` is acceptable only on Caddy
   v2.10+ (where that directive is currently experimental); validate the installed version before
   using it. Verify both a declared-length and chunked request over the public URL receive `413`
   before reaching application logs.

   Minimal nginx shape (add the host's certificate/listen configuration separately):

   ```nginx
   server {
       client_max_body_size 201m;
       # A large lesson-plan upload is one long request: a real 95-file archive took ~11 s to
       # import on a Mac, so a ~20 MB archive (~255 files) may take a minute or more on a Rock.
       # nginx's default 60 s would answer 504 while the import still completes. Allow 5 minutes.
       proxy_read_timeout 300s;

       location / {
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Proto https;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_pass http://127.0.0.1:3001;
       }
   }
   ```
   Configure the app's `AUTH_TRUSTED_PROXY_CIDRS` for the actual proxy peers before deploying the
   client-scoped sign-in protection; see [SIGN-IN-PROTECTION.md](SIGN-IN-PROTECTION.md). An empty
   setting treats the proxy as one shared client. This app setting does not install a WAF rule.

2. **Edge rate limiting** at that proxy — connection/request throttles in front of the app-level
   Postgres limiter (which stays; it's the inner wall). Start conservative (e.g. Caddy
   `rate_limit`/nginx `limit_req` ~10 r/s per IP with burst, tighter on `/api/users/login` and
   `/api/users/forgot-password`) and tune from logs.
3. **Seed users BEFORE DNS points at the box.** On an empty DB, Payload's unauthenticated
   first-register hands Site Admin to the FIRST visitor (verified live 2026-07-05). ✓ The app now
   REFUSES to boot with `SERVER_URL` set and zero users. Either restore a backup first, create the
   administrator while unexposed (boot without `SERVER_URL`, use the one-time setup form at `/login`,
   then set it), or run ONE deliberate bootstrap boot with `ALLOW_FIRST_USER_BOOTSTRAP=1`, complete
   `/login` setup immediately, and unset it afterwards. Do not put a human password in `.env`;
   `/admin/create-first-user` redirects to this same supported setup entry point.
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
     request ✓ (shipped: `src/proxy.ts` CSP), `Set-Cookie` on login carries `Secure`.
   - Run `test:http`/`test:rock` only on an **isolated staging stack with a disposable database**.
     These suites create/delete fixtures and are not production health checks. Load
     `docker-compose.test.yml`: it supplies the mandatory PDF fixture and both public/private app
     modes. Test the public-URL posture on a disposable staging installation, never the live site.
   - On the live installation, use non-mutating HTTP checks instead: `/login` for headers,
     anonymous `/api/resource-library` for 401, and a known PDF file URL for 200 only if deliberately
     published (401 when the folder is configured but not public, 404 when unconfigured). Verify
     `Content-Type: application/pdf` and `X-Content-Type-Options: nosniff` on a successful PDF.
     Do not copy the test override or its fixture into the installation to make a suite pass.
   - Backups + heartbeat crons live (sections above); Gotenberg image digest-pinned ✓.
7. **Local ARES-server deployments** (SPEC's offline box): keep `SERVER_URL` EMPTY (or http) —
   they stay on the internal posture (Lax-cookie CSRF, no Secure flag over plaintext) by design.
