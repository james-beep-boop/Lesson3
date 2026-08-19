# ARES Lesson Library (Lesson3) — AI Assistant Instructions

Loaded automatically by Claude Code at the start of every session.
The canonical specification is **`SPEC.md`** in this directory. **Read it before any architectural decision.**
**At the start of each session, also read `docs/DECISIONS.md`** — the committed record of build-time decisions and prior corrections (it's large; skim the newest entries and grep for the area you're touching).
Engineering conventions (stack, project layout, commands) live in **`AGENTS.md`** — this file holds AI operating rules and project-specific design law, not generic conventions.
For current state + what to work on next, start from **`docs/NEXT-SESSION.md`**.

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
- **The editing UI's grammar must stay a subset of the generator's input grammar.** Prose fields are plain strings: `\n` = paragraph; a leading `- ` = bullet; **no inline markup**. `framework[].phase` is a controlled dropdown. Required lesson-level `resourceLinks` are resolved upstream, stored losslessly as system-only fields, and rendered inline beneath the phase label; they are never editable, and Lesson3 never runs the Python recommender.
- **Versioning:** whole-bundle immutable snapshots; first ingested = `1.0.0`; default bump = patch; one official version per bundle.
- **Ingest extracts `.js` → JSON. Never `require()`/execute an uploaded `.js`** (RCE risk).
- **Field-level permissions:** a Teacher with editing access = prose values; Subject Admin = `META`/`aresKeywords`/`phase`/structure/answer-keys; see `SPEC.md` §5.

---

## Authorization model

**Three user types**, and editing access is a *capability* a Teacher holds — never a fourth type:

- **Site Administrator** (global) — everything.
- **Subject Administrator** (per subject-grade, ≤1) — structural edits, admin-only fields, mark
  official, and grant/revoke **editing access** within that subject-grade. ⚑ **Not** the Subject
  Administrator role itself: only a Site Administrator may appoint or vacate one (operator decision
  2026-08-16, "D6a"; SPEC §8). That is enforced server-side in `enforceAssignmentScope` — covering the
  generic `PATCH /api/users/:id`, not only the dedicated routes — and is forward-only: pre-existing
  grants written under the old behaviour stay valid.
- **Teacher** (default) — view/export. **May additionally hold editing access** for one or more
  subject-grades, which permits editing prose field values there.

⚑ **"Editor" is not a user type and must not be reintroduced as one.** The stored assignment value
`'editor'`, `isEditorFor`, `assign-editor`, `lib/editorGroups.ts` and similar names are implementation
identifiers for that capability — keep them. What must never appear is an **Editor** account type in
prose, in a type label, or in the UI: such a user is a **Teacher with editing access**, and
`userTypeLabel` returns only the three types above. SPEC §8 is canonical; the reasoning is
`docs/DESIGN-user-model-language-2026-07-29.md` and DECISIONS 2026-08-17.

`Subject` = academic discipline only. `SubjectGrade` = subject + **integer** grade; the unit roles attach to (display "Grade N"). Per-subject-grade scoping lives in Payload access functions. Promoting a Subject Admin auto-demotes the prior one — to a Teacher with editing access for that subject-grade — in one transaction. `class` is reserved — the entity is always `SubjectGrade`. **`draft` is likewise reserved** (SPEC §13): it
already means an unofficial *saved version* — the Guide tells users "your drafts live in Manage → My
saved versions" — so the unsaved-work feature is **edit recovery**, never "drafts". Non–Site-Admins never see others' emails —
**with one carve-out (SPEC §8, amended 2026-08-02): Manage → Roles & Access shows addresses to Subject
Administrators too**, so an administrator can tell two identical display names apart before granting or
revoking editing access. `emailReadAccess` is unchanged (Site-Admin-or-self), so every other surface
still withholds them; the carve-out is one trusted projection (`lib/editorGroups.ts`). ⚑ Read SPEC §8
before "fixing" it as a leak — it is a deliberate operator decision with a per-role test
(`tests/int/editorGroupsAccess.int.spec.ts`).

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

---

## Working process

- **Plan first for non-trivial work.** Any task >3 steps or touching architecture: propose a plan before editing. If the plan breaks, stop and re-plan — don't improvise forward.
- **Verify, never assume.** Prove each change: golden-file DOCX diff (regenerate → diff vs approved, everything-except-resources), type-check, or boot. "Done" requires evidence.
- **Surgical edits.** Change only what the task needs. Byte-stability is the product — minimize churn; don't refactor stable code in passing.
- **Elegance at design time, minimal churn at edit time.** Get the approach right in the plan so you don't rip things out later.
- **Inline by default.** Research/analysis happens in this context; spin up a subagent only when explicitly asked or when work is truly parallel.
- **Every custom endpoint ships with wire-level authz tests.** A new/changed endpoint (or auth-affecting hook) lands with `tests/http` coverage of its 401/403/404 (+ the happy path) in the same PR. The endpoints authorize with the caller's access and then write via `overrideAccess: true` — that pattern is only as safe as the test that proves the gate runs first. This is the standing guard the 2026-07-04 audit asked for (it could not be automated structurally). Same rule for a security-critical invariant: pin it with a fast unit/wiring test, not review alone.
- **Record corrections.** When I get something wrong and you correct me, I log the lesson to `docs/DECISIONS.md` and review it at the start of each session.
