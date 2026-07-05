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

A **versioned lesson-plan repository**. ARES-generated CBE lesson plans are uploaded/imported as version **1.0.0 Official**; later edits create retained, immutable versions; exactly one version per lesson plan is **Official** at a time; any version can be viewed and exported as **high-fidelity DOCX and PDF**. Running on offline local servers is a **secondary** goal, not a primary constraint.

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

### Two application surfaces (decided 2026-06-14)

The product has **two front-ends over one Payload backend** (one runtime, one auth, one access layer):

1. **The App** — a unified, role-aware front-of-house frontend (`app/src/app/(frontend)`) that **all four roles log into**, built on Payload's API + auth. It is the home for everything **common to all users**: browse/search lesson plans, view all versions, export/print, **email a document**, **internal messaging + notifications**, **translation** (e.g. Swahili), and **AI features** (summaries, etc.). Per the §13 minimal-UI principle it shows each role only what it can do. **Teachers — the majority — live entirely here** (they are intentionally excluded from `/admin`).
2. **Payload `/admin`** — the **back-office** for the roles that manage content: structured editing (Phase 1), versioning, user/role/taxonomy management, ingest/upload. Editors & Subject Admins edit here; Site Admins administer here.

Rationale: the common features above are *product* features every role uses; giving teachers a separate app would force duplicating them (or making editors switch apps). One shared App + an admin back-office avoids that. This **resolves the former "editor placement" open decision** (start in `/admin`; a custom editor may later move editing into the App — SPEC §5 Phase 2) and confirms the §10 workflows as in-scope. It is a **Phase-2+ track** that does not block current `/admin` editing/publishing work.

### Open decisions (not yet made)
- **Exact host** for production and for the offline box.
- **App build sequencing** — recommended first slice is the teacher-critical path (browse → view → export), then messaging → email → AI/translation.

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

**Generates up to three documents per bundle:** `*_CBE_LessonSequence.docx`, `*_FinalExplanation.docx`, `*_SummaryTable.docx` (plus PDF). All regenerate from the one bundle.

**Single-document sub-strands are legitimate (confirmed 2026-06-26).** Some sub-strands ship as a *single* document — the LessonSequence only — with no FINAL_EXPLANATION sections and/or no SUMMARY_TABLE rows. This is valid content, not incomplete data: the generator already guards and **skips** an empty FE/ST (`FE.sections || []`, `ST.lessons || []`), so it produces exactly the documents the bundle carries. Consequently a missing FE/ST is **not** a defect and **not** a hard gate — it is surfaced as an informational ingest note only. (See `docs/DECISIONS.md` 2026-06-26; this resolves the §3-option-(a) FE/ST modeling question.) The LessonSequence itself is always required — its completeness *is* a hard gate (`validateGeneratable`).

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

- **Presentation:** a document-shaped view (sub-strand → lessons → phases → fields). Phase 1 uses Payload's admin edit screen (nested field panels); invest in clear field **labels and descriptions**. Phase 2 builds a custom React editor only if needed — it reuses the same model, access rules, and versioning, so phase-1 work is not thrown away. The **role-tailored, minimal-UI principle (§13)** governs every screen: a role sees only the controls it can use.
- **Widgets:** prose fields are **plain multi-line text boxes** (newline = paragraph; a `- ` line prefix, ideally via a small "bullet" toggle, makes a bullet). `framework[].phase` is a **controlled dropdown**. No rich-text editor — simplicity *is* the fidelity guarantee.
- **Live preview is the one early custom add** (not built into the admin): a "Preview as Word/PDF" action that runs the real generator on the working copy before saving a new version. This is the trust-builder for the Word-centric stakeholder.
  - **Preview is always DERIVED from generator output — never a parallel HTML renderer.** A hand-built HTML template would be a second source of layout truth that can drift from the actual DOCX and mislead the teacher (and re-introduces the "HTML is lossy" problem rejected for storage). The preview generates the real DOCX in-process from the working copy, then displays it.
  - **Two fidelity tiers:** (1) a fast in-browser **content preview** = real DOCX → HTML via `mammoth` (faithful content + table structure; styling/colours are intentionally dropped — adequate because teachers edit prose and the generator owns visuals); (2) an **exact** check = the real DOCX download and/or DOCX→PDF (§9). Trigger via a preview button / custom edit-view component, not continuous live-preview (don't regenerate per keystroke).
  - **Preview runs on the working copy** (its whole purpose); export is available for every saved valid version. Official status is a default/trust marker, not an export permission boundary.
- **Validation on save:** required fields present, framework cardinality intact, phase ∈ vocabulary — reject anything that would produce a broken document.

### Field-level edit permissions (maps directly to Payload field access control)
- **Editor (teacher):** prose values — `slo.*`, `overview`, `framework[].{learnerExperience, teacherMoves, sensemakingStrategy, formativeAssessment}`, `teacherReflection`, `summaryTablePrompt.*`, `SUMMARY_TABLE.lessons[].{observed, learned, explained}`, lesson `title`, `FINAL_EXPLANATION.instructions`, `sections[].prompt`.
- **Subject Admin only:** `META.*`, `aresKeywords`, `framework[].phase`, `duration`, structural changes (add/remove/reorder lessons & phases), and **assessment answer keys** — `sections[].exemplar`, `rubric[*]`.
- **System (never editable):** the auto-generated Resource column; `LESSONS[].number` (set by order).

---

## 6. Versioning

- The versioned unit is the **whole sub-strand bundle**. Each save is an **immutable snapshot**.
- Store a stable Lesson Plan identity separately from immutable Lesson Bundle Version snapshots.
- Add **semver** (`x.y.z`) and an **official-version pointer** on the Lesson Plan. First uploaded/imported version is **1.0.0 Official**; default edit bump is **patch**; user may choose patch/minor/major. At most one official version per lesson plan.
- Any version regenerates its three documents on demand.
- **Diff:** Payload's field-by-field version compare is adequate to start. Later, add a concise **"what changed" summary** for teachers (e.g. *"Lesson 3 · Teacher Moves edited"*) layered on top — not a replacement.
- Optimistic concurrency to prevent clobbering concurrent edits.

---

## 7. Upload / import

- Accept ARES output and create the first version as **1.0.0 Official**.
- **Two entry points, both trusted:** (1) a **dev-only CLI** (`app/scripts/ingest.ts`, `payload run`) accepting `.js` and `.json`; and (2) a **Site-Administrator-only web upload** (`POST /api/lesson-plans/upload`, `.json` only) — a Lesson3-owned collection endpoint + a self-hiding list-view panel. **Still never teacher-facing.** *(DEVIATION 2026-06-13 from the original "never an HTTP/upload surface" rule — see `docs/DECISIONS.md`. It is now safe because uploads are never executed: `.json` → `JSON.parse`; `.js` stays CLI-only. The web surface is JSON-only to keep the attack surface minimal. Authorization is enforced server-side in the endpoint (`isSiteAdmin`), not just by hiding the button.)*
- **Extract `.js`/`.json` data to canonical JSON. Never `require()`/execute an uploaded `.js`** (arbitrary code execution). ARES's `extract_generator_data.py` is the model for safe extraction. The `.js` path (`app/src/ingest/extract.ts` → `extractAresData`) is a static **`acorn` AST parse that evaluates ONLY pure data literals** — strings/numbers/booleans/null/arrays/objects, plus **constant folding of `+` string concatenation** (the ARES `'a\n' + 'b\n'` multi-line-prose pattern; operands are themselves evaluated as literals, so nothing dynamic slips in) — and **rejects** anything executable or dynamic (a call, identifier reference, member access, non-`+` operator, template-with-expression, spread, getter, `__proto__` key). No `require`/`vm`/`eval`/`Function`. The `.json` path (`extractAresJson`) is `JSON.parse` (no execution surface) with matching structural guards (non-object root, recursive `__proto__` rejection, required groups). Both share the same downstream pipeline. Highest-risk surface → security-reviewed (re-review the web upload before exposing it).
- **Resolve `subjectGrade` by EXACT `(META.subject, META.grade)` match;** missing taxonomy is a hard, actionable failure. Upload/import never auto-creates Subjects/SubjectGrades (keeps that curated junction list clean). Seed taxonomy before uploading/importing.
- Create the Lesson Plan and version snapshot via Payload's Local API **in one all-or-nothing transaction**; bulk import supported (point at a file or directory). A read-only **pre-flight** validates+resolves every file first and reports all problems before any write.
- **Upload/import creates version 1.0.0 as Official.** Later edits create additional Not Official versions by default. Site Admins and matching Subject Admins can make any retained version Official; doing so only moves the official pointer and does not duplicate content.
- **Re-ingest of an existing sub-strand (decided 2026-07-04; implementation tracked — see `docs/DECISIONS.md`).** An upload whose **`(subjectGrade, META.substrand_id)`** matches an existing lesson plan attaches to that SAME plan as the **next MAJOR version** (a 1.x plan gets `2.0.0`, a 2.x plan gets `3.0.0`) and **becomes Official automatically** — mirroring the 1.0.0 rule: a fresh ARES export is the new canonical. All prior versions are retained (never overwritten); the plan `title` refreshes from the new upload's `META.titleDoc`. A key matching **more than one** existing plan (legacy duplicates) is an actionable pre-flight failure — resolve the duplicate first; the batch stays all-or-nothing. *(Gap note: code written before this decision still creates a duplicate plan on re-upload; the fix is the tracked Phase-4 work.)*
- **Validate against the schema on upload/import, plus a generator-completeness gate (same rules as §5).** Schema-required fields are not sufficient — the generator dereferences groups the schema leaves optional. `validateGeneratable` (`app/src/ingest/validateGeneratable.ts`) requires: `META` present; each lesson has `slo` and `summaryTablePrompt` groups and ≥1 framework phase; every `framework[].phase` ∈ the controlled vocabulary. Enforced before any version is saved; export then trusts validated-in data.
- **Resource resolution (optional, §3):** if the resource column is enabled, run the ARES recommender (Python + `ares_content.db`) **once at ingest** and store the resolved `framework[].resources` in the bundle. Generation never calls Python/SQLite live. If the column is disabled (DEFERRED — see §3/`docs/DECISIONS.md`), skip this step; ingest carries `framework[].resources` through if present, else omits it.

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
- **User directory (amended 2026-07-02, with messaging):** every authenticated user may read the
  roster of user **display names** — messaging's user picker requires it (§10 "any user may message
  any user"). This deliberately relaxes the earlier self-only read tightening (2026-07-01) at the
  collection level ONLY: emails stay owner/Site-Admin-visible and roles/assignments stay
  field-hidden from non-admins, and server-side authorization decisions that depend on admin-only
  fields keep using trusted server projections, never client-visible data (DECISIONS 2026-07-02).

---

## 9. Generation, export & sharing

- Export any version, Official or Not Official, as **DOCX** (all three documents) and **PDF**, via the embedded generator.
- Print, save-as-PDF/DOCX, and email-as-attachment are in scope. **PDF, email-out, and message links/attachments are confirmed in scope** (see §10): a lesson artifact is referenced by **(version, document, kind)** where `kind` is `docx | pdf` — a stable, access-gated, version-pinned URL (generation is content-stable, so it resolves deterministically). There is a **single document layout** (the earlier standard/compact "layout"/`format` axis was removed 2026-07-03 — one five-column framework table, no separate Resource column); only the deliverable `kind` varies. Email attaches freshly-generated bytes; messages link the URL. Persisting/caching artifacts is a later optimization, not required first (generate-on-demand behind stable URLs avoids reintroducing a media/storage layer).
- **PDF = convert the generated DOCX, never a parallel renderer** (one source of layout truth — the same rule that limits the mammoth view to a *content* preview). A semantic converter (Pandoc, HTML→PDF) reinterprets layout and would not match the approved DOCX, so it is disqualified for the exact artifact.
- **PDF converter — OPEN decision (do not lock in; decide by fidelity test).** Constraints (locked 2026-06-14): must be **faithful** (reproduces the generator's tables/merges/shading/widths), **free / no paid or commercial service**, **fully offline / no cloud** (rules out MS Graph and metered APIs), and self-hostable. That narrows the field to a **local office engine** (LibreOffice headless, or OnlyOffice/Collabora) — the bulk (~0.4–1 GB) is the intrinsic price of faithful DOCX layout; fine on the Rock's NVMe. **Preferred packaging: a separate sidecar container** (e.g. Gotenberg wrapping LibreOffice — multi-arch/arm64, offline) so the app image stays slim. PDF is **slow → Jobs Queue (async)**. The engine is chosen by a golden-file fidelity test (Word's own DOCX→PDF as oracle) when the PDF slice is built; code calls it behind a swappable `docxToPdf(buffer)` seam.
- Generation can take seconds for large bundles — run it without blocking the UI and show progress; stream/queue as appropriate on the chosen host.

---

## 10. Cross-user workflows (confirmed in scope, 2026-06-14)

These are **features of "The App"** (§2) — common to every role, role-aware per §13. Confirmed
wanted (Phase 2+ track; build order per §2 open decisions). All are ordinary Payload
collections / endpoints / hooks + the Jobs Queue — none affects the generator/versioning core.

- **Browse / search / filter** lesson plans and versions by subject-grade, official status, contributor, favorites.
- **View + export/print**, and **email a document** to any address (server-side send; SPEC §9/§11).
- **Internal messaging + notifications** — any user may message any user, optionally attaching/linking a
  bundle; the recipient is notified of waiting messages. (Supersedes Lesson2's inbox; a
  deletion-request flow can ride on the same messaging substrate if wanted.)
- **Favorites** (per user, per bundle).
- **Translation** (e.g. Swahili) and **AI features** (summaries, etc.) — server-side outbound
  services behind endpoints/jobs, rate-limited (§11); AI uses the current Claude API/models.

---

## 11. Operations

- **Error tracking / observability** (e.g. Sentry) — required before real users.
- **Automated, off-site, encrypted backups** (Postgres dumps); snapshot before migrations.
- **CI/CD** so build/deploy is not bound to one machine.
- **Rate limiting** on expensive endpoints (generation, auth). Generation: per-user export/preview buckets + per-user/per-recipient/site-global email caps. Auth (added 2026-07-04): `login` per target identifier + global, and `forgot-password` per requested address + global (unauthenticated outbound mail — same egress class as email-a-doc), enforced in a Users `beforeOperation` hook (`app/src/hooks/authRateLimit.ts`); budgets keyed on the *requested* identifier so the limiter is not an account-existence oracle.
- **Retention (decided 2026-07-04; prune cron is tracked Phase-3 work — see `docs/DECISIONS.md`):** completed export job rows 14 days; email + message-ping job rows 180 days (they are the data-egress audit trail); failed job rows 90 days; `rate_limit_counters` rows 7 days. Nightly `scripts/prune-db.sh` alongside the backup crons.
- **Admin session timeout.** Auth `tokenExpiration` = **2 hours** (was 15 min; changed 2026-07-04 — too short in practice), enforced server-side (the auth cookie and JWT expire together; an expired token can't be refreshed). A client `IdleLogout` provider (`app/src/components/IdleLogout`) enforces the deadline on the wall clock (interval + focus/visibility) so idle or backgrounded tabs terminate promptly, not just on the next request. Revisit the window as part of the pre-public-exposure checklist. See `docs/DECISIONS.md`.
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
- **Role-tailored, minimal UI (applies to EVERY user type).** The user-facing interface must be
  as clean, lean, and self-evident as possible — a user should grasp the main functionality at a
  glance. **Show only what the current user can actually do:** any action a role cannot perform
  must not appear at all — *not even disabled/greyed-out*. A Teacher (no edit rights) sees no edit
  controls; a non–Site-Admin sees no "create Subject/Grade"; etc. Most users are Teachers, so the
  Teacher view in particular is view/export-only and uncluttered. This is consistent across all
  roles. It is a presentation rule **layered on top of** the server-side access control (§5, §8),
  never a substitute for it — hiding ≠ securing; access is still enforced server-side.
- **Payload-first.** Before adding any new custom endpoint, editor, permission layer, workflow,
  or persistence code, first check whether Payload already provides it — through collection
  config, access control, field/collection hooks, versions/drafts, admin config, the Jobs Queue,
  or the Local API. Build custom only when Payload genuinely cannot; when you do, **document the
  specific gap** in a code comment and/or `docs/DECISIONS.md`. The point is to keep the system
  leaning on Payload's tested machinery rather than re-implementing it.
- Document any deviation from this spec here.
