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

### 3. The resource subsystem (Python + SQLite) — handle at ingest, and it's optional
The LessonSequence's per-phase **Resource column** is *not* in the data file. `generators/aresResources.js` produces it at build time by:
- shelling out to a **Python recommender** — `src/ares_recommender.py`
- which queries a **SQLite content index** — `data/ares_index/ares_content.db` (override via `ARES_DB_PATH`).
- `getAllPhaseResources({substrand, topic, subject})` → per-phase `{ video, reading }` (each with `title`, `direct_url`, `search_url`); `buildResourceParagraphs()` formats them.

Implications for Lesson3:
- This is a **Python + large-SQLite dependency**, not pure Node. **Do not run it live** in the app.
- **Resolve once at ingest**, store the result in the bundle (`framework[].resources`), then generate purely from stored data — keeps the app single-runtime and regeneration byte-stable. Python + `ares_content.db` are needed only where ingest runs.
- **The resource column is OPTIONAL / undetermined** — there's a real chance we ship without it. All code must work with `framework[].resources` absent.
- For the fidelity proof, the resource column only matches the approved DOCX if the same `ares_content.db` + recommender are used — so diff **everything-except-resources** first.

## Integration plan (see `SPEC.md` §4)

- Refactor `generateOne()` to accept a **data object** (not a file path), so Lesson3 can call it in-process from a Payload hook/endpoint.
- The editor's input grammar must stay a **subset** of what `docx_kit.js` accepts: plain strings, `\n` = paragraph, leading `- ` = bullet, no inline markup, `phase` from a controlled vocabulary.
- Generation is deterministic on the stored strings → byte-stable regeneration.

## Versioning discipline

Pin the upstream generator to a known commit/version. Because fidelity depends on it, treat generator upgrades as deliberate, tested changes — never automatic.

## Prior implementation (reference only)

The previous build lives in the separate **`Lesson2`** repository (Laravel 13 / Filament 5 / DreamHost). It is preserved unchanged for reference; no code is ported from it.
