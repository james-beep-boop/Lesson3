# Deploy Lesson3 on a local server

This is the supported online installation path for a local Linux server. It downloads prebuilt,
multi-architecture containers from GitHub Container Registry, so the server needs Docker but does not
need Git, Node.js, npm, or the Lesson3 source tree. The later offline/USB bundle will reuse these same
images and deployment files.

This deployment is for a trusted local network. It publishes the app on TCP port **3001**, keeps
PostgreSQL and Gotenberg internal to Docker, disables the public lesson-library surface, and leaves
`SERVER_URL` empty. Do not expose port 3001 directly to the public internet; public service requires
HTTPS, a reverse proxy, and the complete “Going public” checklist in `docs/OPS.md`.

## Requirements

- A 64-bit Linux server using x86-64 or ARM64.
- Docker Engine with the `docker compose` v2 plugin. Use a currently supported Docker release.
- At least 4 GB RAM; 8 GB is preferred for PDF conversion and operating-system headroom.
- Enough disk for the container images, the Postgres volume, generated artifacts, and more than one
  encrypted backup. Check with `df -h` before installing or updating.
- Outbound HTTPS access to `github.com`, `ghcr.io`, and Docker Hub during installation.
- TCP port 3001 allowed from the local network and blocked at the internet edge.
- `curl` and `openssl` on the host.

## Download and install

GitHub attaches two files to every Lesson3 release: the deployment bundle and its SHA-256 checksum.
GitHub resolves the `releases/latest/` URLs below to the newest release, so they never need updating.
One `curl` command downloads both; verify the checksum before extracting or running anything.

```bash
mkdir lesson3-download && cd lesson3-download
curl -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz \
  -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz.sha256
sha256sum -c lesson3-online-deploy.tar.gz.sha256
tar -xzf lesson3-online-deploy.tar.gz
cd lesson3-deploy
LESSON3_URL=http://SERVER_LAN_IP:3001 ./install.sh
```

Replace `SERVER_LAN_IP` with the server’s fixed LAN address or local DNS name. If the browser will run
on the server itself, omit `LESSON3_URL` and the installer uses `http://localhost:3001`.

`LESSON3_URL` becomes `ADMIN_URL`, the base for links in outbound email such as password resets — and
nothing at install time visits it, since the health check deliberately probes `127.0.0.1`. A wrong value
therefore used to install cleanly and only surface weeks later as a reset link that goes nowhere. The
installer now refuses it: the placeholder is rejected outright (an underscore cannot appear in a
hostname), and a hostname that does not resolve on the server is rejected too. IP literals are taken as
given.

⛑ **Do not “helpfully” change the placeholder to a realistic-looking IP such as `192.168.1.50`.** Its
job is to be invalid, so that a forgotten substitution fails loudly. A plausible IP would be accepted
and quietly wrong — which is the failure this guard exists to prevent.

The installer:

1. generates a 256-bit Payload secret and a separate 256-bit Postgres password;
2. writes them to `.env` with mode `0600` and never prints them;
3. downloads images whose release tag and multi-architecture digest are fixed inside the
   checksummed bundle;
4. starts Postgres, runs all migrations once, then starts Gotenberg and Lesson3; and
5. waits up to five minutes for `/login` to respond.

It refuses to overwrite an existing `.env`. Keep the installation directory: it contains the Compose
definition, configuration, operations scripts, and the version record. The database itself is in a
Docker named volume and survives container replacement.

## Create the first administrator

A local installation configures no SMTP server, so nothing it sends can be received. The first
administrator is therefore created through a one-time form that never sends mail:

1. Open the `/login` URL the installer printed, from a browser on the LAN.
2. Because the installation has no accounts, that page shows **Create the first Site administrator**
   rather than a sign-in box.
3. Enter a display name, an email address, and the password twice. The address is only the sign-in
   name — no message is sent to it, and it need not be reachable.
4. Click **Create Site administrator**. The account is created, marked verified, given the Site
   Administrator role, and signed in immediately; the browser lands on the admin panel.
5. Confirm setup closed: open `/login` in a private window. It must now show the ordinary sign-in
   form. The setup form cannot reappear, and a second attempt is refused.

After this, self-registration works normally and keeps its email-verification requirement — which on
an installation with no SMTP means later accounts should be created by an administrator rather than
self-registered.

⛑ **Do not put a bootstrap password in `.env`, and do not use Payload's stock
`/admin/create-first-user` screen.** There is one supported setup path; that URL redirects to it.
Setup attempts are deliberately exempt from the signup rate limit while the installation is empty, so
mistyping the form does not lock you out of the address.

## What is downloaded

- `ghcr.io/james-beep-boop/lesson3-app:<release>` — the minimal production application.
- `ghcr.io/james-beep-boop/lesson3-migrate:<release>` — the matching one-shot migration image.
- PostgreSQL 16.15, pinned by multi-architecture digest.
- Gotenberg 8.36.0’s LibreOffice-only image, pinned by multi-architecture digest.

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

The database contains lesson plans, all retained versions, users, roles, messages, and edit-recovery
records. The artifact-cache volume is disposable and is not a backup.

Install `age` and `rclone` on the server. Keep the private age identity off the server; put only its
public `age1…` recipient in `.env`. Configure an off-machine rclone destination:

```dotenv
BACKUP_AGE_RECIPIENT=age1REPLACE_WITH_PUBLIC_RECIPIENT
BACKUP_RCLONE_REMOTE=remote-name:lesson3-backups
```

An offline school can additionally set `BACKUP_AGE_RECIPIENT_SCHOOL` so either ARES or the school can
decrypt new backups independently. The removable-drive procedure also requires a separately mounted
device and `.lesson3-backup-volume` sentinel; follow `docs/OPS.md` rather than improvising it.

Test a backup:

```bash
scripts/backup-db.sh
```

Then perform the restore drill in `docs/OPS.md` from the machine that holds the private identity. A
backup is not accepted as recoverable until it has been decrypted, restored into the disposable check
database, and passed the script’s whole-schema row-count checks.

## Update to a later release

Download and checksum the new release bundle exactly as above, but extract it in a temporary directory.
Run its updater and point it at the absolute path of the existing installation:

```bash
cd /tmp/new-lesson3-release/lesson3-deploy
./update.sh /absolute/path/to/existing/lesson3-deploy
```

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
`previous/`, `bundle/`, `backup.log`, and (when available) `backup-status.json`. Existing recovery records
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
`docs/OPS.md` in the GitHub repository.

## Maintainer release procedure

The release workflow runs only for a version tag such as the repository's existing `v0.77` sequence
(three-part tags such as `v1.2.3` are also accepted), and refuses a tag whose commit is not on `main`.
It publishes matching multi-architecture `lesson3-app` and
`lesson3-migrate` images, emits provenance and SBOM attestations, resolves both published manifest
digests into the bundle, and attaches the bundle and checksum to a GitHub Release. Follow the normal
protected-`main` pull-request process, wait for the full CI gate, and create the tag only from the
accepted commit.

If publication is interrupted after the draft is created, rerun the workflow: it replaces the draft's
assets and then publishes it, preserving prerelease status. An already-published release is also repaired
by replacing its assets, but the workflow warns because that release may already have been advertised
without an installable bundle.

After the first release, verify in GitHub Packages that both container packages are public before
giving the download command to a server. A public source repository does not by itself prove an
unauthenticated `docker pull` will work. Then perform one clean-server installation using the release
assets—not the source checkout—and run the verification checklist above.
