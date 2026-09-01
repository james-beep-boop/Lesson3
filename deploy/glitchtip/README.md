# GlitchTip on the Rock — DRAFT FOR REVIEW

Self-hosted error tracking for Lesson3 (SPEC §11; `docs/OPS.md` → "Error tracking (GlitchTip)" step 1).
**Nothing here has been deployed.** The app's `SENTRY_DSN` is still unset, which is honestly *off* —
preferable to a value that makes `errorTrackingEnabled()` return true while events go nowhere.

## Decide these four before it goes near the box

| # | Decision | Draft's answer | Why it needs you |
|---|---|---|---|
| 1 | **Memory budget** | 1.4 GB capped total (web 768M, Postgres 512M, Valkey 128M) | The Rock has 15 GB with ~13 GB available and lesson3 capped at ~3 GB, so it fits with room to spare. But it is a shared box, and the caps are the promise that an error storm here cannot starve the library. |
| 2 | **Reachability** | `127.0.0.1:9000` only — SSH tunnel to reach it | Tightest default. Tailscale traffic arrives on `tailscale0`, **not** loopback, so as written this is *not* reachable over the tailnet. Loosening options below. |
| 3 | **Event retention** | ⚠ **Unbounded as written** | I could not find a documented retention setting (see "Not verified"). Disk is 418 GB free so it will not bite soon, but "soon" is not a policy. |
| 4 | **Backups** | Deliberately **not** added to the backup rotation | Error events are diagnostic exhaust, not records — losing them costs a post-mortem, not data. A second encrypted stream has real ongoing cost. Say if you disagree. |

## What I could not verify, and what it means

Being explicit because this is a draft: **upstream's self-host `compose.sample.yml` was not retrievable.**
The install page references it but the link 404s, and the repository's `compose.yml` is the *development*
compose (`build: .`, `DEBUG: "true"`, `POSTGRES_HOST_AUTH_METHOD: trust`) — unsuitable to copy.

So this stack is assembled from things I *could* confirm:

- the documented environment contract (`SECRET_KEY`, `DATABASE_URL`, `GLITCHTIP_DOMAIN`, `EMAIL_URL`,
  `DEFAULT_FROM_EMAIL`, `ENABLE_USER_REGISTRATION`, `ENABLE_ORGANIZATION_CREATION`);
- upstream's dev compose, for image names, `VALKEY_URL` (**not** `REDIS_URL`), and the Postgres
  `max_locks_per_transaction=512` tuning it says "matches what the install docs recommend to
  self-hosters";
- Docker Hub, for tags and **arm64** availability (6.2.6 publishes amd64 + arm64);
- this repo's own isolation and digest-pinning conventions.

**The one real assumption: that the released image's default entrypoint runs the all-in-one shape**
(web + worker + scheduler). The docs describe all-in-one as a supported deployment sized at 512 MB, and
the dev compose has a `run-all-in-one.sh`, but I did not confirm it is the *default* command. If it is
not, the UI will come up and nothing will process the queue — which the smoke test below catches,
because it checks that an event actually **arrives**, not that a container is running.

## Bring-up

```bash
scp -r deploy/glitchtip Rock5b:/srv/glitchtip     # or land it however you prefer
ssh Rock5b
cd /srv/glitchtip
cp .env.example .env && chmod 600 .env
# fill in SECRET_KEY and GLITCHTIP_POSTGRES_PASSWORD (openssl rand -hex 32 each),
# and put the same password inside DATABASE_URL
docker compose up -d
docker compose logs -f web        # watch migrations run on first boot
```

Migrations apply automatically on start; there is no separate migrate service.

### First user, without ever opening registration

`ENABLE_USER_REGISTRATION` is `false` in the compose file. Create the first account directly instead —
the same posture the app takes toward Payload's unauthenticated first-register:

```bash
docker compose exec web ./manage.py createsuperuser
```

### Reaching the UI

```bash
ssh -L 9000:127.0.0.1:9000 Rock5b      # then browse http://localhost:9000
```

To make it directly reachable instead, either bind to the Rock's Tailscale address
(`ports: - "100.x.y.z:9000:8000"`) or put it behind the same tunnel that serves
`test.kenyalessons.org`. Both widen who can read stack traces, so they are a decision, not a default.
If you do, set `GLITCHTIP_DOMAIN` to match — it is the base for links in the mail GlitchTip sends, the
same trap `deploy/online/install.sh` now guards against for the app.

## Wiring the app to it

In GlitchTip: create the organisation and a project → copy its DSN. Then on the Rock, in the **app's**
`.env` (`/srv/lesson3/.env`, not this stack's):

```bash
cd /srv/lesson3
printf 'SENTRY_DSN=%s\n' 'PASTE_DSN_HERE' >> .env
docker compose up -d app
```

**Then prove it receives**, because "configured" is not "working" — `errorTrackingEnabled()` only checks
that the variable is non-empty:

1. Trigger a real server error in a quiet window (`docs/OPS.md` suggests hitting a throwing route, or
   temporarily lowering a rate limit and watching the event).
2. Confirm the event appears in the GlitchTip project.

If the DSN is wrong, step 1 succeeds and step 2 silently does not — which is exactly why step 2 is the
test and step 1 is not.

## Upgrades

```bash
docker buildx imagetools inspect glitchtip/glitchtip:<new tag>   # get the index digest
# update the pin in compose.yaml, then:
docker compose up -d
```

Pinned by multi-arch **index** digest, so the same line works on arm64 and amd64, and upstream cannot
move under you. Migrations run on start.

## Footprint

| Service | Image | Cap |
|---|---|---|
| web (all-in-one) | `glitchtip/glitchtip:6.2.6` | 768 MB / 1.5 CPU |
| postgres | `postgres:18` | 512 MB / 1.0 CPU |
| valkey | `valkey/valkey:9` | 128 MB / 0.5 CPU |

Postgres and Valkey publish no ports. Valkey has no volume on purpose: it is the broker, not a store of
record, so a restart costs a few seconds of queued events rather than a backup obligation.
