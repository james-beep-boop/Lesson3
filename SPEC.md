# ARES Lesson Library — Specification

> Canonical reference for the build. All architectural decisions and clarifications agreed during design are recorded here. Code must conform to this spec.
>
> **Clean-slate rewrite (Lesson3, June 2026).** This project supersedes the **Lesson2** project (Laravel 13 / Filament 5 on DreamHost), which remains preserved, unchanged, in the separate `Lesson2` repository for reference. Nothing is carried over from it except the domain rules captured here.

---

## 0. Why this exists (and why it's a rewrite)

The Lesson2 build stored lesson plans as **Markdown** and generated DOCX/PDF with PhpWord/dompdf. Evaluating real ARES content proved that model wrong on its central requirement.

The decisive facts:

1. **ARES lesson plans are structured data, not documents.** Each sub-strand is a rich nested object that the ARES generation system (`cbe-generation-system`) renders into **three** Word files via the Node `docx` library. The data — not the DOCX — is the source of truth.
2. **High-fidelity DOCX is only achievable by reusing ARES's own generator.** A 5,000-word lesson is ~40 tables with merged cells, exemplars, and rubrics. Markdown/HTML→DOCX (Pandoc, PhpWord, BookStack) cannot reproduce it. The fidelity the stakeholder approves lives in ARES's `docx_kit.js` / `sections.js`.
3. **Storing Markdown/HTML is therefore lossy and disqualifying.**

**Conclusion:** keep content as structured JSON, edit the data (not the document), version the data, and regenerate DOCX by calling ARES's generator. Because the generator is Node, the whole app is Node — one runtime, no cross-language seam on the core value path.

---

## 1. Product, in one paragraph

A **versioned lesson-plan repository**. ARES-generated CBE lesson plans are ingested as version **1.0.0**; teachers make basic edits; every edit produces a new, immutable version with bulletproof history; any version can be exported as **high-fidelity DOCX and PDF**. Running on offline local servers is a **secondary** goal, not a primary constraint.

Non-goals: not an LMS, not an offline content-distribution platform (Kolibri/RACHEL serve that need), not a Word round-trip editor.

---

## 2. Architecture (decided)

| Layer | Choice |
|---|---|
| Runtime | **Node.js / TypeScript** (single runtime, end to end) |
| App framework / backend | **Payload CMS** (MIT) — data model, auth, RBAC, versioning, admin UI, REST/GraphQL API |
| Database | **PostgreSQL** (Payload's recommended production adapter) |
| DOCX/PDF generation | **Reuse ARES's `cbe-generation-system`** (the `docx` npm package; `docx_kit.js`, `sections.js`, `build_docs.js`), embedded in-process |
| Editor (phase 1) | **Payload admin edit screen** with field-level access control |
| Editor (phase 2, only if needed) | Custom React editor on Payload's API |
| Hosting | A **Node-capable host** (cloud VPS now; a local Node box for offline later) |

**Why Payload + embedded generator:** the generator is the irreducible Node component and the product's whole reason for existing. Wrapping it in a Node app keeps everything in one runtime — `generateOne(dataObject)` is an in-process call, no second service, no PHP↔Node serialization. Payload then supplies, already-built-and-debugged, the parts we would otherwise hand-write: auth, users, **field-level RBAC**, **content versioning**, admin UI, API, media, migrations, and hooks. The custom remainder (editor UX, live preview, generator glue) is the same in any framework — so Payload removes plumbing rather than adding work.

**Maturity caveat (managed):** Payload 3 is young, Next.js-coupled, and ships weekly. We **pin the version and upgrade deliberately** — this is how we reconcile "reuse debugged code" with "stable and trouble-free."

### Open decisions (not yet made)
- **Editor placement:** start with Payload's admin edit screen; build a custom React editor *only if* admin usability proves inadequate in real teacher use.
- **Exact host** for production and for the offline box.
- **Whether a messaging / deletion-request workflow** (present in Lesson2) is wanted here (see §10).

---

## 3. Content model

The unit of content is a **sub-strand bundle** — one structured object that generates three Word documents. This is the natural grain of ARES content (e.g. Biology Grade 10, sub-strand 1.4 "Chemicals of Life").

```
Sub-strand bundle
├── META                 # subject, grade, substrand_id/name, doc titles, file prefix, column labels
├── UNIT                 # sub-strand overview (may be empty for some sub-strands)
├── LESSONS[]            # ordered lessons
│   ├── number, title, duration, substrand, aresKeywords
│   ├── slo { purpose, knowledge, skills, attitudes, keyInquiry, purposeInStoryline, safetyNotes }
│   ├── overview
│   ├── framework[]      # ordered instructional phases (Predict / Observe / Explain / DQB / Model Building …)
│   │   └── { phase, learnerExperience, teacherMoves, sensemakingStrategy, formativeAssessment, resources? }
│   ├── teacherReflection
│   └── summaryTablePrompt { observed, learned, explained }
├── FINAL_EXPLANATION    # { subjectLabel, instructions, sections[{title, prompt, exemplar}], rubric[] }
└── SUMMARY_TABLE        # { subStrand, drivingQuestion, lessons[{number, title, observed, learned, explained}] }
```

Authoritative schema: `cbe-generation-system/generators/data/SCHEMA.md` (see `docs/EXTERNAL-DEPENDENCIES.md`).

**Generates three documents per bundle:** `*_CBE_LessonSequence.docx`, `*_FinalExplanation.docx`, `*_SummaryTable.docx` (plus PDF). All three regenerate from the one bundle.

### Modeling rules
- Model the bundle as **native Payload nested fields** (groups/arrays), **not a JSON blob** — native fields are what unlock free per-field validation, field-level access control, and versioning. A blob forfeits the reuse Payload is chosen for.
- **Canonical storage format is JSON.** The ARES `.js` data modules are CommonJS code; ingest must **extract them to JSON**.
- **`summaryTablePrompt` (in `LESSONS`) and `SUMMARY_TABLE.lessons` are distinct content** serving different documents — not duplicates. Both are edited; label each by the document it feeds.

### Resource column (optional; resolved at ingest, not generation)
The LessonSequence's per-phase **Resource column** is *not* in the ARES data file. Upstream it is produced at DOCX-build time by a **Python recommender** (`src/ares_recommender.py`) querying a **SQLite content index** (`data/ares_index/ares_content.db`) — i.e. it needs Python + a large DB, not just Node. See `docs/EXTERNAL-DEPENDENCIES.md`.

Decision:
- **Resolve resources once, at ingest** (run the recommender), and **store the result in the bundle** as `framework[].resources` (`{ video, reading }` with `title`/`direct_url`/`search_url`). Generation then reads stored data only — **pure Node, byte-stable, versioned**. The heavy Python + SQLite are needed only where ingest runs (a one-off/batch step, possibly upstream on the ARES side), never in the live app.
- **The resource column is OPTIONAL and currently DEFERRED** (decided 2026-06-08; the Python recommender is out of scope — not live and not at ingest — see `docs/DECISIONS.md`). There is a real chance we generate these documents *without* it. The model, generator integration, and templates must work **with or without** `framework[].resources` present. Do not make any code path assume resources exist. The optional `framework[].resources` field is retained as the future seam (links would be sourced from ARES-produced documents, not the live recommender).

---

## 4. The generator contract (fidelity rules)

DOCX fidelity is owned entirely by ARES's generator. Editing must stay within its input grammar. From `docx_kit.js`:

- Every content field is a **plain string**.
- `\n` → a new paragraph.
- A line beginning with **`- ` or `• `** → a bullet (the generator adds its own marker).
- **No inline markup** is parsed (`**bold**`, `*italic*`, `>`, `#` render literally). All styling, tables, colours, and numbering are applied by the generator, never from content.
- The **Resource column** (LessonSequence, Section C) is **resolved at ingest and stored** in `framework[].resources` (see §3); generation reads that stored data — it does **not** call Python/SQLite live, and the column is **never user-editable**. It is **optional** (may be omitted entirely — currently deferred, see §3 and `docs/DECISIONS.md`); the generator must render correctly when it is absent.
- **`framework[].phase` is a controlled vocabulary** — phase names drive colour-coding and resource lookup; an unknown phase silently degrades output. Phase is a fixed dropdown, never free text.

Because `generateOne()` is deterministic on the stored strings, **regeneration is byte-stable** — store the field strings, and the document reproduces exactly. Integrate the generator via a Payload hook/endpoint; refactor ARES's `generateOne()` to accept a data object instead of a file on disk.

---

## 5. Editing

**Principle: edit the data, never the document.** DOCX/PDF are build artifacts, regenerated on demand. There is no Word round-trip.

- **Presentation:** a document-shaped view (sub-strand → lessons → phases → fields). Phase 1 uses Payload's admin edit screen (nested field panels); invest in clear field **labels and descriptions**. Phase 2 builds a custom React editor only if needed — it reuses the same model, access rules, and versioning, so phase-1 work is not thrown away.
- **Widgets:** prose fields are **plain multi-line text boxes** (newline = paragraph; a `- ` line prefix, ideally via a small "bullet" toggle, makes a bullet). `framework[].phase` is a **controlled dropdown**. No rich-text editor — simplicity *is* the fidelity guarantee.
- **Live preview is the one early custom add** (not built into the admin): a "Preview as Word/PDF" action that runs the real generator on the working copy before publish. This is the trust-builder for the Word-centric stakeholder.
  - **Preview is always DERIVED from generator output — never a parallel HTML renderer.** A hand-built HTML template would be a second source of layout truth that can drift from the actual DOCX and mislead the teacher (and re-introduces the "HTML is lossy" problem rejected for storage). The preview generates the real DOCX in-process from the working copy, then displays it.
  - **Two fidelity tiers:** (1) a fast in-browser **content preview** = real DOCX → HTML via `mammoth` (faithful content + table structure; styling/colours are intentionally dropped — adequate because teachers edit prose and the generator owns visuals); (2) an **exact** check = the real DOCX download and/or DOCX→PDF (§9). Trigger via a preview button / custom edit-view component, not continuous live-preview (don't regenerate per keystroke).
  - **Preview runs on the working DRAFT** (its whole purpose); **export stays published-only** (`generateForBundle`). Different gates.
- **Validation on save:** required fields present, framework cardinality intact, phase ∈ vocabulary — reject anything that would produce a broken document.

### Field-level edit permissions (maps directly to Payload field access control)
- **Editor (teacher):** prose values — `slo.*`, `overview`, `framework[].{learnerExperience, teacherMoves, sensemakingStrategy, formativeAssessment}`, `teacherReflection`, `summaryTablePrompt.*`, `SUMMARY_TABLE.lessons[].{observed, learned, explained}`, lesson `title`, `FINAL_EXPLANATION.instructions`, `sections[].prompt`.
- **Subject Admin only:** `META.*`, `aresKeywords`, `framework[].phase`, `duration`, structural changes (add/remove/reorder lessons & phases), and **assessment answer keys** — `sections[].exemplar`, `rubric[*]`.
- **System (never editable):** the auto-generated Resource column; `LESSONS[].number` (set by order).

---

## 6. Versioning

- The versioned unit is the **whole sub-strand bundle**. Each save is an **immutable snapshot**.
- Use **Payload's native versions + drafts** as the storage/history engine.
- Add **semver** (`x.y.z`) and an **official-version pointer** as custom fields + a save hook. First ingested version is **1.0.0**; default edit bump is **patch**; user may choose patch/minor/major. At most one official version per bundle.
- Any version regenerates its three documents on demand.
- **Diff:** Payload's field-by-field version compare is adequate to start. Later, add a concise **"what changed" summary** for teachers (e.g. *"Lesson 3 · Teacher Moves edited"*) layered on top — not a replacement.
- Optimistic concurrency to prevent clobbering concurrent edits.

---

## 7. Ingest

- Accept ARES output and create the first version as **1.0.0**.
- **Extract `.js` data modules to canonical JSON. Never `require()`/execute an uploaded `.js`** (arbitrary code execution). ARES's `extract_generator_data.py` is the model for safe extraction.
- Create the bundle via Payload's Local API in a transaction; bulk ingest supported.
- Validate against the schema on ingest (same rules as §5).
- **Resource resolution (optional, §3):** if the resource column is enabled, run the ARES recommender (Python + `ares_content.db`) **once at ingest** and store the resolved `framework[].resources` in the bundle. Generation never calls Python/SQLite live. If the column is disabled (undetermined), skip this step — everything downstream must tolerate missing resources.

---

## 8. Roles & authorization

| Role | Scope |
|---|---|
| Teacher | Global (any signed-in user) — view/export only |
| Editor | Per subject-grade — edit prose field values |
| Subject Administrator | Per subject-grade (at most one) — structural + admin-only fields, mark official, manage scoped roles |
| Site Administrator | Global — everything, incl. user/role/taxonomy management |

- **Subject** = academic discipline only. **SubjectGrade** = subject + **integer** grade; the assignable unit roles attach to. Display as "Grade N". "Math Grade 4" and "Math Grade 5" are independent.
- Per-subject-grade scoping is expressed inside Payload access functions.
- Promoting a Subject Admin where one exists **auto-demotes** the prior holder to Editor for that subject-grade, in one transaction.
- `class` is a reserved keyword — the entity is always **SubjectGrade**.
- **Email privacy:** non–Site-Admins never see other users' email addresses; attribution shows username.

---

## 9. Generation, export & sharing

- Export any version as **DOCX** (all three documents) and **PDF**, via the embedded generator.
- Print, save-as-PDF/DOCX, and email-as-attachment are in scope.
- Generation can take seconds for large bundles — run it without blocking the UI and show progress; stream/queue as appropriate on the chosen host.

---

## 10. Workflows to confirm before building

These existed in Lesson2 and may or may not be wanted here — **decide before building:**
- **Favorites** (per user, per bundle).
- **Messaging / inbox** and **deletion-request** workflow.
- **Browse/filter** by subject-grade, official status, contributor, favorites.

If kept, they are ordinary Payload collections + hooks; none affects the core architecture.

---

## 11. Operations

- **Error tracking / observability** (e.g. Sentry) — required before real users.
- **Automated, off-site, encrypted backups** (Postgres dumps); snapshot before migrations.
- **CI/CD** so build/deploy is not bound to one machine.
- **Rate limiting** on expensive endpoints (generation, auth).
- Offline target later: a single Node + Postgres deployment on a local box.

---

## 12. Knowledge currency

Node/Payload move faster than older stacks. Before implementing against Payload, the `docx` package, or Next.js:
1. Read the installed package source / official docs; **trust installed source over memory.**
2. **Pin versions**; upgrade on our schedule, not the weekly release train.
3. Treat any pre-2026 recollection of Payload APIs as suspect (Payload 3 is a Next.js-native rewrite).

References: Payload (`payloadcms.com/docs`), the `docx` npm package, ARES `cbe-generation-system` (see `docs/EXTERNAL-DEPENDENCIES.md`).

---

## 13. Conventions & constraints

- Keep scope controlled; do not invent features not listed here.
- One runtime: resist re-introducing a second language on the core path.
- Structured data is canonical; the editor's grammar must stay a subset of the generator's input grammar (§4).
- Critical rules enforced server-side (access functions, hooks, validation), never only in the UI.
- **Payload-first.** Before adding any new custom endpoint, editor, permission layer, workflow,
  or persistence code, first check whether Payload already provides it — through collection
  config, access control, field/collection hooks, versions/drafts, admin config, the Jobs Queue,
  or the Local API. Build custom only when Payload genuinely cannot; when you do, **document the
  specific gap** in a code comment and/or `docs/DECISIONS.md`. The point is to keep the system
  leaning on Payload's tested machinery rather than re-implementing it.
- Document any deviation from this spec here.
