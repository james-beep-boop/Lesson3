# Request to the ARES CBE generation team (`markknit/cbe-generation-system`)

**From:** the Lesson3 team (ARES Lesson Library)
**Re:** Stabilising the lesson-data contract so downstream ingestion is clean, complete, and reproducible at scale
**Attachment:** [`ares-data-contract.schema.json`](ares-data-contract.schema.json) — a first-pass JSON Schema we drafted from your current 13 data files, offered as a starting point for the canonical contract.

---

## Context

We've built a versioned lesson-plan repository that **ingests your generator's data files**
(`generators/data/*_data.js`) and **reuses your own DOCX generator in-process** to regenerate the
three documents (Lesson Sequence, Final Explanation, Summary Table). We deliberately depend on
your data as the source of truth — we store it as structured, versioned fields and regenerate
documents from it. We're about to scale from ~13 sub-strands to **dozens or hundreds of bundles**,
so the **data contract** between your output and our ingestion now matters a lot.

The issues below are **not** about the generator — document fidelity is good (we regenerate
`bio_1_4`'s three documents byte-faithfully today). They're about the **data files** not
conforming to a single, stable schema, which at scale causes silent data loss and inconsistent
documents.

## What we found (evidence from the current 13 files)

1. **`SCHEMA.md` no longer matches the emitted data.** The doc lists `duration`, `outcomes`,
   `competencies`, `careerConnections`, `focusForLessons`, `keyInquiryQuestions` — but the actual
   `UNIT` objects emit `totalDuration`, `learningOutcomes`, `coreCompetencies`, `careers`,
   `focus`, `drivingQuestion`. So there is currently **no single source of truth** for field names.

2. **Field names are inconsistent between files.** Same field, different key:
   - `totalDuration` (8 files) vs `duration` (4 — `bio_2_1`, `math_2_2/2_3/2_4`)
   - `storyline` (8) vs `storylineThread` (4)
   Your generator's `get('totalDuration','duration')`-style fallbacks absorb this internally, but
   every downstream consumer must replicate every alias or silently drop data.

3. **Field-name corruption that no validator caught.** In `LESSONS[].slo`, the `safetyNotes`
   field appears across the corpus as `safety1otes`, `safety2otes`, `safety3otes`, `safety4otes`,
   and `safety8otes` (a digit has replaced the `N` — looks like a search/replace gone wrong). A
   stray `keyInquiry` has also leaked into `UNIT`. These are exactly the errors a schema with
   `additionalProperties: false` would reject on emit.

4. **Incomplete sections with no signal of intent.** `bio_1_4` ships an **empty `UNIT` (0 keys)**
   while its 12 siblings carry 14–17 keys — producing a blank "Sub-Strand Overview" table. We
   can't tell whether that's intentional (no overview for this sub-strand) or an export gap. Same
   ambiguity arises with empty Final Explanation / Summary Table on some bundles.

## What would help us most (prioritised)

**P1 — One canonical field-name set, published as a versioned JSON Schema.**
Pick one name per field (we don't mind which) and make `SCHEMA.md` ⇄ the data ⇄ a machine-readable
**JSON Schema** agree. Ideally the generator **validates its own output against that schema before
writing**, and each file carries a `schemaVersion`. This one change removes the aliases, the
doc/data drift, and the `safety3otes`-class corruption — and lets *both* sides validate
automatically. (We've attached a draft schema to start from.)

**P1 — Completeness, or an explicit "intentionally empty" signal.**
Either always emit a fully-populated `UNIT` (and `FINAL_EXPLANATION` / `SUMMARY_TABLE`), or include
an explicit marker (e.g. `UNIT: null`) when a section is deliberately absent — so we can
distinguish "no overview by design" from "export bug."

**P2 — Emit canonical JSON (not `.js` modules) as the interchange artifact.**
We can ingest `.js`, but we must **parse, never execute** it (we won't `require()` untrusted code),
so a `.js` module is strictly harder and riskier for us than plain JSON. A validated `*.json` per
bundle (your `.js` can remain the internal authoring format) would be ideal and directly
schema-checkable.

**P2 — A stable unique identifier per bundle.**
Something like `{subject, grade, substrandId}` guaranteed stable across regenerations, so we can
match / version / de-duplicate bundles deterministically as the corpus grows (today we fall back
to deep-equality).

**P3 — Embed the per-phase resource data.**
`framework[]` currently carries a single `resource` string, but the rich per-lesson resources
(video + reading: `title`, `source`, `direct_url`/`search_url`) live only in the Python
recommender's output, not in the data file — so our "Resource" column is empty. If each
`framework[]` phase carried its resolved resources in the emitted data, that column would populate
with no extra integration on our side.

## What we are *not* asking you to change
- The document layout, styling, or generator code — fidelity there is good.
- You can keep the `get(a,b)` tolerance internally; we only ask that the **emitted data** be
  canonical and validated.

## Offer
We've attached a **first-draft JSON Schema** (`ares-data-contract.schema.json`) derived from your
current 13 files — canonical names, required/optional fields, the phase controlled-vocabulary, and
`additionalProperties: false` so typos/aliases are rejected. Please adopt/adjust it as the
canonical contract; we'll validate every ingest against the agreed version and report drift back
to you.

If a single canonical, versioned, validated JSON contract is feasible on your end, it removes
essentially all of our downstream normalisation and makes the whole pipeline reproducible.
