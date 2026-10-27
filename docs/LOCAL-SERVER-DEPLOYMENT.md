# Install and look after Lesson Plan Editor on a school server

This manual is for the **technician** who installs Lesson Plan Editor on a school's server, updates
it, and sets up its backups. Teachers and school administrators do not need it: they use the Guide
inside the program.

You will type commands on the server. Each step says what it does and what you should see. **If a
command shows an error, stop.** Do not go on to the next step until the error is fixed. If you cannot
fix it, send the exact error message to ARES.

## Words used in this manual

- **Terminal** — the window on the server where you type commands. You need a login to the server
  (this is not the same as a Lesson Plan Editor sign-in).
- **Installation folder** — the folder on the server that holds the program's settings and scripts.
  The examples use `/srv/lesson3`. If you chose another folder, use that instead.
- **`.env` file** — the settings file in the installation folder. It holds secret passwords that the
  program uses internally. Never share it, and never copy it to another school.
- **Docker** — the software that runs the program's parts (the program itself, its database, and the
  part that makes PDFs). Each part runs in its own **container**.
- **Release bundle** — the download that installs or updates the program. A **lesson ZIP** is
  different: it holds ARES lesson plans, and a school administrator uploads it in the browser.
- **Checksum** — a code that proves a download arrived complete and undamaged.
- **Backup password** and **recovery sheet** — chosen when you set up backups. The password unlocks
  the school's backups. It is different from anyone's Lesson Plan Editor sign-in password.

## What do you need to do?

| Job | Go to | What you need |
| --- | --- | --- |
| Install on a new school server | [Install on a new server](#download-and-install), then [Hand over a new server](#hand-over-a-new-server) | A server login, internet, and an empty installation folder |
| Put newer lesson plans on a server | [Add or update lesson plans](#add-or-update-lesson-plans) | A Site administrator login and the ARES lesson ZIP |
| Update the program | [Update to a later release](#update-to-a-later-release) | A server login, internet, the existing installation folder, and working backups |
| Set up backups | [Set up backups](#configure-backups-before-real-use) | A server login, ARES's public recovery key, and the school's USB backup drive |
| Make a backup now, check a backup, or recover lost data | `OPS.md` in the installation folder, part 1 | A server login; for recovery, the backup drive and the recovery sheet |

Updating the program does **not** add new lesson plans. Lesson ZIPs are always uploaded in the
browser.

`DEPLOYMENT.md` (this manual) and `OPS.md` are in the installation folder, and they match the version
that is installed. A newer copy online may describe commands that an older installation does not have
yet. For example, if `scripts/setup-school-backups.sh` is missing, the installed program is older:
follow its own `OPS.md`, or update the whole program first. **Never copy single new scripts into an
older installation.**

## Before you start

The server needs:

- **Linux, 64-bit**, on an Intel/AMD (x86-64) or ARM64 processor.
- **Docker**, with the `docker compose` command. The account you install with must be able to run
  `docker` without typing `sudo` in front of it.
- **At least 4 GB of memory**; 8 GB is better, because making PDFs uses a lot.
- **Enough disk space** for the program, the database, the files it makes, and several backups. Check
  with `df -h` before you install or update.
- **Internet** while you install or update. It must be able to reach `github.com`, `ghcr.io` and
  Docker Hub.
- The tools `curl`, `openssl`, `tar` and `sha256sum`.

Lesson Plan Editor is for the school's own network. Computers on that network reach it on port
**3001**. **Do not open port 3001 to the internet.** Putting it on the public internet needs extra
security work; see "Going public" in `OPS.md`.

An Apple Silicon Mac cannot be a school server, but it can run a short trial; see
[Trial on an Apple Silicon Mac](#trial-on-an-apple-silicon-mac).

## Install on a new server
<a id="download-and-install"></a>

These commands download the newest release, check it is undamaged, copy it into `/srv/lesson3`, and
start the installer. Making `/srv/lesson3` needs `sudo`; any other folder that your account owns and
that will be kept is also fine. Start with a new, empty folder.

Change `SERVER_LAN_IP` in the last line to the server's fixed address on the school network (or its
local name). If the browser will only ever run on the server itself, leave out
`LESSON3_URL=http://SERVER_LAN_IP:3001`; the installer then uses `http://localhost:3001`.

```bash
workdir="$(mktemp -d)" && cd "$workdir"
curl -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz \
  -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz.sha256 &&
sha256sum -c lesson3-online-deploy.tar.gz.sha256 &&
tar -xzf lesson3-online-deploy.tar.gz &&
sudo mkdir /srv/lesson3 &&
sudo chown "$USER":"$(id -gn)" /srv/lesson3 &&
cp -a lesson3-deploy/. /srv/lesson3/ &&
cd /srv/lesson3 &&
LESSON3_URL=http://SERVER_LAN_IP:3001 ./install.sh
```

The checksum line must say `OK`. If it does not, stop: the download is damaged. Delete it and start
again.

The address you give as `LESSON3_URL` is used in links the program sends, such as password-reset
links. The installer refuses the unchanged word `SERVER_LAN_IP`, and warns if it cannot find a name you
gave.

For anyone editing these instructions: keep `SERVER_LAN_IP` as the placeholder. A realistic-looking
address could be accepted even when it is wrong for the school.

**What the installer does:**

1. makes two long random secrets (one for the program, one for its database);
2. saves them in `.env`, which only your account can read, and never prints them;
3. downloads the program's parts. Their exact versions are fixed inside the checked bundle, so a
   changed or damaged part is refused;
4. starts the database, prepares it, then starts the PDF maker and the program;
5. waits up to five minutes for the sign-in page to answer.

**What you should see:** the installer finishes by printing the sign-in address, ending in `/login`.
Open that address **from another computer on the school network**. It must show a page to create the
first Site administrator. The installer checks the program from the server itself, so only another
computer can prove that the school's computers can reach it.

The installer will not overwrite an existing `.env`. **Keep the installation folder**: it holds the
settings, the scripts and the version record. Never install again on top of it; to get a newer
version, use [Update to a later release](#update-to-a-later-release). The database is stored by Docker
separately from this folder, and it is kept when the program's containers are replaced.

## Check the installation
<a id="verify-the-installation"></a>

From the installation folder, run:

```bash
docker compose ps
docker compose logs migrate --tail 30
curl -fsS -o /dev/null http://SERVER_LAN_IP:3001/login && echo "login is reachable"
```

**What you should see:** `app`, `postgres` and `gotenberg` are running; `migrate` has finished (exited
with status 0); and the last line prints `login is reachable`. Then, from another computer on the
school network, sign in, open a lesson, and download it as Word and as PDF. Containers that are
running do not prove that these work.

## Create the first administrator

The installation has **no ready-made username or password**. The secrets in `.env` are for the program's
own use; they are not sign-ins. Do not edit `.env` to add a person or a password.

This installation does not send email, so the first administrator is created with a one-time form.
Before you leave the school:

1. From a computer on the school network, open the `/login` address the installer printed.
2. It shows **Create the first Site administrator**. If it shows **Sign in** instead, stop: the
   database already has accounts. Find the existing administrator, or follow
   [Recover an administrator without email](#recover-an-administrator-without-email). Do not try to
   create a first administrator again.
3. Enter the person's real name.
4. Enter an email address as their sign-in name. It does not have to receive email, but write it down
   exactly: they will type it every time they sign in.
5. Choose a password of at least eight characters that is not used anywhere else, and type it twice.
   Save the sign-in name and password in the school's password manager or another safe place. The
   program cannot show the password again later.
6. Click **Create Site administrator**. The person is signed in straight away.
7. Check it worked: open `/login` in a private browser window. It must now show the ordinary **Sign
   in** form. Sign in with the details you just saved. The setup form never comes back.

Now create a **second** Site administrator, so the school is not locked out if one person forgets their
password:

1. Open **Manage → Users → Accounts** and choose **Create user**.
2. Enter the person's name, an email address as their sign-in name, and a first password. The address
   does not have to receive email.
3. Save. Back in **Manage → Users → Accounts**, open the person's row and choose **Approve** (on a
   site that sends email, this button says **Mark verified**). The person cannot sign in until you do.
4. Choose **Make Site Administrator** on the same row.
5. Test the new account in a private browser window.

The program will not let anyone remove or demote the last working Site administrator, but it cannot
help if both administrators forget their passwords.

⛑ **Do not put a starting password in `.env`, and do not use the address `/admin/create-first-user`**
(it redirects to the one-time form). Mistakes in the one-time form do not lock you out.

### Recover an administrator without email

Use this only when **no** Site administrator can sign in. It makes a reset link, valid for one hour,
for an existing administrator account. First check the account, which changes nothing. From the
installation folder (change the email address to the administrator's sign-in name):

```bash
docker compose run --rm \
  -e RECOVERY_EMAIL=admin@example.com \
  migrate npx payload run scripts/recover-site-admin.ts
```

If it names the right account, make the link:

```bash
docker compose run --rm \
  -e APPLY=1 \
  -e RECOVERY_EMAIL=admin@example.com \
  migrate npx payload run scripts/recover-site-admin.ts
```

Open the printed link in a browser on the school network. **Treat the link like a password:** it can
be used once. Do not save it in a file, paste it into a message, or leave it on screen. The command
works only for an existing, approved, enabled Site administrator; it cannot create accounts or give
anyone administrator rights. Write down who used it and when. Afterwards, sign in, make sure there
is a second working Site administrator, and close the terminal window. It runs through `migrate` because the
program's own container does not include these tools.

## Hand over a new server

Do these in order before the school starts using the server:

1. Install, then check the sign-in address from another computer on the school network.
2. Create two Site administrator accounts and test both.
3. In **Manage → System → Features**, enter the **School name**, choose **Save**, and confirm with your
   sign-in password.
4. Set up backups (next section) and copy the recovery sheet onto paper. Setup must pass its first
   restore check.
5. Upload the ARES lesson ZIP and read its report.
6. Open a lesson and download it as Word and as PDF. Check **Manage → System → Backups**.
7. Give the school its sign-in address, and the names of the people to contact for account help and for
   server recovery. Keep the backup password and recovery sheet somewhere safe, away from the server.

## Set up backups
<a id="configure-backups-before-real-use"></a>

A backup is a locked copy of everything in the program: lesson plans and all their versions, accounts,
roles, messages and drafts. Without backups, a broken disk loses everything. The full instructions
are in `OPS.md` (part 1, "Set up backups"); this is the short version.

Backups are saved on the server's own disk and on the school's **USB backup drive**. The disk copy
helps after a mistake; the USB copy is the one that survives if the server breaks or is stolen.

1. Get **ARES's public recovery key** from ARES. It is a long code starting with `age1`. It is not a
   password and not a secret. Add it to `.env` as a new line, `BACKUP_AGE_RECIPIENT=age1…`. Do not
   change any other line in `.env`.
2. Install the backup tools. On Ubuntu 24.04:

   ```bash
   sudo apt-get update && sudo apt-get install age rclone cron util-linux coreutils
   ```

   `rclone` is needed even when you back up only to USB.
3. Plug in the school's USB backup drive. It must be **mounted** (opened by Linux) as its own drive,
   not as part of the server's main disk, and it needs a folder for the backups. Setup does not
   format or mount the drive. If you do not know how to mount it, ask ARES. Write down the folder's
   full path, for example `/media/lesson3-backup/lesson3-backups`.
4. Run the setup from the installation folder:

   ```bash
   cd /srv/lesson3 && scripts/setup-school-backups.sh
   ```

   Answer **yes** when it asks about a USB drive, and type the folder path. Setup offers a backup
   password of four random words; accept it or type your own of at least 12 characters. **Write the
   password on paper**, then type it back when setup asks: this proves you wrote it correctly.
5. Let setup finish. It locks the school's recovery key with the password, saves the locked key beside
   the backups, sets up the nightly backups, makes the first backup, and checks it by restoring it into
   a test copy of the database. It restarts the program once, which interrupts it for a moment. At the
   end it shows the **recovery sheet**. **Copy the sheet onto paper:** the password is not saved in any
   file.
6. Open **Manage → System → Backups**. You should see separate lines for the disk and USB backups, and
   **School recovery key: Password-locked (set up …)**.
7. Agree with the school how much recent work it could accept losing (for example one day, written
   `1d`) and how quickly it must be working again after a failure. Add them to `.env` as
   `BACKUP_MAX_DATA_LOSS=1d` and `RECOVERY_TARGET_TIME=1d`, then apply them with
   `docker compose up -d --no-deps --no-build --pull never --wait app` (a plain restart does not
   read the new values). Until then the Backups page says "Not agreed".

**After setup:** backups run every night, at 02:00 (weekly copies on Sunday at 02:10, monthly copies
on the 1st at 02:20), by the server's clock. The server must be switched on then; if it is normally
off at night, change the time (see "Make a backup now" in `OPS.md`). Leave the USB drive plugged in so the nightly backup
reaches it. When someone can, take it to another building, and plug it back in when it returns. While
it is away, disk backups still run, but the USB copy gets older.

**If setup stops** (for example after a power cut), run the same command again and type the **same**
backup password. It carries on from where it stopped and keeps the key it already made.

A new school key opens only the backups made after it. Keep any earlier recovery keys for older
backups. If the school already has a working online (cloud) backup, follow "Manual setup for existing
online installations" in `OPS.md` instead; do not replace its key just to update the program.

The first check proves that a backup can be restored on this server. **Full recovery: Not yet tested**
still shows, because rebuilding a whole machine from its backups is a separate test, and the tools for
it are not finished yet.

## Add or update lesson plans

A **Site administrator** does this in the browser. It needs no server login, and no internet if the
lesson ZIP is already on the computer.

1. Sign in and open **Manage → Lesson plans → Upload lesson plans**.
2. Choose the ARES lesson ZIP. Do not unzip it, and keep everything that came in it together
   (including `LESSONS.json` if there is one).
3. Read the list before confirming. It shows which lessons will become Official, which are waiting
   for a subject-grade administrator, and which change nothing. Answer any questions about subjects
   and grades, then confirm.
4. Read the report. Good files are imported even when others are rejected. Correct the rejected files
   and upload again; files already imported are skipped. Older versions stay in each lesson's history.
5. If the report says the lessons need a newer program, update the program (next section), then
   upload the same ZIP again.

A teacher's Official version is left for the subject-grade administrator to review. A release older
than the newest one already imported is not imported. Updating the program does not change these
rules.

## Update to a later release

An update replaces the program with a newer version. It keeps the school's accounts, lesson plans,
settings and `.env`.

**Before you start:**

- Choose a quiet time. The program stops for a short while during the update.
- Plug in the USB backup drive (or check that the school's online backup works).
- Have the recovery sheet ready, in case a recovery is needed.

The updater makes a backup first and **will not update without one**. It needs ARES's public recovery
key in `.env` and somewhere to save the backup. A school with only the disk backup can update; the disk
backup must succeed first. Keep a copy away from the server when you can: a disk backup does not
survive if that disk fails. **Never skip the backup for a school with real data.** (An older installed
backup script may not know about disk backups; in that case keep its USB or online backup working for
this update.)

Download the new release into a **new temporary folder** (not the installation folder), check it, and
run its updater. The commands stop by themselves if the download or the check fails:

```bash
workdir="$(mktemp -d)" && cd "$workdir" &&
curl -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz \
  -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz.sha256 &&
sha256sum -c lesson3-online-deploy.tar.gz.sha256 &&
tar -xzf lesson3-online-deploy.tar.gz &&
./lesson3-deploy/update.sh /srv/lesson3
```

**What you should see:** the updater reports success only after the new version answers. Then check:

1. In `/srv/lesson3`, run `cat VERSION`. It must match the version shown on the sign-in page and in
   the Guide.
2. From another computer on the school network, sign in, open a lesson, and download it as Word and as
   PDF.
3. If the school was on an older version, before its next backup follow "After a program update" in
   the installed `OPS.md`. Then run `cd /srv/lesson3 && scripts/backup-db.sh` and
   check each backup line in **Manage → System → Backups**.
4. Upload any newer ARES lesson ZIP separately, as in the section above.

| If the updater says… | What to do |
| --- | --- |
| Some `.env` keys are missing | Open `.env.example` in the **new** download folder. Copy only the missing lines into the **installed** `.env`. Do not change any existing line. Run the same updater command again. If you do not know what value a line needs, ask ARES. |
| The backup failed, or backups are not configured | Fix the backups first, using the installed `OPS.md`. Do not use the option to update without a backup on a school with data. |
| The download or checksum failed | Stop. Do not unpack or run that download. Download it again and check it again. |
| The update was interrupted | Keep the download folder and run exactly the same updater command again. If it mentions a lock, see [What the updater does](#update-recovery-details-for-the-server-operator). |
| Starting the program or preparing the database failed | Keep everything as it is. Send ARES the error and the output of `docker compose logs migrate app`, run in the installation folder. |

## Day-to-day commands

Run these from the installation folder:

```bash
docker compose ps            # which parts are running
docker compose logs -f app   # the program's messages (press Ctrl+C to stop watching)
docker compose restart app   # restart the program
docker compose stop          # stop everything
docker compose start         # start everything again
```

⚠ **Never run `docker compose down -v`.** The `-v` deletes the database and everything in it.
Plain `docker compose down` keeps the data, but stop and start are normally all you need.

The full backup, recovery and maintenance instructions are in `OPS.md` in the installation folder
([online copy](https://github.com/james-beep-boop/Lesson3/blob/main/docs/OPS.md)).

---

# For the ARES operator and developer

The sections below are for ARES staff: what the downloads contain, how the updater recovers from a
failure, a disposable trial on a Mac, and how releases are published. A school technician does not
need them.

## What is downloaded

This release-bundle path is the only supported way to install a school server. Do not clone the
repository or run `scripts/deploy.sh` on a new school server; that script exists for the
developer-managed Rock source checkout and builds a different Compose topology locally. The
installation runs prebuilt, multi-architecture containers from GitHub Container Registry, so the server
needs Docker but not Git, Node.js, npm or the source tree. It still needs outbound internet during
installation and every update. The planned USB distribution is not implemented yet;
`install.sh --prepare-only` only writes configuration and does not make an offline installation bundle.

This deployment keeps PostgreSQL and Gotenberg internal to Docker, disables the public lesson-library
surface, and leaves `SERVER_URL` empty. Public service requires HTTPS, a reverse proxy, and the complete
“Going public” checklist in `OPS.md`.

- `ghcr.io/james-beep-boop/lesson3-app:<release>` — the minimal production application.
- `ghcr.io/james-beep-boop/lesson3-migrate:<release>` — the matching one-shot migration image.
- PostgreSQL 16.15, pinned by multi-architecture digest.
- Gotenberg 8.38.0’s LibreOffice-only image, pinned by multi-architecture digest.

The installer generates a 256-bit Payload secret and a separate 256-bit Postgres password, and writes
them to `.env` with mode `0600`. Its health check probes `127.0.0.1`, which is why a separate computer
must confirm the printed address. Postgres data and the generated-artifact cache live in Docker named
volumes, not in the installation directory.

The local-server Gotenberg image deliberately omits Chromium and the optional Microsoft core fonts.
That makes distribution materially smaller and avoids an automatic EULA-governed font download.
DOCX output is unchanged. Locally generated PDFs use LibreOffice’s Arial-compatible substitute, so
some table row heights can differ slightly from PDFs generated by the internet deployment with Arial.

Setup attempts for the first administrator are deliberately exempt from the signup rate limit while the
installation is empty. The administrator-recovery script runs through `migrate` because the minimal
production `app` image contains neither the Payload CLI nor the scripts source; record the operator and
time of any use in the site's incident log.

## What the updater does
<a id="update-recovery-details-for-the-server-operator"></a>

After the checks in [Update to a later release](#update-to-a-later-release) pass, the update is
complete. Use this section when investigating a failed or interrupted update.

The updater stages the bundle and original deployment files in `.update-pending/`, then pulls the new
images **without replacing the active Compose file**. It next takes an encrypted pre-migration backup,
records its log and backup identity, activates the staged files, runs migrations, and waits for `/login`.
Only successful health verification advances `VERSION`. It refuses activation without configured
backups. Only an empty or disposable installation should use `ALLOW_UNBACKED_UPDATE=1`.

**Retry the exact same extracted bundle after a failure.** `.update-pending/phase` records `staged`,
`backed-up`, or `activating`; the updater resumes that transaction and rejects another version or changed
bundle contents, including changed image digests under the same version. Failed pulls leave the active
files untouched. Once a backup is recorded, retries never replace it with a potentially post-migration
backup. The original files in `.update-pending/previous/` are never overwritten by a retry. An installed
version without pending state is not treated as an update retry; different Compose/image identity under
that same version is refused. Investigate failures from older updaters manually rather than trusting
their prematurely advanced `VERSION`; a legacy `releases/<installed-version>/` snapshot also blocks a
fresh transaction because it may belong to an unfinished update.

After health succeeds, the transaction moves to `releases/<old-version>-to-<new-version>/`, preserving
`previous/`, `bundle/`, `backup.log`, and the pre-update backup's record when available
(`backup/<disk|usb|remote>/premigrate.json`, or `premigrate-backup.json` / `backup-status.json`
from an older backup script). Existing recovery records
are never overwritten. The installation's `.env` is always left in place.

If startup or health fails, **no automatic rollback is attempted**: migrations may already have run.
Inspect `docker compose logs migrate app` and fix the problem before resuming. To return to old images,
restore the paired pre-migration database and original deployment files as an explicit recovery operation;
do not just remove `.update-pending` or restart the old Compose definition against a new schema. Keep the
database backup and recovery record until login, representative lesson, DOCX, PDF, and backup checks pass.
After an abrupt process termination, `.update-lock` can remain: remove that empty lock directory only
after confirming no updater or its Compose child is still running, then resume the same bundle.

## Trial on an Apple Silicon Mac

This is for evaluating a release on a Mac that already runs Docker Desktop, testing backup and restore,
and then removing it. It is not a production installation: a laptop sleeps, and the
backup destination below deliberately skips the separate-drive guard. Docker Desktop stays installed.

The images are multi-architecture, so they run natively on Apple Silicon. Two things differ from Linux:
`/srv` cannot be created on macOS, so install under your home directory; and macOS lacks `sha256sum`,
so verify with `shasum`. Before starting, give Docker Desktop at least 4–5 GB of memory (Settings →
Resources), and confirm `docker compose ls` shows no existing project named `lesson3` and that nothing
already listens on port 3001. A Mac that also runs a Lesson Plan Editor development stack under the `lesson3`
project name must not be used: the removal step below would delete that stack's database.

```bash
workdir="$(mktemp -d)" && cd "$workdir"
curl -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz \
  -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz.sha256
shasum -a 256 -c lesson3-online-deploy.tar.gz.sha256
tar -xzf lesson3-online-deploy.tar.gz
mkdir ~/lesson3 && cp -a lesson3-deploy/. ~/lesson3/
cd ~/lesson3
./install.sh
```

Then create the first Site Administrator at `http://localhost:3001/login` as described above.

### Backup and restore on the Mac

The ops scripts need bash 5, `flock`, `age` and `rclone`, which macOS does not provide. Rather than
install them on the Mac, run the scripts in a disposable Linux tools container that drives Docker
Desktop through its socket — the same approach `scripts/test-restore-db-stack.sh` uses on a Mac. Run
everything below from `~/lesson3`. The installation directory is mounted at the same path inside the
container, so the paths Compose passes to Docker Desktop stay valid.

```bash
docker build -t lesson3-ops-tools - <<'EOF'
FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
RUN apk add --no-cache bash coreutils docker-cli docker-cli-compose age rclone procps util-linux
EOF
ops() {
  docker run --rm -it --init -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$PWD:$PWD" -w "$PWD" -e RCLONE_CONFIG_TRIAL_TYPE=local "$@"
}
mkdir -p keys backups
ops lesson3-ops-tools age-keygen -o "$PWD/keys/backup.key"   # prints the public key, age1…
echo "$PWD/backups"                                           # the absolute path for .env
```

Add both settings to `.env`, using the printed public key and path:

```dotenv
BACKUP_AGE_RECIPIENT=age1REPLACE_WITH_PRINTED_PUBLIC_KEY
BACKUP_RCLONE_REMOTE=trial:/Users/REPLACE_WITH_YOU/lesson3/backups
```

`trial:` is an rclone remote of type `local`, defined by the `RCLONE_CONFIG_TRIAL_TYPE` variable in
`ops`. Because it is a named remote rather than a bare path, `backup-db.sh` does not require a separately
mounted drive and `.lesson3-backup-volume` sentinel. That is acceptable only for a trial whose backups
are thrown away. Keeping the private key beside the backups is likewise trial-only.

Take a backup, then confirm **Manage → System → Backups** reports it:

```bash
ops lesson3-ops-tools scripts/backup-db.sh
```

Run the restore drill into the disposable check database:

```bash
ops lesson3-ops-tools scripts/restore-db.sh --list daily
ops -e AGE_IDENTITY="$PWD/keys/backup.key" lesson3-ops-tools \
  scripts/restore-db.sh --from daily/REPLACE_WITH_LISTED_FILE --into lesson3_restore_check
```

Because the trial data is disposable, this is also a safe place to rehearse a live-database restore
(`--into lesson3 --force-prod`, then `--confirm` or `--undo`) exactly as the
[operations runbook](https://github.com/james-beep-boop/Lesson3/blob/main/docs/OPS.md) describes.

### Remove the trial

This is the one place `down -v` is intended: it deletes the trial's database and cache volumes, and
`--rmi all` deletes the images its services used. Docker Desktop itself is left installed.

```bash
cd ~/lesson3
docker compose down -v --rmi all --remove-orphans
docker image rm lesson3-ops-tools
docker image rm node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
cd ~ && rm -rf ~/lesson3
```

`~/lesson3` holds the bundle, `.env`, the trial key and the trial backups, so deleting it removes the
rest. If either removal reports that an image is in use, another project on the Mac uses the same image;
leave it.

## Maintainer release procedure

The release workflow runs only for a version tag such as the repository's existing `v0.77` sequence
(three-part tags such as `v1.2.3` are also accepted), and refuses a tag whose commit is not on `main`.
Follow the normal protected-`main` pull-request process and wait for the full CI gate. Then update local
`main`, create the next unused tag on that accepted commit, and push the tag:

```bash
git switch main
git pull --ff-only
git tag v0.84            # example only: confirm the next unused version first
git push origin v0.84
```

**Do not click GitHub's “Create a new release” button.** Pushing the tag is the only human publication
step. The workflow publishes matching multi-architecture `lesson3-app` and `lesson3-migrate` images,
emits provenance and SBOM attestations, resolves both published manifest digests into the bundle,
creates a draft release with the bundle and checksum already attached, and only then publishes it.
This ordering prevents `releases/latest/download/...` from advertising a release whose bundle is not
yet available.

Container images are published only under immutable version tags. There is deliberately no container
`latest` alias: app and migration images build in independent matrix jobs, so moving that alias in each
job can advertise a mixed release after a partial failure. GitHub's `releases/latest` download URL is a
different mechanism and remains the supported installer entry point; its bundle pins both image tags
and digests.

If publication is interrupted after the draft is created, rerun the failed workflow from GitHub Actions:
it replaces the draft's assets and then publishes it, preserving prerelease status. Do not create a
second tag or release. An already-published release is also repaired by replacing its assets, but the
workflow warns because that release may already have been advertised without an installable bundle.

For every release, wait for the `Publish release containers` workflow to finish and verify the release
shows both bundle assets. Verify in GitHub Packages that both container packages remain public; a public
source repository does not by itself prove an unauthenticated `docker pull` will work. Then perform one
clean-server installation using the release assets, not the source checkout, and run the
[verification checks](#verify-the-installation) above.
