# External Dependencies

## ARES CBE generation system

**Repo:** `markknit/cbe-generation-system`

This is the upstream system that produces ARES CBE lesson plans. Lesson3 depends on it for two things:

### 1. The generated JSON contract (source of truth for Lesson3 ingest)

- **`data/outputs/v2/**/*.json`** — the complete downstream interchange artifacts. The definitive
  Lesson3 1.0.0 contract is `schemaVersion`, `META`, `UNIT`, `LESSONS[]`, `FINAL_EXPLANATION`, and
  `SUMMARY_TABLE`, with mandatory `LESSONS[].resourceLinks`.
- **`app/src/ingest/ares-contract.schema.json`** — Lesson3's enforceable consumer contract. Keep it
  aligned to emitted JSON. Upstream `generators/data/SCHEMA.md` remains useful prose documentation but
  is not authoritative when it lags actual output.
- **`generators/data/*_data.js`** — upstream authoring modules. They are not complete downstream
  interchange artifacts when resources are attached later in the build. Lesson3's web upload is JSON
  only, and no supported path ever executes uploaded JavaScript.

### 2. The DOCX generator (source of truth for fidelity)
- **`generators/generate.js`** — CLI entry point (`generateOne()` per sub-strand).
- **`generators/lib/docx_kit.js`** — formatting primitives, brand colours, the field→paragraph/bullet rules.
- **`generators/lib/sections.js`**, **`build_docs.js`** — section/document builders.
- **`generators/aresResources.js`** — upstream resolution/formatting bridge. Lesson3 does not vendor its
  Python-spawning lookup behavior; it consumes the resource data already embedded in JSON.
- Uses the **`docx`** npm package.

Each sub-strand bundle generates three Word documents: `*_CBE_LessonSequence.docx`, `*_FinalExplanation.docx`, `*_SummaryTable.docx`.

### 3. The resource subsystem (resolved upstream; mandatory stored input in Lesson3)

Upstream resolves lesson resources while building its output by:
- shelling out to a **Python recommender** — `src/ares_recommender.py`
- which queries a **SQLite content index** — `data/ares_index/ares_content.db` (override via `ARES_DB_PATH`).
- `getAllPhaseResources({substrand, topic, subject})` → per-phase `{ video, reading }` (each with `title`, `direct_url`, `search_url`); `buildResourceParagraphs()` formats them.

Implications for Lesson3:
- The current upstream build writes the resolved map into every lesson as required
  `resourceLinks.{predict,observe,explain,dqb,model}` before exporting JSON.
- Lesson3 validates and stores that full map as system-only native fields. It does **not** run Python,
  ship the SQLite database, refresh links, or infer resources from `framework[]`.
- The LessonSequence has five columns. Resource paragraphs render beneath the phase name in the first
  cell; there is no dedicated Resource column.
- Fidelity is tested against the current upstream JSON/DOCX pair, including hyperlink relationships
  and targets, so the resolved links themselves are part of the oracle rather than an excluded region.

## Integration plan (see `SPEC.md` §4)

- Call the vendored builders in-process with the validated Payload data object; do not write a source
  module to disk or execute uploaded code.
- The editor's input grammar must stay a **subset** of what `docx_kit.js` accepts: plain strings, `\n` = paragraph, leading `- ` = bullet, no inline markup, `phase` from a controlled vocabulary.
- Generation is deterministic on the complete stored snapshot, including `resourceLinks` → stable
  regeneration for a fixed generator-render version.

## Versioning discipline

Pin the upstream generator to a known commit/version. Because fidelity depends on it, treat generator upgrades as deliberate, tested changes — never automatic.

**Current Lesson3 pin (2026-07-19):** upstream `main` commit
`742c8a96637377abbec37af32073210b9f87465b`. This pin carries the five-column Section C widths,
inline-resource rendering, and page-break behavior used by the replacement JSON/DOCX outputs. The
semantic and package/XML fidelity gates pass against the current Physics 4.1 oracle.

## Vendored into Lesson3 (re-pinned 2026-07-19)

The three Node generator libraries are **vendored byte-verbatim** (not a submodule/npm dependency).
See `app/src/generator/vendor/PROVENANCE.md` for checksums and the re-sync procedure.

- **Branch / pinned commit:** `main` @ `742c8a96637377abbec37af32073210b9f87465b`
- **Mirror tag:** none created as part of this local Lesson3 change.
- **Vendored files** (`app/src/generator/vendor/lib/`): `build_docs.js`, `sections.js`, `docx_kit.js`
- **NOT vendored:** upstream `aresResources.js`, because it invokes Python. Lesson3's pure-Node bridge
  supplies the stored JSON map through `AsyncLocalStorage` and filters hyperlinks to HTTP(S).
- **`docx` pinned** `9.6.1` exact; `mammoth` `1.12.0` (devDep, for DOCX→text diffing).
- **Re-sync:** `scripts/vendor-generator.sh <clone> <sha>`, then re-run the fidelity regression
  (the acceptance gate) before trusting the new version.

> `build_docs.js` already exports builders that return `docx` `Document`s and a `run(dataModule)`;
> Lesson3 wraps the builders + `Packer.toBuffer()` for in-process Buffers without modifying any
> vendored file.

### Clean cutover implementation (2026-07-19)

`build_docs.js`, `sections.js`, and `docx_kit.js` were re-vendored byte-pristine from the current pin.
Lesson3-owned glue supplies each stored `lesson.resourceLinks` map without Python/SQLite, and renderer
revision 2 invalidates pre-cutover DOCX, PDF, and HTML-preview cache identities.

## Prior implementation (reference only)

The previous build lives in the separate **`Lesson2`** repository (Laravel 13 / Filament 5 / DreamHost). It is preserved unchanged for reference; no code is ported from it.
