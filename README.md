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

## Docs

- `SPEC.md` — canonical specification (architecture + domain rules)
- `CLAUDE.md` — AI assistant operating rules
- `AGENTS.md` — engineering conventions (stack, layout, commands)
- `USER_GUIDE.md` — roles and user workflow
- `docs/NEXT-SESSION.md` — current state + what to work on next (the launch prompt)
- `docs/DECISIONS.md` — build-time decisions + reasoning (canonical)
- `docs/CHANGELOG.md` — session-by-session build history
- `docs/EXTERNAL-DEPENDENCIES.md` — the ARES generator + schema this app depends on
- `docs/ROCK5B-SETUP.md` — deployment runbook

## Status

The app is built and validated end to end (Phases 0–4 done). Ingest, versioning, field-level RBAC,
the role-aware frontend, §5 editing/preview, and §9 DOCX **and PDF** export are all live. It is
deployed on **"the Rock"** (a Rock 5B running Docker) as a **non-production verification environment**
— production hardening (queue/rate-limit, dependency remediation, security headers, backups, CI/CD)
is still outstanding. The current corpus is 13 published bundles (Biology + Mathematics, Grade 10).
See `docs/NEXT-SESSION.md` for the live state and next steps.
