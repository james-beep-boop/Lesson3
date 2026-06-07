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

- `SPEC.md` — canonical specification
- `CLAUDE.md` — AI assistant instructions
- `AGENTS.md` — engineering conventions
- `USER_GUIDE.md` — roles and user workflow
- `docs/EXTERNAL-DEPENDENCIES.md` — the ARES generator + schema this app depends on

## Status

Documentation and architecture are set. Application scaffolding (Payload + Postgres + the embedded generator) has not been generated yet.
