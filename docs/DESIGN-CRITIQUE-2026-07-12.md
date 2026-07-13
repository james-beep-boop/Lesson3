# Design Critique — Lesson Plan Repository UI

**Date:** 2026-07-12
**Reviewer:** Claude (design-critique skill), live walkthrough with Soon
**Scope:** Live app at `rock5b.tail49b05.ts.net:3001`, reviewed as both Teacher and Editor roles
**Purpose:** Source material for Claude Code to plan and implement UI fixes. Findings are ordered by severity within each surface; cross-cutting issues are called out at the end.

---

## How to use this document

Each surface below follows the standard critique framework (First Impression, Usability, Visual Hierarchy, Consistency, Accessibility). Findings are tagged 🔴 Critical / 🟡 Moderate / 🟢 Minor. Two issues recur across multiple surfaces and are the highest-leverage fixes — see **Cross-Cutting Issues** before diving into individual pages.

> **STATUS (2026-07-13): this critique has been triaged and actioned — it is a historical
> snapshot, not a to-do list.** The design track it drove (D1–D6, PRs #85–#90) is merged; the
> dispositions live in `docs/DECISIONS.md` (2026-07-12 entry). Notably: the semantic
> `<section>`/`<h2>` conversion suggested under Cross-Cutting Issue #2 (and echoed in §3/§9) was
> **rejected** under SPEC §5 in favor of sticky anchor navigation only; several §7 Manage-page
> findings described the then-stale Rock deployment rather than `main`; and the app-wide gray
> contrast worry (#4) was audited and passed — only the admin's elevation-500 text and document
> gridlines needed fixes.

---

## Cross-Cutting Issues (fix once, benefits multiple pages)

### 1. 🔴 The editing surface (`/admin/...`) has a different visual identity than the rest of the app
Login, Lessons dashboard, Lesson detail, Guide, and Messages all share a custom, blue-accented visual language. The Manage page and the version editor (Payload admin views) look like unstyled default admin tooling — no logo/header branding, black "Save" button instead of the app's blue, gray disabled-field styling, generic sans-serif treatment. This is the single most jarring inconsistency found. **Decide deliberately**: either reskin the editing surface to match the branded app, or explicitly scope admin/editor tooling as unstyled-by-design — but right now it reads as an unfinished second product bolted onto the first.

### 2. 🔴 Long-form content pages use a single unbroken table with no in-page navigation
Both the public Lesson Detail page and the Content Preview render an 8-lesson document as one continuous two-column table (label/value rows) with no way to jump to a specific lesson or section. This is a shared template — fixing it once (add anchor-link/sticky nav for Overview / Lesson 1–8 / Final Explanation / Summary Table, and split short metadata facts from long-form prose into real document sections instead of table rows) fixes both surfaces at once. This also has accessibility implications: a `<table>` used for prose content announces oddly to screen readers; narrative fields should use semantic `<section>`/`<h2>` markup instead.

### 3. 🟡 No consistent visual language for "you can't edit/access this"
Disabled-looking gray fields in the version editor, the "Request editing access" button on the lesson detail page, and role-scoped content all use different (or no) visual treatment to signal role-gating. Establish one pattern (e.g., a lock icon + tooltip) and reuse it everywhere access is restricted by role, consistent with the app's field-level RBAC model (Editor = prose values, Subject Admin = structure/META/admin fields).

### 4. 🟡 Muted gray text is used pervasively for secondary content and should be audited for contrast
Metadata labels, timestamps, helper text, and version chips across nearly every page use a light gray that has not been contrast-checked. Recommend a single accessibility-review pass (WCAG 2.1 AA) across the whole app rather than page-by-page spot fixes.

### 5. 🟢 Inconsistent title casing
Some titles/headers render in ALL CAPS (matching raw stored data, e.g. "BIOLOGY GRADE 10: PLANT TRANSPORT"), others in Title Case (e.g. "Plant Transport" on the dashboard). Consider a display-level casing transform so headers read consistently regardless of how the source data was entered.

---

## 1. Sign-In Page (`/login`)

**Screenshot context:** Unauthenticated, default state.

### Usability
- 🟡 "Sign up" link present on what appears to be a closed, role-provisioned system (Site Admin / Subject Admin / Editor / Teacher, each provisioned rather than self-serve). Confirm intent; remove self-signup if accounts are meant to be provisioned, not requested.
- 🟢 No visible error-state treatment — confirm invalid credentials show inline, field-specific messaging.
- 🟡 Could not confirm keyboard focus states in a static review — verify visible focus rings on inputs/buttons.

### Visual Hierarchy / Consistency
- Product name ("Lesson Plan Repository") and "Sign in" heading have too little size/weight differentiation — give the product name more distinction (logo, eyebrow label, or size contrast).
- Form floats in the top third of a large empty viewport — center it or add a background treatment so the page doesn't read as unstyled.
- No branding/color/logo tying the page to the ARES/Lesson Plan Repository identity — the first thing every role sees currently signals "default scaffold," not a trusted internal tool.

### Accessibility
- Contrast on "Sign up" / "Forgot password?" links (appear to be lighter blue on white) should be verified against AA.
- Label text ("Email", "Password") is small and light gray — check size/contrast.

### Priority Fixes
1. Add branding/identity to the login page.
2. Reconsider whether "Sign up" belongs on this screen given the provisioned-role model.
3. Center/anchor the form so the layout doesn't look broken on larger viewports.

---

## 2. Lessons Dashboard (`/`) — Teacher and Editor views

**Screenshot context:** Reviewed as both `teacher@lesson3.local` and `editor@lesson3.local`.

### Usability
- 🟡 Every lesson row exposes 6 export buttons (PDF/Word × Lesson plan/Final explanation/Summary table). For a Teacher, whose core action is exporting, this is a lot to scan per row. Consider consolidating into a single "Export" control with a small menu, or demoting the two secondary document types (Final Explanation, Summary Table) behind a disclosure.
- 🟢 No breadcrumb or way to tell/switch which subject-grade scope is active if a user has access to more than one.
- 🟢 Search box has no visible clear affordance or "no results" state.
- 🟡 (Editor view) Version chips ("2 versions ▾", "3 versions ▾") appear only on rows with history, shifting the star icon's horizontal position row to row. Reserve a fixed-width column for version chips so rows stay aligned regardless of version count.
- 🟢 (Editor view) No "My favorites" section appears when an editor has none starred — confirm this is a deliberate omission vs. a missing empty state ("No favorites yet — click ☆ to add one" would be more informative).

### Visual Hierarchy / Consistency
- Export buttons (PDF/Word) use the same blue outline as the active subject-filter pill, creating visual competition between navigation and action controls. Differentiate these — keep pills as filled/selected-state controls, give export buttons a distinct (e.g., neutral or icon-based) treatment.
- Strand headers ("Strand 1: Cell Biology and Biodiversity") and lesson row titles ("Cell Structure") have too little size/weight gap, slowing scanning.
- (Editor view) "Manage" nav item — which gates significant structural/admin capability per the role model — has identical typographic weight to "Lessons" and "Guide." Worth a deliberate decision on whether it should stand out.

### Accessibility
- Gray metadata text ("Biology · Grade 10 · Strand 1.0...") should be checked against AA (4.5:1) for body text.
- Export buttons are tightly packed — verify minimum touch target size/spacing (44×44px) for tablet/mobile use.

### Priority Fixes
1. Simplify/consolidate the 6-button export cluster per row.
2. Differentiate export button styling from active-filter pill styling.
3. Fix version-chip column alignment (Editor view).

---

## 3. Lesson Detail Page (`/lessons/:id`)

**Screenshot context:** "Cell Biology" (Sub-Strand 1.3), Teacher view; content matches the CBE phenomenon-driven lesson-sequence model (SUB-STRAND OVERVIEW → Learning Outcomes → Core Competencies → SEPs → PCIs → Career Links → Focus for Lessons → Driving Question → Anchoring Phenomenon → 8 lessons → Final Explanation → Summary Table).

### Usability
- 🔴 **No in-page navigation.** This is a long, multi-section document (8 lessons plus overview/final-explanation/summary sections) rendered as one continuous scroll with no way to jump to a specific lesson. This is the single biggest usability issue found across the whole app. (See Cross-Cutting Issue #2.)
- 🟡 Every field — including long-form prose (Core Competencies, PCIs, Anchoring Phenomenon) — renders as an expanded table row. Secondary/reference content (PCIs, Career Guidance) competes visually with primary teaching content (Learning Outcomes, Driving Question). Consider collapsible sections for secondary content.
- 🟡 Header actions (export buttons, "Request editing access," "Download all," "Message a colleague") scroll away immediately and aren't reachable again without scrolling back up. Make this bar sticky.
- 🟢 "Request editing access" — unclear resulting workflow/behavior from the UI alone; worth a copy/flow pass once behavior is confirmed (candidate for the `ux-copy` skill).

### Visual Hierarchy / Consistency
- The same two-column table pattern is used for both short facts (Grade Level: "10") and multi-paragraph prose (Anchoring Phenomenon, ~150+ words). These need different treatments: compact metadata table for facts, document-style sections (heading + prose) for narrative content.
- ALL CAPS section labels ("SUB-STRAND OVERVIEW," "DRIVING QUESTION") mixed with Title Case row labels ("Learning Outcomes," "Core Values") — pick one convention.

### Accessibility
- A real `<table>` element used for prose content will announce oddly to screen readers (row/column navigation over paragraph text). Recommend semantic `<section>`/`<h2>` markup for narrative fields instead of table markup.
- Prose cells run long (~700px of dense text) — constrain line length/max-width for readability.
- Verify gray section-header contrast against AA.

### What Works Well
- Content structure faithfully reflects the underlying CBE/SPEC data model.
- Kenya-contextualized content (phenomenon-driven examples) is rich and specific — a content strength that the current layout undersells.

### Priority Fixes
1. Add in-page/anchor navigation across lessons and sections.
2. Split table-as-layout from prose-as-document; use semantic sections for narrative fields.
3. Make the header action bar sticky.

---

## 4. Guide Page (`/guide`)

**Screenshot context:** Role-segmented documentation (Teachers, Editors, Subject Administrators, Site Administrators, Writing in fields).

### Usability
- 🟡 Jump links at the top (by role) aren't sticky — switching sections requires scrolling back to the top. This is the same fix needed on the Lesson Detail page; the pattern that's missing there already exists here and should be extended, not reinvented.
- 🟡 Inconsistent styling for referring to UI elements: italics ("*N versions*" chip, "*Sign up*" link), bold ("**Your account:**"), and plain text are all used to denote clickable/UI elements. Standardize on one convention.
- 🟢 Version-history/comparison mechanics are explained in the Teachers section even though Teachers "see only the Official version and no editing controls" per the guide's own text — consider moving that explanation to the Editors section only.

### Visual Hierarchy / Consistency
- Bold-lead-in bullet pattern ("**Browse lesson plans:** the home page groups...") is a strong, scannable model — it should be applied more consistently across denser paragraphs (e.g., the long unbulleted paragraph about version history).
- Section boundaries (Teachers → Editors → ...) have minimal visual separation beyond a thin divider; consider more breathing room or a subtle background tint per section.

### Accessibility
- Jump-link row items are tightly spaced inline text links — verify adequate spacing/touch target for mobile.
- Verify gray "USER GUIDE" eyebrow and link contrast against AA.

### What Works Well
- Role-based jump navigation is exactly the right pattern for a 4-role system — **this should be reused on the Lesson Detail page.**
- Content accurately reflects role-based feature differences (matches the access model).

### Priority Fixes
1. Make the jump nav sticky; port this same nav pattern to the Lesson Detail page.
2. Standardize UI-term styling (bold vs. italic vs. plain).
3. Convert dense paragraphs to the bold-lead-in bullet style already used successfully elsewhere on this page.

---

## 5. Account Menu (dropdown from avatar)

**Screenshot context:** Editor identity shown ("Editor," `editor@lesson3.local`, Messages badge, Log Out).

### Usability
- 🟡 No visible way to see/switch subject-grade scope from this menu. If an Editor could ever be scoped to more than one Subject-Grade, this menu will need it; if the access model truly caps roles at ≤1 scope, this is a non-issue — worth explicit confirmation either way.
- 🟢 "Messages 1" badge here duplicates the badge on the avatar itself — fine for reinforcement, just confirm both stay in sync when messages are read.

### Visual Hierarchy / Consistency
- "Messages" and "Log Out" are both plain blue links with identical styling, despite being very different in consequence (navigate vs. end session). Distinguish Log Out visually (e.g., different color, or a divider above it) so it isn't mistaken for another content link.
- The unread badge here uses a different visual treatment than the avatar's badge dot — unify badge styling app-wide.

### Accessibility
- Verify keyboard operability: dropdown opens on Enter/Space, closes on Escape, traps focus while open (not confirmed from screenshots).
- Email text in gray may be borderline AA at this size.

### Priority Fixes
1. Visually separate "Log Out" from "Messages."
2. Unify badge styling between avatar and in-menu counts.

---

## 6. Messages Page (`/messages`)

**Screenshot context:** Editor inbox with one unread message, plus older test/seed messages.

### Usability
- 🟡 The "Send a message" compose form sits above the Inbox, pushing existing messages below the fold — most messaging UIs prioritize reading over composing. Consider moving Inbox above the fold, with compose as a secondary action (button that reveals the form) rather than always-open.
- 🟡 Recipient picker is a generic, contextless `<select>` ("Choose a recipient..."). Since messaging appears scoped to a lesson/colleague context (and the access model restricts who can see whose email), clarify who's eligible directly in or near the dropdown.
- 🟡 No visible thread grouping — unclear whether messages with the same subject/context are threaded or independent. Clarify if replies should visually nest.
- 🟢 Verify the muted "Send" button is an intentional disabled-until-valid state rather than a low-contrast styling accident.

### Visual Hierarchy / Consistency
- Unread message treatment (left blue border + gray background + "New" pill) is the **strongest, clearest visual signal found anywhere in the app.** This pattern should become the app's standard "needs attention" treatment and be reused elsewhere (e.g., version chips, favorites, Manage page items).
- The message's lesson-reference link ("BIOLOGY GRADE 10: CHEMICALS OF LIFE") renders in all-caps underlined text, inconsistent with Title Case used for lesson titles elsewhere.
- The compose panel's boxed gray background/border isn't used anywhere else in the app — confirm this is an intentional new pattern or align it with existing card styling.

### Accessibility
- "To" and "Message" fields have real labels (not placeholder-only) — good practice, keep this.
- Verify contrast on the muted Send button and gray timestamps.

### Priority Fixes
1. Reprioritize layout: Inbox above compose, or collapse compose by default.
2. Clarify recipient scope in the "To" dropdown.
3. Reuse the unread-message visual treatment as the app-wide standard for "needs attention" states.

---

## 7. Manage Page (`/admin`, Editor view)

**Screenshot context:** Editor sees "Signed in as Editor / Biology · Grade 10" and a single "My saved versions" entry.

### Usability
- 🔴 No app header/branding ("Lesson Plan Repository" logo, present on every other page) — the page reads as a different, unfinished product. (See Cross-Cutting Issue #1.)
- 🟡 Content occupies roughly the top-left 15% of the viewport with no apparent intentional constraint — either narrow the layout deliberately (settings-panel style) or confirm more Manage functionality exists that isn't populated in this test account.
- 🟢 "Signed in as Editor / Biology · Grade 10" is static, non-interactive text — same scope-switching question as the account dropdown.
- 🟡 "Delete" renders as bare underlined text with no button styling and no visible confirm step for what is a destructive action.

### Visual Hierarchy / Consistency
- The single content row ("Plant Transport," version metadata) uses a plain horizontal-rule list style, not the card/row pattern from the Lessons dashboard. Reuse that pattern here.

### Accessibility
- "Signed in as..." and version metadata text is light gray — check contrast.
- "Delete" as bare text is a small, unpadded touch target for a destructive action — increase hit area and consider a confirmation step.

### Priority Fixes
1. Restore consistent header/branding on this page (top cross-cutting priority).
2. Confirm scope of Manage functionality for Editors — is this sparse view complete?
3. Style "Delete" as a proper (ideally confirm-gated) button, matching other action styling in the app.

---

## 8. Lesson Version Editor (`/admin/collections/lesson-bundle-versions/:id?edit=1`)

**Screenshot context:** Editing "Biology Grade 10: Plant Transport," v1.0.1, Editor role.

### Usability
- 🔴 Toolbar mixes four distinct control types with no grouping: mode toggle (Edit/Preview), save actions (Save, Discard Edits), format checkboxes (docx/PDF), and Download, plus an overflow menu — all same size/weight. Group by function; give Save (the highest-stakes action) distinct visual weight from Discard Edits and Download.
- 🟡 Gray, disabled-looking fields (Title, Subject Grade, Lesson Plan, Source Version, Author, Version) are visually identical to placeholder/empty-state styling. If these are role-locked per the field-level RBAC model (structure/META reserved for Subject Admin), make that explicit with a lock icon or tooltip rather than relying on ambiguous gray-out.
- 🟢 "Collapse All / Show All" controls are useful for a long nested form but their scope (this lesson only, vs. all lessons) isn't labeled.

### Visual Hierarchy / Consistency
- This is the clearest instance of Cross-Cutting Issue #1: black "Save" button and default Payload styling contrast sharply with the app's blue-accented branded pages.
- Page title renders in ALL CAPS ("BIOLOGY GRADE 10: PLANT TRANSPORT") vs. Title Case on the dashboard — same casing inconsistency noted elsewhere.

### Accessibility
- Gray-on-gray disabled field styling (light gray text on light gray background) is a likely AA contrast failure, independent of whether the field is meant to be non-editable.
- Save and Discard Edits sit directly adjacent with similar styling — risk of mis-click between "commit" and "throw away"; verify spacing/differentiation.
- Confirm collapsible sections and nested fields are fully keyboard-operable.

### What Works Well
- Two-column layout (content left, provenance sidebar right: Source Version, Author, Last Modified, Created) is well-suited to a versioned document system.
- Helper text under the Title field ("Plain text only. A new line starts a new paragraph; a leading '- ' becomes a bullet. Markdown/bold/italic are NOT rendered.") enforces the prose-grammar rule exactly where it's needed — a genuinely good pattern, worth confirming it appears under every prose field.
- Collapsible Lesson sections handle the "long document" problem better here than the read-only Lesson Detail page does.

### Priority Fixes
1. Decide and align this surface's visual identity with the rest of the app (top cross-cutting priority — see Issue #1).
2. Visually distinguish Save from Discard Edits/Download/overflow.
3. Make role-locked fields explicit (lock icon/tooltip) instead of ambiguous gray-out.

---

## 9. Content Preview (`/api/lesson-bundle-versions/:id/preview`)

**Screenshot context:** Opened via "Preview" from the version editor; unbranded, standalone tab.

### Usability
- Inherits Cross-Cutting Issue #2 in full — same unbroken table layout as the public Lesson Detail page, confirming both share a template. Fixing the Lesson Detail page's layout should be done at the shared-template level so this view improves automatically.
- 🟡 Title is effectively stated three times in the first few lines (page heading, "LESSON SEQUENCE" label, then repeated bold text). Collapse redundant repetition.
- 🟢 No visible way back to the editor from this tab (it opens as a separate browser tab) — confirm this is intended, not a missing affordance.

### What Works Well
- The status disclaimer — "CONTENT PREVIEW · UNSAVED EDITS · NOT THE FINAL DOCUMENT LAYOUT" — is excellent, precise UX writing. It answers exactly the right three questions in the right order and should be treated as a model for status messaging elsewhere in the app.
- Confirms preview accuracy: the rendered content faithfully matches the underlying data editors are working with.

### Priority Fix
Apply the Lesson Detail page's layout fix at the shared template level (benefits this view automatically). No independent action needed beyond that.

---

## Summary: Priority Order for Claude Code

1. **Decide the editing surface's visual identity** (Manage page, version editor) — reskin to match the branded app or explicitly scope as unstyled admin tooling. This is the most consequential open design question in the whole app.
2. **Add in-page/anchor navigation to the Lesson Detail page and Content Preview** (shared template) — the single biggest usability blocker for the actual teaching content.
3. **Fix the version-editor toolbar** — group controls by function, give Save distinct visual weight.
4. **Simplify/consolidate the 6-button export cluster** on lesson rows in the dashboard.
5. **Reuse the Messages page's unread-state treatment** as the app's standard "needs attention" pattern.
6. **Make the Guide page's jump nav sticky**, and port the same jump-nav pattern to the Lesson Detail page.
7. **Establish one visual pattern for role-locked/inaccessible content** and apply it consistently (version editor fields, "Request editing access," etc.).
8. **Run a full WCAG 2.1 AA contrast pass** app-wide rather than fixing gray-text contrast page by page (candidate for the `accessibility-review` skill as a follow-up).
9. Minor cleanup: title casing consistency, redundant title repetition on preview, button/link styling parity (Log Out vs. Messages, Delete on Manage page).
