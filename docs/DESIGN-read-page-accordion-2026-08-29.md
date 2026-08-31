# Read-page accordion — plan (2026-08-29)

Source: an **operator structural proposal**, made after living with the version editor's collapsible
panels. The observation that started it, in the operator's words: these plans are *"very very unwieldy
fully expanded; these collapsing accordions allow you to view everything easily"*, and the accordion
*"really provides navigation function, and it's better because instead of a tiny button it's a full
sentence."*

**Status: DEFERRED, nothing written.** Recorded so the reasoning is not re-derived. Everything below
was checked against source or measured in a browser on 2026-08-29 — the ⚑ items are the ones that
changed the shape of the plan.

Goal in one line: **the read page should open as a table of contents, not a wall of document.**

---

## 1. The original proposal, and what survived it

The operator proposed eliminating three things, on the grounds that the editor's accordion already does
the job better:

| Proposed for removal | Verdict | Why |
|---|---|---|
| The read view (`/lessons/[id]`) | **No** | It is the only surface most users can reach. See §2. |
| Quick preview | **No, but** | Not redundant with the accordion; the real duplication is elsewhere. See §3. |
| The floating jump nav | **Yes, eventually** | Strongest case, but sequence it after the accordion. See §8. |

What replaced it: **do not move teachers to the editor — move the accordion to the read page.** Same
UX win, no authorization change, and the public library gets it for free.

## 2. ⚑ Grounding — the fact that decides §1

| Fact | Where | Consequence |
|---|---|---|
| **`/admin` is gated to editing-access holders, Subject Admins and Site Admins** — *"admin-panel access is gated … not teachers"* | `collections/Users.ts:57` | Teachers, the default and largest class, **cannot see the editor's accordion at all**. Deleting the read view would remove the product for ~95% of users (the teacher-first lock's own figure). |
| "Request editing access" already exists and messages the right admins server-side, roster names-only, 1/day per subject-grade | `lessons/[id]/page.tsx:170`, `RequestEditingButton.tsx` | The proposal's "greyed-out Edit with a dialog" is already built, and better: a live control offering the next action beats a dead one explaining why it is dead. |
| Edit / Quick preview / Editing help are already behind `canEdit` | `lessons/[id]/page.tsx` | A non-editing teacher already sees only Favourite, Back, Request editing access, Share ▾. |
| The planned public-read slice resolves into the same DOCX-derived reading surface | `docs/DESIGN-public-library.md` §Public-content boundary | Improving the read page now also improves the later public lesson page; today's `/explore` remains a placeholder and links nowhere yet. |

## 3. Quick preview is not a worse accordion

The accordion shows **form fields**; Quick preview shows the **rendered document**. The POST variant
renders the *unsaved working copy*, overlaid on the stored version and run through the field-split
hook, so an editor can see changes before saving. It is also the *fast* one — "Formatted PDF" is the
real DOCX→PDF through Gotenberg, rate- and concurrency-limited.

⚑ **The real duplication is between the read view and Quick preview**, which render through the *same*
path (`previewBundle` → `htmlSectionsCache`) into two subtly different shells. Consolidating those is
the available simplification, and it removes code without removing capability. That is a separate,
later change (§9).

## 4. ⚑ THE SUBSTRATE FINDING — this is what sizes the work

**The read page does not have thirteen sections. It has three.**

- `docxToSections` emits exactly `LESSON_SEQUENCE` / `FINAL_EXPLANATION` / `SUMMARY_TABLE`
  (`generator/previewBundle.ts:42`).
- All thirteen lessons live inside the first one, as mammoth-converted DOCX: a flat run of `<table>`
  elements where a lesson begins at a table containing
  `<p><strong>LESSON n (40 min): title</strong></p>` (`lib/lessonAnchors.ts` header, pinned by
  `tests/unit/lessonAnchors.spec.ts`).

So there are two versions of this change:

- **Cheap** — wrap the three sections in disclosures. ~1 hour. Collapsed, the reader sees "Lesson
  Sequence / Final Explanation / Summary Table". **Does not deliver the table of contents**, so it is
  not the ask.
- **Real** — partition the Lesson Sequence HTML at lesson boundaries, so each lesson is its own
  disclosure titled with its own header. This is the one worth doing.

The real version extends a technique already in the tree: `annotateSections` is *already* a per-request
string transform over that HTML, matching that exact `LESSON n` shape to inject `id="lesson-n"`, and
`lessonAnchors.spec.ts` already pins mammoth's output so a generator bump fails fast. We go from "find
the boundaries and inject an id" to "find the boundaries and split there" — same detection, same guard.

## 5. ⚑ Why the read page is DOCX-derived, and must stay so

Asked directly by the operator: *"Why did we generate anything from docx? Seems to me that everything
from JSON would be easier and more consistent."* It would be easier. It is disqualified anyway.

The read page is not showing *the data*; it is showing *the document you are about to print*, converted
to HTML. SPEC §5 (and `SPEC.md:567`) require one source of layout truth: **convert the generated DOCX,
never a parallel renderer.**

- **Two renderers must agree forever.** They would drift, and the failure mode is a teacher reading one
  thing on screen and printing another — noticed only in front of a class.
- **The generator is not ours.** It is ARES's vendored `cbe-generation-system`. When ARES changes
  `sections.js`, the DOCX-derived view follows for free; a JSON renderer would have to chase every
  change, and would fail *silently* when it did not.

⚑ **The editor is not a counter-example.** It renders fields from JSON, but never claims to be the
document — nobody mistakes a textarea for a printed page. The rule forbids a second thing that
*pretends to be the document*.

## 6. Decisions taken

1. **Fully collapsed on entry** (operator, 2026-08-29). The first draft of this plan argued for
   expanded-with-collapse-all, on the grounds that a reader came to read. The operator's counter is
   better and was adopted: *"It allows the reader to see what the entire lesson plan is all about, by
   seeing all of the names of the lessons in sequence by their titles right up front."* The collapsed
   state **is** the table of contents.
2. **Native `<details>/<summary>`** on the read page. Server-rendered, zero JS, free keyboard support,
   find-in-page expansion in most browsers, print-controllable.
3. **Visual consistency across surfaces; three mechanisms.** See §7.
4. **The version-history gate is untouched.** The 2026-07-08 teacher-first lock §4 — the versions UI
   (chip, panel, Compare) renders only for someone with editing access or administration on that
   subject-grade, and a plain Teacher is shown the Official and nothing else — is orthogonal to this
   change and stays. (That entry uses the label of the day; read it per `CLAUDE.md`'s vocabulary rule.) Note the
   distinction it actually draws: teachers are **not** barred from other versions (`?version=` renders
   for them — *"Official is just the default + trust marker, not an access gate"*); they are simply
   never *offered* them. Version multiplicity is an authoring concern.

## 7. ⚑ Why there will be three collapsible implementations

The operator's preference is reuse, so this is stated plainly rather than buried:

| Surface | Mechanism | Why it cannot be the others |
|---|---|---|
| Version editor | Payload's `Collapsible` field | We do not own it; replacing it means replacing Payload's field rendering. |
| Manage | `components/Manage/Accordion.tsx` | Needs URL-mirrored state against a **closed id vocabulary**, role gating, and no-unmount-on-close to protect in-progress form state. |
| Read page | native `<details>` | Needs **zero JS**, server rendering, find-in-page and print control. Lesson ids are dynamic, not a closed vocabulary. |

Reusing Manage's accordion here would mean generalising `panelState.ts` away from its closed id
vocabulary — which its own docblock calls load-bearing — to serve dynamic ids, and turning a
server-rendered page into a client-JS one. That is damage to a working design, and *more* code: an
adapter plus three implementations under it.

**What IS shared: the stylesheet.** One visual language — header row, chevron, borders, spacing, focus
ring — so a reader cannot tell three mechanisms apart. Make that an explicit requirement of the change.

## 8. One product question settled; three implementation requirements remain

Answer these before writing code; each has bitten this codebase already.

1. **Anchors into collapsed content.** The page has `#lesson-3` anchors and a `.doc-nav` linking to
   them. Both an in-page click and an inbound bookmark must open the target — **on load and on click**.
   ⚑ This is the exact class of defect that produced #310 and #314's predecessor; decide it, do not
   discover it.
2. ✅ **Find-in-page — settled 2026-08-30.** The collapsed state is the table of contents. Searching
   or scanning the visible lesson titles is the required navigation; a teacher opens the relevant
   lesson and can then search within it. Firefox not auto-expanding closed `<details>` for a hidden
   full-text match is accepted and is not a release blocker.
3. **Print.** There are **no print styles at all** in `styles.css` today. Ctrl+P currently yields the
   whole plan; after this it would yield three headings. `@media print` is not optional here.
4. **Consistency vs three mechanisms.** §7. Decide whether the shared-stylesheet answer is enough.

## 9. Scope

**In:** partition Lesson Sequence per lesson; render the three document sections and the per-lesson
chunks as `<details>`, collapsed by default; hash-open behaviour on load and click; print styles; keep
`.doc-nav` for now.

**Out:** removing either jump nav (§10); the compare page; the read-view/Quick-preview renderer
consolidation (§3); anything touching the version-history gate (§6.4).

**Tests:** extend `lessonAnchors.spec.ts` for partitioning, including zero-lesson and malformed-header
cases; an e2e for collapsed-on-load, anchor-opens-target, and an inbound `#lesson-3`.

**Sequencing:** ship the accordion with the nav still present, live with it, then decide the nav's
fate. Doing both at once means a complaint cannot be attributed to either.

## 10. The jump navs

If the collapsed list is navigation — full titles beating numbered chips — then both navs become
removable: `EditJumpNav.tsx` (391 lines) plus `currentSection.ts` (119) in the editor, and the read
page's own `.doc-nav`.

⚑ **One residual difference, named so it is not discovered later: the nav is STICKY.** Deep inside an
expanded lesson 9, the nav is one click to lesson 2; the accordion means scrolling back up. Three ways
out — accept the scroll (collapsed neighbours make it short), make the disclosure headers sticky, or
keep one nav. Decide after living with the accordion, not before.

## 11. Measurements worth not re-taking

Taken 2026-08-29 against the local stack, 13-lesson plans:

- **73 tables** in one plan: 24 one-column, 34 two-column, 1 three, 2 four, 12 five.
- **Summary Table was still unrendered six seconds after load** on a tall document — the read/editor
  content is behind `RenderIfInViewport` (rootMargin 1000px). Any design that assumes "the section is
  in the DOM" is wrong; this is what defeated the registry alternative in `entryPhase.ts`.
- The editor bar at 375px wrapped to **four rows** before #314, three after.
- The lesson page's action row uses **191px of 359** at 375px — width is not scarce there.
