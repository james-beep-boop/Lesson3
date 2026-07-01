# How CBE Generation Works

This document explains how the upstream **ARES CBE generation system**
(`markknit/cbe-generation-system`, referenced in `docs/EXTERNAL-DEPENDENCIES.md`)
actually produces its Kenyan CBE lesson-plan Word documents — what source
material it starts from, what Claude generates versus what a human wrote,
and how the final DOCX files get assembled. It's a conceptual/provenance
reference for the upstream system; for how Lesson3 integrates with and
vendors parts of it, see `docs/EXTERNAL-DEPENDENCIES.md`.

Everything below was verified directly against the public repo (source
files, actual KICD curriculum PDFs, and actual teacher-submitted template
docx files) rather than taken from the repo's own README claims.

---

## 1. What the project is

`cbe-generation-system` automates production of ~2,000 Kenyan
Competency-Based Education (CBE) lesson plans — Grade 10 Biology,
Chemistry, Physics, and Mathematics — aligned to the official **KICD**
(Kenya Institute of Curriculum Development) March 2025 curriculum, using
an NGSS-Storyline-style, phenomenon-driven inquiry pedagogy. Output is
meant to run on **ARES offline servers** (Rachel 4 Plus devices) in
Kenyan schools, with no internet dependency at point of use.

The codebase is split by responsibility:

- **Python (`src/`)** — the content-generation pipeline: extracts source
  material and calls the Claude API to write full lesson content.
- **Node.js (`generators/`)** — the document-rendering pipeline: takes
  the generated content and lays it out as formatted `.docx` files using
  the `docx` npm package.

## 2. The three source-material inputs

Three distinct materials feed into generation, and it's important not to
conflate them — they carry different authority and different amounts of
actual content.

### 2a. KICD curriculum PDFs — the authoritative content source

`data/raw/curriculum_pdfs/` contains the official government curriculum
documents (`Grade10_Biology_CBE_Curriculum.pdf`, etc.). Direct text
extraction from these PDFs confirms their real structure is Kenya's
standard CBC design-document table:

> **Strand | Sub Strand | Specific Learning Outcomes | Suggested Learning
> Experiences | Suggested Key Inquiry Question(s)**

plus separate blocks for **Core Competencies to be developed**, Core
Values, and Pertinent and Contemporary Issues (PCIs).

**Important finding:** these PDFs contain **no occurrence** of "storyline,"
"driving question," "NGSS," or "anchoring" anywhere in any of the four
subject documents (confirmed by grepping extracted text from all four).
The word "phenomena" appears only in the ordinary sense ("natural
phenomena," "explain phenomena in day-to-day life") — not as the NGSS
technical term for a single anchoring event.

KICD only mandates: outcomes, competencies, values, PCIs, and one Key
Inquiry Question per sub-strand. It does **not** require an NGSS
storyline, an anchoring phenomenon, or a driving question. That
requirement comes from elsewhere (§2b).

### 2b. Teacher-submitted "Scheme of Work" templates — the NGSS-storyline requirement's real origin

`data/raw/CBE LESSON TEMPLATES/` contains docx files submitted by named
individual teachers (e.g. "Author: Jackline Mwambere," "Author: kilei"),
one per sub-strand, across Biology/Chemistry/Maths/Physics.

**"Scheme of work" and "template" are the same document genre, not two
different things.** Comparing a file with "SCHEME OF WORK" in its
filename against a file without it (e.g. `Biology 10.1.3 Cell sturcture
and specialization.docx`) shows byte-for-byte identical boilerplate in
both — they're the same master fill-in-the-blank template, just saved
under different filenames by different teachers. The template's own
header names it: *"Scheme of Work for..."*

That master template's own boilerplate — not KICD, not Claude — is where
the NGSS-storyline requirement actually originates:

> "Chapter and/or Unit Criteria — Lessons and units designed so students
> make sense of a **phenomenon-based storyline** and/or design solutions
> to problems."
>
> "THE PHENOMENON: ... The phenomenon is framed as a **Driving Question**
> to be figured out in the series of evidence gathering activities..."

Whoever designed this template (presumably ARES's pedagogy lead, not
KICD) imposed the NGSS framework as a rubric teachers had to fill in.

**What teachers actually filled in is a thin sketch, not a complete lesson
plan.** For a real example (Biology 10.2.1, Nutrition in Plants), the
teacher supplied:
- Subject/strand/sub-strand/author metadata
- Learning Outcomes (copied from KICD)
- One phenomenon description (a pumpkin growth time-lapse) and driving
  questions ("How do plants get their nutrients? What role does sunlight
  play?")
- A bullet-point-per-lesson outline — 2–3 short bullets per lesson,
  e.g. *"Lesson 4: Photosynthesis Begins — The Light Stage / Explore the
  light-dependent reactions. / Hands-on: Observe oxygen bubbles from
  aquatic plants under light. / **Reading HERE**"*

That trailing "Reading HERE" / "Video HERE" / "SIMULATION" text is a
literal placeholder — the teacher marking where a resource link should
eventually go, without being able to supply one. This is the direct
evidence for why the ARES resource-recommendation step (§4) exists: it
fills in exactly these placeholder slots.

Teacher templates do **not** contain: categorized SLOs (purpose/
knowledge/skills/attitudes/safety), scripted teacher dialogue or "teacher
moves," formative-assessment questions, differentiation guidance, teacher
reflection prompts, a Final Explanation assessment document, or a Summary
Table. None of that exists until Claude generates it.

### 2c. `template_examples/` — an unrelated, different kind of "template"

`data/raw/template_examples/` (e.g. `Biology_CellStructure_CBE_
LessonSequence_v1.pdf`, 79 pages) is a **finished, already-generated
output document**, kept as a reference for the desired final formatting —
not an input teachers filled in. Don't confuse this with §2b; it's the
opposite end of the pipeline (a fully generated sample output), reused as
a style/format exemplar.

## 3. The generation pipeline, stage by stage

1. **Teacher** fills the thin template sketch described in §2b: KICD
   outcomes + one phenomenon/driving-question + rough per-lesson bullet
   outline with resource placeholders.
2. **`src/generate_substrand.py`** extracts:
   - KICD PDF text (used **verbatim** for outcomes/competencies/values/
     PCIs), via regex-targeted section extraction, skipping table-of-
     contents and validating with keyword checks ("learner should",
     "Learning Outcomes").
   - Whatever's filled into the teacher template's `PHENOMENON`,
     `LESSON SEQUENCE`, `EVIDENCE GATHERED`, and `FINAL EXPLANATION`
     table cells (via `extract_template_docx()`; any missing field
     just comes back empty — nothing is invented at this stage).
3. Both are fed to **Claude** (model `claude-sonnet-4-6`, overridable via
   `CLAUDE_MODEL`) via **forced tool-use with JSON schemas**
   (`UNIT_TOOL_SCHEMA`, `LESSON_TOOL_SCHEMA`, `FE_TOOL_SCHEMA`,
   `ST_TOOL_SCHEMA`), so responses come back as structured tool-call
   input rather than free-text JSON needing fragile parsing. A system
   prompt embeds Kenya-context rules (local foods, place names,
   scientists) and instructs the model to "Embed NGSS Science and
   Engineering Practices where indicated" and "Connect every lesson
   phase back to the anchoring phenomenon."
4. **Claude generates, essentially from scratch** (this is the bulk of
   the actual content in the final documents, not a rewrite of existing
   teacher text):
   - `UNIT`: an elaborated anchoring phenomenon, storyline thread across
     all lessons, driving question(s), competencies, values, SEP, PCIs,
     careers.
   - Each `LESSON` in full: categorized SLO (purpose, knowledge, skills,
     attitudes, key inquiry, purpose-in-storyline, safety notes), a
     2–3 paragraph prose overview, the complete 5-phase framework
     (Predict → Observe → Explain → DQB → Model-Building) with specific
     teacher moves — including scripted lines and "WAIT TIME" cues —
     learner experience, sense-making strategy, and formative
     assessment, plus teacher reflection questions.
   - Two documents that have **no counterpart in the teacher template at
     all**: `FINAL_EXPLANATION` (student assessment with a scored
     rubric) and `SUMMARY_TABLE` (teacher reference table).
   - Generation runs **synchronously** (checkpointed after each lesson,
     resumable via `--resume`) or in **batch mode** (`--batch`/
     `--collect --wait`, using the Anthropic Message Batches API at 50%
     cost — the README claims ~$114 for the full 2,000-lesson target).
5. Output is written to **`generators/data/<name>_data.js`** — a
   CommonJS module exporting `schemaVersion, META, UNIT, LESSONS,
   FINAL_EXPLANATION, SUMMARY_TABLE`. This file is the **canonical
   source of truth**; nothing downstream hand-edits it except explicit
   patch scripts (`scripts/patch_lesson.js`, `scripts/patch_fe.js`).
6. **`generators/generate.js`** loads that module and calls `run()` in
   **`generators/lib/build_docs.js`**, which uses section builders in
   **`generators/lib/sections.js`** (title block, sub-strand overview
   table, Sections A–E, differentiation table) and low-level formatting
   primitives in **`generators/lib/docx_kit.js`** (colors, fonts,
   paragraph/table helpers, built on the `docx` npm package) to render
   three Word documents per sub-strand into
   `data/outputs/docx/Grade 10 <Subject>/`:
   - `*_CBE_LessonSequence.docx` — the full lesson sequence
   - `*_FinalExplanation.docx` — student assessment document
   - `*_SummaryTable.docx` — teacher reference table
7. While rendering Section C specifically, **`generators/aresResources.js`**
   shells out (subprocess, 20s timeout, fails silently on error) to
   **`src/ares_recommender.py`**, which runs a **keyword-based full-text
   search** (SQLite FTS, not embeddings) against a **1.55M-item content
   database** (`data/ares_index/ares_content.db`), ranked by channel
   tier (Khan Academy/CK-12/MIT rank highest), storage/URL availability,
   content-type preference, and keyword-hit count. This replaces the
   teacher's "Reading HERE"/"Video HERE" placeholders with real,
   hyperlinked video/reading recommendations.

## 4. Where the ARES resource links actually land

`docs/SCHEMA.md` (the upstream schema doc) lists a `resource` field name
as part of each framework row's schema (`phase, learnerExperience,
resource, teacherMoves, sensemakingStrategy, formativeAssessment`), which
reads as if it implies a dedicated column — **it doesn't get one in the
actual rendered table.**

Section C ("Lesson Implementation Framework") renders exactly **5
columns**:

```js
const cw = [1520, 3040, 3040, 3040, 3040];
// Phase | Learner Experience | col3Label | Sensemaking Strategy | col5Label
```

(`col3Label`/`col5Label` are subject-configurable relabels, e.g. differ
between Chemistry and Physics.)

The ARES resource paragraphs are stacked **inside the first cell (Phase,
only 1520 of ~13680 twips wide)**, directly below the bold phase-name
paragraph:

```js
const phaseCell = (ph) => {
  const out = [para(ph.phase, { bold: true, size: SZ, after: 40 })];
  const resPara = buildResourceParagraphs(
    aresRes[PHASE_KEY[ph.phase] || 'observe'], ph.phase
  );
  return out.concat(resPara);
};
```

So there is no dedicated Resource column in the finished document — video
and reading links (with icons, blue hyperlink styling, source
attribution) are packed into the same narrow Phase cell as the phase
label, one set per phase row. The `resource` field named in `SCHEMA.md`
appears to be either vestigial documentation or a field Claude's schema
could populate that the current renderer simply doesn't read for
placement, since resources are instead looked up live at render time.

## 4a. Correction: some already-rendered outputs *with real links* are committed to the public repo

The upstream repo's `.gitignore` lists:

```
# Large runtime files — live on jhm-spark, not in git
data/ares_index/ares_content.db
...
data/outputs/docx/
```

which implies none of the generated Word documents should be in git. **This
is not true in practice** — a `.gitignore` rule only stops *new* untracked
files from being added; it does not retroactively untrack files already
committed. A real generated output tree is checked into the public repo at
`data/outputs/docx/Grade 10 <Subject>/<Sub-strand>/`, confirmed present for
at least `Grade 10 Bio`, `Grade 10 Biology` (subfolders `Bio 1.2`, `2.2`,
`2.3`, `3.1`, `3.2`, `3.3`), `Grade 10 Chemistry` (`Chemistry 1.4`), and
`Grade 10 Math` — each such folder holds all three `.docx` outputs **plus**
the sub-strand's `_data.json`.

Downloading and unzipping one of these
(`Chemistry_Chemical_Bonding_CBE_LessonSequence.docx`) and inspecting
`word/_rels/document.xml.rels` shows genuine hyperlink relationships baked
into the document, e.g.:

```
http://ares.edu:8069/en/learn/#/topics/c/1a11aa5bad505b969a466a7e7e05bd47
http://ares.edu/www2/search.php?searchstring=valence+electrons+octet+rule+video&sources[]=kha&sources[]=ck12&...
```

— a direct Kolibri-content link plus a fallback keyword-search link
(with channel-source filters), repeated per lesson phase.

**This does not contradict §5 below** — it confirms it. The sibling
`Chemistry_Chemical_Bonding_data.json` from that same folder was checked
directly: every `framework` phase object has exactly the keys `phase,
learnerExperience, teacherMoves, sensemakingStrategy, formativeAssessment`
— no `resource` key. The links exist only inside the rendered `.docx`
XML, never in that sub-strand's own JSON, exactly as §5 describes.

**Practical implications for anyone wanting these links (e.g. for
Lesson3):**

- **Coverage is partial.** Only sub-strands with a committed output
  folder have real links available at all — a handful, not the full
  ~2,000-lesson target.
- **Association is positional, not labeled.** Nothing in the docx ties a
  given hyperlink explicitly to "Lesson 3, Predict phase" as structured
  data — recovering that requires walking `document.xml` in document
  order and matching hyperlinks to the phase table rows they fall inside,
  then cross-referencing lesson/phase order against the sibling
  `_data.json`'s `LESSONS[].framework[]` array (same ordering, since both
  were produced from the same generation run).
- **Domain caveat.** Links point to `ares.edu` / `ares.edu:8069` — ARES's
  own hostname for their offline Kolibri server. These may not resolve
  outside ARES's network or without the same Kolibri content mounted. The
  embedded Kolibri **topic IDs** and the fallback search **query
  terms/channel filters** are portable metadata regardless of whether the
  hostname itself resolves for a given reader.
- **The live-lookup path (`ares_recommender.py` + `ares_content.db`) is
  still unavailable** — this doesn't change the assessment in §4 or in
  `docs/EXTERNAL-DEPENDENCIES.md` that the underlying 1.55M-item SQLite
  index is not published and was deliberately not vendored into Lesson3.
  What changed is narrower: a *sample* of real, already-computed links
  exists in the public repo for the sub-strands that happen to have
  committed output, recoverable only by parsing those specific `.docx`
  files directly.

## 5. The `.js` source file vs. the `.json` export — one is upstream, one is a disposable mirror

These are not two independent copies of the content; the relationship is
strictly one-directional:

- **`generators/data/<name>_data.js`** — the canonical source, written
  once by `generate_substrand.py` (§3, step 5). A CommonJS module
  (`module.exports = { schemaVersion, META, UNIT, LESSONS,
  FINAL_EXPLANATION, SUMMARY_TABLE }`). This is what you'd hand-edit to
  fix content.
- **`{filePrefix}_data.json`** — written by `build_docs.js`'s `run()`,
  as the **last** step, strictly after all three `.docx` files:

  ```js
  const jsonPath = path.join(outBase, `${META.filePrefix}_data.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(
    { schemaVersion, META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE },
    null, 2
  ));
  ```

  It's a plain `JSON.stringify` of the exact same five fields the `.js`
  module exports — no transformation — just stripped of CommonJS syntax.
  It's written into the **output directory**
  (`data/outputs/docx/Grade 10 <Subject>/...`), not next to the source
  `.js` file in `generators/data/`.

In short: `.js` is upstream and authoritative; `.json` is a
regenerated-every-run, disposable mirror for downstream tools that want
plain data without `require()`-ing a JS module. Edit the `.js`, rerun the
generator, and a fresh `.json` snapshot falls out automatically.

## 6. Summary table: who supplies what

| Element | Source |
|---|---|
| Learning Outcomes, competencies, values, PCIs | KICD PDF — verbatim/paraphrased |
| NGSS-storyline requirement itself (phenomenon, driving question framing) | The teacher-facing "Scheme of Work" template's own boilerplate rubric — not KICD, not Claude |
| One phenomenon idea, driving question(s), rough per-lesson bullet outline, resource placeholders | Individual teacher, filling in the template |
| Full per-lesson SLOs, prose overviews, 5-phase teacher-moves framework, reflections | Generated de novo by Claude, constrained by the above |
| Final Explanation (assessment + rubric), Summary Table | Generated de novo by Claude — no teacher-template counterpart exists at all |
| Resource links (video/reading) | Separate SQLite FTS lookup against the ARES content DB at DOCX-render time — not from KICD, templates, or Claude, and never written into the `.js`/`.json` data. A partial sample of real, already-computed links *is* recoverable from the handful of already-rendered `.docx` files committed to the public repo (see §4a), by parsing hyperlink relationships directly — not from any JSON export |
| `.docx` formatting/layout | Node.js renderer (`docx_kit.js`, `sections.js`, `build_docs.js`) |
| `.json` data export | Mechanical `JSON.stringify` of the `.js` source, written once per render |

## References

- Upstream repo: `markknit/cbe-generation-system` (public GitHub)
- Lesson3's dependency notes and vendoring record: `docs/EXTERNAL-DEPENDENCIES.md`
- Vendored file provenance: `app/src/generator/vendor/PROVENANCE.md`
