# Editor usability batch — plan (2026-07-25)

Source: a round of **user/reviewer comments** on the live editor (test.kenyalessons.org), relayed by the
operator, who agrees with all of them. Revised after a **GPT review** of the first draft, which
contributed three substantive corrections (all verified against installed source — see §1).

Everything here is **app-level with no migration**. The one schema-adjacent item (field
`label`/`description` changes) regenerates `payload-types.ts` only.

The operator's stated priority is **the current-lesson indicator**. Do that first.

Goal, in one line: the editor should read as a **guided teaching tool, not a database admin form**.

---

## 1. Grounding — verified facts

Read before touching anything. Everything below was checked against installed source or the repo, not
recalled. Several comments are cheaper than they look; three are more constrained than the first draft
assumed.

| Fact | Where | Consequence |
|---|---|---|
| The wordy grammar sentence exists **once**, as `GRAMMAR_HINT`, stamped onto ~40 fields by `prose()`/`proseAdmin()` | `src/fields/bundleFields.ts:12` | De-duplicating is a one-line change, not 40 edits |
| `META`/`UNIT`/`LESSONS`/`SLO`/… are Payload **`label`** values; `name` is the schema key | `src/fields/lessonContent.ts` | Renaming touches **no DB, no migration, no generator input**. Labels don't appear in `payload-types.ts`; **descriptions do** (as JSDoc) |
| SPEC §5 asks us to "invest in clear field **labels and descriptions**" | `SPEC.md` §5 | The renaming is spec-endorsed, not cosmetic drift |
| SPEC §5 mandates **two fidelity tiers** of preview | `SPEC.md` §5 | Removing the fast preview would require a SPEC amendment |
| **Quick preview renders all three deliverables in ONE page** (Lesson Sequence + Final Explanation + Summary Table); the PDF path is per-`?doc`, **one document at a time** | `src/generator/previewBundle.ts:38-40` vs `endpoints/previewVersion.ts` | ⚑ A functional difference, not just speed: quick preview is the **only whole-plan view**. Strengthens the case for keeping it |
| SPEC §4: content fields are plain strings; **no inline markup** is parsed; all styling comes from the generator | `SPEC.md` §4, `CLAUDE.md` | Bold/italic/underline **cannot** be added in Lesson3 |
| The numbered lesson chip bar **already exists** — sticky on desktop, deep-linkable (`?lesson=n`), and it already expands a collapsed row before scrolling | `src/components/LessonControls/EditJumpNav.tsx` | The priority request is an **active-state enhancement to working code** |
| ⚑ **Below 640px the editor toolbar is deliberately NOT sticky** — `.doc-controls { position: static }`, because a tall sticky block pinned itself over the Title field | `src/app/(payload)/custom.scss:878-888` (#99 item ①) | **The chip bar does not float on phones.** The indicator is a desktop feature. Do **not** re-enable mobile sticky — that was a deliberate fix |
| ⚑⚑ **For array rows, `initCollapsed` is the LAST of three fallbacks** — and is skipped entirely once a preferences entry exists: `if (previousRow && 'collapsed' in previousRow) return previousRow.collapsed;` → `if (collapsedPrefs !== undefined) return collapsedPrefs.includes(row.id);` → `return field.admin.initCollapsed` | `@payloadcms/ui/dist/forms/fieldSchemasToFormState/isRowCollapsed.js` (whole file); prefs are written by `fields/Array/index.js:194,217`. Same shape for `collapsible` at `fields/Collapsible/index.js:93-103` | **Stronger than "the user's toggles are remembered."** The existence check is `collapsedPrefs !== undefined`, then membership is by `row.id` — so once *any* prefs entry exists for that array path, `initCollapsed` is **inert** and every unlisted row renders **expanded**. See §3b — this may mean the collapse default never reaches existing users at all |
| `initCollapsed` exists on `array`, `collapsible`, `blocks` — **not on `group`** | payload@3.85.1 `dist/fields/config/types.d.ts` | Collapsing the top-level groups needs `collapsible` wrappers → **deferred**, see §7 |
| Unsaved PDF preview of a 12-lesson plan is **~5.5–10 s** (LibreOffice floor, not being engineered around); DOCX gen alone ~1.7 s | `docs/NEXT-SESSION.md` item 1 | The fast preview earns its place on **cost** as well as scope |
| The HTML preview page is script-free under `default-src 'none'`, opened via `target=_blank` | `src/endpoints/previewShared.ts:92` | `window.close()` / `history.back()` are both unavailable |
| `META`/`UNIT` are wrapped in `adminOnly()` → `structureCondition` → `isSubjectAdminFor` = Site Admin **or** Subject Admin for this subject-grade | `src/fields/lessonContent.ts:90`, `src/access/index.ts:42` | **An Editor should not see "META."** The reporter was almost certainly an admin — browser-verify all three roles (§6) |

---

## 2. Verdicts

| # | Comment | Verdict | PR |
|---|---|---|---|
| 8 | Current-position indicator | **Strongly accept. First change.** | 1 |
| 6 | Collapse content by default | Accept — **row-based arrays only** | 1 |
| 1 | Hide Details by default | Accept — **via CSS, not state** | 2 |
| 6 | Remove repeated technical instructions | **Strongly accept** | 2 |
| 2, 3 | Replace `META`, `UNIT`, `SLO` | Accept **at the display-label layer** | 2 |
| 4 | Explain bold/italic/underline | Say plainly it is unsupported. **Don't fake formatting** | 2 + upstream |
| 5 | Remove the quick preview | **Keep both, rename by purpose** — operator decision (§5) | 3 |
| 7 | Back buttons on preview/PDF | Fix the confusion, **but not with a literal Back link** (§5) | 3 |

---

## 3. PR 1 — current-position indicator

### 3a. Active section tracking in `EditJumpNav`

- Active chip: blue background, white text, via `var(--app-accent)` (`src/app/app-tokens.scss`).
  **Never hardcode `#1f5fa8`** — that drift was single-sourced once already (DECISIONS 2026-07-18).
  White on `--app-accent` is ≈7.5:1.
- `aria-current="location"` on the active chip — the correct token for position within an in-page
  navigation set (preferred over a bare `aria-current`).
- **Clicking a chip highlights it immediately** — don't wait for the scroll pass to catch up.
- **Keyboard focus wins while typing.** `document.activeElement.closest('[id^="lessons-row-"]')`
  answers "which lesson am I working on" more accurately than scroll position. Scroll position is the
  fallback for reading.
- **Track Final Explanation and Summary Table too.** When either is in view, highlight *that* link —
  do not leave the last lesson highlighted. This was a real gap in the first draft.
- ~~**Bring the active chip into view** when the chip row overflows horizontally.~~ **DROPPED during
  implementation — the condition cannot occur.** `.lesson-controls__nav` is `flex-wrap: wrap` with no
  `overflow-x` anywhere in `custom.scss`, so chips wrap onto a second line and are always visible. The
  right-edge fade from #99 item ③ is on the *frontend lesson page's* `.doc-nav`, a different stylesheet
  — both the first draft and the GPT review misattributed it to the editor. No scroll-into-view code was
  written; it would have been dead code, and `scrollIntoView` on a chip risks yanking the page
  vertically mid-scroll.

Implementation constraints, all from verified behaviour:

- **Use a passive, rAF-throttled `scroll` listener PLUS a body `ResizeObserver`.** ⚠ An earlier draft
  of this plan said "use an `IntersectionObserver`, not a scroll handler". **That was wrong and the
  first implementation shipped the bug** (caught in review): IO fires when an element enters or leaves
  the root band, but this rule turns on a section's TOP crossing the toolbar line, and a row taller than
  the band stays continuously intersecting while its top crosses — so the callback never fires at the
  moment the answer changes. The half of that reasoning which *was* right: scroll alone goes stale,
  because the form lazy-renders and its height grows for seconds after load (`scrollToField` already
  re-pins on a 150 ms interval for the same reason). Hence both signals — "position changed" and
  "position changed without scrolling".
- **Measure the toolbar height; don't hardcode the offset.** The bar's height changes with wrapping,
  and `custom.scss` already derives `scroll-margin-top` from it. Re-measure on every pass rather than
  caching: with no observer geometry to keep in step, that is both simpler and always current. The
  effect itself only rebuilds when the lesson list changes (reactive to Subject-Admin add/remove).
- **Scroll-spy rule: "the last section whose header crossed the top,"** not "the section currently
  intersecting" — necessary because 3b makes rows short headers, so many are on screen at once.
- **Preserve the existing deep-link (`?lesson=n`) and lazy-render settling behaviour.** Don't refactor
  `scrollToField`; add alongside it.

**Known limitation to record, not fix:** on phones the toolbar is static by design, so the chip bar
scrolls away and the indicator only helps while it is on screen. A separate compact mobile lesson bar
is a deliberate design exercise, not a bolt-on — see §7.

**"Lesson 3 of 8" text readout — optional, decide after the prototype.** The chips already carry
`aria-label="Lesson 3: Osmosis"`, so combined with `aria-current` the accessible story is adequate
without it. Build the highlight first; add the text only if the browser prototype still feels
ambiguous.

**Tests:** extract the pure picker — `pickCurrentSection(rects) → index` — and unit-test it: rows
above/below the fold, a collapsed short-header run, an empty list, the FE/ST handoff, and the boundary
where a header crosses the top. Component-test the `--current` class and `aria-current`. Precedent:
`tests/unit/lessonControlsSsr.spec.tsx`.

### 3b. Collapse array rows by default

`admin: { initCollapsed: true }` on `lessons`, `framework`, `finalExplanation.sections`,
`finalExplanation.rubric`, `summaryTable.lessons`.

Collapsed rows stay navigable — the shared `RowLabel` already renders `"Lesson 3 — Osmosis"`.

⚑⚑ **`initCollapsed` may not reach existing users at all — settle this before building 3b.**
Per `isRowCollapsed.js` (§1), array rows resolve collapse in three tiers: in-session form state →
stored preferences → `initCollapsed`. The preferences tier is gated on `collapsedPrefs !== undefined`
and then tested by `collapsedPrefs.includes(row.id)`. So once a preferences entry exists for that array
path — for *any* reason, even listing unrelated rows — `initCollapsed` is never consulted, and every row
not explicitly in the list renders **expanded**.

Consequence: 3b could ship, pass a clean test on a fresh account, and **do nothing for the very users
who complained**, because they have opened this editor before. Verify the real blast radius on the Rock
before assuming the one-line change is sufficient.

**DECIDED (operator, 2026-07-25): clear the stored collapse preferences.** The objection to this —
that it discards arrangements teachers deliberately built — does not apply: the operator confirms all
current stored state comes from **test edits only**, with nothing worth carrying into the final product.
So clear it and let everyone land on the new default.

**Built SURGICAL rather than wholesale** (review, 2026-07-25). The first draft deleted whole preference
documents, which the disposable-test-data decision authorised — but the script and its OPS runbook
outlive that assumption, and "clear the collapse preferences" is more precisely what the surgical form
does. It strips only `value.fields[*].collapsed`, so it stays correct and safe to re-run after go-live.
The post-go-live caveat below is therefore now moot.

### 3c. Clearing the stored collapse preferences

Verified mechanism:
- Preferences live in Payload's built-in **`payload-preferences`** collection (`key` is a queryable
  string, `value` is JSON — `src/payload-types.ts` → `PayloadPreference`).
- The per-document key format is **`collection-${slug}-${id}`**
  (`@payloadcms/ui/dist/providers/DocumentInfo/index.js:134`), so ours are
  `collection-lesson-bundle-versions-<versionId>`.
- Collapse state sits at `value.fields[<arrayPath>].collapsed` — the exact array `isRowCollapsed` reads.

So the operation is: find `payload-preferences` rows whose `key` starts with
`collection-lesson-bundle-versions-`, **strip `value.fields[*].collapsed` from each, and write it
back** — leaving every other stored preference intact. Removing the key (rather than emptying the
array) is the point: `isRowCollapsed` gates on `collapsedPrefs !== undefined`, so an EMPTY array still
suppresses `initCollapsed`. Only an absent value restores the fallback. The transform is
`scripts/lib/stripCollapsed.ts` (pure, unit-tested); the script wraps it in the find/update loop.

**Do it as a one-off script (`scripts/`), not a migration.** Reasons: it is ephemeral UI state, not
schema; it is naturally **idempotent** (a second run finds nothing left to strip) and harmless to re-run;
and a migration would drag this otherwise app-level batch onto the heavier schema-change runbook
(backup → generate/review/apply → DB gates) for no benefit. There is existing `scripts/` precedent
(`prune-db.sh`, `backup-db.sh`) and `docs/OPS.md` is the place to document the procedure. If you would
rather have it tracked in `payload_migrations`, that is a defensible alternative — but then update §6,
which currently states no migration is expected.

Two notes for whoever runs it:
- **List-view preferences are a different key** and are untouched — this does not reset saved columns
  or sort order.
- **New preferences will accumulate again** as soon as anyone toggles a row. That is intended: collapsed
  is the initial default, and the UI then respects the user's own choice.
- ⚑ **The same trap returns after go-live.** Once real teachers have accumulated preferences, any future
  `initCollapsed` change is inert for them too — so keep this script. Being surgical, it remains correct
  and safe to run then, with no data-is-disposable assumption attached.

**Tradeoff, accepted knowingly:** collapsed rows break browser Ctrl-F across the form. That is the
argument for shipping 3a in the same PR — the chip bar becomes the navigation that replaces it.

---

## 4. PR 2 — calm, plain-language editor

### 4a. Remove the repeated grammar sentence

Delete `GRAMMAR_HINT` from the `prose()`/`proseAdmin()` descriptions in `src/fields/bundleFields.ts`.
Keep the factories (they carry `canEditProse` and the whitelist contract) and the file's header comment
(developer-facing). **Keep field-specific descriptions that convey unique information** — only the
repeated generic paragraph goes.

Replace it with **one** accessible **Instructions** / "How editing works" modal in the toolbar, reusing
`components/Modal` (it already has a focus trap, added 2026-07-18). Content:

- Saving creates a new version. The original stays unchanged.
- Press Enter for a new paragraph.
- Start a line with `- ` to make a bullet.
- Text styling — bold, italics, underline — isn't supported.
- Quick preview checks content; Formatted PDF shows the final layout.

Also shorten the collection description at `src/collections/LessonBundleVersions.ts:54`.

**Bullet-toggle button: deferred** (SPEC §5 floats the idea). It isn't needed to satisfy this feedback
and would enlarge the first batch. Note for whoever picks it up: implement it as a **per-textarea
affordance**, not a global toolbar button — that sidesteps the "coordinate one control with ~40
textareas" problem entirely.

### 4b. Teacher-facing labels

Labels only — never `name`.

| Current | Recommended |
|---|---|
| `META` | Document settings |
| `UNIT` | Sub-strand overview |
| `LESSONS` | Lessons |
| `SLO` | Specific learning outcomes |
| `FINAL EXPLANATION` | Final explanation |
| `SUMMARY TABLE` | Summary table |
| `Summary-table prompt (for the Lesson Sequence)` | Lesson summary prompts |
| `Purpose in storyline` | Purpose in the storyline |
| `ARES keywords` | **Keep as-is** |

"Specific learning outcomes" over "Learning objectives": it expands the acronym while preserving
established CBE terminology. **Keep "ARES keywords"** unless we verify they function as generic search
keywords — renaming a domain concept to something friendlier but less accurate is a net loss.

`sep` and `pcis` already spell themselves out ("Science & Engineering Practices", "Pertinent &
Contemporary Issues (PCIs)") — the pattern is established; this finishes it.

### 4c. The bold/italic answer

This cannot be solved by instructions, because the feature does not exist. Adding it would need a
coordinated change across the canonical data grammar, Payload field representation, the **vendored ARES
generator** (byte-pristine at a pinned commit), validation/ingest, DOCX fidelity tests, and existing
lesson data. That is a separate upstream/product project.

Say plainly in the Instructions modal and `/guide` that text styling isn't supported. Teachers can write
`IMPORTANT:` or `NOTE:` — but note honestly that **those words print in the final document**.

Keep the two needs separate:
- *"in the final document for everyone"* → **upstream ARES request.** Log in `docs/EXTERNAL-DEPENDENCIES.md`.
- *"a private reminder so I don't forget"* → a **personal editor-notes** feature. Nothing like it exists,
  and anything in a content field prints. Needs a SPEC §5 conversation. **Do not improvise it inside
  printable lesson content.**

### 4d. Hide Details by default — in CSS

`detailsShown` starts `true` (`src/components/LessonControls/index.tsx:91`) and the body class is applied
in an **effect**, so flipping only the `useState` produces a visible "sidebar flashes, then disappears"
on every load.

Instead: make the sidebar hidden by **collection-scoped CSS** by default, and add a `details-shown`
class only when the user presses **Show details**. Keep it per-page, not persisted. Clean first paint,
and it preserves the existing hydration discipline (no SSR/first-paint disagreement).

---

## 5. PR 3 — preview clarity

### 5a. Keep both tiers, renamed by purpose

**Operator decision, 2026-07-25 (explicitly confirmed when asked):** keep both, rename by purpose.
This is also what SPEC §5 requires, so removal would need a spec amendment.

- **Quick preview** — real DOCX from the working copy → mammoth → simplified HTML. Content and table
  structure, final styling dropped, **all three documents in one page**, ~1.7 s.
- **Formatted PDF** — real DOCX → LibreOffice/Gotenberg. Final layout, **one document at a time**,
  ~5.5–10 s unsaved.

Wording should make the PDF clearly the final-layout check, but **Save stays the primary toolbar
action** — "PDF primary" means primary *between the two preview controls*, nothing more.

Revisit after the PDF-latency work (`NEXT-SESSION` item 1) is deployed **and measured**. If quick
preview is dropped then, amend SPEC §5 and remove **only the toolbar affordance** first — do not delete
the proven backend preview path, which the teacher lesson page also depends on.

### 5b. New-tab confusion — do NOT add a literal Back link

⚑ **Correction to the first draft.** It proposed a back-link in the preview page. That is a work-loss
hazard: the link navigates the *preview* tab to the lesson page, so the user now has the editor with
unsaved edits in tab 1 and a saved-data view in tab 2. Clicking Edit there opens a **second editor from
saved data** while the real edits sit in the other tab — and unsaved work loss is already the known #1
data-integrity risk (SPEC §5 working drafts). A literal Back button is also structurally wrong: a new
tab has no useful history, and the PDF is rendered by the browser's native viewer where we cannot add
controls at all.

Do this instead:

- Label the controls explicitly: **`Quick preview ↗`** and **`Formatted PDF ↗`**.
- Accessible labels include "opens in a new tab".
- Change the PDF preparing state from "Preparing document…" to
  **"Preparing document… This opens in a new tab. Close that tab to return to your edits."**
- Add a banner to the HTML preview page:
  **"This preview opened in a new tab. Close this tab to return to your edits."**
- **No custom PDF wrapper page.** It would fight the strict CSP and fails outright for the unsaved path,
  which is a one-shot POST response with no addressable URL.

This addresses exactly what the reviewer experienced — *"I didn't realize a new page opened for me"* —
while keeping the unsaved work in the original tab untouched.

---

## 6. Verification (CLAUDE.md: evidence, not assertion)

Every PR: `tsc` clean, `test:unit` green, lint with no *new* errors (the repo carries ~87 pre-existing
warnings — don't let them mask new ones), CI `gate` green. `main` is **protected**: PR required for
everything including docs. Each PR updates `docs/DECISIONS.md` and `docs/NEXT-SESSION.md`.

**No migration should be generated anywhere in this batch.** If one appears, stop — something touched
`name`, not `label`. (The §3c preferences clear is a one-off `scripts/` data operation, not a migration —
it touches no schema.)

Regenerate `payload-types.ts` after PR 2 (descriptions are JSDoc'd into it). Expect a few
**string-pinned tests** to need updating — that is the tests working, not noise.

**`/guide` and `USER_GUIDE.md` move in the same PR.** Guide drift has been caught in review here before
(DECISIONS 2026-07-18); do not defer it.

⚠ **Browser verification of PR 1 is still OUTSTANDING.** PR 1 is MERGED and LIVE on the Rock (`5cfd4eb`,
2026-07-27), and the preference clear has run there — so the feature is on screen and checkable now. It
could not be verified locally (2026-07-25): Postgres came up fine, but `next dev` hangs during **node's own bootstrap**
(`LoadEnvironment` → `ExecuteBootstrapper`, ~0% CPU, port never binds) under both node 25 and a pinned
node 22, so no app was reachable. Not an app defect — nothing app-level had executed yet. Do this on a
host where the stack runs, or post-deploy on the Rock.

What it needs (there is no lesson corpus in the repo — the 42 ARES files live outside it):
- A version with **≥8 lessons whose prose is long enough that one EXPANDED lesson exceeds the
  viewport**. That is the exact shape the IntersectionObserver bug needed, and no shorter fixture
  reproduces it. `tests/helpers/fixtures.ts` → `minimalBundleContent()` / `minimalStoredResourceLinks()`
  is the shortcut to a bundle that passes `validateGeneratable`.
- **Scroll-spy:** expand two adjacent lessons, scroll slowly through them, confirm the chip advances as
  each header passes under the toolbar and never sticks on the previous lesson.
- **The nested-collapsible fix:** jump to an ALREADY-OPEN lesson → it must only scroll, not expand a
  phase row. Jump to Final Explanation → must not expand a section row.
- **Focus-beats-scroll:** click into a field in lesson 5 while lesson 3 is under the toolbar; chip 5 wins.

**Role-based browser verification — all three roles, desktop and 390px:**
- **Editor:** sees no `META`/`UNIT` group at all.
- **Subject Admin:** sees **Document settings** and **Sub-strand overview**.
- **Site Admin:** retains every repair field.
- Jumping to a collapsed lesson still expands it; the FE/ST chips still work.
- Mobile: no reintroduced sticky-toolbar overlap of the Title field.

⚑ **Two verification traps:**
1. **`initCollapsed` goes inert once a preferences entry exists** (§1, §3b). Verify 3b **both ways**: on
   a fresh account (proves the default works) *and* on an account that has previously opened the editor
   (proves what real users will actually see). Testing only the fresh account will report success on a
   change that does nothing in production. Then verify the §3c clear actually worked — re-open the editor
   on the previously-used account and confirm rows now land collapsed.
2. **Role-gated surfaces have previously been "verified" under the wrong role** (DECISIONS 2026-07-13).
   Log in as each role; do not infer.

**PR 3 specifically:** quick preview and PDF both contain unsaved edits; popup-blocked failures still
surface inline in the toolbar (not as a raw JSON tab); preview CSP stays strict; authorization, rate
limits and PDF concurrency limits all unchanged.

---

## 7. Deferred, and open questions

**Deferred out of this batch, deliberately:**
- **`collapsible` wrappers around the top-level groups.** `initCollapsed` doesn't exist on `group`, so
  this needs unnamed `collapsible` wrappers. They'd preserve every data path (unnamed collapsibles hoist
  their `fields`), but they add nested-toggle complexity and duplicate-label risk, and they **break the
  Final Explanation / Summary Table jump chips**: `scrollToField` expands a collapsed target with
  `el.querySelector('.collapsible--collapsed .collapsible__toggle')`, which searches *inside* the
  target — once the group sits inside a collapsed wrapper the blocker is an **ancestor** and the chips
  silently stop working. Fixing that means teaching `scrollToField` to walk
  `el.closest('.collapsible--collapsed')`, expanding outermost-first. Not worth it: collapsed lesson rows
  plus the hidden sidebar remove most of the intimidation with far less machinery.
- **Bullet-toggle button** (§4a) — per-textarea design when picked up.
- **Compact mobile lesson bar** — a real design exercise; the current static-toolbar decision stands.
- **Working drafts** (`docs/DESIGN-working-drafts.md`) — the only confirmed silent work-loss path, a
  multi-session project. Do not fold in.
- **PDF-latency work** (`NEXT-SESSION` item 1) — needs a deploy. Gates the §5a revisit.

**Open questions to resolve, not guess:**
1. **Which role reported seeing "META"?** Statically an Editor cannot (§1). Operator was unsure. If a
   genuine Editor saw it, that is a **bug to chase before** any cosmetic work.
2. **Are answer keys Subject-Admin-only to _see_, or only to _edit_?** SPEC §5's heading is "Field-level
   **edit** permissions", and `adminOnly()` is a form `condition` — presentation only, with the
   field-split hook as the write-time authority. A Payload `condition` hides a field in the UI but the
   value still reaches the client, so `sections[].exemplar` and `rubric[*]` are likely readable by an
   Editor via the API today. That may be entirely intended (Editors are trusted teachers). Flagged to be
   **decided**, not asserted as a defect — and adjacent to this batch, not part of it.
