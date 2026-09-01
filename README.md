# ARES Lesson Library (Lesson3)

A **versioned lesson-plan repository** for ARES Kenya. ARES-generated CBE lesson plans are ingested as version 1.0.0; teachers make basic edits; every edit creates a new immutable version; any version exports as **high-fidelity DOCX and PDF**.

> **Clean-slate rewrite.** This repository supersedes the **Lesson2** project (Laravel 13 / Filament 5 on DreamHost), which is preserved unchanged in its own repository for reference. See **`SPEC.md`** for the architecture and **`CLAUDE.md`** for AI-assistant guidance.

## Architecture

- **Node.js / TypeScript**, single runtime.
- **Payload CMS** (Postgres) — data model, auth, field-level RBAC, versioning, admin UI, API.
- **DOCX/PDF by reusing ARES's own generator** (`cbe-generation-system`, the `docx` npm package), embedded in-process.
- **Node-capable host** (cloud VPS now; local Node box for offline later).

### Why
ARES lesson plans are **structured data** (a nested sub-strand bundle), and the approved Word formatting is produced by ARES's Node generator. The only way to get high-fidelity DOCX is to keep the structured data and reuse that generator — so the app is built in the generator's runtime. Markdown/HTML storage (the Lesson2 approach) is lossy and was disqualifying. Full reasoning: `SPEC.md` §0.

## Deploy on a local server

Versioned releases provide prebuilt x86-64 and ARM64 containers through GitHub Container Registry.
The server needs Docker Compose, `curl`, and `openssl`; it does not need Git, Node.js, npm, or a local
image build. Download the checksummed deployment bundle from the latest GitHub release — GitHub resolves
the `releases/latest/` URLs below to the newest release, so they never need updating:

```bash
mkdir lesson3-download && cd lesson3-download
curl -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz \
  -fLO https://github.com/james-beep-boop/Lesson3/releases/latest/download/lesson3-online-deploy.tar.gz.sha256
sha256sum -c lesson3-online-deploy.tar.gz.sha256
tar -xzf lesson3-online-deploy.tar.gz && cd lesson3-deploy

# Replace SERVER_LAN_IP with this server's LAN IP address, e.g. http://192.168.1.50:3001
LESSON3_URL=http://SERVER_LAN_IP:3001 ./install.sh
```

`LESSON3_URL` is the address teachers will use, and it becomes the base for password-reset links. The
installer **rejects the unsubstituted `SERVER_LAN_IP` placeholder**, so forgetting to replace it fails
immediately instead of installing cleanly and mailing links that go nowhere.

Read [`docs/LOCAL-SERVER-DEPLOYMENT.md`](docs/LOCAL-SERVER-DEPLOYMENT.md) before installing. It covers
requirements, firewall posture, first-user setup, verification, encrypted backups, updates, recovery,
and the deliberate PDF-font tradeoff. Do not pipe a remote install script directly into a shell.

## Docs

- `SPEC.md` — canonical specification (architecture + domain rules)
- `CLAUDE.md` — AI assistant operating rules
- `AGENTS.md` — engineering conventions (stack, layout, commands)
- `USER_GUIDE.md` — roles and user workflow
- `docs/NEXT-SESSION.md` — current state + what to work on next (the launch prompt)
- `docs/DECISIONS.md` — build-time decisions + reasoning (canonical)
- `docs/CHANGELOG.md` — session-by-session build history
- `docs/EXTERNAL-DEPENDENCIES.md` — the ARES generator + schema this app depends on
- `docs/DEPENDENCY-REVIEW-2026-08-25.md` — current component updates, deferrals, and evidence
- `docs/LOCAL-SERVER-DEPLOYMENT.md` — checksummed GitHub/container deployment for a local server
- `docs/ROCK5B-SETUP.md` — deployment runbook

## Status

The app is built and validated end to end. Ingest, versioning, field-level RBAC, the role-aware
frontend, editing/recovery/preview, and high-fidelity DOCX/PDF export are live. The canonical GitHub
gate builds the real Compose stack, applies migrations to disposable Postgres, and runs unit,
integration, HTTP, browser, lint, format, contract, and production-audit checks. The Rock 5B remains
the deployment verification environment. See `docs/NEXT-SESSION.md` for dated deployment evidence and
the current next steps; re-measure those claims rather than treating the handoff as live telemetry.

## Licence

**MIT** — see [`LICENSE`](LICENSE). Chosen to match Payload CMS, which this project is built on, so
there is no friction between the two.

⚑ **Read [`NOTICE`](NOTICE) alongside it.** Three vendored generator files are copied byte-verbatim
from the ARES CBE generation system and are not ours to license; the lesson-plan content is a separate
question, and content wants a different kind of licence from code.
