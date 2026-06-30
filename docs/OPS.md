# Operations runbook (the Rock)

Production-hardening ops for Lesson3 (SPEC §11 / readiness #9). Covers **backups**, **restore**,
**deploy**, **structured logging**, and **monitoring**. The Rock is the single Docker-compose box
(`app` on :3001, `postgres` + `gotenberg` internal-only); repo at `/srv/lesson3`. All commands run on
the Rock unless noted.

---

## Backups (encrypted, off-site to Google Drive)

`pg_dump` (in the postgres container) → `age` encrypt (on the host) → `rclone` to Google Drive.
Two streams under the remote: `daily/` (kept `BACKUP_RETENTION_DAYS`, default 30) and `premigrate/`
(pre-deploy snapshots, kept `BACKUP_PREMIGRATE_RETENTION_DAYS`, default 90). Scripts:
`scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/deploy.sh`.

### One-time setup

1. **Binaries (no sudo — installed to `~/bin`):** `age`, `age-keygen`, `rclone` (arm64). See the install
   block at the bottom of this section if they are not already present (`command -v age rclone`).

2. **Encryption key — generate on your MAC, not the Rock** (so the private key never touches the box):
   ```bash
   age-keygen -o ~/lesson3-backup.key     # prints "Public key: age1..."
   ```
   - Store `~/lesson3-backup.key` (the PRIVATE identity) somewhere safe and durable — a password manager
     plus one more copy. **If you lose it, every backup is unrecoverable.** Do NOT put it on the Rock.
   - Take the printed `age1...` PUBLIC key → it goes in the Rock's `.env` as `BACKUP_AGE_RECIPIENT`.

3. **rclone → Google Drive (headless OAuth):** on your **Mac** (has a browser):
   ```bash
   rclone authorize "drive"               # opens a browser; prints a token JSON blob
   ```
   On the **Rock**, `rclone config` → new remote named `drive`, type `drive`, and when asked
   "Use auto config?" answer **n**, then paste the token from the Mac. Make a base folder, e.g.
   `lesson3-backups`, in that Drive. The remote+path becomes `BACKUP_RCLONE_REMOTE=drive:lesson3-backups`.

4. **`.env` on the Rock** — add:
   ```
   BACKUP_AGE_RECIPIENT=age1xxxxxxxx...
   BACKUP_RCLONE_REMOTE=drive:lesson3-backups
   # optional overrides: BACKUP_RETENTION_DAYS, BACKUP_PREMIGRATE_RETENTION_DAYS
   # optional (monitoring): HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<uuid>
   ```
   These are read by the scripts only; they are NOT app config (the app ignores them).

5. **Cron — nightly backup** (`crontab -e`):
   ```
   # 03:17 UTC nightly Lesson3 DB backup
   17 3 * * * /srv/lesson3/scripts/backup-db.sh >> /srv/lesson3/out/backup.log 2>&1
   ```

### Run / verify

- Manual backup: `scripts/backup-db.sh` (writes to `daily/`).
- List backups: `scripts/restore-db.sh --list` (or `--list daily` / `--list premigrate`).

### Restore drill (do this periodically — an untested backup is not a backup)

Restores into a **disposable** DB by default (refuses live `lesson3` without `--force-prod`):
```bash
AGE_IDENTITY=~/lesson3-backup.key \
  scripts/restore-db.sh --from daily/lesson3-<TS>.dump.age --into lesson3_restore_check
# prints lesson_plans / versions counts; then drop it:
docker compose exec -T postgres psql -U lesson3 -d postgres -c 'DROP DATABASE lesson3_restore_check;'
```
Real disaster recovery into live: same command with `--into lesson3 --force-prod` (app down first).

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

Use `scripts/deploy.sh` instead of a bare `docker compose up`: it pulls, takes a `premigrate-<sha>`
snapshot (once backups are configured), then `docker compose up -d --build` (the one-shot `migrate`
runs first). Before backups are wired it just warns and continues, so it is safe to adopt immediately.

> Schema-change caveat unchanged: regenerate types/migrations on the Rock when the schema shifts (the
> local Payload CLI breaks on newer Node) — see `docs/NEXT-SESSION.md` "Deploy".

---

## Structured logging

Payload's `payload.logger` is a **pino** instance — logs are structured JSON. We log errors through it
WITH context (e.g. `generateVersionArtifact` export-job failures), and the level is env-tunable
(`LOG_LEVEL` in `.env`, default `info`). The container log stream is **bounded + rotated by Docker's
json-file driver** (`docker-compose.yml`: `max-size 10m`, `max-file 5` per service) so it can't fill the
disk and recent history is retained.

Deliberately **no error-tracking SaaS** (Sentry etc.): keeps everything on-box, no new dep, nothing to
scrub. Trade-offs we accept: no auto-alerting/grouping, and **no client-side (browser) error capture** —
post-mortems are by grepping the JSON logs; liveness is the heartbeat below.

- Tail live: `docker compose logs -f app` · errors only: `docker compose logs app | grep '"level":50'`
  (`50`=error, `60`=fatal).
- Rotation keeps ~5×10 MB per service; logs reset on container recreation (`up --build`). Durable
  cross-deploy log archival (ship to a file/volume) is a noted follow-up — not built (kept simple).

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
