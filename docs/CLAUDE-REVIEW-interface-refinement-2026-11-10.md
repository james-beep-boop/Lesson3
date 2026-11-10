# Claude's review of `PLAN-interface-refinement-2026-11-10.md`

Date: 10 November 2026. Reviewed against `origin/main` at `08f3e84`. That is v1.14 (`d5217a4`) plus
#494, which changed only the Guide's roles chart and the space above its version line, so the v1.14
captures in the bundle are a valid baseline. I also opened the interactive concept
(`lesson3-refined-review.html`) at desktop and 390 px.

**Verdict: the direction is sound and the plan is unusually careful about preserving behaviour. It
is not ready to implement as written.** Four items conflict with decisions already recorded in the
repository, and the plan does not mention them (A1 to A4). One requirement conflicts with an operator
decision (A5). The lesson-page work is really the deferred read-page accordion (`docs/DESIGN-read-page-accordion-2026-08-29.md`)
and should follow that design. Everything else is ready, with the corrections below.

---

## A. Required corrections (with source evidence)

### A1. High: the lesson page's sections cannot be restructured the way the concept shows

The concept's "Unit overview" (Sub-strand / Duration / Driving question rows) and the per-lesson
card ("Lesson 1 · The Healing Cut", "Purpose", "Predict phase") are built from structured fields.
The real page renders the **generated DOCX through mammoth** (`lessons/[id]/page.tsx`, the
`renderVersionSectionsCached` call). That yields exactly three HTML sections (`generator/previewBundle.ts`):
Lesson Sequence, Final Explanation and Summary Table. The overview is the first table *inside*
Lesson Sequence. SPEC §5 forbids a parallel renderer. The reason is in
`DESIGN-read-page-accordion-2026-08-29.md` §5: a teacher must never read one thing on screen and
print another.

**Correction:** state that the section treatments are a *frame* around the DOCX-derived HTML: header
rows, borders and disclosures. They are not new field layouts. The only sanctioned way to get
per-lesson disclosures is the one already designed and deferred: split the Lesson Sequence HTML at
the `LESSON n (40 min): title` boundaries that `lib/lessonAnchors.ts` already detects, pinned by
`lessonAnchors.spec.ts`.

### A2. High: collapsing sections breaks printing unless print styles are added

There is no `@media print` anywhere in `styles.css`. Today Ctrl+P prints the whole plan. With
collapsed `<details>`, it would print a few headings. The accordion design (§8.3) lists print as a
hard requirement. The plan never mentions printing, yet the product line is "Find, edit and print
lesson plans."

**Correction:** add "Print expands every section and hides the sticky toolbar, menus and nav" to §2
(Lesson detail) and §7. Test it in Chrome and Safari print preview.

### A3. High: a wrapped two-row lesson nav reverses a recorded phone decision

On a phone the jump nav sits inside the **sticky** `.lesson-toolbar`. `styles.css` (the ≤640 px
block, the `.doc-nav` rule) deliberately keeps it as one sideways-scrolling row with a fade: "a
wrapped multi-row nav would eat a phone viewport." The plan asks for two rows of six 44 px buttons
and forbids a scrolling strip. Stacked inside the sticky toolbar, those two rows plus the action row
(which itself wraps to two rows in the concept) take about 200 px of an 844 px screen. In landscape
that is about half the screen.

**Correction (pick one, I recommend the first):** on phones, keep only the action row sticky and let
the wrapped number grid scroll away with the page. Or keep today's single scrolling row. Either way,
record the choice in DECISIONS, because it supersedes a documented rule.

### A4. High: "Versions & details" must keep the teacher-first version gate

Today the versions chip and Compare render only when `canEdit && versions.length > 1`
(`lessons/[id]/page.tsx`, the `lesson-context` line). That is the 2026-07-08 teacher-first lock §4,
reaffirmed in the accordion design §6.4. A plain Teacher sees the Official version plus the
"Show details" metadata (`LessonDetails`), and is never *offered* other versions. The plan's §3
table says Versions & details will "retain all readable history". Read literally, that shows
version history to every teacher.

**Correction:** say explicitly that inside Versions & details, the metadata is for everyone, while
the versions list and Compare remain gated exactly as today. Add a plain-Teacher row to the role
matrix that asserts their absence.

### A5. Medium: the concept shows Word downloads on a phone

The 390 px catalogue and lesson concepts both show Word buttons. Phones hide Word deliberately
(operator decision 2026-08-29, `styles.css` "NO WORD DOWNLOADS ON A PHONE", which uses both
`.doc-buttons__word` selectors). The plan's §5 text correctly says to preserve this, so only the
concept is wrong. It should be fixed so nobody builds from the picture.

### A6. Medium: catalogue downloads drawn as blue text links, not the button system

In the concept, PDF, Word, "6 versions ▾" and the star are plain blue text. Today they are
`.btn--quiet.btn--compact`, following `DESIGN-button-system-2026-07-30.md`, which deliberately keeps
the row quiet until hover. Text links would also lose the 44 px touch bar the button system gives
on phones. **Correction:** keep the existing compact quiet buttons and change only spacing and
alignment.

### A7. Medium: blue used for things that are not actions

The concept uses the accent blue for the eyebrows ("FOR YOUR CLASSROOM", "BIOLOGY · GRADE 10"), for
underline bars under every page title, and for the selected-tab underline. GPT's own principle,
which you agreed, is "blue for actions and selection". The tab underline is selection, so that's
fine. The eyebrows and the title bars are decoration. The sign-in page already has one accent bar
under the product name (`.login-title::after`), and it should stay the only one. **Suggest:** make
the eyebrows muted grey and drop the extra title bars, or decide explicitly to make the bar a brand
element and use it in exactly one place per page.

### A8. Low: factual slips in the plan

- §2 Catalogue: "Remove the visible 'Search' label". There is no visible label today. The input
  already has only a placeholder and `aria-label="Search lesson plans"` (`LibraryBrowser.tsx`).
  Nothing to do.
- §2 Catalogue and §7: "preserve ... Back/Forward behavior" for filters. Filters write the URL with
  `history.replaceState` after 250 ms, so filter changes create **no** history entries. Only
  `popstate` from page navigation is handled. Say "preserve" (no new entries). The new tab state
  should also use `replaceState`, or Back will start stepping through tab clicks.
- §2 Lesson detail: "Keep the small numbered lesson buttons ... do not use the proposed lesson
  dropdown". Numbered buttons with full-title `title`/`aria-label` already exist (`.doc-nav__lesson`),
  so this is "keep", not "restore" (§6 step 4 says "restore").
- §2 Forum action: the composer behaviour asked for already exists. `/discuss/new?version=<id>` is
  a separate page headed "Start a discussion" that posts only on submit. The change is just the
  menu label, plus the Guide text that quotes it (`guide/page.tsx`, "Share → Discuss this version")
  and `USER_GUIDE.md`.
- "Lesson version 1.0.0": use the existing `releaseVersionLabel`, which can append an ARES release
  label. Don't rebuild the string.
- §1: the Mac checkout is on `codex/backup-recovery-guidance`, which is behind `main`. Implementation
  should branch from `origin/main` `08f3e84` or later. (The plan already says not to use the old
  checkout. Here is the concrete baseline.)

---

## B. Missing capabilities and conditions

1. **Print** (A2).
2. **Hash-open on load and on click.** The plan mentions it. The accordion design §8.1 adds that this
   class of defect has already shipped twice (#310 and #314's predecessor), so it needs an e2e test,
   not only a manual check.
3. **Find-in-page inside collapsed sections.** This was settled on 2026-08-30: the collapsed state is
   the table of contents, and Firefox not expanding a closed `<details>` for a full-text match is
   accepted. The plan should cite that decision rather than promise full-text find.
4. **Default state of the collapsible strand groups in the catalogue** is undefined. Recommendation:
   open by default, so today's page and Ctrl+F still work. Search and filters force matching groups
   open. Don't persist the open/closed state; SPEC §13 bans browser storage of user content, and the
   simplest compliant answer is not to store it.
5. **Where the Grade 12 checkbox comes from** (see D, decision 1). Today both grades and subjects are
   derived from the plans present (`LibraryBrowser.tsx`), and an unknown grade is dropped from the URL
   selection, so `?grade=12` silently becomes All. The plan diagnosed this correctly.
6. **Login forum invitation when signed out.** The page needs `isForumEnabled`, which reads system
   flags through a request. Make sure the read doesn't require a user, and that it stays off the
   first-user setup branch (the plan says this).
7. **"Create an account" vs "Sign up".** The concept renames the link. The Guide, `USER_GUIDE.md`,
   `offlineSignup.e2e.spec.ts` and the sign-up page heading all say "Sign up". Either keep "Sign up"
   or rename it everywhere in one change.
8. **The login header bar.** The concept adds a header strip with the brand on the signed-out page.
   The root layout hides the header when signed out, and auth transitions rely on full-document
   navigation because the layout's shape depends on auth (`layout.tsx` ⚑, DECISIONS 2026-08-03). Put
   the strip **inside the login page**, not by making the layout render a header when signed out.
9. **The Welcome dialog.** It still shows once per account after first sign-in. Check that its links
   and copy still match the new labels ("Start a forum discussion…", tabs).
10. **Release notes, Guide and `USER_GUIDE.md`.** Every renamed label (tabs, Versions & details,
    Start a forum discussion…, Create an account) needs the same wording in both. That's a SPEC §13
    convention.

---

## C. Smallest implementation breakdown

**No migration and no new endpoint are needed.** Every item reads data the server already has:

- The resume row calls `listUnsavedWork` from the catalogue's server component. It needs a
  `PayloadRequest`; use `createLocalReq({ user }, payload)`, as `lib/identity/resetIdentity.ts`
  does. For a plain Teacher it returns `[]` before any query (filter 3 in `unsavedWork.ts`), so most
  users pay nothing. Its rows already carry `restorable`, so "Continue editing" vs "Open to copy"
  comes free, matching Manage's `UnsavedWorkList`. The link is the same
  `/admin/collections/lesson-bundle-versions/<id>?edit=1`, which keeps the editor's own width guard.
- The grade list, if taxonomy-driven, is one more depth-0 `subject-grades` read. The page already
  makes that query for its rows.

Proposed PRs, each separately reviewable and revertible (the accordion design §9 asks for the same
"ship one change, live with it" sequencing):

| PR | Contents | Main files |
|---|---|---|
| 1. Chrome | Brand mark on both headers; app version in the avatar menu footer | `app-chrome.scss`, `layout.tsx`, `AppNav`, `UserMenu` (client: pass the label in), `AppVersion`/`lib/appVersion.ts`, admin header via `custom.scss` |
| 2. Sign-in | Two columns on desktop, stacked on phone; forum line when enabled; credit and version kept | `login/page.tsx`, `styles.css` (login block) |
| 3. Catalogue | Grade list fix, tabs, compact rows, open-by-default strand groups, resume row, catalogue empty states | `page.tsx`, `LibraryBrowser.tsx`, `lib/substrand.ts`, `styles.css`; extend `catalogue.e2e.spec.ts` |
| 4. Lesson header | Versions & details (gated as A4), action row, numbered nav per A3 | `lessons/[id]/page.tsx`, `LessonDetails.tsx`, `styles.css`; extend `lessonDetails.e2e.spec.ts` |
| 5. Read-page accordion | Per-lesson `<details>` (collapsed, per the 2026-08-29 decision), hash-open, **print styles** | `lib/lessonAnchors.ts` (split, not just annotate), `page.tsx`, `styles.css`; extend `lessonAnchors.spec.ts` and add an e2e |
| 6. Wording | "Start a forum discussion…", empty-state sentences on the six surfaces, Guide and `USER_GUIDE.md` | `ShareMenu.tsx`, Messages, Discuss, Manage lists, `guide/page.tsx`, `USER_GUIDE.md` |

PRs 1, 2 and 6 are small. PR 3 is medium. PRs 4 and 5 are the real work. PR 5 should not start until
you confirm the accordion decisions still stand (D, decision 3).

---

## D. Decisions needed from David before building

1. **Grade 12 checkbox.** (a) Offer exactly the grades that have subject-grades set up in *Subjects
   and grades*, whether or not they have plans yet. Grade 12 then appears once an administrator adds
   "Biology · Grade 12" and the others, which will be needed anyway when the plans arrive.
   (b) Hard-code 10, 11 and 12 as the plan says. **I recommend (a).** It needs no code change when
   Grade 13 or a primary install comes along, and it never offers a grade the school doesn't teach.
   The plan's "don't create placeholder taxonomy" reads as ruling (a) out, but a real subject-grade
   isn't a placeholder.
2. **Phone lesson nav** (A3): non-sticky wrapped grid (recommended), or today's sticky scrolling row.
3. **Lesson sections open or closed on arrival.** You chose "fully collapsed, titles as the table of
   contents" on 2026-08-29. The concept shows them open. Which stands?
4. **Blue accents** (A7): grey eyebrows and a single title bar (recommended), or blue as drawn.

---

## E. Test matrix

**Roles** (every page touched): signed out; first-user setup; plain Teacher; Teacher with editing
access in this subject-grade; the same Teacher outside it; Subject-grade administrator in and out of
scope; Site administrator.

**Deployment switches:** school name set and unset; forum on and off; SMTP set and unset; public
library on and off (login link only); Standard and Advanced tools.

**Catalogue:** `?grade=12` alone, reloaded and deep-linked; `grade=10,12`; old `grade=10`; search
with filters in both tabs; favorites on an Official and on a pinned older version; empty favorites;
empty corpus (teacher vs admin wording); no matches. Resume row: none, one, several (newest shown),
expired, source deleted or unreadable, editing access revoked, stale (shows "Open to copy").

**Lesson page:** Official and non-Official; with and without a draft; every number button; inbound
`#lesson-7` on load; nav click into a collapsed section; Ctrl+P preview; Share menu items per
Standard/Advanced and SMTP; plain Teacher sees no versions or Compare; Make Official only for an
eligible admin on a non-Official version.

**Widths:** 320, 360, 390, 430, 768, 1024 and 1280 px; phone landscape; 200% zoom.

**Corpus:** 150+ sub-strands. Only one plan is seeded locally today (`scripts/dev-seed.sh`), so this
needs a small fixture generator that clones the seed bundle with varied names. It's test-only and
should be in PR 3.

**What I can and can't do here:**
- I can run unit, integration and e2e tests, lint, types and the build, and take Playwright
  screenshots at every width above.
- I can't test real iOS Safari or Android Chrome. That's you, on the Rock after a deploy, or on the
  Mac's local stack with a phone on the same network.
- This cloud session has no Docker daemon, so the full local stack (Postgres, Gotenberg) has to run
  on your Mac through Remote Control, as for earlier browser checks.

---

## F. Smaller suggestions

- The headline "Good lessons. Ready to teach." is the loudest element in the concept, and the one
  most at odds with "restrained". "Find, edit and print lesson plans." (your 27 October wording)
  could stay as the headline, with GPT's "for your classroom" line beneath it.
- Show the resume row only when it would be useful: hide it on the catalogue while a search is typed,
  since the user has moved on to something else.
- Keep the "3 plans" count, but make it follow the active filters and tab, or it will contradict
  the list.
- On the tabs, use two buttons with `aria-pressed` (a segmented control) rather than ARIA `tablist`,
  unless you implement arrow-key navigation. The plan already asks for semantics that match behaviour.
