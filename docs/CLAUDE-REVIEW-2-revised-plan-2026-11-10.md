# Claude's second review: `PLAN-interface-refinement-2026-11-10-revised.md`

Date: 10 November 2026. Checked against `origin/main` `08f3e84`, which has not changed since the
first review, so no new conflicts come from the code. I also opened both reviewed previews at
desktop and 390 px, including the lesson page's disclosures, Grade 12 and print media.

**Verdict: ready to implement once the corrections below are folded in.** None of them changes the
design. The settled decisions in §2 are taken as given: Grade 12 hard-coded, blue horizontal
accents kept, grey labels, the single sticky scrolling phone row, sections collapsed on arrival,
and catalogue groups open. The six-change sequence stands. **No migration and no new endpoint are
needed.**

---

## Corrections (most important first)

### 1. Print: CSS alone cannot open closed sections (High)

I emulated print media on the preview. Every lesson still printed as a closed heading, and the jump
nav printed too. That's expected: `@media print` cannot reveal the content of a closed `<details>`
in most browsers. The preview opens them through a `beforeprint` script, which media emulation (and
any headless PDF tool) never fires.

**Required:**
- Open every disclosure on `beforeprint` and restore the previous state on `afterprint`. The plan
  says this.
- **Also** add `details::details-content { content-visibility: visible; display: block }` inside
  `@media print`, for browsers that support it. This is the safety net when the print event doesn't
  fire. iOS Safari's Share → Print is the case to check on a real phone.
- Hide the site header, the sticky `.lesson-toolbar` (action row and jump nav), menus and the
  disclosure markers in print. The preview still prints the nav row.
- The acceptance test is an actual print preview in Chrome and desktop Safari, plus iOS Safari's
  Share → Print. It cannot be a DOM check.

### 2. "Edit" stops remembering which lesson you were reading (High)

`EditActions.tsx` carries the reader's place into the editor by reading `#lesson-<n>` from
`window.location.hash` (lines 47–60). Today only the jump nav sets that hash. With the accordion,
most readers will open a lesson by clicking its title, which sets no hash. Edit would then open the
editor at the top instead of at that lesson. The plan lists "current-lesson handoff into editing"
as something to preserve but doesn't say how.

**Required:** when a reader opens a lesson disclosure, record it with
`history.replaceState(null, '', '#lesson-<n>')`. This avoids a scroll jump and a new history entry.
Add an e2e check: open lesson 7 by its title, press Edit, and the editor lands on lesson 7.

### 3. Keep the change on the lesson page only (Medium)

`renderVersionSectionsCached` also feeds the editor's Quick preview (`endpoints/previewShared.ts`),
and the Compare page groups `docxToSections` output (`lib/compareGroups.ts`). Do the partition as a
**per-request transform in `lessons/[id]/page.tsx`**, next to today's `annotateSections`, and never
inside the cached HTML. Quick preview and Compare then stay unchanged. The accordion design (§9)
scopes them out. Add both to the smoke checks.

### 4. Anchor ids and scroll offsets move (Medium)

Lesson ids are injected today onto an element inside `.doc-preview`. The landing offset below the
sticky toolbar uses `.doc-preview [id^='lesson-']` (`scroll-margin-top` 6.5rem on desktop, 8rem on
phones). If the ids move onto the new `<details>` wrappers, move those selectors with them.
Otherwise a jump lands with its heading under the sticky bar. Hash-open must open the disclosure
first and then scroll. This is the defect class behind #310.

### 5. Forum flag on the signed-out sign-in page is already available (Low, simplification)

The plan asks for "an appropriate signed-out request context". It isn't needed. The login page
already reads `schoolNameForRender(payload)`. The same per-render settings read
(`systemSettingsForRender` in `lib/systemFlags.ts`) carries `forumEnabled`, with no user and no
request to construct.

### 6. Grade list: hard-code 10, 11 and 12, but don't hide other grades (Low)

Use `{10, 11, 12} ∪ grades present in the data`. The hard-coded set covers Grade 12 now, as David
decided. The union means a plan uploaded at another grade (for a test, or by mistake) can still be
filtered to, instead of only showing under All. It costs one line, and the URL parser uses the same
list.

### 7. Smaller wording points (Low)

- The nav says **Overview** but the disclosure says **Unit overview**. Use one name for both.
- When Grade 12 is combined with a subject, the empty message should still be true:
  "No Grade 12 Biology lesson plans are available yet."
- "Lesson version 1.0.0": a plan holds twelve lessons, so "lesson version" could be read as one
  lesson's version. Today's page says "Version 1.0.0". I'd keep that, but it's optional.
- Disclosure titles come from the DOCX header text (`LESSON n (40 min): title`), reformatted as
  "Lesson n · title". Escape the text, and fall back to "Lesson n" if the header doesn't parse.

---

## What I checked and found consistent

- The lesson page is a frame around the DOCX-derived HTML, collapsed on arrival, with real lesson
  titles. ✓ It matches the August accordion design and SPEC §5.
- The version gate: plan §5 now states exactly the current `canEdit && versions.length > 1` rule. ✓
- Word is hidden on phones in the preview (action row: Continue editing · PDF · Share). ✓ The Share
  menu's "Download all — Word (.zip)" is hidden on phones by `share-menu__word-zip` today, so keep
  that class.
- The single sticky scrolling number row on phones, with its fade. ✓
- Catalogue buttons use the quiet compact button system, not blue text links. ✓
- The resume row uses `listUnsavedWork` (it returns nothing for plain teachers before any query),
  "Continue editing" or "Open to copy" from `restorable`, and Manage's link (`?edit=1`, which keeps
  the editor's width guard). ✓
- Sign-up wording is unchanged, and the brand strip sits inside the login page rather than the
  layout. ✓
- "Start a forum discussion…" only renames the existing link to `/discuss/new?version=<id>`, which
  already posts only on submit. The Guide line at `guide/page.tsx:259` and `USER_GUIDE.md` quote the
  old label. ✓

---

## Final sequence (unchanged, with where each correction lands)

1. **Header and account version.** Brand mark on both headers; version footer in the avatar menu.
2. **Sign-in.** Two columns and stacked on phone; forum line from `systemSettingsForRender` (#5).
3. **Catalogue.** Grade union (#6), segmented favorites, open groups, resume row, empty states
   (#7), and a 150+ sub-strand test fixture.
4. **Lesson header.** Details / Versions & details with the existing gate; the action row.
5. **Accordion.** Per-request partition (#3), ids and offsets (#4), hash-open, edit handoff (#2),
   print (#1).
6. **Wording.** Forum label, empty states, Guide, `USER_GUIDE.md`, Welcome dialog, release notes.

## Additions to the plan's test matrix (§8)

- Open a lesson by its title, then press Edit. The editor lands on that lesson.
- Quick preview in the editor and the Compare page look exactly as before.
- Print from a fully collapsed page, and from a page with two lessons open: in Chrome, desktop
  Safari and iOS Safari (Share → Print). Every lesson is printed in full, the nav and header are
  not, and the open/closed state is restored afterwards.
- A jump to `#lesson-7` from the sticky nav, on desktop and on a phone. The lesson heading lands
  below the sticky bar, not under it.

## What needs David or his Mac

- Real iPhone and Android checks, including printing from iOS. Best done on the Rock after a deploy,
  or against the Mac's local stack over the local network.
- The browser checks in this list need the local stack (Postgres, Gotenberg). This cloud session
  has no Docker, so they run on the Mac through Remote Control, as for earlier work.
