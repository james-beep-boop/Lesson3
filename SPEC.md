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

**Generates up to three documents per bundle:** `*_CBE_LessonSequence.docx`, `*_FinalExplanation.docx`, `*_SummaryTable.docx` (plus PDF). All regenerate from the one bundle.

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
- **No inline markup** is parsed (`**bold**`, `*italic*`, `>`, `#` render literally). All styling, tables, colours, and numbering are applied by the generator, never from content.
- The required lesson-level **ARES resource links** are read from stored `resourceLinks` (see §3) and
  rendered beneath the phase label inside Section C's first cell. There is no separate Resource column,
  no live Python/SQLite lookup, and no user-editable resource field.
- **`framework[].phase` is a controlled vocabulary** — phase names drive colour-coding and resource lookup; an unknown phase silently degrades output. Phase is a fixed dropdown, never free text.
- **Document attribution (decided in principle 2026-08-12):** every Lesson Sequence, Final
  Explanation and Summary Table should carry a visible creator credit and permanent website URL on
  every page, inherited by PDF from DOCX. Implement this once in the upstream ARES generator and
  re-vendor; do not inject a PDF-only overlay or store repeated credit prose in lesson content. Exact
  ARES/Seavuria relationship wording and the permanent printed URL remain to be confirmed. Any such
  change increments `GENERATOR_RENDER_VERSION` and reruns the DOCX/PDF fidelity and pagination gates.

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

### Editing surface — a wider-screen affordance; 640px or narrower is view-only (decided 2026-07-28)

Lesson-content editing is offered only at **viewport width > 640px** (i.e. blocked **at 640px or narrower**). The primary editing surface is inexpensive Kenyan laptops (**1280×800 is common and must stay editable even when the window is not maximised**); tablets are secondary; **phones are explicitly not an editing device** — the framework table and a ~3350px lesson body do not fit, and keeping phone editing would mean owning unbuilt mobile-reflow work indefinitely. At 640px or narrower the lesson page's **Edit** button, the version editor's **Edit / Save / Cancel**, and the `?edit=1` deep-link intent are all unavailable, replaced by a short *notice* that names the remedy (rotate / widen / larger screen) so the absence is explained, not read as a bug or a lost role.
- **This is progressive disclosure, NOT an authorization boundary.** Viewport is not a device class: a landscape phone or "request desktop site" clears 640px, and that is fine — bypassing it just yields the cramped editor. Server-side RBAC is untouched and **no endpoint gets a viewport check**. The notice names *screen space*, not a device, for the same reason (a split-screen tablet can be blocked; a landscape phone can pass).
- **Everything else stays at every width:** viewing, both previews, downloads/exports, Share, email, messaging, favorites, version history, **Make Official**, **Delete** ("editing needs room, deleting does not"), user administration incl. promote/demote, guide, auth. The boundary is the lesson-content editor, not `/admin`.
- **Behaviour:** at 640px or narrower, **new edit intent is neutralised on initial load** (a mount-time JS guard; needed because `?edit=1` seeds `editing` during SSR, so CSS alone can't decide the mode without a hydration mismatch). **An edit session already underway is not cancelled when the viewport is resized** — the guard evaluates once on load, never on resize, so a user who narrows the window mid-edit keeps Save/Cancel. The CSS button↔notice swap is cosmetic; the guard is what decides edit mode.

### Field-level edit permissions (maps directly to Payload field access control)
- **Teacher with editing access for the subject-grade:** prose values — `slo.*`, `overview`, `framework[].{learnerExperience, teacherMoves, sensemakingStrategy, formativeAssessment}`, `teacherReflection`, `summaryTablePrompt.*`, `SUMMARY_TABLE.lessons[].{observed, learned, explained}`, lesson `title`, `FINAL_EXPLANATION.instructions`, `sections[].prompt`.
- **Subject Admin only:** `META.*` (except the identity fields below), `aresKeywords`, `framework[].phase`, `duration`, structural changes (add/remove/reorder lessons & phases), and **assessment answer keys** — `sections[].exemplar`, `rubric[*]`.
- **Site Admin only (amended 2026-07-05):** `META.subject`, `META.grade`, `META.substrand_id` — corruption-repair fields, not curation. Subject/grade only label the printed document (the plan's `subjectGrade` relationship is the categorization truth, fixed at ingest), and `substrand_id` is the re-ingest matching key (§7) — a wrong edit silently redirects future re-uploads. A Subject Admin's submitted values are preserved from the source (`hooks/fieldSplit.ts`); the fields render read-only for them.
- **System (never editable):** `LESSONS[].resourceLinks`; `LESSONS[].number` (set by order).

> **Vocabulary note.** Editing is a *capability*, not a user type. It is presented as **"editing
> access"** granted to a Teacher, never as an "Editor" account. The stored `editor` assignment value
> is an implementation identifier retained for compatibility; it does not define a fourth type.

### Unsaved-work durability — edit recovery (amended 2026-07-20; reconciled 2026-08-05)

**Invariant: a teacher's in-progress edits must survive session expiry, browser crash, forced
refresh, device sleep and accidental tab close.** This is a product guarantee, not a nicety.

It is not currently met. There are **two distinct expiry paths, with different failures**: Payload's
own `forceLogOutTimeout` navigates via a *programmatic* `router.replace()` and its dirty-form guard
intercepts only `beforeunload` and link clicks — so the editor unmounts and unsaved work is destroyed
with no prompt and no recovery copy. Our `IdleLogout` calls `logOut()`, which does **not** navigate,
leaving a *zombie editor*: work on screen, session dead, saves 401ing, and the previous teacher's
content visible to the next person at a shared machine. Both must be fixed; neither is fixed by
"stop unmounting" (see the clearing rule below). Verified against installed `@payloadcms/ui` 3.85.1;
full design in `docs/DESIGN-working-drafts.md`.

**Vocabulary — "draft" is reserved and must not be used for this feature.** In this product a
*draft* already means an unofficial **saved version**, and the live evidence is the Guide, which
defines the word for users in as many words: "Your drafts live in Manage → **My saved versions**".
Calling a recovery capture a "draft" would tell a teacher their version had been saved when it has
not. The feature is **edit recovery**; the collection is `edit-recovery`; the UI says **"Unsaved
changes backed up · <when>"**. Same class of reserved-word rule as `class` → `SubjectGrade` (§13).
*(A `Draft` status pill also exists in `LibraryBrowser.tsx`, but it is dead code — catalogue rows are
built with `status: 'published'` hardcoded, and Official/Not-Official became bold status text rather
than pills. It is not evidence for this rule; it is a latent second collision if `status` ever goes
dynamic.)*

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

- Accept only the definitive ARES JSON contract and create the first version as **1.0.0 Official**.
- **Clean contract cutover (2026-07-19):** `schemaVersion: "1.0.0"` is intentionally re-baselined to
  the new mandatory-`resourceLinks` shape because the old Lesson3 corpus was permanently deleted before
  replacement. There is no legacy compatibility mode or backfill: a former 1.0.0 file without
  `LESSONS[].resourceLinks` fails pre-flight. Any later contract change after this baseline is live must
  receive a new schema version.
- **Two entry points, both trusted:** (1) a **dev-only CLI** (`app/scripts/ingest.ts`, `payload run`) accepting `.js` and `.json`; and (2) a **Site-Administrator-only web upload** (`POST /api/lesson-plans/upload`, `.json` only) — a Lesson3-owned collection endpoint + a self-hiding list-view panel. **Still never teacher-facing.** *(DEVIATION 2026-06-13 from the original "never an HTTP/upload surface" rule — see `docs/DECISIONS.md`. It is now safe because uploads are never executed: `.json` → `JSON.parse`; `.js` stays CLI-only. The web surface is JSON-only to keep the attack surface minimal. Authorization is enforced server-side in the endpoint (`isSiteAdmin`), not just by hiding the button.)*
- **Extract `.js`/`.json` data to canonical JSON. Never `require()`/execute an uploaded `.js`** (arbitrary code execution). ARES's `extract_generator_data.py` is the model for safe extraction. The `.js` path (`app/src/ingest/extract.ts` → `extractAresData`) is a static **`acorn` AST parse that evaluates ONLY pure data literals** — strings/numbers/booleans/null/arrays/objects, plus **constant folding of `+` string concatenation** (the ARES `'a\n' + 'b\n'` multi-line-prose pattern; operands are themselves evaluated as literals, so nothing dynamic slips in) — and **rejects** anything executable or dynamic (a call, identifier reference, member access, non-`+` operator, template-with-expression, spread, getter, `__proto__` key). No `require`/`vm`/`eval`/`Function`. The `.json` path (`extractAresJson`) is `JSON.parse` (no execution surface) with matching structural guards (non-object root, recursive `__proto__` rejection, required groups). Both share the same downstream pipeline. Highest-risk surface → security-reviewed (re-review the web upload before exposing it).
- **Resolve `subjectGrade` by EXACT `(META.subject, META.grade)` match;** missing taxonomy is a hard, actionable failure. Upload/import never auto-creates Subjects/SubjectGrades (keeps that curated junction list clean). Seed taxonomy before uploading/importing.
- Create the Lesson Plan and version snapshot via Payload's Local API **in one all-or-nothing transaction**; bulk import supported (point at a file or directory). A read-only **pre-flight** validates+resolves every file first and reports all problems before any write.
- **Upload/import creates version 1.0.0 as Official.** Later edits create additional Not Official versions by default. Site Admins and matching Subject Admins can make any retained version Official; doing so only moves the official pointer and does not duplicate content.
- **Re-ingest of an existing sub-strand (decided 2026-07-04, refined 2026-07-05; implemented — `app/src/ingest/index.ts`).** An upload whose **`(subjectGrade, META.substrand_id)`** matches an existing lesson plan attaches to that SAME plan as the **next MAJOR version** (a 1.x plan gets `2.0.0`, a 2.x plan gets `3.0.0`), arriving **Not Official**. It is a candidate for review: a Subject/Site Admin promotes it via **Make Official** when ready, so a re-upload never silently supersedes the live Official content, and the library keeps showing the current Official until promotion. All prior versions are retained (never overwritten); the plan `title` is **not** refreshed on re-ingest (it mirrors the Official content, which is unchanged until promotion). Pre-flight fails (actionably, all-or-nothing) when the key matches **more than one** existing plan (legacy duplicates — resolve first) or when **two files in one batch** target the same key. An **empty `META.substrand_id`** can't be matched, so it always creates a new plan.
- **Validate against the schema on upload/import, plus a generator-completeness gate (same rules as §5).** Schema-required fields are not sufficient — the generator dereferences groups the schema leaves optional. `validateGeneratable` (`app/src/ingest/validateGeneratable.ts`) requires: `META` present; each lesson has `slo`, `summaryTablePrompt`, a complete and valid `resourceLinks` map, and ≥1 framework phase; every `framework[].phase` ∈ the controlled vocabulary. Enforced before any version is saved; export then trusts validated-in data.
- **Resource handling (§3):** validate and store the already-resolved `LESSONS[].resourceLinks` exactly;
  do not run the recommender, infer missing buckets, or silently drop unknown/malformed resource fields.

---

## 8. Roles & authorization

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

- Export any version, Official or Not Official, as **DOCX** (all three documents) and **PDF**, via the embedded generator.
- Print, save-as-PDF/DOCX, and email-as-attachment are in scope. **PDF, email-out, and message links/attachments are confirmed in scope** (see §10): a lesson artifact is referenced by **(version, document, kind)** where `kind` is `docx | pdf` — a stable, access-gated, version-pinned URL (generation is content-stable, so it resolves deterministically). There is a **single document layout** (the earlier standard/compact "layout"/`format` axis was removed 2026-07-03): one five-column framework table, no separate Resource column, with the stored ARES video/reading links rendered inline beneath the phase label. Only the deliverable `kind` varies. Email attaches freshly-generated bytes; messages link the URL. Persisting/caching artifacts is a later optimization, not required first (generate-on-demand behind stable URLs avoids reintroducing a media/storage layer).
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
- **Favorites** (per user, **per version**, with role-split semantics — teacher-first T4,
  2026-07-08): for users with edit rights on the subject-grade a favorite **pins that snapshot**
  (decided 2026-07-06); for everyone else the star **follows the plan's current Official** — the
  row is re-pointed when the pointer moves (and so survives promote-and-delete-previous). Design
  in DECISIONS "version browser design" + "T4 build notes".
- **Translation** (e.g. Swahili) and **AI features** (summaries, etc.) — server-side outbound
  services behind endpoints/jobs, rate-limited (§11); AI uses the current Claude API/models.

---

## 11. Operations

- **Error tracking / observability** (e.g. Sentry) — required before real users.
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
    the boot disk. The destination must be verified as a non-root, separately backed mount **and**
    carry a regular, non-symlink sentinel before any dump is written; its mount identity must remain
    stable through upload.
  - ⚑ **Backup monitoring cannot be a healthcheck ping offline.** "Did the backup run?" needs a local
    answer — surfaced in the **Manage → System** panel as last-success time and destination. (Renamed
    from "Installation" 2026-08-21; the panel's design is `docs/DESIGN-system-panel-2026-08-21.md`.)
    **Built 2026-08-21:** `scripts/backup-db.sh` atomically replaces `out/backup-status.json` only after
    `rclone copyto` succeeds; the app receives `out/` read-only and reports the UTC time, stream/type,
    actual destination, filename and encrypted size. A failed upload cannot advance the record, and a
    missing/malformed record is `Unknown`, never evidence that no remote backup exists. This is the row
    that proves the rule the rest of that half follows — facts are **read-only**, not necessarily
    *computed*; recorded operational state is allowed, but never operator-authored on this screen.
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
- **Reserved words — a name that already means something else is a bug, not a preference.** `class`
  is reserved: the entity is always `SubjectGrade`. **`draft` is reserved** for an unofficial *saved
  version* — the Guide tells users "your drafts live in Manage → My saved versions" — so
  the unsaved-work feature is **edit recovery**, never "drafts" (§5). Before naming a new concept,
  grep the frontend and the Guide for the word: a label that asserts something the code does not mean
  spends other people's attention, exactly like a stale docstring.
- **Payload-first.** Before adding any new custom endpoint, editor, permission layer, workflow,
  or persistence code, first check whether Payload already provides it — through collection
  config, access control, field/collection hooks, versions/drafts, admin config, the Jobs Queue,
  or the Local API. Build custom only when Payload genuinely cannot; when you do, **document the
  specific gap** in a code comment and/or `docs/DECISIONS.md`. The point is to keep the system
  leaning on Payload's tested machinery rather than re-implementing it.
- Document any deviation from this spec here.
