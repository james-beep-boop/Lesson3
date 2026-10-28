# Rock 5B setup — Lesson3 alongside nanoclaw

Stand up the Payload + Postgres app in Docker on the Rock 5B, isolated from the
running nanoclaw stack (`onecli` / `onecli-postgres-1`).

> **The app is already scaffolded and committed** (in `./app`). On the Rock you
> **clone and run** — you do *not* run `create-payload-app`. You don't even need
> Node/npm on the Rock; the Docker build installs deps inside the image.

## Why this is safe to co-host

nanoclaw uses ~140 MB of the Rock 5B's 16 GB. This app idles at a few hundred MB.
The compose file isolates everything:
- separate project/container names (`lesson3-*`), separate Postgres + volume
- Lesson3's Postgres has **no published host port** (internal-only) — no clash with
  `onecli-postgres-1` (which binds `127.0.0.1:5432`)
- app on host port **3001** (3000 stays free), with mem/cpu caps as insurance
- Postgres versions differ (nanoclaw 18, Lesson3 16) — irrelevant; separate containers/volumes

## Prerequisites (on the Rock 5B)

```bash
docker --version && docker compose version   # Docker + Compose v2+ present
git --version                                # if missing: sudo apt install -y git
```

## Step 1 — Clone into the service directory (one-time)

Lives in `/srv/lesson3` (the conventional home for a long-lived service; owned by
your user, not root). Data persists in a Docker **named volume** (`lesson3_pgdata`),
decoupled from the repo — so you can re-clone the code without risking the database.

```bash
sudo mkdir -p /srv/lesson3
sudo chown "$USER":"$USER" /srv/lesson3
git clone https://github.com/james-beep-boop/Lesson3.git /srv/lesson3
cd /srv/lesson3
```

The committed `docker-compose.yml` builds the app from `./app` (`build: ./app`) using
the Dockerfile that `create-payload-app` generated. Nothing to scaffold.

## Step 2 — Configure env (`.env` is gitignored — create it fresh on each host)

Create the configuration from the current template. The script makes matching random secrets and
refuses to overwrite an existing `.env`:

```bash
cd /srv/lesson3
scripts/create-env.sh
```

`DATABASE_URI` uses `postgres` (the compose service name), not `localhost`. Review `.env` and
configure backups as described in `docs/OPS.md` before deploying changes to a populated database.

## Step 3 — Bring it up

```bash
docker compose up -d --build
docker compose logs -f app          # watch first boot / migrations (Ctrl-C to stop tailing)
docker ps                           # confirm lesson3-app-1 + lesson3-postgres-1 are up
```

nanoclaw's containers are untouched — `docker ps` should show `onecli`,
`onecli-postgres-1`, `lesson3-app-1`, `lesson3-postgres-1`.

**ARM64 note:** Node, Postgres, and the `docx` generator run natively. `sharp` ships
prebuilt musl/arm64 binaries. The production build explicitly traces sharp's separate libvips
library and renders a one-pixel image in the final stage; a missing native runtime therefore fails
the build instead of the deployed app. If another native module still fails, switch the Dockerfile's
base image from `node:24-alpine` to a Debian-based `node:24-slim` and rebuild.

## Step 4 — First login

Over Tailscale, open `http://rock5b.tail49b05.ts.net:3001/login`. On an empty database, use
**Create the first Site administrator** to create the account. If the sign-in form appears instead,
use an existing account.

## Day-to-day

For the developer-managed Rock checkout, use `scripts/deploy.sh` to pull and deploy. It takes an
encrypted backup before applying migrations. Follow the **Deploy** section of `docs/OPS.md` for the
full procedure and recovery steps. After changing `.env`, recreate the app container so it reads the
new settings; a restart alone does not update its environment.

```bash
cd /srv/lesson3
scripts/deploy.sh              # pull, back up, build, migrate and check readiness
docker compose logs -f app     # logs (Ctrl-C stops watching)
docker compose down            # stop; Postgres data stays in its named volume
docker stats --no-stream       # confirm footprint vs nanoclaw
```

## Backups (per SPEC §11)

Follow **Backups** in `docs/OPS.md` to configure encrypted backups, the schedule and a restore drill.
Run `scripts/backup-db.sh` from `/srv/lesson3` to make a backup now. A successful copy does not prove
it can be restored; use the restore drill in that manual to check it.

## Notes

- This is a **private** (Tailscale-only) box — ideal for testing and as the
  offline-deployment prototype. Public/teacher-facing production wants a public host
  (small VPS or Railway/Render) running the identical stack.
- The whole stack auto-starts on reboot (`restart: unless-stopped`).
