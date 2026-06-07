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

The secret and the Postgres password must match between `POSTGRES_PASSWORD` and
`DATABASE_URI`. This block generates both and writes them consistently:

```bash
cd /srv/lesson3
SECRET=$(openssl rand -hex 32)
PGPASS=$(openssl rand -hex 16)
cat > .env <<EOF
PAYLOAD_SECRET=${SECRET}
POSTGRES_PASSWORD=${PGPASS}
DATABASE_URI=postgres://lesson3:${PGPASS}@postgres:5432/lesson3
NODE_ENV=production
PORT=3000
EOF
chmod 600 .env
```

`DATABASE_URI` host is `postgres` (the compose service name), not `localhost`.

## Step 3 — Bring it up

```bash
docker compose up -d --build
docker compose logs -f app          # watch first boot / migrations (Ctrl-C to stop tailing)
docker ps                           # confirm lesson3-app-1 + lesson3-postgres-1 are up
```

nanoclaw's containers are untouched — `docker ps` should show `onecli`,
`onecli-postgres-1`, `lesson3-app-1`, `lesson3-postgres-1`.

**ARM64 note:** Node, Postgres, and the `docx` generator run natively. `sharp` ships
prebuilt musl/arm64 binaries, so the Alpine build normally works. If the build fails
on a native module (e.g. `sharp`), switch the Dockerfile's base image from
`node:22-alpine` to a Debian-based `node:22-slim` and rebuild.

## Step 4 — First login

Over Tailscale, open: `http://rock5b.tail49b05.ts.net:3001/admin`
Create the first admin user. You now have an empty Payload admin panel — the scaffold
is done; feature work (sub-strand collection, ingest, embedded generator) comes next.

## Day-to-day

```bash
docker compose logs -f app      # logs
docker compose restart app      # restart after env change (rebuild if deps/code changed: --build)
git pull && docker compose up -d --build   # deploy latest committed code
docker compose down             # stop (Postgres data persists in the lesson3_pgdata volume)
docker stats --no-stream        # confirm footprint vs nanoclaw
```

## Backups (per SPEC §11)

Back up via `pg_dump` to a folder you control — the correct, restorable artifact
(copying a running Postgres data dir is corruption-prone):

```bash
mkdir -p /srv/lesson3/backups
docker compose exec -T postgres pg_dump -U lesson3 lesson3 \
  | gzip > /srv/lesson3/backups/lesson3-$(date +%F).sql.gz
```

Automate (cron) and move off-box + encrypt before real users.

## Notes

- This is a **private** (Tailscale-only) box — ideal for testing and as the
  offline-deployment prototype. Public/teacher-facing production wants a public host
  (small VPS or Railway/Render) running the identical stack.
- The whole stack auto-starts on reboot (`restart: unless-stopped`).
