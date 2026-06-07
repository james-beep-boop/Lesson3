# ARES Lesson Library (Lesson3) — AI Assistant Instructions

Loaded automatically by Claude Code at the start of every session.
The canonical specification is **`SPEC.md`** in this directory. **Read it before any architectural decision.**

---

## Project in one line

A **versioned lesson-plan repository**: ingest ARES-generated CBE lesson plans as v1.0.0 → basic teacher editing → bulletproof versioning → **high-fidelity DOCX/PDF export**. Offline use is secondary.

---

## Lineage

This is **Lesson3**, a clean-slate rewrite. The prior implementation (a Laravel 13 / Filament 5 app on DreamHost) lives, preserved and unchanged, in the **separate `Lesson2` repository**. Do not port its code. Only the domain rules captured in `SPEC.md` carry over.

## Decided architecture

- **Node.js / TypeScript**, single runtime end to end.
- **Payload CMS** (MIT, Postgres) for data model, auth, **field-level RBAC**, **versioning**, admin UI, and API.
- **DOCX/PDF by reusing ARES's own Node generator** (`cbe-generation-system`: the `docx` npm package, `docx_kit.js`, `sections.js`), embedded in-process and called as `generateOne(dataObject)`.
- A **Node-capable host**, not DreamHost.

**Why:** ARES lesson plans are structured data, and high-fidelity DOCX is only achievable by reusing ARES's generator. Storing Markdown/HTML is lossy and disqualifying. Full reasoning: `SPEC.md` §0.

---

## Non-negotiable design rules

- **Edit the data, never the document.** DOCX/PDF are regenerated build artifacts; there is no Word round-trip.
- **Content is structured JSON** (the sub-strand bundle: `META, UNIT, LESSONS[], FINAL_EXPLANATION, SUMMARY_TABLE`). Model it as **native Payload nested fields**, not a JSON blob.
- **The editor's grammar must stay a subset of the generator's input grammar.** Prose fields are plain strings: `\n` = paragraph; a leading `- ` = bullet; **no inline markup**. `framework[].phase` is a controlled dropdown. The Resource column is auto-generated and never editable.
- **Versioning:** whole-bundle immutable snapshots; first ingested = `1.0.0`; default bump = patch; one official version per bundle.
- **Ingest extracts `.js` → JSON. Never `require()`/execute an uploaded `.js`** (RCE risk).
- **Field-level permissions:** Editor = prose values; Subject Admin = `META`/`aresKeywords`/`phase`/structure/answer-keys; see `SPEC.md` §5.

---

## Authorization model

- **Site Administrator** (global) — everything.
- **Subject Administrator** (per subject-grade, ≤1) — structural edits, admin-only fields, mark official, manage scoped roles.
- **Editor** (per subject-grade) — edit prose field values.
- **Teacher** (default) — view/export only.

`Subject` = academic discipline only. `SubjectGrade` = subject + **integer** grade; the unit roles attach to (display "Grade N"). Per-subject-grade scoping lives in Payload access functions. Promoting a Subject Admin auto-demotes the prior one in one transaction. `class` is reserved — the entity is always `SubjectGrade`. Non–Site-Admins never see others' emails.

---

## Knowledge currency

Node/Payload move fast. Before implementing against Payload, the `docx` package, or Next.js:

1. Read installed package source / official docs; **trust installed source over memory.**
2. **Pin versions; upgrade deliberately**, not on the weekly release train.
3. Treat any pre-2026 recollection of Payload APIs as suspect — Payload 3 is a Next.js-native rewrite.

References: `payloadcms.com/docs`, the `docx` npm package, and the ARES `cbe-generation-system` repo (`docs/EXTERNAL-DEPENDENCIES.md`).

---

## Working agreements

- **Never commit or push without an explicit request.**
- When in doubt, check `SPEC.md`; if still ambiguous, choose the simplest maintainable option and document the deviation there.
- Do not invent features beyond the spec.
- Keep the system single-runtime — do not re-introduce a second language on the core path.
