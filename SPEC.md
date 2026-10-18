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

A **versioned lesson-plan repository**. ARES-generated CBE lesson plans are uploaded/imported as version **1.0.0 Official**; later edits create retained, immutable versions; exactly one version per lesson plan is **Official** at a time; any authenticated user can view and export retained versions as **high-fidelity DOCX and PDF**. An optional public-discovery mode distributes deliberately published Official lesson plans without login; local school installations can disable that entire surface and run the authenticated service with no internet dependency. Running on offline local servers is a **secondary** goal, not a primary constraint.

Non-goals: not an LMS, not an offline content-distribution platform (Kolibri/RACHEL serve that need), not a Word round-trip editor.

---

## 2. Architecture (decided)

| Layer | Choice |
|---|---|
| Runtime | **Node.js / TypeScript** (single runtime, end to end) |
| App framework / backend | **Payload CMS** (MIT) — data model, auth, RBAC, versioning, admin UI, REST/GraphQL API |
| Database | **PostgreSQL** (Payload's recommended production adapter) |
| DOCX/PDF generation | **Reuse ARES's `cbe-generation-system`** (the `docx` npm package; `docx_kit.js`, `sections.js`, `build_docs.js`), embedded in-process |
| Editing UI (phase 1) | **Payload admin edit screen** with field-level access control |
| Editing UI (phase 2, only if needed) | Custom React editor on Payload's API |
| Hosting | A **Node-capable host** (cloud VPS now; a local Node box for offline later) |

**Why Payload + embedded generator:** the generator is the irreducible Node component and the product's whole reason for existing. Wrapping it in a Node app keeps everything in one runtime — `generateOne(dataObject)` is an in-process call, no second service, no PHP↔Node serialization. Payload then supplies, already-built-and-debugged, the parts we would otherwise hand-write: auth, users, **field-level RBAC**, **content versioning**, admin UI, API, media, migrations, and hooks. The custom remainder (editor UX, live preview, generator glue) is the same in any framework — so Payload removes plumbing rather than adding work.

**Maturity caveat (managed):** Payload 3 is young, Next.js-coupled, and ships weekly. We **pin the version and upgrade deliberately** — this is how we reconcile "reuse debugged code" with "stable and trouble-free."

### Two application surfaces (decided 2026-06-14)

The product has **two front-ends over one Payload backend** (one runtime, one auth, one access layer):

1. **The App** — a unified, role-aware front-of-house frontend (`app/src/app/(frontend)`) that **all users log into**, built on Payload's API + auth. It is the home for everything **common to all users**: browse/search lesson plans, view all versions, export/print, **email a document**, **internal messaging + notifications**, **translation** (e.g. Swahili), and **AI features** (summaries, etc.). Per the §13 minimal-UI principle it shows each user only what they can do. **Teachers without an administrative role or editing access — the majority — live entirely here** (they are intentionally excluded from `/admin`).
2. **Payload `/admin`** — the **back-office** for content-management work: structured editing (Phase 1), versioning, user/role/taxonomy management, ingest/upload. Teachers with editing access and Subject Administrators edit here; Site Administrators administer here.

Rationale: the common features above are *product* features every user needs; giving teachers a separate app would force duplicating them (or making teachers with editing access switch apps). One shared App + an admin back-office avoids that. This **resolves the former "editing placement" open decision** (start in `/admin`; a custom editing UI may later move into the App — SPEC §5 Phase 2) and confirms the §10 workflows as in-scope. It is a **Phase-2+ track** that does not block current `/admin` editing/publishing work.

### Deployment modes and public discovery (decided 2026-08-12)

The authenticated App above is present everywhere. A separate public-discovery surface is an
**explicit opt-in deployment feature**, not something inferred from `SERVER_URL` (which remains the
public-security-posture switch in §11/OPS). Its detailed design is
`docs/DESIGN-public-library.md`.

- `/login` remains the normal unauthenticated entry. An enabled internet deployment adds one
  secondary **Explore free lesson plans** action to `/explore`; it does not replace the restrained
  sign-in page. A shared public lesson URL opens that lesson directly.
- A disabled/offline installation renders no Explore action and returns 404 from every public browse,
  lesson, metadata and artifact route. This is enforced server-side; hiding UI is not the boundary.
- The public experience is **mobile-first** (360–390 px phones are the primary constraint) while
  expanding cleanly on laptops. It exposes only deliberately public Lesson Plans through their
  current Official pointer—never arbitrary version ids and never general anonymous collection read.
- Public visibility and Official status are independent. Approval does not silently publish, and
  publication cannot expose a non-Official version.

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
│   ├── resourceLinks    # required map: predict / observe / explain / dqb / model
│   │   └── each { video, reading, fallback_search_url }
│   ├── framework[]      # ordered instructional phases (Predict / Observe / Explain / DQB / Model Building …)
│   │   └── { phase, learnerExperience, teacherMoves, sensemakingStrategy, formativeAssessment }
│   ├── teacherReflection
│   └── summaryTablePrompt { observed, learned, explained }
├── FINAL_EXPLANATION    # { subjectLabel, instructions, sections[{title, prompt, exemplar}], rubric[] }
└── SUMMARY_TABLE        # { subStrand, drivingQuestion, lessons[{number, title, observed, learned, explained}] }
```

Authoritative Lesson3 upload schema: `app/src/ingest/ares-contract.schema.json`, aligned to the
current generated ARES JSON artifacts (see `docs/EXTERNAL-DEPENDENCIES.md`). Upstream's prose schema
is useful provenance, but it is not the enforceable downstream contract when it differs from emitted
JSON.

**Generates up to four documents per bundle:** `*_CBE_LessonSequence.docx`, `*_FinalExplanation.docx` (the **student** document: prompts, blank answer space and rubric — **no exemplar answers**), `*_FinalExplanation_TeacherKey.docx` (the **teacher key**: the same prompts beside the exemplar answers — never give it to students) and `*_SummaryTable.docx` (plus PDF). The student document and the key come from the same `FINAL_EXPLANATION` data, so they exist together or not at all and cannot disagree. All regenerate from the one bundle.

**The teacher key follows the plan's existing read access (decided 2026-10-06):** anyone who can read and export a plan can export its key, it travels in the whole-zip downloads and in email-a-doc, and it is labelled "Teacher key — not for students". Any future public library must **never** serve it (allowlist public deliverables rather than denying the key). Before this split (to 2026-10-06) the single Final Explanation was titled "Student Assessment Document" yet printed the exemplars.

**Single-document sub-strands are legitimate (confirmed 2026-06-26).** Some sub-strands ship as a *single* document — the LessonSequence only — with no FINAL_EXPLANATION sections and/or no SUMMARY_TABLE rows. This is valid content, not incomplete data: the generator already guards and **skips** an empty FE/ST (`FE.sections || []`, `ST.lessons || []`), so it produces exactly the documents the bundle carries. Consequently a missing FE/ST is **not** a defect and **not** a hard gate — it is surfaced as an informational ingest note only. (See `docs/DECISIONS.md` 2026-06-26; this resolves the §3-option-(a) FE/ST modeling question.) The LessonSequence itself is always required — its completeness *is* a hard gate (`validateGeneratable`).

### Modeling rules
- Model the bundle as **native Payload nested fields** (groups/arrays), **not a JSON blob** — native fields are what unlock free per-field validation, field-level access control, and versioning. A blob forfeits the reuse Payload is chosen for.
- **Canonical production interchange and storage format is JSON.** ARES `.js` data modules are
  authoring inputs, not complete Lesson3 uploads unless they already contain the same mandatory 1.0.0
  fields. Any supported development extraction path must still produce and validate the complete JSON
  contract; uploaded code is never executed.
- **`summaryTablePrompt` (in `LESSONS`) and `SUMMARY_TABLE.lessons` are distinct content** serving different documents — not duplicates. Both are edited; label each by the document it feeds.

### ARES resource links (mandatory lesson data; resolved upstream)

The definitive 1.0.0 JSON contract includes **`LESSONS[].resourceLinks`**. It is required for every
lesson and has exactly five buckets: `predict`, `observe`, `explain`, `dqb`, and `model`. Each bucket
contains `video`, `reading`, and `fallback_search_url`; a video/reading value is either a complete
resource record or `null` when ARES found no recommendation. A resource record preserves ARES's full
metadata: `title`, `source`, `content_type`, `direct_url`, `search_url`, `search_terms`,
`exact_search_url`, `has_transcript`, and `tier`.

⚑ **A `null` slot is stored as an empty group, and means `null` on export (2026-10-05).** ARES emits
`video: null` / `reading: null` whenever its relevance matcher finds nothing suitable (upstream
`DESIGN_link_selection_v2.md` §4.8; 54 of the 95 current Grade 10/11 files carry some). Payload cannot
persist a `null` group (it throws on write → HTTP 500), so ingest stores an empty group and the export
adapter restores `null`; the JSON the generator receives is identical to what ARES wrote. The empty
group is an internal storage form only: an uploaded `{}` or partially populated record is still a
contract violation (`isEmptyResourceGroup` in `ingest/resourceLinks.ts` is deliberately strict).
Rendered, a null slot is the "Search ARES" fallback link built from `fallback_search_url`.
See DECISIONS 2026-10-05.

ARES resolves these links before it writes the downstream JSON artifact. Lesson3 **does not run** the
Python recommender or its SQLite index at upload or render time. It strictly validates the supplied
map, stores it losslessly as system-only native Payload fields on each immutable version, and renders
the stored links. Only `http` and `https` URL schemes may become document hyperlinks.

The lesson-level map must not be normalized into `framework[]`: framework phase rows may repeat or omit
a canonical phase, while `resourceLinks` still carries all five buckets. The former optional
`framework[].resources` seam and separate Resource-column plan are retired by the clean-slate 2026-07-19
cutover.

---

## 4. The generator contract (fidelity rules)

DOCX fidelity is owned entirely by ARES's generator. Editing must stay within its input grammar. From `docx_kit.js`:

- Every content field is a **plain string**.
- `\n` → a new paragraph.
- A line beginning with **`- ` or `• `** → a bullet (the generator adds its own marker).
- **No inline markup** is parsed (`**bold**`, `*italic*`, `>`, `#` render literally). All styling, colours, and numbering are applied by the generator, never from content. **One exception, in the fields upstream parses tables in** — Final Explanation `instructions`, `sections[].prompt` and `.exemplar`; lesson `overview`; and the four framework fields `learnerExperience`, `teacherMoves`, `sensemakingStrategy`, `formativeAssessment`: **two or more consecutive** lines that begin with `|` are rendered as a real **table** (`| a | b |` rows; a separator row such as `|---|---|` is ignored; the first row is the header). A single `|` line is ordinary text (it is usually maths, `|x| = 3`) — which also means a header-only table (one row, no body) prints literally. In `instructions`, `prompt`, `exemplar` and `overview` the table is drawn in place; in a framework column it is too wide for the cell, so upstream leaves a `(table below)` pointer there and prints the table full-width in a row of its own under that phase. Nothing else about the grammar changes, editing stays plain strings, and no table-editing UI exists. In any of those fields that contains a table, a parenthesized `(https://…)` stays visible text rather than a clickable link (the table wins). (Before the 2026-10 re-pins only `prompt` and `exemplar` were table-capable; `tests/unit/vendorProvenance.spec.ts` pins the list and upstream's table rule.)
- The required lesson-level **ARES resource links** are read from stored `resourceLinks` (see §3) and
  rendered beneath the phase label inside Section C's first cell. There is no separate Resource column,
  no live Python/SQLite lookup, and no user-editable resource field.
- **`framework[].phase` is a controlled vocabulary** — phase names drive colour-coding and resource lookup; an unknown phase silently degrades output. Phase is a fixed dropdown, never free text.
- **Document attribution (implemented 2026-10-07; supersedes the 2026-08-12 "every page" wording):**
  every document carries upstream's attribution and licence block — **CC BY-NC 4.0**, SeaVuria and ARES
  — exactly as Mark's generator renders it: the full block once after the sub-strand overview in the Lesson
  Sequence and at the end of the Final Explanation, teacher key and Summary Table, plus a short footer after
  **every** lesson. It is **not** stamped on every page; the placement is upstream's (2026-10-01) and the
  rights position for the lesson plans is settled by the operator as stated there. It is implemented once, in
  the vendored generator (`lib/attribution.js` + `generator/config/attribution.yaml`), and inherited by PDF
  from DOCX; never as a PDF-only overlay and never as repeated prose in lesson content. The year is a
  **fixed, configured copyright year** (2026 for this release) so re-rendering a stored version in a later
  January does not change its bytes; changing it must accompany a `GENERATOR_RENDER_VERSION` bump.
  The PDF fidelity gate was retired 2026-07-20 (DECISIONS 2026-07-20): **DOCX is the gated layout
  deliverable**, and a change like this is checked by the DOCX fidelity gates plus a visual inspection of
  representative PDFs.

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
- **Plan identity is immutable after ingest:** the `LessonPlans.subjectGrade` relationship is set
  once when the plan is uploaded and cannot be changed through the admin form, REST API, or Local API
  update — including by a Site Administrator. Correct a wrongly categorised plan by deleting it and
  uploading it again; an exceptional in-place data repair requires an explicit migration.

#### Links inside prose (Plan A, 2026-10-18)

Link insertion stays inside the plain-string grammar. While editing, the toolbar's single
**Insert link** action is available only for the four framework columns: Learner experience,
Teacher moves, Sensemaking strategy and Formative assessment. It is hidden during Combine review.
It is disabled until the cursor is placed in a linkable field; focusing another textarea clears the
target. Existing links in other prose fields still render as before.

The dialog accepts complete `http://` and `https://` addresses and an optional plain-text label,
trimmed, single-line and at most 120 characters. It inserts `Label (http://…)` at the cursor, or
`(http://…)` without a label. Parentheses in the address are escaped; label parentheses are plain
text. No markup or hidden link metadata is stored. Web/PDF links open separately so they never
replace a page holding unsaved work. The existing generator's table-text exception still applies.

**Store ARES links in ARES's own form:** `http://ares.local/…` or
`http://ares.local:8069/…` for Kolibri. Before insertion, unwrap recognized ARES tracker URLs,
map `/kolibri/` and a configured Kolibri prefix to port 8069, and normalize recognized ARES hosts.
Recognized hosts are `ares.local`, `demo.aresedu.dev`, the hosts in optional `ARES_SITE_URL` and
`ARES_KOLIBRI_URL`, and exact hostnames/IPs in comma-separated `ARES_HOST_ALIASES`.
`ares.edu` is not a default alias. Preserve path, query and fragment. Non-ARES addresses are stored
as typed (apart from trimming surrounding whitespace); malformed tracker targets leave the address
unchanged. This is a local string transformation, never a network lookup. Plan A does not rewrite
stored versions or generated document destinations; document-time rewriting is separate Plan A+.

ARES PDFs normally live under `/modules/`: open the PDF in ARES and paste its address. The optional
Rock PDF picker appears only after the server confirms `PDF_LIBRARY_DIR` is configured and readable.
Both environment templates leave that setting commented out. The folder is flat, read-only and
operator-managed; Lesson3 cannot upload, rename, replace or delete files there.

**Configuring this folder makes eligible PDFs public by direct link, independently of
`PUBLIC_LIBRARY_ENABLED`.** Only `GET /api/resource-library/file/:token` is anonymous;
`GET /api/resource-library` still requires sign-in for every role. An unconfigured folder returns
404 for files. Serving retains the filename/path checks, no symlinks, non-hidden `.pdf` extension,
25 MiB limit, `%PDF-` signature and `nosniff`. Tokens encode filenames and are not access secrets.
Inserted PDF targets use the browser's current absolute origin. Listing failures do not block
pasting an address. This optional folder is not part of lesson public discovery or resource backups.

The dialog's **New feature** note is removed after a term of school use with no reported link
problems, with that removal recorded in DECISIONS. Search, resource uploads and resource versioning
remain outside this scope. System-owned ARES `resourceLinks` remain unchanged.

### Editing surface — a wider-screen affordance; 640px or narrower is view-only (decided 2026-07-28)

Lesson-content editing is offered only at **viewport width > 640px** (i.e. blocked **at 640px or narrower**). The primary editing surface is inexpensive Kenyan laptops (**1280×800 is common and must stay editable even when the window is not maximised**); tablets are secondary; **phones are explicitly not an editing device** — the framework table and a ~3350px lesson body do not fit, and keeping phone editing would mean owning unbuilt mobile-reflow work indefinitely. At 640px or narrower the lesson page's **Edit** button, the version editor's **Edit / Save / Cancel**, and the `?edit=1` deep-link intent are all unavailable, replaced by a short *notice* that names the remedy (rotate / widen / larger screen) so the absence is explained, not read as a bug or a lost role.
- **This is progressive disclosure, NOT an authorization boundary.** Viewport is not a device class: a landscape phone or "request desktop site" clears 640px, and that is fine — bypassing it just yields the cramped editor. Server-side RBAC is untouched and **no endpoint gets a viewport check**. The notice names *screen space*, not a device, for the same reason (a split-screen tablet can be blocked; a landscape phone can pass).
- **Everything else stays at every width:** viewing, both previews, downloads/exports, Share, email, messaging, favorites, version history, **Make Official**, **Delete** ("editing needs room, deleting does not"), user administration incl. promote/demote, guide, auth. The boundary is the lesson-content editor, not `/admin`.
- **Behaviour:** at 640px or narrower, **new edit intent is neutralised on initial load** (a mount-time JS guard; needed because `?edit=1` seeds `editing` during SSR, so CSS alone can't decide the mode without a hydration mismatch). **An edit session already underway is not cancelled when the viewport is resized** — the guard evaluates once on load, never on resize, so a user who narrows the window mid-edit keeps Save/Cancel. The CSS button↔notice swap is cosmetic; the guard is what decides edit mode.

### Field-level edit permissions (maps directly to Payload field access control)
- **Teacher with editing access for the subject-grade:** prose values — `slo.*`, `overview`, `framework[].{learnerExperience, teacherMoves, sensemakingStrategy, formativeAssessment}`, `teacherReflection`, `summaryTablePrompt.*`, `SUMMARY_TABLE.lessons[].{observed, learned, explained}`, lesson `title`, `FINAL_EXPLANATION.instructions`, `sections[].prompt`.
- **Subject Admin only:** `META.*` (except the identity fields below and the no-op fields in *System*), `framework[].phase`, `duration`, structural changes (add/remove/reorder lessons & phases), and **assessment answer keys** — `sections[].exemplar`, `rubric[*]`.
- **Site Admin only (amended 2026-07-05):** `META.subject`, `META.grade`, `META.substrand_id` — corruption-repair fields, not curation. Subject/grade only label the printed document (the plan's `subjectGrade` relationship is the categorization truth, fixed at ingest), and `substrand_id` is the re-ingest matching key (§7) — a wrong edit silently redirects future re-uploads. A Subject Admin's submitted values are preserved from the source (`hooks/fieldSplit.ts`); the fields render read-only for them.
- **System (never editable):** `LESSONS[].resourceLinks`; `LESSONS[].number` (set by order); `SUMMARY_TABLE.lessons[].number`.
- **Stored faithfully, but never editable by anyone (amended 2026-08-23):** `META.outputDir`, `LESSONS[].substrand`, `LESSONS[].aresKeywords`. These are ARES contract data the generator receives verbatim, so they are stored losslessly — but *editing* them cannot change anything observable, which made them controls the system does not honour. `outputDir` is described by the contract itself as "not consumed downstream" (its only upstream reader is the CLI's file-writing path, which Lesson3 does not use). `substrand`/`aresKeywords` are arguments to `getAllPhaseResources()`, and Lesson3's bridge is positional — it takes each lesson's already-resolved `resourceLinks` in order and ignores the arguments. ⚑ Hidden and read-only, **not** protected by field-level `access`: these are optional subfields inside open arrays, where Payload field access nulls the value instead of retaining it (DECISIONS 2026-07-04). The whitelist in `hooks/fieldSplit.ts` is the write-time authority, and it is secure by default.
- **`SUMMARY_TABLE.lessons[].title` is Subject-Admin-only (amended 2026-08-23):** it was rendered as teacher prose and listed in `SUMMARY_LESSON_PROSE`, so the implementation was wider than the teacher grant above, which names only `{observed, learned, explained}`. Mirroring it from the lesson title would be tidier still, but that changes generator input and is a separate decision.

> **Vocabulary note.** Editing is a *capability*, not a user type. It is presented as **"editing
> access"** granted to a Teacher, never as an "Editor" account. The stored `editor` assignment value
> is an implementation identifier retained for compatibility; it does not define a fourth type.

### Unsaved-work durability — edit recovery (amended 2026-07-20; reconciled 2026-09-12)

**Invariant: a teacher's in-progress edits must survive session expiry, browser crash, forced
refresh, device sleep and accidental tab close.** This is a product guarantee, not a nicety.

**Implemented:** server-owned captures, client capture/restore, and the pre-expiry flush and
screen-clearing policy below. Both historical expiry paths (Payload's navigating timeout and
IdleLogout's non-navigating logout) are addressed by this integration. The guarantee remains the
last confirmed capture, not every keystroke: debounce, network failure and offline work have the
limits specified below. If the final flush is unconfirmed, the explicit unsafe-work screen policy
below takes precedence over automatic clearing. Full design and dated implementation history:
`docs/DESIGN-working-drafts.md`.

Saving holds Payload's processing lock across recovery preparation, submission and navigation;
native prose and structural controls must not accept changes after the submitted snapshot is taken.
A rejected or failed save releases the lock without clearing the dirty form.

**Vocabulary — what users see is a "draft" (operator decision 2026-10-17, superseding the
2026-07-20 reservation).** A *draft* is a user's private, **unnumbered** copy of changes not yet
saved as a version; a *version* is a **numbered** save (1.0.1, 1.0.2 …). The feature's internal
name stays **edit recovery** — the collection is `edit-recovery`, the endpoints are `/recovery`,
and the code says "capture" — exactly as the stored `editor` value survived the "Editor" account-type
rename (CLAUDE.md). The UI says **"Draft saved automatically · <when>"**.
*Why the reservation was lifted:* it held "draft" for unofficial saved versions on the evidence of a
Guide sentence ("Your drafts live in Manage → My saved versions") that no longer exists — by
2026-10-17 no screen or Guide text used the word for versions. Its worry was that calling an
automatic backup a "draft" would tell a teacher a VERSION had been saved; with an explicit "Save as
draft" beside "Save as new version", the two are named apart instead. ⚑ **Never call a numbered
version a draft**, in UI text or Guide: "My saved versions" lists versions; "Your Drafts" lists
drafts, each "Based on version 1.0.4".
*(A `Draft` status pill also exists in `LibraryBrowser.tsx`, but it is dead code — catalogue rows are
built with `status: 'published'` hardcoded. If `status` ever goes dynamic, that pill would call a
version a draft and must be renamed first.)*

**What is guaranteed, precisely.** The guarantee is **the last server-confirmed capture survives** —
not every keystroke. Three windows are necessarily outside it and must be stated rather than implied:
work typed during the **debounce interval** before a capture fires; a capture **in flight** when the
process dies; and any editing done while **offline** — client-side persistence is disqualified by the
shared-machine rule (§13), so there is no durable copy anywhere until the server confirms one. The
editor therefore shows a **save-state indicator with the confirmed timestamp**: that timestamp is the
observable contract, and a failed or backed-off capture must say so rather than fail silently.

- **Captures are stored SERVER-side**, in a user-owned `edit-recovery` collection — never in
  `localStorage`/`sessionStorage`/IndexedDB (§13).
- **A capture is not a version.** `edit-recovery` is a separate mutable collection creating no
  `lesson-bundle-versions` rows, so the immutable-version model (§6) is untouched and no version
  churn is introduced.
- **No client-facing collection surface.** `read`, `create`, `update` and `delete` are all closed on
  the collection, and it is hidden from the admin panel. Every operation goes through custom
  endpoints on `lesson-bundle-versions` (alongside `/:id/preview`, `/:id/save-as-new`,
  `/:id/make-official`) which re-load the source and re-run the caller's editing authorization on
  each call, then write with `overrideAccess`. This is deliberate and is the **documented Payload-first
  gap** (§13): `start` needs an atomic upsert keyed `(user, sourceVersion)`, and default REST has none.
  **Only `start` may insert or reactivate a row.** Capture is a compare-and-set UPDATE of an existing
  *active* row and returns 409 when the row is missing, retired, or its revision has moved — an
  upserting capture would recreate a retired row, which is the resurrection retirement markers exist to
  prevent, and would make the explicit start optional. Closing `read` is what makes "a user who has lost
  editing access cannot restore" true by construction rather than by accident; closing `delete` is
  what stops an owner erasing their own retirement marker (below).
- **Content is a sparse prose overlay stored as JSON** — a deliberate, bounded exception to the
  native-nested-fields rule (§3 / `AGENTS.md`), which governs the canonical content of record. A
  capture is not lesson content: it is a sparse map of prose leaves keyed by row id, restored by
  overlaying onto the current source. Native fields cannot express it — every field would be
  optional, sparseness would be lost, and a capture written against an **older field shape** could
  not be stored at all, which would make the schema-drift rule below impossible.
- **The projection is derived from the existing prose whitelist**, not from top-level keys: the
  `*_PROSE` constants in `hooks/fieldSplit.ts`, which `tests/unit/proseWhitelistDrift.spec.ts`
  already pins mechanically to the `canEditProse` field factories. So system and admin-only data —
  `resourceLinks`, `framework[].phase`, `duration`, `number`, answer keys — cannot enter a capture as
  **content** by construction, and a future admin field is excluded automatically. A capture must never
  become a second, weaker channel for data the field-split protects; on restore it supplies prose only,
  and `applyEditorFieldSplit` remains the write-time authority.
  - **Row ids are keys, not content** — the one apparent exception, stated explicitly because the two
    rules read as contradictory otherwise. A row id appears only as a **map key**, used to align the
    overlay with the source's rows. On restore each key is validated against the current source and an
    unrecognised one is dropped, never created; ids are never written back as field values, and an id
    is not a value a capture can change (structure is not editable here at all).
- **v1 covers prose only, and the UI must say so.** Subject Admins edit structure, phases, durations,
  rubrics and answer keys in the same editor; none of that is captured, because a structural change
  alters row identity and a sparse overlay has nothing stable to key on (admin-scope recovery would
  be a different storage model, and is deferred). The save-state indicator is therefore
  **role-aware**: unqualified for prose-only editors, explicit for administrators that structural and
  answer-key changes are not backed up. A generic "saved" shown to an administrator would be false.
- **Fencing: server-issued generations, plus revisions.** A **generation** fences retirement across
  editing sessions; a **revision** fences individual writes. They are not interchangeable, and
  **every** write and every retirement needs a revision precondition — an ordinary capture bumps
  `revision` but leaves `generation` untouched, so a generation check alone cannot notice that another
  tab has captured newer work.
  - **`start` is atomic, and is a no-op on an already-active row.** Clicking Edit performs an explicit
    `start` — never the client's choice, never implicitly created by a capture — implemented as a
    single upsert (`INSERT … ON CONFLICT (user, sourceVersion) DO UPDATE … RETURNING`) returning
    **both** `generation` and `revision`. One statement, because two simultaneous first starts would
    otherwise race the unique insert and two starts against a retired row would race reactivation; the
    race loser must read exactly the winner's values, not fail and not a moved-on version of them.
    Reactivating a retired row **advances** the generation (fencing any stale tab holding the old one)
    and takes a **fresh** `baseUpdatedAt`/`schemaVersion`, or the new session would inherit the retired
    generation's baseline. Resuming an **active** row must change nothing at all — `start` fires on
    every Edit click in every tab, so any mutation there would invalidate the preconditions other tabs
    hold, and bumping the revision on resume would 409 the caller's own first capture.
  - **Capture** carries `generation` + `expectedRevision`; a stale or missing generation is **409,
    never an implicit restart**.
  - **Every endpoint that advances the row returns the resulting token** — `{generation, revision,
    updatedAt}`, from the same atomic statement — and the client adopts it. A client left holding the
    token it *sent* would 409 its own next write against a conflict it caused itself.
  - **`updatedAt` is set explicitly by every raw-SQL write.** Payload maintains that column on its own
    update path and the column default fires only on INSERT, so a raw upsert leaves it stale unless
    told otherwise — and expiry keys off "untouched since the cutoff", so a reactivated old marker
    would be re-expired immediately. Reactivation restarts the clock; resume preserves it, which means
    the TTL measures the age of the captured **content**, not of the session.
- **Retirement is one state transition with four callers, and every caller carries a precondition.**
  Save-as-new, explicit discard, 30-day expiry and Site-Admin cleanup all atomically clear `content`,
  mark retired, set `updatedAt`, and advance the **revision** — one shared function, so "the same
  transition" is testable rather than aspirational (which also means expiry cannot live in
  `scripts/prune-db.sh` as SQL). **None hard-delete the marker.** The precondition differs per caller,
  and each is applied inside the atomic update itself, never as a read-then-write:
  ⚑ **Retirement does NOT advance the generation** (amended 2026-08-06; earlier wording said
  "revision/generation"). The two counters have one meaning each and the boundary is where a SESSION
  begins, not where one ends:

  - **`revision`** advances on every write to the row, retirement included — it fences concurrent
    writes, so a tab holding a pre-retirement revision must be refused.
  - **`generation`** identifies the active editing SESSION, and advances only when a new one begins —
    i.e. at REACTIVATION, in `start`. Retirement ends a session without beginning one, so it leaves
    the generation alone.

  Advancing it in both places would double-count: one retire-then-reactivate cycle would move the
  generation by two, and "which session am I in" stops being answerable by comparison. Retirement is
  therefore `content := NULL`, `retiredAt := now`, `updatedAt := now`, `revision += 1`; reactivation is
  `retiredAt := NULL`, `content := NULL`, fresh `baseUpdatedAt`/`schemaVersion`/`updatedAt`,
  `generation += 1`, `revision += 1`.

  - **save-as-new** and **discard**: `generation` **and** `expectedRevision`.
  - **Site-Admin cleanup**: the `revision` returned by the metadata endpoint, so an operator cannot
    clear a capture that changed between looking and acting.
  - **expiry**: the revision read when the row was selected, plus still-active and still-untouched-
    since-the-cutoff, all evaluated in the update. The cutoff term alone already defeats the race (every
    advancing write sets `updatedAt`), so the revision is defence in depth — carried anyway so the rule
    has no exception and expiry's safety does not depend on an invariant maintained elsewhere.

  Retirement on save joins the save-as-new transaction — inside the semver retry attempt, so it can
  neither half-apply nor double-apply — and a precondition failure there fails the **whole save** with
  409 rather than retiring newer work; unlike a semver conflict, it is **not** retryable.
  A save without a recovery token also **keeps its source version**, even when `deleteSource=true`:
  deleting it would cascade an unchecked earlier draft away. The editor only offers source deletion
  after obtaining a checked retirement token. Tokenless saves still create the new version normally.
- **Save flushes first, and the two flush failures differ.** Save pauses capture, flushes, and awaits
  any in-flight write. A **transport** failure (network, 429, 5xx) is ignored and the save proceeds —
  the version save is the operation that matters and the capture is only insurance, so blocking a real
  save on failed insurance would invert the priority. A **409 is not ignored**: it means another tab
  holds newer work, so proceeding would retire it. That case surfaces the conflict instead.
- **Retirement markers live as long as their source version.** A content-free marker is what stops a
  stale tab recreating a superseded capture, and the staleness check cannot cover that case
  (versions are immutable, so a stale tab's `baseUpdatedAt` still matches). Rows are removed only by
  the explicit parent cascades on `lesson-bundle-versions` and `users` — the required-relationship /
  `ON DELETE SET NULL` pattern already used for favorites.
- **Restore is always offered, never automatic**, and is refused (view/discard only) when the
  capture's schema version or base source version no longer matches. On a 409 the stale tab must
  surface its content read-only so the user can copy it out — silently discarding real keystrokes
  would defeat the purpose of the feature.
- **The restore prompt offers Restore my draft · Exit edit mode · Discard the draft** (2026-10-18).
  *Exit edit mode* leaves the editor with the draft untouched, and the prompt says so; Escape and a
  backdrop click do the same. It replaced "Decide later" (and, for a copy-only draft, "Continue
  editing"), which left the teacher in the editor, where the first keystroke started a new draft
  that replaced the unread one.
- **Expiry still clears the screen.** Clearing the editor at logout is itself a privacy control on a
  shared machine, so the rule is *capture the working copy, then clear* — never "stop unmounting".
  Both expiry paths must clear.
- **Caps:** per-user **active** capture count (~20; tombstones excluded, or a prolific editor would
  be locked out) and a hard per-capture byte limit. The count cap may be enforced approximately — an
  improbable concurrent create yielding 21 is not an integrity problem — but the byte limit is hard.
- **Cross-device recovery is intended:** a capture follows the account, so work started on a school
  machine can be resumed elsewhere — surfaced through the same explicit restore prompt.
- **Site Admins see existence, never content:** count and metadata plus an authorized
  retirement/cleanup operation (for "this teacher's capture is stuck"), served by the same
  content-free endpoint. There is no admin read bypass for capture content.

#### Drafts — Save as draft, Discard changes, Your Drafts (decided 2026-10-17)

Operator question: can a teacher put work aside without saving a version each time? Edit recovery
already keeps unsaved work on the server, across devices, for 30 days — so the answer is to make
that **visible and deliberate**, not to add a second store. ⚑ **No separate drafts collection**: a
full-snapshot store would carry admin and system fields, which is the "second, weaker channel" this
section forbids. The user-facing word is **draft** (vocabulary note above). No schema change.

- **Editor buttons: "Save as new version" · "Save as draft" · "Discard changes".**
  - *Save as draft* flushes the capture and leaves edit mode **only after the server confirms the
    content on screen** (the same `isSafe` test the pre-expiry flush uses); on any other outcome the
    editor stays open with the work in it, because leaving clears the screen. Unlike Save, a
    transport failure is not tolerated — there is no other copy. The form is locked during the
    flush. Disabled on a pristine form. An administrator is asked first, because only prose is
    captured and structural or answer-key changes would be discarded. Afterwards: "Your draft is
    saved until <date>. Find it in **Manage** tab, under Your Drafts."
  - *Discard changes* replaced Cancel, which reverted the screen but left the automatic draft on
    the server — a less reliable Save as draft under a misleading name. It now confirms ("Discard
    your unsaved changes? This cannot be undone."), retires the draft, and reverts. A pristine form
    just leaves edit mode, without asking and without touching an existing draft.
- **"Continue editing"** replaces the Edit label (editor and lesson page) whenever the signed-in
  user has a draft on that version — a server-side existence check (`hasUnsavedWork`) at page load,
  updated in the editor by Save as draft and Discard.
- **"Your Drafts" on Manage**: the caller's own drafts (active, non-empty captures), each row with
  its subject-grade, **"Based on version 1.0.4"** (never "Version 1.0.4" — the number belongs to the
  version, not the draft), saved date and **kept-until date** (last write + 30 days, the date the
  nightly expiry honours), plus Continue editing (opens the editor, where the restore prompt takes
  over) and Discard (the existing discard endpoint, with the rendered precondition). Rows are listed
  only where the restore path would accept them: the version is readable and the caller still has
  editing access. Shown above the accordion and only when non-empty — not a panel, so a teacher's
  Manage page still opens straight onto "My saved versions" (numbered versions). Server-rendered from
  the session user; no listing endpoint.
- **The 30-day retention is stated** wherever drafts appear. It is unchanged (operator confirmed 30
  days, 2026-10-17).
- **Deleting a version warns when it discards drafts.** The parent cascade removes captures with
  their version, so the four deliberate delete paths — the editor's Delete, Manage's version list,
  Save's delete-the-source, Make Official's delete-previous — fold a warning into their existing
  confirmation. ⚑ **A new, bounded disclosure:** `GET /:id/recovery/unsaved-count` returns `{
  otherUsers, includesCaller }` — counts only, never names, times or content — and only to a caller
  for whom `canDeleteVersionDoc` holds, the one audience whose decision it changes. Advisory and
  fail-open: a refused lookup leaves the confirmation as it was. Whole-plan deletion (Site Admin) is
  not covered.

---

Combine recovery metadata is a second, bounded JSON overlay on the same closed, owner-only
`edit-recovery` row: only `mergeParent` (a plain version id) and `resolvedKeys` (field keys), capped
at 64 KiB, 1,000 keys and 512 characters per key. It is transient, non-exported session state,
not content of record. The bounded JSON envelope keeps this session state beside its sparse prose
overlay, written and retired by the same atomic statement; it grants no content or editing rights.
Capture writes it atomically with prose under the existing revision fence, checking only bounded
metadata shape; invalid optional metadata is dropped without rejecting prose. It performs no parent,
ancestor or comparison lookup. Ordinary drafts store SQL NULL. Stored metadata remains untrusted:
restore returns it, shape-checked, to its owner only, and the editor's next request — Combine preview —
is the one place that authorizes the pair (readable, same plan, editing access), charges the preview
budget and computes the current conflicts; keys that no longer match a conflict simply stop counting.
A preview refusal (400, 403, 404) continues the text as an ordinary draft, with an explanation; any
other failure (an exhausted budget, a timeout) offers *Retry combination* and keeps the second parent
(simplify, 2026-10-18: restore used to repeat the whole comparison itself, and a rate limit there
permanently dropped the second parent). Authentication, source authorization and capture fencing are unchanged. Deleting the editing
source still cascades its draft away; no draft is retained after source deletion.

## 6. Versioning

- The versioned unit is the **whole sub-strand bundle**. Each save is an **immutable snapshot**.
- Store a stable Lesson Plan identity separately from immutable Lesson Bundle Version snapshots.
- Add **semver** (`x.y.z`) and an **official-version pointer** on the Lesson Plan. First uploaded/imported version is **1.0.0 Official**; default edit bump is **patch**; user may choose patch/minor/major. At most one official version per lesson plan.
- Any version regenerates its documents (up to four) on demand.
- **Diff:** Payload's field-by-field version compare is adequate to start. Later, add a concise **"what changed" summary** for teachers (e.g. *"Lesson 3 · Teacher Moves edited"*) layered on top — not a replacement.
- Optimistic concurrency to prevent clobbering concurrent edits.

### Combine versions (approved 2026-10-17; phase 3b adds the screen)

Two teachers can each save from the same version (e.g. 1.0.1 and 1.0.2 from 1.0.0). **Combine
versions** reconciles them into a new version (1.0.3). Operator decisions: the feature is approved;
**a Teacher with editing access may combine** versions in their subject-grade; the UI calls it
**"Combine versions"** (not "merge"). Design summary — the detail lands with the build:

- **A combine is an edit session with two parents, not a new write path.** The merged prose arrives
  as an edit-recovery-shaped overlay on one parent, shown with the existing restore-preview diff;
  conflicts are settled in the normal editor; Save is the unchanged `save-as-new` plus one recorded
  second parent. Preview, validation, the no-op guard, the stale-source guard, the field split and
  semver retry all apply as they do today. **Never auto-committed**, even with zero conflicts.
- **Base:** the newest surviving common ancestor. `sourceVersion` is nulled when a version is
  deleted, so ancestry needs a delete-proof record (a plain-id lineage list plus a second-parent
  link); if no common ancestor survives, every difference is a conflict.
- **Alignment requires both shape and reliable correspondence** — regenerated row ids cannot pair
  versions, and matching shapes cannot detect a reorder. Multiple lessons require distinct, unchanged
  system upload identities (`substrand`, `aresKeywords`, `resourceLinks`) in the same order. Multiple
  framework, section and summary rows require unique, unchanged phase/title labels in the same order.
  Ambiguous or reordered arrays are refused until stable row identity is built. An unaligned ancestor
  is ignored, yielding a two-way comparison of aligned sides. Version 1 also refuses admin-field
  changes on both sides and differing system fields, each with a clear message.
- **Per prose leaf:** one side changed → take it; both made the same change → take it; one emptied
  and one edited → conflict; both changed differently → paragraph-level three-way merge (the grammar's
  `\n` paragraphs and `- ` bullets), conflicting where the same paragraph was edited. No
  character-level merging: it can splice two rewrites into a sentence nobody wrote.
- **Work is bounded across the whole document.** One preview admits at most 100,000 values and
  6,000,000 string characters across all three inputs. Paragraph merges share 2,000,000 work units
  (LCS cells and hunk comparisons); each LCS table also stays below 1,000,000 cells. A prose merge
  exceeding its remaining allowance becomes a controlled field conflict. Paragraph-merge inputs and
  output are bounded at 1,000,000 characters and merged output at 200,000 lines; lines are appended
  iteratively.
- **Combining does not make anything Official**; that stays an administrator action.

**Phase 2 — built (2026-10-17): the engine and a read-only preview.** Nothing is written yet.
- `lib/combine/engine.ts` (`planCombine`) and `lib/combine/diff3.ts` (`merge3`) — pure, DB-free. The
  plan names the version to START from, an edit-recovery-shaped `overlay` keyed by that version's
  rows (only fields whose combined text differs from it), the automatic `changes`, and the
  `conflicts` (each with ancestor, A and B text and a reason: `both-edited`, `emptied`,
  `no-ancestor`). Refusals are `structure`, `admin-both`, `system` and `size`, each with a plain message.
  Rows pair through `captureAnchors`' document order — the same walk edit recovery uses — and "prose"
  is the field split's whitelists, so the three features cannot disagree about either.
- `GET /api/lesson-bundle-versions/:id/combine-preview?with=:otherId` → `{ a, b, base, plan }`.
  401 unauthenticated; 400 for a missing/malformed/identical `with` or versions of different plans;
  404 for either version unreadable; 403 without editing access for the subject-grade. A refused
  combine is a 200 with `plan.ok: false`. Wire-tested (`tests/http/combinePreview.http.spec.ts`).
- Phase 3a replaces the original, lossy `sourceVersion` ancestor walk with delete-proof lineage
  (below). The preview remains read-only.
- `DROP_KEYS`/`SERVER_REL_KEYS` moved from `endpoints/versionEdit.ts` to `lib/versionContent.ts`
  (unchanged values), so the save no-op guard and the engine share one definition of content.

**Phase 3a — data and save support (2026-10-18), before the Combine screen.**

- `mergedFrom` is the optional second-parent relationship alongside `sourceVersion`. Both links may
  become null on later deletion. `lineage` is a native array of plain numeric ancestor ids, without
  foreign keys to those ancestors. Every creation path stamps the deduplicated union of both parents
  and their lineage; submitted lineage is never copied. Provenance is excluded from content equality
  and cannot bypass the no-op guard.
- Lineage retains the **newest 2,000 distinct ancestor ids per version**, ordered by serial id.
  Older ids are dropped rather than preventing future saves. A full window cannot prove complete
  ancestry, so preview conservatively uses two-way comparison when either input has a full window
  (even at the exact cap). It must not silently select an older common ancestor from partial history.
  Migration backfills surviving chains without changing content or timestamps, using the same window.
  Already-deleted links cannot be reconstructed. Cyclic legacy chains fail migration explicitly.
  Reapplying the migration retains recorded deleted ancestors within the bounded window.
- The common ancestor is the **highest numeric semver** among surviving, readable common ancestors
  in the same plan; ties use newest creation timestamp, then highest id. Semver is unique per plan,
  so the latter two are defensive. Both parents participate, including in histories with multiple
  common ancestors. When no common ancestor survives, the engine falls back to two-way comparison.
- `POST /:id/save-as-new` accepts optional multipart **`mergeParent`**, separate from `data`.
  An empty string is treated as absent, allowing an ordinary save. A non-empty value must name a
  different, existing, readable version of the same plan, and the caller needs current editing access. Invalid/self/cross-plan inputs are 400, missing/unreadable parents 404, insufficient
  editing access 403, unauthenticated requests 401. The server records provenance; it does **not**
  certify submitted prose as a correct combination or rerun the merge engine at save time.
- **A Combine save refuses `deleteSource=true` (400) and deletes neither parent.** The parent plan
  is locked and both parents re-read after waiting, coordinating with native version deletion.
  Existing field split, stale/no-op guards, semver retry, transaction rollback, recovery-token fencing
  and closing authority checks remain in force. Combining never moves the Official pointer.

**Phase 3b — screen and safe draft resumption (2026-10-18).**

- On a saved version, **Combine versions** appears only with editing access and at least two
  readable versions of the plan. The existing 640px editing-width rule applies. Save/discard an
  existing edit before starting a combination.
- Choose another version and **Review combination**. Automatic prose changes use the existing
  escaped restore diff; conflicts show both texts labelled by version. Refusals explain unreliable
  row correspondence, administrator changes on both sides, different uploads or size bounds.
  With no usable common version, every differing field requires a choice.
- **Continue in editor** explicitly switches to the engine-selected starting version, **URL included**,
  before applying its overlay. Existing drafts are offered before any overlay can replace them.
  The prose overlay is validated in full and applied to native form fields without the networked
  form-reset request. This starts an edit session, never an automatic numbered save.
- Conflict buttons are **Use {version}’s text** and **Write my own**. Custom text starts from the
  version being edited. Every conflict needs an explicit choice; choices remain changeable until
  saving. Both the Save handler and button block while any choice remains. The existing prose
  fields and custom textareas share Payload form state, so draft capture and Save see the same text.
- **Save as new version** sends the second parent separately from content. It offers no source
  deletion and saves Not Official; Official stays unchanged. The existing server authorization,
  field split, no-op check and recovery fencing remain authoritative.
- **Already included** is shown only when a conflict-free engine result, with its overlay applied,
  is content-identical to the descendant. An ancestry relationship alone is insufficient. Other
  combinations with no changes say **Nothing to combine.**
- An unfinished combination captures the bounded metadata described in §5. Restoring preserves
  captured prose, reruns preview and requires choices for conflicts missing from the saved resolved
  list. The comparison may have changed, so the screen asks the teacher to review remaining choices.
  A missing or unreadable second parent falls back to an ordinary draft with an explanation.
- Failed comparison loading after restoring prose and failed overlay application offer **Retry
  combination**. Retrying a restored comparison never reapplies or replaces the recovered text.
  Save remains blocked until comparison/choices are ready; Save as draft remains available.
- A save 404 alone does not identify a missing parent. Follow-up reads must confirm the editing
  source or other parent is unavailable. Only a confirmed missing second parent converts the live
  edit to an ordinary edit, explaining that its text is still on screen; unknown/failed probes keep
  both-parent provenance and allow another save attempt. Restoring an earlier ordinary draft explains
  that the newly selected combination was cancelled.
- If the editing source is deleted mid-session, Save explains the deletion and leaves the current
  text on screen for copying. **Its draft is deleted by the existing cascade and is not retained or
  recreated.** If only the other parent disappears, the text can continue as an ordinary draft.

The metadata and screen are separate commits in the same PR. Advanced draft rebasing onto another
version remains a later phase, alongside stable row identity and support for structural drafts.

---

## 7. Upload / import

- Accept only the definitive ARES JSON contract and create the first version as **1.0.0 Official**.
- **Clean contract cutover (2026-07-19):** `schemaVersion: "1.0.0"` is intentionally re-baselined to
  the new mandatory-`resourceLinks` shape because the old Lesson3 corpus was permanently deleted before
  replacement. There is no legacy compatibility mode or backfill: a former 1.0.0 file without
  `LESSONS[].resourceLinks` fails pre-flight. Any later contract change after this baseline is live must
  receive a new schema version.
- **Two entry points, both trusted:** (1) a **dev-only CLI** (`app/scripts/ingest.ts`, `payload run`) accepting `.js` and `.json`; and (2) a **Site-Administrator-only web upload** (`POST /api/lesson-plans/upload`, `.json` exports or `.zip` archives of JSON) — a Lesson3-owned collection endpoint + a self-hiding list-view panel. **Still never teacher-facing.** *(DEVIATION 2026-06-13 from the original "never an HTTP/upload surface" rule — see `docs/DECISIONS.md`. It is now safe because uploads are never executed: `.json` → `JSON.parse`; `.js` stays CLI-only. The web surface parses JSON only; ZIP archives are read in memory and never extracted to disk. Authorization is enforced server-side in the endpoint (`isSiteAdmin`), not just by hiding the button.)*
- **Extract `.js`/`.json` data to canonical JSON. Never `require()`/execute an uploaded `.js`** (arbitrary code execution). ARES's `extract_generator_data.py` is the model for safe extraction. The `.js` path (`app/src/ingest/extract.ts` → `extractAresData`) is a static **`acorn` AST parse that evaluates ONLY pure data literals** — strings/numbers/booleans/null/arrays/objects, plus **constant folding of `+` string concatenation** (the ARES `'a\n' + 'b\n'` multi-line-prose pattern; operands are themselves evaluated as literals, so nothing dynamic slips in) — and **rejects** anything executable or dynamic (a call, identifier reference, member access, non-`+` operator, template-with-expression, spread, getter, `__proto__` key). No `require`/`vm`/`eval`/`Function`. The `.json` path (`extractAresJson`) is `JSON.parse` (no execution surface) with matching structural guards (non-object root, recursive `__proto__` rejection, required groups). Both share the same downstream pipeline. Highest-risk surface → security-reviewed (re-review the web upload before exposing it).
- **Resolve `subjectGrade` by EXACT `(META.subject, META.grade)` match;** missing taxonomy is a hard, actionable failure. Upload/import never auto-creates Subjects/SubjectGrades (keeps that curated junction list clean). Seed taxonomy before uploading/importing.
- Create the Lesson Plan and version snapshot via Payload's Local API. The **CLI stays all-or-nothing**; bulk import supports a file or directory. **Web uploads accept JSON files and ZIP archives containing JSON, including nested folders, and import every valid file even when others are malformed** (amended 2026-10-11). Read-only pre-flight validates and resolves each file; invalid files are rejected individually, and the valid subset is written in one transaction. A database/write failure still rolls back that transaction. The response and UI report imported files with version/action, rejected files with reasons, and skipped non-JSON archive entries. If there are neither imports nor unchanged matches, the response is 422; otherwise it is 200, including an entirely unchanged upload. Limits (sized 2026-10-11 from a real export: 95 JSON files, 7.4 MB zipped, 33 MB expanded; archives of ~20 MB are expected): 500 JSON files and 200 MiB of expanded JSON across the request, 5 MiB per expanded JSON, 50 MiB per ZIP, and 1000 entries per ZIP, counted from the archive's actual directory records (never its declared count) before it is parsed. Inflation stops at the actual JSON byte limits. Archives are read one at a time and released. Archives that cannot be read are rejected individually; exceeding the combined JSON count or expanded budget rejects the request before writes.
- **Upload/import creates version 1.0.0 as Official.** Later edits create additional Not Official versions by default. Site Admins and matching Subject Admins can make any retained version Official; doing so only moves the official pointer and does not duplicate content.
- **Re-ingest of an existing sub-strand (decided 2026-07-04, refined 2026-07-05; implemented — `app/src/ingest/index.ts`).** A web upload whose content matches the latest saved version (highest numeric semver, Official or Not Official) is skipped and reported as unchanged. Comparison happens inside the subject-grade write lock and excludes storage-added row IDs, empty optional-field padding and derived row numbers; meaningful content and array order are preserved. The CLI retains its previous revision behavior. Otherwise, an upload whose **`(subjectGrade, META.substrand_id)`** matches an existing lesson plan attaches to that SAME plan as the **next MAJOR version** (a 1.x plan gets `2.0.0`, a 2.x plan gets `3.0.0`), arriving **Not Official**. It is a candidate for review: a Subject/Site Admin promotes it via **Make Official** when ready, so a re-upload never silently supersedes the live Official content, and the library keeps showing the current Official until promotion. All prior versions are retained (never overwritten); the plan `title` is **not** refreshed on re-ingest (it mirrors the Official content, which is unchanged until promotion). Pre-flight rejects a file when the key matches **more than one** existing plan (legacy duplicates — resolve first) or when **two files in one batch** target the same key. Web uploads reject every member of a duplicate group and import unrelated valid files; CLI pre-flight still rejects the whole batch. An **empty `META.substrand_id`** can't be matched, so it always creates a new plan.
- **Validate against the schema on upload/import, plus a generator-completeness gate (same rules as §5).** Schema-required fields are not sufficient — the generator dereferences groups the schema leaves optional. `validateGeneratable` (`app/src/ingest/validateGeneratable.ts`) requires: `META` present; each lesson has `slo`, `summaryTablePrompt`, a complete and valid `resourceLinks` map, and ≥1 framework phase; every `framework[].phase` ∈ the controlled vocabulary. Enforced before any version is saved; export then trusts validated-in data.
- **Resource handling (§3):** validate and store the already-resolved `LESSONS[].resourceLinks` exactly;
  do not run the recommender, infer missing buckets, or silently drop unknown/malformed resource fields.

---

## 8. Roles & authorization

- **Authority after waiting:** native user/plan updates and user/plan/version deletes acquire the
  shared administrator lock and relevant target/plan row lock before refreshing the caller and
  evaluating Payload access. This deliberately serializes those native mutations across plans;
  trusted `overrideAccess` writes retain their own authorization contract. A refresh rejects a
  missing, disabled or unverified account, or a revoked authenticated session, and uses current
  roles/assignments. Save-as-new and Make Official also recheck before committing their transaction;
  Save must still satisfy the current field split and any source-deletion permission. Failure rolls
  back the entire operation, including draft retirement and deletion cascades.
- **Open self-registration (decided 2026-07-09):** anyone may create an account from the login
  page's Sign up link (standard Payload create); new accounts are plain **Teachers** — the
  privileged fields (`roles`, `assignments`, `_verified`) are create-gated, and signups are
  rate-capped per address + site-globally. Password reset is Payload's native forgot/reset flow,
  emailed to the frontend `/reset-password` page. **Email verification (added 2026-07-09,
  Payload `auth.verify`):** a new account cannot sign in until the emailed link (frontend
  `/verify-email` page) is used; manual verify/unverify is a Site-Admin repair action. There is
  deliberately no resend endpoint in v1 — the signup caps bound abuse, and a lost email is a
  Site-Admin remedy. **Changing an account's email is Site-Admin-only** (verification happens
  only at create, so a self-service change would claim an unproven address); the verify
  endpoint is rate-capped site-globally.
- **First-user bootstrap (amended 2026-09-18):** an empty private/local installation presents a
  one-time setup form at `/login`. It uses Payload's native transactional `first-register` operation
  plus Lesson3's advisory-lock recheck: exactly one concurrent caller can become user #1, be
  automatically verified, receive `siteAdmin`, and be signed in without depending on outbound email.
  Ordinary anonymous `POST /api/users` is refused while the users table is empty, so a direct request
  or stale `/signup` page cannot strand an unverified first administrator. Once any user exists,
  first-register refuses further use and normal signup plus email verification resume.
  Public-posture startup refusal remains unchanged: an internet-facing empty installation must be
  deliberately bootstrapped before exposure.

| User type | Scope |
|---|---|
| Teacher | Global baseline — view/export; may additionally hold editing access for specific subject-grades |
| Subject Administrator | Per subject-grade (at most one) — structural + admin-only fields, mark official, grant and revoke **editing access** within that subject-grade, and **hand administration over** to one of that subject-grade's existing editors (see D6a below: they may not *remove* an administrator, their own row included) |
| Site Administrator | Global — everything, incl. user/role/taxonomy management |

- **Canonical user model (amended 2026-07-29; clarified 2026-08-17).** There are **three user types**:
  *Teacher*, *Subject-grade administrator*, and *Site administrator* (sentence case). **"Editor" is
  not a user type.** An `editor` assignment is a per-subject-grade *editing-access capability*, so a
  Teacher who holds one remains a **Teacher** and shows a separate **"Editing access: …"** scope line.
  The stored assignment value remains `'editor'` and the access functions continue to enforce it;
  retaining that internal identifier does not restore the retired account class. The accurate title
  *Subject-grade administrator* is used wherever the scope is not shown beside it (the grant is one
  subject-grade, not a whole subject).
- **Subject** = academic discipline only. **SubjectGrade** = subject + **integer** grade; the assignable unit roles attach to. Display as "Grade N". "Math Grade 4" and "Math Grade 5" are independent.
- Per-subject-grade scoping is expressed inside Payload access functions.
- Promoting a Subject Admin where one exists **auto-demotes** the prior holder to a Teacher with editing access for that subject-grade, in one transaction.
- ⚑ **D6a — appointing and vacating a Subject Administrator. ASYMMETRIC as of 2026-08-19; read the
  amendment below before the original rule, which it changes.**

  **The original rule (operator decision, 2026-08-16): only a Site Administrator may appoint or
  vacate a Subject Administrator.** A Subject Administrator manages **editing access** within their
  subject-grades and nothing above it — they may not appoint their successor. The earlier wording
  "manage scoped roles" did not disambiguate this, and the shipped code did not either:
  `enforceAssignmentScope` gated *which subject-grade* a touched row belonged to and never inspected
  the row's `role`, so a Subject Administrator could write a `subjectAdmin` row inside a grade they
  administered — and, through `autoDemotePriorSubjectAdmins`, demote themselves in the same write.
  "At most one per subject-grade" combined with "the incumbent chooses their replacement" is an
  unusual governance property for a role that also controls marking versions Official.
  **This is a server rule, not a UI one.** The guard lives in `enforceAssignmentScope` and covers
  every write path including the generic `PATCH /api/users/:id`; the routes
  (`/:id/{assign,unassign}-subject-admin`, both Site-Admin-only **until the amendment** — see below)
  assert it a second time so a caller gets an honest 403 on
  the route they used. Pinned in two places, deliberately — **three since the amendment, listed under
  it; do not read this sentence as the current inventory**: `tests/unit/enforceAssignmentScope.spec.ts`
  drives the hook directly for every branch (grant, revoke, role change, the narrowness case, and the
  system-cascade exemption), and `tests/http/userAssignments.http.spec.ts` proves the refusal over a
  real request on both the route and the generic PATCH. ⚑ The branch cases are NOT in the wire spec,
  and that is the point: they were, until an earlier test in the same file appointed a new
  administrator and — through `autoDemotePriorSubjectAdmins` — demoted the very account those
  assertions used as their caller, so the refusal came from collection access and the test passed
  with the guard deleted.
  **Forward-only.** An installation deployed before this guard may already hold `subjectAdmin` rows
  written by a Subject Administrator. The rule changes what is permitted from now on; it does not
  retroactively invalidate those grants and must not try to.
  **A Subject Administrator still SEES who administers their subject-grade** — scoped information
  they already effectively hold. Removing the control without showing the fact would leave them
  unable to answer a question they legitimately need answered; leaving the control while refusing the
  write would teach them the app is broken.

  ⚑ **AMENDED 2026-08-19 (operator decision): A SUBJECT ADMINISTRATOR MAY HAND ADMINISTRATION OVER,
  BUT MAY NOT TAKE IT AWAY.** The rule above is split around the mechanic it was built on:

  - **Adding** a `subjectAdmin` row is permitted inside a subject-grade the actor administers. Given
    ≤1 and the auto-demote cascade, that IS a handover: the actor loses the role in the same
    transaction. The action is append-only in form and self-demoting in effect, so it cannot be used
    to accumulate power — which is what made the original prohibition safe to relax.
  - **Removing** one stays Site-Admin-only, whoever the row belongs to. Nobody may eject an
    administrator, and nobody may resign by deleting their own row.
  - ⚑ **The successor must ALREADY hold editing access in that subject-grade.** This is the
    operator's blast-radius narrowing: a mis-click can only reach somebody already trusted with this
    subject-grade's content, and it makes a handover two deliberate steps (grant editing access, then
    promote) rather than one. Read from the target's rows as they stood **before** the write, so a
    single `PATCH` cannot grant both at once.

  **Why the relaxation, when the original reasoning still stands.** The concern was governance: "at
  most one per subject-grade" plus "the incumbent chooses their replacement" is unusual for a role
  that controls marking versions Official. What changed is the direction of the asymmetry, not the
  concern. An administrator leaving a school can now hand their subject-grade to a colleague without
  a Site Administrator in the loop, while nobody can be *stripped* of the role except by a Site
  Administrator — so the failure mode the original rule prevented (an administrator being displaced
  by someone at their own level) is still prevented. A Site Administrator remains the only route
  back: a handover cannot be undone by the person who made it.

  ⚑ **Provenance, added with the amendment (operator decision 2026-08-19).** Every `assignments` row
  now carries system-written `grantedBy` / `grantedAt`. The audit query recorded for D6a "cannot
  distinguish a legitimate Site-Admin grant from a self-appointment", because the data did not carry
  the answer; a handover is irreversible to the person making it, so "who did this, and when" needs
  an answer in the data rather than in someone's memory. On **every** row, not just `subjectAdmin`
  ones — editing-access grants are the more frequent audit question and the migration costs the same.
  Nullable with no backfill: a row that predates this knows nothing about its own origin, and a null
  means *unknown*, never *nobody*. ⚑ It is scoped to the **life of the row** — revoke an assignment
  and the record of who granted it goes with it, so the question is answerable only while the
  assignment stands. Answering it afterwards would need an append-only grant log, deliberately not
  built.

  **Where the amended rule is pinned** (the sentence above about the branch cases still applies):
  `tests/unit/enforceAssignmentScope.spec.ts` for every branch, `tests/int/subjectAdminHandover.int.spec.ts`
  for the cases needing a database including the demote cascade, and
  `tests/http/userAssignments.http.spec.ts` at the wire in **both** directions — the permitted route
  handover, the refusal to delete one's own row, and a three-step sequence in which the identical
  generic `PATCH` is refused, then permitted once the target gains editing access, which is what
  identifies *which* rule a 403 came from now that there are two.

  **In the UI:** a Subject Administrator gets the fact, one control over it (hand over to an existing
  editor, with a confirmation naming the self-demotion and that only a Site Administrator can give it
  back), and **no remove control**. Where the subject-grade has no editors yet, the panel says how to
  proceed rather than showing nothing — silence produces the same "the app is broken" reading as a
  refused click.
- `class` is a reserved keyword — the entity is always **SubjectGrade**.
- **Email privacy:** non–Site-Admins never see other users' email addresses; attribution shows username.
- **Amended 2026-08-02 — one carve-out, for granting editing access.** A **Subject Administrator**
  sees the email addresses of the users listed in **Manage → Roles & Access** (named *Editing access*
  until 2026-08-18) for their *own*
  subject-grades: both the current editing-access holders and the candidates in the grant picker.
  Operator decision.
  **Rationale:** granting editing access is an authorization decision, and a display name is not an
  identifier — two teachers can share one, so a name-only picker lets an administrator grant edit
  rights over a subject's content to the wrong person, with no way to notice. The address is the
  only identifier the system already holds. Withholding it made the *privacy* rule safe at the cost
  of making the *authorization* act unsafe.
  **Bounds — this is a carve-out, not a repeal.** `emailReadAccess` (the `users.email` field access)
  is UNCHANGED: still Site-Admin-or-self, so the REST/Local API and every other surface keep hiding
  addresses from Subject Admins. The carve-out is delivered by a trusted server-side projection in
  the Manage view only. Teachers without an administrative role see no part of this section.
  ⚑ **State the exposure honestly: the grant picker necessarily lists the WHOLE roster.** An earlier
  draft of this clause said the carve-out "reaches only the subject-grades that administrator already
  administers." That is true of the *current editing-access holders* list, and FALSE of the
  *candidates* list: to
  grant access you must be able to pick anyone, so `addable` is every non-Site-Admin user with no
  assignment in that subject-grade — effectively every teacher in the system. A Subject Administrator
  therefore sees **every non-Site-Admin user's address**, not only those of people in their subjects.
  That is inherent to a grant picker rather than an implementation choice, but it is a materially
  wider exposure than the sentence it replaced implied, and it is the thing to revisit if this is
  ever narrowed (a search-as-you-type picker that resolves addresses only for a chosen candidate
  would bound it). Site-Admin addresses are excluded because site admins are not grantable.
  See `docs/DECISIONS.md` 2026-08-02.
- **User directory (amended 2026-07-02, with messaging):** every authenticated user may read the
  roster of user **display names** — messaging's user picker requires it (§10 "any user may message
  any user"). This deliberately relaxes the earlier self-only read tightening (2026-07-01) at the
  collection level ONLY: emails stay owner/Site-Admin-visible and roles/assignments stay
  field-hidden from non-admins, and server-side authorization decisions that depend on admin-only
  fields keep using trusted server projections, never client-visible data (DECISIONS 2026-07-02).

---

## 9. Generation, export & sharing

- Export any version, Official or Not Official, as **DOCX** (every document it has) and **PDF**, via the embedded generator.
- Print, save-as-PDF/DOCX, and email-as-attachment are in scope. **PDF, email-out, and message links/attachments are confirmed in scope** (see §10): a lesson artifact is referenced by **(version, document, kind)** where `kind` is `docx | pdf` — a stable, access-gated, version-pinned URL (generation is content-stable, so it resolves deterministically). There is a **single document layout** (the earlier standard/compact "layout"/`format` axis was removed 2026-07-03): one five-column framework table, no separate Resource column, with the stored ARES video/reading links rendered inline beneath the phase label. Only the deliverable `kind` varies. Email attaches freshly-generated bytes; messages link the URL. Persisting/caching artifacts is a later optimization, not required first (generate-on-demand behind stable URLs avoids reintroducing a media/storage layer).
- ⚑ **A PHONE OFFERS NO WORD *DOWNLOAD* (≤640px, operator decision 2026-08-29).** Neither the
  per-document pill nor the `.zip`. Word by **email** is unaffected at every width, as is every
  format on every larger screen. Reading and printing are the PDF's job; the only reason to want the
  `.docx` over the PDF is to edit it, and editing it in a phone's Word app forks the document away
  from the system — no version, no Official pointer, no provenance — which is what §0's
  "edit the data, never the document" exists to prevent. **This is progressive disclosure, NOT an
  authorization boundary** (the same framing §5 applies to the ≤640px editing rule): the endpoints are
  unchanged and no handler gets a viewport check. ⚑ It is drawn on WIDTH and must stay so — Windows
  tablets are in real use and must keep the `.docx`, and they report a coarse pointer, so a
  `pointer: coarse` query would hide it on exactly those devices. Reasoning: DECISIONS 2026-08-29.
- **PDF = convert the generated DOCX, never a parallel renderer** (one source of layout truth — the same rule that limits the mammoth view to a *content* preview). A semantic converter (Pandoc, HTML→PDF) reinterprets layout and would not match the approved DOCX, so it is disqualified for the exact artifact.
- **PDF converter — DECIDED AND SHIPPED (this bullet said "OPEN decision… decide by fidelity test" until 2026-08-21).** The engine is **Gotenberg wrapping headless LibreOffice**, in a sidecar container, called behind the swappable `docxToPdf(buffer)` seam (`src/generator/docxToPdf.ts`). The 2026-06-14 constraints it had to meet are unchanged and were met: **faithful**, **free**, **fully offline / no cloud**, self-hostable. ⚑ The golden-file fidelity test this bullet promised as the deciding mechanism was **never the acceptance route and no longer exists** — `scripts/pdf-fidelity-check.ts` was retired 2026-07-20 because its Word-vs-LibreOffice methodology had already been abandoned and its parser was broken (DECISIONS 2026-07-20).
- ⚑ **THE OPERATIONAL LIMITS OF THAT CHOICE (measured 2026-08-21).** They are LibreOffice's limits plus the caps deliberately placed around it, and they are written here because every one of them is invisible until it bites:
  - **Throughput is CPU-bound and roughly two conversions at a time, by design.** `cpus: 2.0`, `mem_limit: 1024m` on the sidecar; `PREVIEW_PDF_MAX_CONCURRENT` = 2 for the synchronous editor path (`lib/conversionLimit.ts`) and `JOBS_AUTORUN_LIMIT` = 2 for the queued export path. Each conversion is multi-second. Rate is capped separately (`previewPdf` = 10/min/user).
  - **Timeouts are matched on purpose:** the sidecar's `--api-timeout=120s` and the client's `GOTENBERG_TIMEOUT_MS` (default 120 000). The queued path retries; the synchronous preview does not — it 503s.
  - ⚑ **THERE IS NO AUTOMATED PDF FIDELITY GATE.** DOCX is the authoritative layout deliverable and PDF is a faithful-but-unverified derivative, so a PDF-only regression is caught by eye. This matters because **PDF is what most teachers open** — it is the anonymous public download format, and the teacher-facing default is served inline.
  - **Fidelity depends on fonts, and the server's fonts affect ONLY the PDF.** A DOCX merely *references* Arial and renders correctly in Word on any machine that has it; the conversion is the only place the server's own fonts matter. Stock LibreOffice substitutes Liberation Sans for Arial, whose vertical metrics shifted **table row heights** versus Word — hence the local Gotenberg build with real Microsoft core fonts (`gotenberg/Dockerfile`).
  - **The sidecar image cannot be built offline, and cannot be freely redistributed with the fonts in it.** The font installer downloads Microsoft's cab files at build time under an EULA that forbids vendoring them; the supply-chain pins fail loudly (by design) when Debian moves, and re-pinning needs network. See `docs/NEXT-SESSION.md` for the packaging consequences.
  - **Single point of failure, and the cache is what makes public serving cheap.** If the sidecar is down every PDF path throws `PdfConversionError`. Official versions are pre-warmed into the artifact cache on becoming Official, so public downloads should be **cache hits, not conversions** — and `ARTIFACT_CACHE_MAX_BYTES` (default 512 MB, holding both kinds per version) is therefore a capacity decision, not a tuning knob: once it thrashes, a cheap path silently becomes an expensive one with no code change.
  - ⚑ **`lib/conversionLimit.ts` is an IN-PROCESS counter.** The day the online tier runs two app containers, the concurrency cap becomes 2-per-instance rather than 2 overall; a shared (Postgres-lease) bound is noted there as an unbuilt follow-up.
- Generation can take seconds for large bundles — run it without blocking the UI and show progress; stream/queue as appropriate on the chosen host.
- **Per-document serving + pre-warm (teacher-first track, 2026-07-08).** Besides the whole-export
  .zip, each deliverable is individually downloadable at its (version, document, kind) URL
  (`GET /:id/export/doc?doc=<tag>&as=docx|pdf`), served from the artifact cache: **PDF inline**
  (opens in the browser — the teacher-facing default), DOCX as attachment. When a version becomes
  Official (make-official or first ingest), both kinds are **pre-warmed** into the cache via the
  Jobs Queue, so teachers effectively read stored official PDFs/DOCX; the cache stays a disposable
  optimization, never a storage layer of record.
- **Public artifacts (direction decided 2026-08-12; launch corpus/licence still open):** public
  discovery may serve a generator-derived online preview and PDF for a deliberately public Lesson
  Plan's **current Official** version. This is a narrow public route, not anonymous read access to
  `lesson-bundle-versions`; non-Official versions are never public. Anonymous PDF requests are
  serve-only from pre-warmed artifacts and must not become an unbounded Gotenberg trigger. **PDF is
  the only anonymous download format. Word/DOCX requires an authenticated account because it is the
  editable artifact.** Public UI omission is not the access boundary: every public artifact handler
  must reject DOCX server-side. Favorites, editing, internal messaging and version history also
  remain authenticated. See `docs/DESIGN-public-library.md`.

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
  Specific-version links keep a server-generated label after version or lesson deletion and show
  "this version is no longer available" without substituting the Official version. Whole-lesson
  links carry no version label and retain their existing behaviour. A reply identifies its original
  message; the server verifies the caller is its recipient, chooses the original sender as the reply
  recipient, and copies the reference, including an unavailable-version label. Browser labels are
  ignored. Migration backfills labels only where a referenced version survives; older references
  already cleared by deletion cannot be distinguished from whole-lesson links.
- **Discussions** — a forum for existing signed-in users, with chronological replies, title-only search,
  saved-version references, and a blue unread dot for contributors and authors of versions referenced
  by a new topic. Posts cannot be edited. Site Administrators can pin topics, irreversibly redact
  titles or posts, and delete whole threads. Manage → System provides a password-confirmed off switch;
  while off, only Site Administrator reading, redaction and deletion remain. Design and release order:
  `docs/DESIGN-discussions-2026-10-09.md` §16.
- **Favorites** (per user, **per version**, with role-split semantics — teacher-first T4,
  2026-07-08): for users with edit rights on the subject-grade a favorite **pins that snapshot**
  (decided 2026-07-06); for everyone else the star **follows the plan's current Official** — the
  row is re-pointed when the pointer moves (and so survives promote-and-delete-previous). Design
  in DECISIONS "version browser design" + "T4 build notes".
- **Translation** (e.g. Swahili) and **AI features** (summaries, etc.) — server-side outbound
  services behind endpoints/jobs, rate-limited (§11); AI uses the current Claude API/models.

---

## 11. Operations

- **Error tracking / observability** (e.g. Sentry) — **required before PUBLIC exposure; optional on a
  trusted-LAN local installation** (amended 2026-09-01). The original wording said "required before real
  users", which read as a blanket prerequisite and would have made every school install non-compliant
  while the capability sat deliberately off. It splits by posture, the way backups and `SERVER_URL` do:
  a school server on a trusted LAN has Docker's JSON logs, plus the push heartbeat **if the operator has
  configured one** (§11 below — it is optional setup, not automatic), and shipping error data off-box is
  a governance decision there, not a default. On an internet-facing host it is required.
  ⚑ **No backend is adopted today** — self-hosted GlitchTip rejected (shared failure domain with the app
  it watches), hosted Sentry deferred (external data flow). `docs/OPS.md` → "Error tracking" is canonical
  for the state and the reasoning.
- **Automated, encrypted backups** (Postgres dumps); snapshot before migrations. **Encryption and
  retention are constant; the destination varies by deployment (amended 2026-08-20).**
  - **Internet-connected installations: off-site**, to a remote object store — today `age` +
    `rclone` to Google Drive, GFS retention (`scripts/backup-db.sh`, `docs/OPS.md`).
  - **Offline installations (ARES schools, no internet): a rotated removable drive.** `rclone`'s local
    backend means `BACKUP_RCLONE_REMOTE` may be a mounted path, so encryption, GFS retention and
    pruning are unchanged — only the destination differs. Backups here are **occasional rather than
    nightly**, because they depend on a person.
  - ⚑ **"Off-site" is a property of the drive's LOCATION, not of the backup.** A thumb drive left in
    the server is not a backup against fire or theft — the guarantee comes from **rotation**, which is
    a human process the school must own. Say so plainly rather than implying the file is safe because
    it was written.
  - ⚑ **A missing drive must FAIL, never silently succeed.** Writing to an unmounted `/media/...` path
    creates a directory on the root filesystem instead: backups appear to work, go nowhere, and fill
    the boot disk. The destination mount must be backed by a different device from `/` **and**
    carry a regular, non-symlink sentinel before any dump is written; its mount identity must remain
    stable through upload.
  - ⚑ **Backup monitoring cannot be a healthcheck ping offline.** "Did the backup run?" needs a local
    answer — surfaced in the **Manage → System** panel as last-success time and destination. (Renamed
    from "Installation" 2026-08-21; the panel's design is `docs/DESIGN-system-panel-2026-08-21.md`.)
    **Built 2026-08-21:** `scripts/backup-db.sh` atomically replaces `out/ops/backup-status.json` only after
    `rclone copyto` succeeds; the app receives `out/` read-only and reports the UTC time, stream/type,
    actual destination, filename and encrypted size. A failed upload cannot advance the record, and a
    missing/malformed record is `Unknown`, never evidence that no remote backup exists. This is the row
    that proves the rule the rest of that half follows — facts are **read-only**, not necessarily
    *computed*; recorded operational state is allowed, but never operator-authored on this screen.
  - ⚑ **DECIDED 2026-08-22 — TWO RECIPIENTS. Key custody had made an OFFLINE school unable to restore
    its own backups.** The rule below is deliberate and works for an internet-connected deployment: the
    ciphertext can travel to wherever the identity is held, which is exactly how the 2026-08-22 drill
    passed. An **offline** school has no equivalent move. Their server dies; they hold a rotated USB
    drive of correct encrypted dumps; the only thing that can read them is at ARES, and there is no
    network to carry either the key to them or the drive to ARES. Recovery becomes a physical shipping
    problem, during an outage, for a school that has just lost its lesson plans. Three candidate
    answers, none obviously right and none chosen:
      1. **Per-school identity, sealed offline** — printed or on a USB in the head teacher's safe. The
         school can recover alone; the risk custody was protecting against (a stolen server yielding
         readable backups) partly returns, though a safe is not the server.
      2. **Two recipients** — encrypt to ARES *and* the school, so either can decrypt. `age` supports
         multiple recipients natively, so this is a one-line change to `backup-db.sh`, and it keeps
         ARES's copy working while giving the school independence.
      3. **Accept it and say so** — offline recovery requires ARES involvement, written into the
         deployment plan and the school's expectations rather than discovered during a crisis.
    ⚑ **The operator chose (2), two recipients, on 2026-08-22 and it is BUILT.** `BACKUP_AGE_RECIPIENT`
    (ARES) plus an optional `BACKUP_AGE_RECIPIENT_SCHOOL`; `backup-db.sh` passes both to `age` and
    either identity decrypts independently, so no key is ever shared. Manage → System reports which
    state an installation is in ("Backup recovery"). Two properties worth keeping in mind:
      - **Forward-only.** `age` cannot retro-encrypt what is already uploaded, so backups written before
        the school's key was configured remain readable only by ARES. The panel row says so explicitly.
      - **A duplicate is refused.** The same key in both variables would look two-recipient and grant
        nobody new the ability to decrypt; the script dies rather than shipping that illusion.
    ⚑ This DOES reduce the guarantee below — a school now holds an identity that can read its own
    backups, so a stolen school box plus a stolen safe is a different risk than before. That was the
    accepted trade: an offline school unable to recover its own data is the worse failure.
  - **Key custody: schools hold only the `age` PUBLIC key; ARES retains the private identity.** A
    school has nowhere durable to keep a private key, and losing it makes every backup unrecoverable.
    This also keeps a stolen school box from yielding readable backups.
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

- Manage calls the subject/grade setup area Subjects and grades, and retains at most two accordion
  levels. Under Lesson plans, Upload comes first, Delete a plan (all versions) removes selected plans
  and all their versions, and Delete individual versions handles administrators' non-Official-version
  cleanup. Set an Official version comes last, visible to Site administrators only when a plan has
  no Official version selected. Before upload, explain that a matching subject and subject grade
  must already exist and match the lesson file. Teachers retain My saved versions.
  System shows Features before Installation status. Existing panel ids and deep links remain stable.

- Login and the Guide footer show the installed application version, supplied automatically by the
  release image. Source deployments identify an exact release tag or their commit; local development
  shows "Development build". An unlabelled production build shows "Version unavailable". Both pages
  share the display component.

- Desktop is the primary interface for the current audience. Phone layout fixes must preserve
  desktop usability and be checked at desktop widths as well as on phones.

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
- **Shared computers are the deployment norm (confirmed 2026-07-20).** Teachers overwhelmingly work
  on shared school machines. Two standing consequences:
  1. **Never persist user content client-side** (`localStorage`, `sessionStorage`, IndexedDB). Such
     data outlives logout inside the browser profile and is readable by the next person at that
     machine; namespacing by user id prevents an accidental *restore*, not *exposure*.
  2. **Session expiry stays, and must clear the screen.** The walk-away case is the normal case, and
     the next person at the keyboard may be a student rather than a colleague — so the 2-hour token
     and `admin.autoRefresh: off` are deliberate, and an indefinitely self-refreshing session is
     explicitly rejected. Durability of unsaved work is solved by server-side **edit recovery** (§5),
     never by weakening expiry.
     ⚑ **Known gap (recorded 2026-10-09):** only the admin surface clears the screen at expiry
     (`IdleLogout`). Frontend pages, including the Messages composer and the planned Discussions composer,
     do not yet. This is a frontend-wide follow-up, and when fixed it applies to every frontend page alike.
     No frontend page holds an exception to it (`docs/DESIGN-discussions-2026-10-09.md` §16.1).
- **Reserved words — a name that already means something else is a bug, not a preference.** `class`
  is reserved: the entity is always `SubjectGrade`. **`draft` means a private, unnumbered draft**
  (edit recovery's user-facing name, decided 2026-10-17, §5) and never a numbered version; a version
  is never called a draft. Before naming a new concept,
  grep the frontend and the Guide for the word: a label that asserts something the code does not mean
  spends other people's attention, exactly like a stale docstring.
- **Payload-first.** Before adding any new custom endpoint, editor, permission layer, workflow,
  or persistence code, first check whether Payload already provides it — through collection
  config, access control, field/collection hooks, versions/drafts, admin config, the Jobs Queue,
  or the Local API. Build custom only when Payload genuinely cannot; when you do, **document the
  specific gap** in a code comment and/or `docs/DECISIONS.md`. The point is to keep the system
  leaning on Payload's tested machinery rather than re-implementing it.
- Document any deviation from this spec here.
