# External Dependencies

## ARES CBE generation system

**Repo:** `markknit/cbe-generation-system`

This is the upstream system that produces ARES CBE lesson plans. Lesson3 depends on it for two things:

### 1. The data schema (source of truth for our content model)
- **`generators/data/SCHEMA.md`** — the authoritative definition of a sub-strand bundle (`META`, `UNIT`, `LESSONS[]`, `FINAL_EXPLANATION`, `SUMMARY_TABLE`).
- **`generators/data/*_data.js`** — real sub-strand data modules (CommonJS). Lesson3 **extracts these to JSON on ingest; it never executes them.**

### 2. The DOCX generator (source of truth for fidelity)
- **`generators/generate.js`** — CLI entry point (`generateOne()` per sub-strand).
- **`generators/lib/docx_kit.js`** — formatting primitives, brand colours, the field→paragraph/bullet rules.
- **`generators/lib/sections.js`**, **`build_docs.js`** — section/document builders.
- **`generators/aresResources.js`** — auto-generates the Resource column from `aresKeywords` + phase (not user content).
- Uses the **`docx`** npm package.

Each sub-strand bundle generates three Word documents: `*_CBE_LessonSequence.docx`, `*_FinalExplanation.docx`, `*_SummaryTable.docx`.

## Integration plan (see `SPEC.md` §4)

- Refactor `generateOne()` to accept a **data object** (not a file path), so Lesson3 can call it in-process from a Payload hook/endpoint.
- The editor's input grammar must stay a **subset** of what `docx_kit.js` accepts: plain strings, `\n` = paragraph, leading `- ` = bullet, no inline markup, `phase` from a controlled vocabulary.
- Generation is deterministic on the stored strings → byte-stable regeneration.

## Versioning discipline

Pin the upstream generator to a known commit/version. Because fidelity depends on it, treat generator upgrades as deliberate, tested changes — never automatic.

## Prior implementation (reference only)

The previous build lives in the separate **`Lesson2`** repository (Laravel 13 / Filament 5 / DreamHost). It is preserved unchanged for reference; no code is ported from it.
