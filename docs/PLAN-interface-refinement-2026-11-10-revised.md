# Lesson3 interface refinement revised plan

Date: November 10, 2026. Status: incorporates both Claude reviews and the user's acceptance of the reviewed previews. The six-change implementation sequence is ready for an implementation request; the second review's corrections are folded in below. No application changes, commits, pushes or deployment are authorized by this handoff alone.

This revision supersedes `PLAN-interface-refinement-2026-11-10.md` wherever they differ. It incorporates `CLAUDE-REVIEW-interface-refinement-2026-11-10.md`, `CLAUDE-REVIEW-2-revised-plan-2026-11-10.md` and the user's subsequent decisions. Preserve the earlier documents as history.

## 1. Review material and baseline

Start with `docs/interface-refinement-2026-11-10/START-HERE.md` in this repository. The two self-contained HTML files are in that same folder:

- `lesson3-reviewed-comparison-standalone.html`: Login, Catalogue and Lesson detail; Current, Proposed and Both; Desktop and Phone controls. Current uses actual v1.14 captures, including fresh 390 × 844 Safari responsive captures.
- `lesson3-reviewed-preview-standalone.html`: the proposed interface independently, including document disclosures, Grade 12 filtering and phone layout.

The proposed lesson text was produced from the user's local `Biology_Cell_Structure_data.json` through the release generator and mammoth. Its three document bodies are preserved in full and partitioned into fifteen collapsed disclosures: overview, twelve lessons, Final Explanation and Summary Table. The partition was checked to reassemble the original HTML exactly. This illustrates the approved framing approach; production must use the actual selected immutable version and its existing cached document pipeline.

Read `CLAUDE.md`, `AGENTS.md`, current `SPEC.md`, relevant decisions and `docs/DESIGN-read-page-accordion-2026-08-29.md` in the implementation checkout. Claude's first review used `origin/main` at `08f3e84`; verify current main and intervening changes before coding. The Mac checkout used to write this plan remains the older `codex/backup-recovery-guidance` branch. Do not reset or repurpose unrelated work to implement this plan.

The previews are presentation references, not production code or functional-parity evidence. Their screenshot scaling, sample account, preview controls and simulated action handlers must never enter the application. DOM checks passed for page/view/device controls, collapsed sections, target opening and Grade 12 filtering. Claude's second review inspected desktop/390 px layouts. Actual application browser checks and physical-phone testing remain implementation acceptance work. The user subsequently clarified that printing is through the downloaded PDF and Word documents; browser printing of the reading page or HTML mockups is outside this refinement's scope and is not an acceptance blocker.

## 2. Settled design decisions

| Area | Final decision |
|---|---|
| Overall style | Keep the professional neutral/blue visual system and shared tokens across pages. |
| Brand | Keep the vertical blue mark beside ARES Lesson Plans. |
| Horizontal accents | Keep the short blue title accents, selected-tab underline and catalogue separators. The user explicitly likes their appearance and low space cost. Do not remove them under a blanket ban on decorative blue. |
| Informational labels | Use muted grey for labels such as Biology · Grade 10 and the login eyebrow; retain clear accessible contrast. |
| Grades | Always include hard-coded choices 10, 11 and 12, plus All. Also include any other grades actually present in the accessible catalogue data, so every existing plan remains filterable. Grade 12 must be offered immediately even with zero plans. A taxonomy-driven configuration change is not required. |
| Lesson navigation | Retain existing numbered one-click buttons. On phones preserve the current single sticky sideways-scrolling row and its scroll affordance. No dropdown, wrapped sticky grid or non-sticky replacement. |
| Read-page entry | Fully collapsed on arrival, with full lesson titles forming a table of contents. Open a specifically linked target automatically. |
| Catalogue groups | Open by default; search/filter matches must be visible. Users may collapse groups for the current visit. Do not persist disclosure state in browser storage. |
| Resume | Exactly one compact row below search/filter controls when there is eligible unfinished work. No recent-activity feed or three-row block. |
| Forum label | Start a forum discussion… |

Keep the approved login headline and introduction shown in the reviewed preview. Claude's alternative headline and suggestion to hide the resume row while typing were optional suggestions, not additional accepted requirements.

## 3. Shared chrome and login

Reuse shared header/brand, typography, spacing and button-system components on the frontend and custom admin surface. Preserve school identity and all role-dependent navigation.

Add an application-version footer to the avatar disclosure while retaining user type and scope, login identity, display-name editing, messages/unread count, dismissal/focus behavior and logout. Reuse `AppVersion`/`appVersionLabel` and `APP_RELEASE_VERSION`, including their development/build/unavailable fallbacks. Pass a server-derived label into client components; do not hard-code 1.14 or confuse it with a lesson's version. Use the existing `releaseVersionLabel` for lesson-version/release provenance.

Login has the approved two-column desktop arrangement and a stacked phone layout. Keep the application version, partner credit and school identity. Replace the secondary browse/download paragraph with the short invitation to discuss plans with other teachers. Show that invitation only when the forum is enabled. Reuse `systemSettingsForRender` in `lib/systemFlags.ts`, alongside the login page's existing `schoolNameForRender(payload)` read, for `forumEnabled`. No new signed-out request construction is needed; do not expose unrelated settings.

Put the signed-out brand strip inside the login page. Keep the authenticated root-layout header conditional and existing full-document auth transitions. Preserve first-user setup branching, password visibility, errors, busy states, SMTP-dependent registration/recovery behavior, authenticated redirects and the opt-in public-library link/boundary. Keep the existing Sign up label; no account-creation terminology rename is needed.

## 4. Catalogue and resume row

### Filters and density

- Keep the search placeholder and accessible name. The live application already has no visible Search label; the earlier mock label was removed. Do not introduce one.
- Retain the native subject dropdown and compact multi-select grade checkboxes: All and the sorted union of `{10, 11, 12}` with grades actually present in the accessible catalogue data. Derive this union from the full available corpus, not the currently filtered results, so choices do not disappear as filters change.
- Use the same supported-grade policy in display and URL parsing. Do not validate Grade 12 against grades currently present in plan data: `?grade=12` must remain selected and return zero matches, rather than silently becoming All.
- With no Grade 12 plans, say “No Grade 12 lesson plans are available yet,” with a useful way to choose another grade. Include the subject when selected, for example “No Grade 12 Biology lesson plans are available yet.” Use this availability wording only when the corresponding grade/subject corpus is empty; when a search, favorites view or other filter excludes existing plans, say that no plans match the active filters instead. Do not promise a date. Real Grade 12 data must appear automatically when added; no placeholder lessons, taxonomy change or migration is required for the checkbox.
- Preserve comma-separated multi-grade links and existing single-grade links, search/subject combinations, curriculum ordering and instant in-memory filtering. Preserve the existing 250 ms URL replacement behavior: no new browser-history entries for filter changes. Tab state must likewise avoid adding history steps.
- Use All lesson plans / My favorites as a two-button segmented control with `aria-pressed`, or implement the full keyboard contract if using actual ARIA tabs. Apply filters/search to both views. Preserve favorites on exact versions, pinned non-Official favorites, their labels and destinations, and the applicable version controls.
- Use actual stored names, counts and strand labels. Keep the compact quiet button system for downloads, versions and favorite actions; do not replace controls with bare blue text links. Preserve phone touch targets.
- Keep rows compact and supporting documents folded. Catalogue strand groups start open. Search/filtering reveals matching groups. Preserve complete results rather than paginating or virtualizing as part of this visual change.

### One row for unfinished work

Reuse the existing owner-scoped `listUnsavedWork` helper from the catalogue's server component, with the existing `PayloadRequest` construction pattern. Select the newest eligible row in its established order. Reuse the exact-version continuation route and recovery flow already used by Manage.

Retain ownership, expiry, readable-source and editing-access checks. Use Continue editing for restorable work and Open to copy when provenance permits only copy-out. Hide the row when nothing is eligible, including for a Teacher without editing access. Opening it must not save, discard, promote or overwrite anything. Preserve the editor's phone width guard.

Keep the full unfinished-work list in Manage. Add no timestamp block, recent-view tracking, new storage, migration or endpoint. Avoid per-plan resume queries.

## 5. Lesson page and full document accordion

### Controls and permissions

Keep Favorite and Back beside the title and the primary action row recognizable. Preserve Edit/Continue editing for eligible users, Request editing access for other users, and Make Official only for an eligible administrator viewing a non-Official version. Preserve all existing confirmation, recovery, concurrent-change and narrow-screen rules.

Versions & details groups the existing controls; it does not broaden their audience:

- Metadata remains available to everyone: selected version/release provenance, Saved by, Based on version, Created and Last modified, as currently supplied.
- Render history and Compare only under the existing `canEdit && versions.length > 1` condition. A plain Teacher must not be offered a version list, count/chip or Compare. A plain-Teacher disclosure may simply say Details.
- Preserve existing direct-version link access. The teacher-first rule is a display gate, not a new prohibition on otherwise readable version URLs.

Reuse the real PDF/Word/export components and their preparation, error, cache and busy states. Preserve the existing phone suppression of direct Word downloads and Word zip downloads. Do not hide email-in-Word merely because phone downloads are hidden; keep current SMTP and mode rules.

Share retains complete-document exports, every applicable supporting document, exact-version messaging, forum handoff and centrally resolved Advanced-only JSON/email actions. Derive deliverables from the selected version. The concept's Advanced tools grouping is illustrative; do not add a new local mode switch or expose actions disabled by permissions, SMTP or deployment settings.

Retain Official-update notices, newer-release/Combine suggestions, unfinished-work/recovery prompts and conditional continuation paths, including the current Standard-mode exceptions. Their absence in a normal screenshot is not permission to remove them.

### DOCX-derived content only

Implement the deferred read-page accordion using `DESIGN-read-page-accordion-2026-08-29.md`, particularly sections 4–9.

- Continue through the existing generated DOCX → mammoth → sanitizer/cache pipeline. Do not create a JSON/field-based document renderer, mini overview, rewritten lesson card or shortened document. Apply partitioning as a per-request lesson-page transform in `lessons/[id]/page.tsx`, next to the existing `annotateSections`. Do not modify cached HTML or shared `renderVersionSectionsCached` / `docxToSections` output. The editor's Quick preview (`previewShared.ts`) and Compare (`compareGroups.ts`) must retain their existing rendering.
- Partition the existing Lesson Sequence HTML at the lesson boundaries already recognized by `lessonAnchors.ts`; frame the original overview and each complete lesson in native details/summary. Frame Final Explanation and Summary Table similarly when present. Derive all counts and titles from actual output. Use “Overview” consistently in navigation and its disclosure. Reformat parsed DOCX headings as “Lesson n · title”, escape the extracted text, and fall back safely to “Lesson n” if the title cannot be parsed. Retain the existing “Version 1.0.0” style of version label.
- Keep valid complete tables and original content, including resources, outcomes, framework, teacher moves, assessment, reflection, differentiation, licensing and attribution. Production must handle absent optional documents, malformed boundaries and duplicate lesson numbers safely.
- Fully collapse document disclosures on normal entry. Retain all lesson numbers and full title labels. Open enclosing sections for an inbound hash on load, hash changes and in-page navigation before scrolling. Preserve existing anchor schemes. When a user opens a numbered lesson by its title, quietly update the hash to `#lesson-<n>` using `history.replaceState`, retaining the existing history state, path and query; do not add a history entry or trigger scrolling. This preserves `EditActions.tsx`'s current-lesson handoff. Distinguish explicit user opens from automatic deep-link expansion: programmatic expansion must not overwrite the requested/current lesson. If several lessons are open, retain the most recently user-opened lesson as the edit destination; do not introduce auto-closing siblings.
- Keep desktop sticky navigation and the existing single scrolling phone row. Respect the current touch sizing and fade/scroll affordance. If `lesson-<n>` ids move from inside `.doc-preview` onto disclosure wrappers, update the associated scroll-margin selectors too; the current offsets are 6.5rem desktop and 8rem phone, to be verified against the resulting toolbar height. Hash navigation must expand first, then scroll the heading below the sticky bar. Do not let menus be clipped or sticky controls obscure headings or keyboard focus.
- Preserve the accepted August 30 find-in-page tradeoff: scanning/searching the visible title list and searching an opened lesson are supported; Firefox need not auto-expand a closed lesson for a hidden full-text match.
- Printing is through the existing PDF and Word downloads. Preserve their full content, formatting, preparation and export behavior. Do not add browser-print disclosure scripts, print CSS fallbacks or reading-page print-preview checks as part of this refinement. This explicit user clarification supersedes the browser-print requirements in both reviews and the deferred August accordion design for this work.

## 6. Wording and documentation

Change only the Share label to Start a forum discussion… and update references that quote it. Reuse the existing `/discuss/new?version=<viewed-id>` composer. It already opens a form and posts only on explicit submission; preserve validation, cancel and busy behavior. Do not rebuild the composer or change the referenced version to the Official pointer.

Review empty/dead-end states in Lessons, lesson detail, Messages, Discuss, Manage and the editor. Add one contextual next step only where needed. Retain the already helpful empty Discuss and saved/unfinished-work guidance. Preserve omission of empty cleanup/review panels. Distinguish no matches from unavailable data/render failures, and offer only actions the caller can actually use.

Examples: empty favorites explains the star action; no search results suggests changing/clearing filters; an empty inbox suggests New message only if eligible recipients exist. Do not add permanent onboarding panels to populated pages.

Update the in-app Guide, `USER_GUIDE.md`, first-login Welcome dialog and release/change notes consistently for the segmented favorites view, Versions & details and forum label. Keep Sign up and other existing terms unless a separate change is agreed.

## 7. Implementation sequence

Use six separately reviewable changes, following Claude's proposed split:

1. Shared brand/header and account-version footer.
2. Responsive login and gated forum invitation.
3. Catalogue grades, segmented favorites, compact groups, resume row and related empty states.
4. Lesson header/control grouping with explicit role gates; retain existing numbered navigation and mobile scroll behavior.
5. Lesson-page-only DOCX accordion, hash/open handling, title-open Edit handoff and updated anchor offsets.
6. Remaining wording and matching Guide/manual/Welcome-dialog updates.

No migration or new server endpoint is expected. Reuse existing auth, recovery, export, forum, versioning and rendering components. Verify installed APIs before modifying framework integration. Avoid dependency upgrades and unrelated refactors. Reconcile any actual need for an endpoint/schema change in review before expanding scope.

## 8. Acceptance evidence

Use disposable local data and the current repository's pinned runtime/wrapper. Never run fixture-driven tests against the live installation.

**Behavior and role checks**

- Plain Teacher, Teacher with editing access in/out of scope, Subject-grade administrator in/out of scope and Site administrator. There are still three user types; editing access is a capability.
- Assert explicitly that a plain Teacher sees metadata but no version history/chip/count or Compare. Preserve direct-version access and all current action eligibility rules.
- Sign-in, first-user setup, school identity present/absent; forum, SMTP, public-library and Standard/Advanced combinations; unchanged local/offline behavior and auth transitions.
- Grade 12 alone, `grade=12` after reload/deep link, `grade=10,12`, old `grade=10`, search/filter/tab combinations, no matches, empty corpus and empty favorites. Check subject-specific Grade 12 wording and distinguish missing corpus from search/favorites exclusions. Add real Grade 12 fixtures and a grade outside 10–12; prove they appear and remain selectable after reload without a UI patch, with the same grade union used by controls and URL parsing.
- Exact-version favorites, pinned older favorites, history, Compare, Make Official, recovery/continuation and all export/share paths. Forum navigation must not create a post; explicit posting retains established behavior and version context.
- Resume with no/one/several captures, newest eligible row, expiry, missing/unreadable source, revoked access, copy-out-only provenance and a phone-width launch.
- Automated accordion tests: all sections collapsed on normal entry, every numbered target, inbound `#lesson-7` on initial load, hash changes and clicks opening closed targets, direct supporting-section links, duplicate/malformed/zero-lesson boundaries and complete HTML preservation.
- Open lesson 7 by its title, press Edit and verify the editor lands on lesson 7. Check that title opening does not scroll or add history entries and preserves query/history state. Test both pointer and keyboard opening.
- Jump to `#lesson-7` from the sticky bar on desktop and phone; verify the section opens and its heading remains below the sticky bar.
- Smoke-check the editor's Quick preview and Compare against their prior rendering; confirm no accordion wrappers or shared-cache changes reach either surface.
- Preserve existing PDF/Word export fidelity and completeness, including all lessons and applicable supporting documents, regardless of which reading-page sections are open. Browser printing of the reading page and mockups is not a required check.

**Phone, accessibility and density checks**

Inspect actual app layouts at 320, 360, 390, 430, 768, 1024 and 1280 px, phone landscape and 200% zoom. Check actual iOS Safari and Android Chrome; explicitly record unavailable physical-device checks. The supplied captures and Phone switch are responsive desktop previews, not that evidence.

Require accessible field names, associated checkbox labels, effective 44 px touch targets, visible focus and correct disclosure/button keyboard behavior. Avoid page-level horizontal overflow. Wide document tables may scroll inside a clear contained area. Keep account/Share/version menus usable on short screens and with the phone keyboard. Preserve existing phone Word suppression and editor width restrictions.

Exercise at least 150 representative sub-strands with varied subjects, grades, long names, version/document counts and full real lesson structures. Verify compact rows, open-by-default groups, visible matching results, accurate active-view counts and instant client-side filtering without a server render per keypress.

Run relevant existing unit/integration/HTTP/e2e checks, lint, formatting, types, build and applicable fidelity gates. Add focused regression coverage for changed behavior; avoid tests that merely mirror CSS declarations. Capture before/after screenshots of the three primary pages, open account/Share/version disclosures, Grade 12 and other empty states, plus shared-style smoke checks of Manage, Messages, Discuss, Guide and the editor. Record devices, widths, roles, commands/results and remaining gaps.

## 9. Handoff status

Both reviews are incorporated, with their browser-print requirements superseded by the user's clarification: teachers print the PDF/Word exports, not the reading page. The six-change sequence stands, with no migration or new endpoint expected. Before implementation, verify current main and repository instructions rather than repurposing the unrelated checkout. Begin the first change only on an implementation request. Physical-phone layout checks need the user's device participation; desktop browser checks can run against the Mac's disposable local stack. Record unavailable checks explicitly and do not claim them complete.
