# Rock 5B setup — Lesson3 alongside nanoclaw

Stand up the Payload + Postgres app in Docker on the Rock 5B, isolated from the
running nanoclaw stack (`onecli` / `onecli-postgres-1`).

## Why this is safe to co-host

nanoclaw uses ~140 MB of the Rock 5B's 16 GB. This app idles at a few hundred MB.
The compose file isolates everything:
- separate project/container names (`lesson3-*`), separate Postgres + volume
- Lesson3's Postgres has **no published host port** (internal-only) — no clash with `onecli-postgres-1`
- app on host port **3001** (3000 stays free), with mem/cpu caps as insurance

## Prerequisites (on the Rock 5B)

```bash
docker --version && docker compose version   # confirm Docker + Compose v2 present
```

## Step 1 — Scaffold the Payload app (once)

> Payload moves fast; confirm the current flags at payloadcms.com/docs before running.
> Choose: **blank** template, **PostgreSQL**, **TypeScript**.

Scaffold into the repo (it generates `package.json`, the Next/Payload app, **and a Dockerfile**):

```bash
cd ~/Documents/GitHub/Lesson3        # or wherever you clone it on the Rock 5B
npx create-payload-app@latest .      # if it refuses a non-empty dir, scaffold to ./app and set `build: ./app` in compose
```

Keep the **Dockerfile** it generates (our `docker-compose.yml` builds from it via `build: .`).
Discard any `docker-compose.yml` it generates — use the committed one instead.

## Step 2 — Configure env

```bash
cp .env.example .env
# generate a secret:
openssl rand -hex 32        # paste into PAYLOAD_SECRET
# set POSTGRES_PASSWORD to a strong value, and put the SAME value into DATABASE_URI
```

`DATABASE_URI` host is `postgres` (the compose service name), not localhost.

## Step 3 — Bring it up

```bash
docker compose up -d --build
docker compose logs -f app          # watch first boot / migrations
docker ps                           # confirm lesson3-app-1 + lesson3-postgres-1 are up
```

nanoclaw's containers are untouched — verify with `docker ps` (you'll see `onecli`,
`onecli-postgres-1`, `lesson3-app-1`, `lesson3-postgres-1`).

## Step 4 — First login

Over Tailscale, open: `http://rock5b.tail49b05.ts.net:3001/admin`
Create the first admin user. You now have an empty Payload admin panel — the
scaffold is done; feature work (sub-strand collection, ingest, embedded generator) comes next.

## Day-to-day

```bash
docker compose logs -f app      # logs
docker compose restart app      # restart after code/env change (rebuild if deps changed: --build)
docker compose down             # stop (Postgres data persists in lesson3_pgdata)
docker stats --no-stream        # confirm footprint vs nanoclaw
```

## Notes

- This is a **private** (Tailscale-only) box — ideal for testing and as the
  offline-deployment prototype. Public/teacher-facing production wants a public host
  (small VPS or Railway/Render) running the identical stack.
- ARM64: Node, Postgres, and the `docx` generator all run natively; native deps
  (e.g. `sharp`) have arm64 builds. If a build hits a native-module error, prefer a
  Debian-based Node base image over Alpine.
