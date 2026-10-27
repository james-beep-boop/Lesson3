# Deploy Lesson3 on a local server

This is the supported **online** installation path for a local Linux server. It downloads prebuilt,
multi-architecture containers from GitHub Container Registry, so the server needs Docker but does not
need Git, Node.js, npm, or the Lesson3 source tree. It still needs outbound internet during installation
and every update. The planned USB distribution is not implemented yet; `install.sh --prepare-only`
only writes configuration and does not make an offline installation bundle.

New sites must use this release-bundle path. Do not clone the repository or run `scripts/deploy.sh` on
a new school server; that script exists for the developer-managed Rock source checkout and builds a
different Compose topology locally.

This deployment is for a trusted local network. It publishes the app on TCP port **3001**, keeps
PostgreSQL and Gotenberg internal to Docker, disables the public lesson-library surface, and leaves
`SERVER_URL` empty. Do not expose port 3001 directly to the public internet; public service requires
HTTPS, a reverse proxy, and the complete “Going public” checklist in the
[operations runbook](https://github.com/james-beep-boop/Lesson3/blob/main/docs/OPS.md).

## Start with the job you need

| Job | Where to start | What you need |
| --- | --- | --- |
| Install a new school server | [Download and install](#download-and-install), then the checklist below | Server login, internet and a new installation folder |
| Put newer lesson plans on an existing server | [Add or update lesson plans](#add-or-update-lesson-plans) | Site administrator login and the ARES lesson ZIP |
| Update the Lesson3 program | [Update to a later release](#update-to-a-later-release) | Server login, internet, the existing installation folder and working backups |
| Set up or run backups | [Configure backups before real use](#configure-backups-before-real-use) | Server login, ARES's public recovery key and the school's backup drive |
| Recover lost data | The **Restore into the live database** procedure in `OPS.md` | A backup, its matching key and, for a password-locked key, the recovery-sheet password |

A lesson ZIP and a Lesson3 release bundle do different jobs. Upload lesson ZIPs in the browser;
use `update.sh` for the program. Updating the program does not import newer ARES lessons.

For a new server, complete these steps in order before handing it over:

1. Install and check the printed sign-in address from another computer on the school network.
2. Create and test two Site administrator accounts.
3. Set **Manage → System → Features → School name**, then Save and confirm with your sign-in password.
4. Set up backups and write down the recovery sheet; the setup must pass its first restore drill.
5. Upload the ARES lesson ZIP and check its report.
6. Open a lesson, download its Word and PDF files, and check **Manage → System → Backups**.
7. Give the school its sign-in address and named contacts for account help and server recovery.
   Keep the backup password and recovery sheet somewhere safe away from the server.

The commands below run in a terminal on the server, as the same operator account used for installation.
Replace `/srv/lesson3` if your installation folder is elsewhere. **Stop when a command reports an
error; fix it before continuing.** `DEPLOYMENT.md` and `OPS.md` in the installed folder are the
manuals for that release. A newer online manual can describe screens or commands an older bundle
does not have;
if `scripts/setup-school-backups.sh` is missing, use that installation's `OPS.md` until updating the
whole release. Do not copy individual new scripts into an older installation.

## Requirements

- A 64-bit Linux server using x86-64 or ARM64.
- Docker Engine with the `docker compose` v2 plugin. Use a currently supported Docker release. The
  installing account must be able to run `docker` without prefixing each command with `sudo`.
- At least 4 GB RAM; 8 GB is preferred for PDF conversion and operating-system headroom.
- Enough disk for the container images, the Postgres volume, generated artifacts, and more than one
  encrypted backup. Check with `df -h` before installing or updating.
- Outbound HTTPS access to `github.com`, `ghcr.io`, and Docker Hub during installation.
- TCP port 3001 allowed from the local network and blocked at the internet edge.
- `curl`, `openssl`, `tar`, and `sha256sum` on the host.

An Apple Silicon Mac is not a supported server, but it can host a temporary evaluation that includes a
backup and restore drill; see [Trial on an Apple Silicon Mac](#trial-on-an-apple-silicon-mac).

## Download and install

GitHub attaches two files to every Lesson3 release: the deployment bundle and its SHA-256 checksum.
GitHub resolves the `releases/latest/` URLs below to the newest published, non-prerelease release, so
they never need a version number. One `curl` command downloads both; verify the checksum before
extracting or running anything.

Lesson3 is a containerized service, not a static website. It does not need a `www` directory. Keep the
bundle's control files in a durable, operator-owned service directory; the examples use `/srv/lesson3`.
Postgres data and the generated-artifact cache live in Docker named volumes, not in that directory.
Creating `/srv/lesson3` requires `sudo`; an operator-owned durable directory elsewhere is also valid.
Create a new, empty service directory, download into a temporary directory, then install:

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

Replace `SERVER_LAN_IP` with the server’s fixed LAN address or local DNS name. If the browser will run
on the server itself, omit `LESSON3_URL` and the installer uses `http://localhost:3001`.

`LESSON3_URL` sets the address used in emailed links. Check the printed `/login` address from
another school computer; a successful local health check cannot prove that the address works there.
The installer rejects the unchanged placeholder and warns when a hostname cannot be resolved.

The installer:

1. generates a 256-bit Payload secret and a separate 256-bit Postgres password;
2. writes them to `.env` with mode `0600` and never prints them;
3. downloads images whose release tag and multi-architecture digest are fixed inside the
   checksummed bundle;
4. starts Postgres, runs all migrations once, then starts Gotenberg and Lesson3; and
5. waits up to five minutes for `/login` to respond.

It refuses to overwrite an existing `.env`. Keep the installation directory: it contains the Compose
definition, configuration, operations scripts, and the version record. Do not repeat the fresh-install
copy over this directory; use `update.sh` for later releases. The database itself is in a Docker named
volume and survives container replacement.

## Create the first administrator

A local installation configures no SMTP server, so nothing it sends can be received. This is separate
from the installer's network requirement: release assets and images are downloaded during installation,
but no email service or reachable inbox is needed. The first administrator is created through a
one-time form that never sends mail.

**There are no factory credentials.** The installer does not create a username or password, and the
generated `PAYLOAD_SECRET` and `POSTGRES_PASSWORD` in `.env` are internal service secrets, not browser
login credentials. Do not edit `.env` to add a person or a password.

Before leaving the server, the installing technician must create the first login:

1. Open the `/login` URL the installer printed, from a browser on the LAN.
2. Because the installation has no accounts, that page shows **Create the first Site administrator**
   rather than a sign-in box. If it shows **Sign in**, stop: the database is not empty. Locate the
   existing administrator or follow the recovery procedure below instead of trying to bootstrap again.
3. Enter the person's real display name.
4. Enter an email-format address as the sign-in name. On a no-mail installation it need not be a
   reachable inbox, but record it exactly; the administrator will type it whenever they sign in.
5. Choose a unique password of at least eight characters and enter it twice. Store the sign-in name
   and password in the site's approved password manager before continuing. Lesson3 stores only a
   password hash and cannot show the original password later.
6. Click **Create Site administrator**. The account is created, marked verified, given the Site
   Administrator role, and signed in immediately; the browser lands on the admin panel.
7. Confirm both the credentials and the one-time boundary: open `/login` in a private window. It must
   show the ordinary **Sign in** form. Sign in with the credentials just recorded. The setup form
   cannot reappear, and a second first-user attempt is refused.

After this, self-registration works normally and keeps its email-verification requirement — which on
an installation with no SMTP means later accounts should be created by an administrator:

1. Open **Manage → Users → Accounts** and select **Create user**.
2. Enter the person's display name, sign-in email, and initial password. The email is an identifier on
   a no-mail installation and need not receive messages.
3. Save the account, return to **Manage → Users → Accounts**, open its row, and select **Approve**
   (**Mark verified** on a site that sends email). The user cannot sign in until approved.
4. For a second administrator, select **Make Site Administrator** on that account's row.
5. Test the second administrator in a private browser window before relying on it for recovery.

Commission at least two Site Administrators before real use. The last-usable-administrator guard
prevents ordinary demotion, deletion, disabling, or unverification from removing the final one, but it
cannot compensate for both administrators forgetting their passwords.

⛑ **Do not put a bootstrap password in `.env`, and do not use Payload's stock
`/admin/create-first-user` screen.** There is one supported setup path; that URL redirects to it.
Setup attempts are deliberately exempt from the signup rate limit while the installation is empty, so
mistyping the form does not lock you out of the address.

### Recover an administrator without email

If no Site Administrator can sign in, an operator with shell access can mint a one-hour reset link for
an **existing, verified, enabled Site Administrator**. Run the read-only check first from the
installation directory:

```bash
docker compose run --rm \
  -e RECOVERY_EMAIL=admin@example.com \
  migrate npx payload run scripts/recover-site-admin.ts
```

If it identifies the intended account, mint the link:

```bash
docker compose run --rm \
  -e APPLY=1 \
  -e RECOVERY_EMAIL=admin@example.com \
  migrate npx payload run scripts/recover-site-admin.ts
```

Open the printed link from a browser that can reach `ADMIN_URL`. It is a live, single-use credential:
do not redirect the command output to a file, paste it into a ticket, or leave the terminal visible.
The script cannot create users, grant Site Administrator, verify an account, or re-enable sign-in. It
runs through `migrate` because the minimal production `app` image contains neither the Payload CLI nor
the scripts source.

## What is downloaded

- `ghcr.io/james-beep-boop/lesson3-app:<release>` — the minimal production application.
- `ghcr.io/james-beep-boop/lesson3-migrate:<release>` — the matching one-shot migration image.
- PostgreSQL 16.15, pinned by multi-architecture digest.
- Gotenberg 8.38.0’s LibreOffice-only image, pinned by multi-architecture digest.

The local-server Gotenberg image deliberately omits Chromium and the optional Microsoft core fonts.
That makes distribution materially smaller and avoids an automatic EULA-governed font download.
DOCX output is unchanged. Locally generated PDFs use LibreOffice’s Arial-compatible substitute, so
some table row heights can differ slightly from PDFs generated by the internet deployment with Arial.

## Verify the installation

Run these commands from the installation directory:

```bash
docker compose ps
docker compose logs migrate --tail 30
curl -fsS -o /dev/null http://SERVER_LAN_IP:3001/login && echo "login is reachable"
```

Expected state: `app`, `postgres`, and `gotenberg` are running; `migrate` exited with status 0. Also
verify from another LAN computer that sign-in, one lesson view, DOCX export, and PDF export work.
Container status alone does not prove those paths.

## Configure backups before real use

The release bundle includes `OPS.md` alongside `DEPLOYMENT.md` so the full operations runbook is
available without internet access. The GitHub links below point to the same content for online
reference.

The database contains lesson plans, all retained versions, users, roles, messages, and edit-recovery
records. The artifact-cache volume is disposable and is not a backup.

Use the **School setup (password-locked recovery key)** procedure in the bundled `OPS.md`.
It replaces the separate manual key-generation, cron and first-drill steps for a new school setup.

1. Get ARES's **public** recovery key from ARES and put it in `.env` as `BACKUP_AGE_RECIPIENT`.
   This is an `age1…` address, not a password or a private key. Keep existing database passwords and
   other `.env` values unchanged.
2. Install the host tools listed in `OPS.md`. On Ubuntu 24.04, these are:

   ```bash
   sudo apt-get update && sudo apt-get install age rclone cron util-linux coreutils
   ```

   `rclone` is required even for USB setup. Docker Compose must already work for the operator.
3. Connect the school's backup drive. It must be mounted on a separate device from the server's
   main disk, with a writable backup folder already created on it. Ask the server operator to mount
   and prepare it if necessary; setup does not format or mount drives. Know the folder's full path.
4. From the installed folder, run:

   ```bash
   cd /srv/lesson3 && scripts/setup-school-backups.sh
   ```

   Answer **yes** for USB and enter that folder path. Accept the suggested four-word password or
   choose one of at least 12 characters. Write it on paper and type it back when asked. This is a
   **backup password**, separate from the password used to sign in to Lesson3.
5. Let setup finish. It saves only a password-locked school key, copies it beside the backups,
   installs the schedule, makes the first backup and restores it into a throwaway database to check
   it. It refreshes the app service once; this can briefly interrupt use. It then shows the recovery
   sheet in the terminal. Copy the sheet onto paper: no file or log contains the password.
6. Check **Manage → System → Backups**. Expect separate disk and USB findings and **School recovery
   key: Password-locked (set up …)**. Agree the acceptable backup age with the school and have the
   operator set `BACKUP_MAX_DATA_LOSS` as described in `OPS.md`. Take the drive and recovery sheet
   away from the server when possible; keep them separately.

Setup schedules daily backups at 02:00, weekly on Sunday at 02:10 and monthly on the first at 02:20,
in the server's time zone. The server needs to be on at those times. While USB is away, disk backups
can still succeed; USB age continues to increase. To refresh the drive, connect it and run
`cd /srv/lesson3 && scripts/backup-db.sh`, then check the USB date in Manage before taking it away.

If setup is interrupted, run the same command again and enter the **same** backup password. It
reuses its saved key and skips completed steps. A new school key opens only backups made for that
key; keep earlier recovery keys for older backups. For an existing cloud arrangement, use the
**Manual setup for existing online installations** section in `OPS.md`; do not replace its key just
to update the program.

A successful first drill checks the database backup. **Full recovery: Not yet tested** still appears:
recovering an entire wiped machine is a separate test, and the planned USB install/reinstall tools
are not available yet.

## Add or update lesson plans

This is a browser task for a **Site administrator**. It does not require a server login or internet
if the lesson ZIP is already on the computer used for the upload.

1. Sign in and open **Manage → Lesson plans → Upload lesson plans**.
2. Select the ARES lesson ZIP. Keep its contents together, including `LESSONS.json` when supplied;
   there is no need to unpack it or copy files onto the server.
3. Review the confirmation. Check which lessons will become Official, which are waiting for a
   Subject-grade administrator, and which make no change. Answer any subject/grade questions, then
   confirm.
4. Read the final report. Valid files can be imported even when others are rejected. Correct the
   rejected files and upload again; unchanged releases are skipped. Older versions remain in history.
5. If the report says the lessons need a newer Lesson3 program, have the technician update the
   program using the next section, then upload the lesson ZIP again.

A teacher's Official version is left for the Subject-grade administrator to review. A release older
than the newest one already imported is refused. An app update alone does not change these rules.

## Update to a later release

Keep the existing installation in place. Arrange a quiet time, connect its backup drive (or check
the configured cloud destination), and make sure you have the recovery key/password if recovery is
needed. The current bundle updater requires `BACKUP_AGE_RECIPIENT` and a configured USB/cloud
`BACKUP_RCLONE_REMOTE`; disk-only configuration does not satisfy that check. Do not bypass it for
school data.

Download the new release into a **different, temporary folder**. These commands stop the sequence
if downloading or checksum verification fails:

```bash
workdir="$(mktemp -d)" && cd "$workdir" &&
curl -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz \
  -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz.sha256 &&
sha256sum -c lesson3-online-deploy.tar.gz.sha256 &&
tar -xzf lesson3-online-deploy.tar.gz &&
./lesson3-deploy/update.sh /srv/lesson3
```

The updater takes its own backup before changing the database and keeps the existing users, lesson
plans and `.env`. It can briefly stop the app. It reports success only after the new app responds.
After it succeeds:

1. From `/srv/lesson3`, run `cat VERSION` and check the version shown on the sign-in page or Guide.
2. Sign in from another school computer; open a lesson and download Word and PDF.
3. Before the first backup after an older release, follow **Upgrading an older backup arrangement**
   in the installed `OPS.md` to prepare the disk folder or keep your USB/cloud-only arrangement.
   Then run `cd /srv/lesson3 && scripts/backup-db.sh` and check each destination in Manage.
4. Upload any newer ARES lesson ZIP separately, using the previous section.

| If the updater says… | What to do |
| --- | --- |
| Missing `.env` keys | Open the **new extracted** `.env.example`. Add only the listed missing keys to the **installed** `.env`, preserving all existing secrets and settings, then rerun the same updater. Ask the server operator about values you do not recognise. |
| Backup failed or backups are not configured | Fix the backup destination or configuration using the installed `OPS.md`. Do not use the unbacked-update override for a school with data. |
| Download or checksum failed | Stop. Do not extract or run that download; download and verify it again. |
| Update was interrupted | Keep the extracted bundle and retry that exact updater command. Follow the lock guidance below if it reports a lock. |
| Startup or migration failed | Keep the recovery files. Give the error and the installed `docker compose logs migrate app` output to the server operator; follow the recovery guidance below. |


### Update recovery details (for the server operator)

After the checks above pass, the update is complete. Use this section when investigating a failed
or interrupted update.

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
(`premigrate-backup.json`, or `backup-status.json` from an older backup script). Existing recovery records
are never overwritten. The installation's `.env` is always left in place.

If startup or health fails, **no automatic rollback is attempted**: migrations may already have run.
Inspect `docker compose logs migrate app` and fix the problem before resuming. To return to old images,
restore the paired pre-migration database and original deployment files as an explicit recovery operation;
do not just remove `.update-pending` or restart the old Compose definition against a new schema. Keep the
database backup and recovery record until login, representative lesson, DOCX, PDF, and backup checks pass.
After an abrupt process termination, `.update-lock` can remain: remove that empty lock directory only
after confirming no updater or its Compose child is still running, then resume the same bundle.

## Routine operations

```bash
docker compose ps
docker compose logs -f app
docker compose restart app
docker compose stop
docker compose start
```

Do not run `docker compose down -v`: `-v` deletes the Postgres and artifact-cache volumes. Ordinary
`docker compose down` preserves them, but stopping and starting is normally sufficient.

The complete backup, restore, pruning, monitoring, public-exposure, and incident procedures remain in
the [operations runbook](https://github.com/james-beep-boop/Lesson3/blob/main/docs/OPS.md).

## Trial on an Apple Silicon Mac

This is for evaluating a release on a Mac that already runs Docker Desktop, testing backup and restore,
and then removing it. It is not a production installation: a laptop sleeps, and the
backup destination below deliberately skips the separate-drive guard. Docker Desktop stays installed.

The images are multi-architecture, so they run natively on Apple Silicon. Two things differ from Linux:
`/srv` cannot be created on macOS, so install under your home directory; and macOS lacks `sha256sum`,
so verify with `shasum`. Before starting, give Docker Desktop at least 4–5 GB of memory (Settings →
Resources), and confirm `docker compose ls` shows no existing project named `lesson3` and that nothing
already listens on port 3001. A Mac that also runs a Lesson3 development stack under the `lesson3`
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
clean-server installation using the release assets, not the source checkout, and run the verification
checklist above.
