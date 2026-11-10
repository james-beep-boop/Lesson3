# Lesson3 interface refinement review and implementation plan

Date: November 10, 2026. Status: design agreed in conversation; ready for Claude's review. This handoff requests a review, not implementation, a commit, deployment, or release.

Improve the login, catalogue and lesson detail pages while retaining Lesson3's restrained professional appearance and all existing capabilities. The revised interface should make common actions clearer, keep the catalogue compact at more than 100 sub-strands, and support reading, browsing, sharing and navigation on phones. Existing restrictions on editing at narrow widths remain in force.

## 1. Review baseline and precedence

Read `CLAUDE.md`, `AGENTS.md`, the current `SPEC.md`, relevant decisions and the current handoff in the implementation checkout. Preserve unrelated work. The local checkout where this plan was prepared is `codex/backup-recovery-guidance` at `d985c23`; it is older than the live application reviewed. Do not implement the new interface on that old application baseline or reset that checkout to get a newer one.

The current-page images in the accompanying comparison were captured from `test.kenyalessons.org` on November 10, showing application version 1.14. Functionality was also inspected in release commit `d5217a4`. Before implementation, verify the intended current `main`, deployed version and any intervening changes. Establish one explicit baseline commit for the work.

Review files in the accompanying bundle:

- `lesson3-refined-review.html`: revised interactive concept, including the 390 px phone layout.
- `lesson3-refined-comparison-for-claude.html`: captured current pages and revised concepts, with side-by-side and individual views.
- This plan: the agreed decisions, behavior requirements and acceptance criteria.

The application and specification define existing behavior; this plan defines the requested changes. The concepts illustrate presentation. They are not production components or evidence of functional parity. Their abbreviated lesson content, sample account and preview actions must not replace real data or behavior. Resolve any conflict in review before implementing it.

## 2. Agreed presentation changes

### Shared appearance and account menu

- Keep the neutral light surfaces, restrained blue accent, existing shared typography and predictable controls throughout the site. Use the existing shared tokens instead of creating a second design system.
- Add the small vertical blue mark next to “ARES Lesson Plans” through the shared header/brand components. Apply it consistently to the frontend and custom admin header, with an appropriate equivalent on login.
- Preserve school identity, navigation destinations, user-type and scope information, account identity, display-name editing, unread messages and logout.
- Add a quiet application-version footer to the avatar dropdown. Reuse the existing `AppVersion`/`appVersionLabel` source and its release, development, source-build and unavailable fallbacks. Pass the server-derived label into client components where necessary. Do not hardcode `1.14` or expose arbitrary environment values.
- Keep application version and lesson-content version visibly distinct. For example, application “Version 1.14” belongs in login/account chrome; lesson “Version 1.0.0” belongs with the selected lesson.
- Other pages inherit the shared appearance; this is not a redesign of Manage's structure or the editor's workflow.

### Login

Use the approved two-column desktop arrangement: a short introduction on the left and the sign-in form on the right. Stack them on a phone.

- Retain the proposed headline and short introduction as the presentation reference.
- Remove the secondary “Browse by subject and grade. Read online or download PDF and Word documents” paragraph.
- Use the short forum invitation: “Discuss your lesson plans with other teachers. Share ideas, ask questions, and learn from one another in the discussion forum.” Keep its visual treatment quiet.
- Preserve ARES Education/Seavuria attribution, school identity and the application-version display.
- Preserve actual authentication, password visibility, errors, busy/disabled states, sign-up and password-recovery routes, SMTP-dependent account flows and the authenticated-user redirect.
- Preserve the first-user setup branch. Do not leak normal sign-in, forum or discovery actions onto a setup state that currently excludes them.
- Preserve the existing opt-in public-library link and server-side deployment boundary. The welcome copy must not turn public discovery on.
- When the forum is disabled, omit the forum invitation rather than advertise an unavailable feature.

### Catalogue

Keep the grouped curriculum catalogue and improve its hierarchy without turning every sub-strand into a tall card.

- Remove the visible “Search” label above the search box. Keep the placeholder and a programmatic accessible name.
- Retain a native subject dropdown. Use compact multi-select grade checkboxes: All, 10, 11 and 12.
- Always offer Grade 12 even while it has no plans. Do not create placeholder lessons or taxonomy records merely to display the checkbox.
- Preserve existing valid grade choices if the implementation supports additional grades. Crucially, separate selectable grades from grades with data: URL parsing must not discard `grade=12` and silently fall back to All because the corpus currently lacks Grade 12.
- When Grade 12 alone is selected and has no plans, say “No Grade 12 lesson plans are available yet.” Add a short way back to available grades. Do not promise a publication date. Once real Grade 12 plans exist, the same filter should show them automatically.
- Preserve instant client-side filtering, curriculum order, search, subject/grade combinations, shareable URLs, reload and Back/Forward behavior. The current release uses comma-separated grades; keep old single-grade links working.
- Use “All lesson plans” and “My favorites” tabs in place of the duplicated favorites section. Apply the same search and subject/grade criteria to both tabs. Retain access to favorites on non-Official versions, their pinned/version labels and exact-version links.
- Define the selected-tab state using existing navigation conventions; do not add a new history or preference system for it. Test that navigation and filter state remain coherent.
- Show actual stored display names, strand labels, counts and version information. The illustrative “Cell Structure and Function” and “Living things and their environment” labels were withdrawn. The representative live names are “Cell Structure,” “Chemicals of Life,” “Cell Biology,” and “Strand 1: Cell Biology and Biodiversity.”
- Keep names, lesson counts, eligible version controls, favorite toggles and primary PDF/Word actions compact. Fold supporting documents into a disclosure. Remove repeated explanatory metadata where it adds no value; do not remove information needed to identify a pinned version.
- Use collapsible strand groups as illustrated. Filtering/search must reveal matching results rather than leave them concealed in a closed group. Preserve grouping/order and existing keyboard semantics.
- Handle an empty favorites tab with a short next step: “No favorites yet. Tap the star beside a lesson to save it here.” Provide a route back to All lesson plans.

### One resume row

Show exactly one quiet row below the search/filter controls when the caller has eligible unfinished work. Example: “Pick up where you left off: Continue editing Cell Structure.”

- Reuse `listUnsavedWork` and the existing owner-scoped recovery/provenance rules; choose the newest eligible item in their existing order.
- The link must reference that item's exact source version and use the current restore flow. Opening it must not save, discard, promote or overwrite content.
- Preserve checks for ownership, current read/edit access, expiry, missing versions and schema/source changes. If the current recovery flow permits only copy-out, label the action “Open to copy” rather than falsely promise continuation.
- Hide the row when there is no eligible work. Do not add an empty resume panel, a recent-browsing feed, timestamps or a three-item list. Keep the complete unfinished-work list in Manage.
- Retain the current narrow-screen editing guard when following this shortcut from a phone; do not provide a bypass into unsupported editing.
- Do not add a new database schema, storage mechanism or endpoint if existing server helpers can supply this row. If a new endpoint proves necessary, treat it as a separate, explicitly reviewed change with the repository-required HTTP authorization tests.

### Lesson detail

Use the cleaner heading, quiet subject/grade context, primary action row and section treatments. Reuse existing data and components underneath them.

- Keep Favorite and Back beside the title.
- Keep Edit/Continue editing, primary PDF, Word and Share readily available with their current eligibility rules.
- Group version history, Compare and metadata under “Versions & details.” This changes location, not capabilities or which selected version they act on.
- Keep the small numbered lesson buttons for one-click navigation; do not use the proposed lesson dropdown. Size them for touch and wrap them. Twelve lessons should fit as two rows of six in the representative phone layout. Generate destinations from actual lessons, not a hardcoded twelve-item list.
- Provide each number's full lesson title accessibly and on hover/focus where appropriate. Keep Overview, Final explanation and Summary table destinations.
- Retain the complete document through the existing generator-derived rendering pipeline. The concept's short excerpt is not a proposed curriculum edit or replacement renderer.
- When grouping content into disclosures, retain all fields, outcomes, phases, resource links, teacher moves, assessments, reflections, differentiation, supporting documents and attribution. Do not create invalid table markup when introducing section wrappers.
- Jumping to an anchor must open any enclosing collapsed sections before scrolling. Preserve direct hashes, Back behavior and the current ability to carry the lesson context into editing.
- Preserve sticky action/section navigation without letting a large fixed header obscure phone content, focus targets or anchor headings.

### Forum action

Rename “Discuss this version” in Share to **“Start a forum discussion…”**.

It opens the existing discussion composer linked to the exact viewed version, including when that is not the Official version. Use a clear composer heading, visible lesson/version context, title/message fields and an explicit final posting action such as “Post discussion.” Opening the composer must never publish a post. Preserve cancellation, validation, disabled/busy states and forum availability checks. Reuse the existing route and posting flow; do not add another composer.

## 3. Functionality that must survive

Before editing, Claude should complete a baseline-to-proposed action inventory using current source and a running app. Include conditional actions even when absent from the normal Official-version screenshot.

| Capability | Proposed home and preservation requirement |
|---|---|
| Browse/search/filter | Catalogue controls; instant filtering, multi-grade semantics, curriculum order, deep links and history remain coherent. |
| Favorites | Catalogue tabs and lesson heading; preserve exact-version identity, pinned older versions, updating/removing a favorite and empty states. |
| Editing | Main toolbar; preserve Edit/Continue editing, Request editing access, field permissions and narrow-screen behavior. |
| Official version | Preserve Make Official only for eligible administrators on a non-Official version, including confirmations and concurrent-change protection. |
| Versions and Compare | Versions & details; retain all readable history, selection, comparison and link context. |
| Metadata | Versions & details; retain Version, Saved by, Based on version, Created and Last modified, plus release provenance and Official status. |
| Primary exports | Direct PDF/Word controls; retain document identity, preparation/download states, errors, cache behavior and current phone rules. |
| Supporting exports | Share; preserve every actual supporting document and its applicable PDF/Word action. Derive the list from the selected version's deliverables. |
| Complete exports | Share; retain available all-document PDF/Word zip actions. |
| Message/email/forum | Share; retain exact-version messaging, conditional document email and the existing forum handoff. |
| Advanced tools | Preserve centrally resolved Standard/Advanced rules for JSON, email and other actions. The mock's illustrative “Advanced tools” group does not authorize a new local mode switch or reveal unavailable actions. |
| Updates and unfinished work | Retain Official-update notices, newer-release/Combine suggestions, recovery prompts, continuation paths and state-dependent actions. |
| Read and navigate | Full content, every lesson anchor, supporting sections, sticky navigation, collapsed-target opening and editing-context handoff. |
| Account and navigation | Preserve school identity, user type/scope, account information, name editing, unread counts, all permitted destinations and logout; add application version. |

There remain three user types. A Teacher with editing access is a capability case to test, not a fourth account type. The Site-administrator concept does not authorize showing its controls to everyone.

## 4. Contextual empty states across the site

Make a targeted wording pass through Lessons, lesson detail, Messages, Discuss, Manage and the editor. Replace dead ends with one useful sentence and an existing permitted next action. Do not add permanent onboarding paragraphs, dashboard cards or new workflows to populated pages.

| State | Treatment |
|---|---|
| Empty catalogue | Explain that no plans are available. Offer Manage only to callers allowed to use the relevant action; otherwise point to the school administrator. |
| No search/filter results | Suggest another search or clearing filters; retain entered criteria until the user clears them. |
| Grade 12 has no plans | Use the specific Grade 12 message above; distinguish absence from a loading or server error. |
| Empty favorites | Explain the star action and offer All lesson plans. |
| Empty inbox | Suggest the existing New message action only when an eligible recipient is available. Otherwise explain the unavailable next step. |
| Empty discussions | Keep the already helpful introduction and Start the first discussion action; respect forum availability. |
| Discussion search has no matches | Preserve that search covers titles only; suggest fewer words or clearing the search. |
| Empty saved/unfinished work lists | Keep useful existing instructions; avoid duplicating them. |
| Nothing awaiting cleanup/review | Keep the current omission of unnecessary cleanup sections. Do not add cards merely to announce no work. |
| Editor has no changes | Preserve existing feedback and disabled-action explanations; do not change save/discard/recovery behavior. |
| Lesson cannot render | Keep an honest error and useful retry/export routes where available. Never present a failure as an empty or complete document. |

## 5. Phone and accessibility acceptance criteria

The concept's Phone control is not a device test. Accept the implementation only after inspecting the actual app.

- Test portrait widths 320, 360, 375/390 and 430 px; tablet 768 px; desktop 1024 and 1280/1440 px. Include a short landscape viewport and 200% browser zoom.
- Inspect on actual iOS Safari and Android Chrome, with browser emulation used for the broader matrix. If a real device is unavailable, explicitly record that gap; do not report full phone verification.
- No page-level horizontal scrolling, cropped labels or overlapping controls. Truly wide document tables may have a clearly contained horizontal scroll area without hiding cell content or scrolling the whole page sideways.
- Search has an accessible name without restoring the redundant visible label. Checkboxes have associated labels and usable tap areas; All and individual-grade selections stay synchronized.
- Native dropdowns work with the phone picker, remain legible, and do not require a custom interaction library. Editable field sizing must avoid unintended phone zoom.
- Number buttons have at least 44 px effective touch targets on touch layouts; phone wrapping does not turn into a horizontally scrolling strip of hidden lessons. Long titles remain readable in their proper context.
- Account, Share and version disclosures stay within the viewport. All their content remains reachable on short screens and with the on-screen keyboard. Opening a disclosure does not conceal its own close/trigger action.
- Preserve normal keyboard order, visible focus, disclosure expanded state, Escape/outside dismissal and focus return where currently supported. Use buttons for actions and links for navigation. Color is not the sole state signal.
- Native details, numbered anchors and new tabs must remain accessible; choose ARIA semantics that match their actual keyboard behavior.
- Sticky regions do not hide content, anchors or focus targets. Opening a collapsed target and scrolling to it works after resize and direct-hash navigation.
- Preserve existing mobile export policies and the editor width guard. Document any existing phone-only suppression of Word/zip actions; do not broaden it simply to make the new layout fit. Changing that policy requires a separate product decision.

## 6. Implementation sequence after review

1. **Baseline and inventory.** Work from the verified current source, capture representative before states, and reconcile the action inventory above. Inspect relevant shared styles and existing component APIs before changing them.
2. **Shared chrome and login.** Update tokens/components surgically, add the brand mark and shared application-version footer, then implement the responsive login without altering account or deployment branches.
3. **Catalogue.** Add tabbed favorites, compact rows, Grade 12 and the one-row unfinished-work projection. Preserve existing filters, URL contract, version identity and in-memory responsiveness.
4. **Lesson detail and forum wording.** Reorganize existing controls and full rendered sections, preserve conditional prompts, restore numbered navigation and clarify the composer entry label.
5. **Empty-state wording.** Apply the reviewed short next steps only to the applicable empty/error states across the six surfaces.
6. **Verification and handoff.** Complete the behavior matrix, screenshots, phone checks and repository checks. Record the final design and any corrected decisions using repository conventions.

Suggested existing seams, verified in the reviewed release and subject to current-main verification:

- `app/src/app/app-tokens.scss`, frontend `styles.css`, admin `custom.scss`, shared brand/header/navigation components.
- Frontend `login/page.tsx`, `AppVersion.tsx`, `lib/appVersion.ts`, `UserMenu` and `AppNav`.
- Catalogue `page.tsx`, `LibraryBrowser.tsx`, `lib/substrand.ts`, favorite/version/document components.
- `lib/editRecovery/unsavedWork.ts` and Manage's existing `UnsavedWorkList` continuation flow.
- Lesson `[id]/page.tsx`, `EditActions.tsx`, `ShareMenu.tsx`, `LessonDetails.tsx`, `VersionsChip`, document-section/anchor helpers and `advancedTools.ts`.

Do not copy the mock's fixed stage heights, screenshot images, scaling transforms, sample data, fake status actions or preview controls into Lesson3. Do not change the data model, generator, immutable-version semantics or permission checks as part of the presentation pass. Avoid dependency upgrades and unrelated cleanup.

## 7. Required verification

Use disposable local data, never live fixture-driven tests. Follow the current checkout's pinned runtime and `scripts/in-deps.sh` workflow.

**Meaningful regression coverage**

- Grade 12 with zero plans: checkbox remains selected and empty state appears after reload, deep linking and Back/Forward. Selecting 10+12 still returns Grade 10 matches; adding real Grade 12 fixture data makes those records appear with no UI code change.
- Search/subject/grade combinations in both tabs; favorites on Official and pinned older versions; no duplicates, lost pins or incorrect destinations.
- Resume row: none, one and several captures; newest eligible owner-only item; expiry, deleted/unreadable source, revoked editing access and copy-out-only provenance. Opening the shortcut preserves current restore and warning behavior.
- Lesson actions across Official/non-Official versions, clean/unfinished work and Standard/Advanced settings. Verify the selected version reaches every export, comparison, message and forum handoff.
- Forum composer entry does not create a post; explicit posting, validation and cancel retain the established behavior. Test forum disabled, SMTP absent/present and unavailable advanced actions.
- Every lesson number, full supporting sections, direct hashes, opening collapsed targets and current-lesson handoff into editing.

**Role and deployment matrix**

Exercise a plain Teacher, a Teacher with editing access in and outside the current subject-grade, a Subject-grade administrator in and outside their scope, and a Site administrator. Use signed-out/first-user states for auth pages. Include configured/absent school identity, public library enabled/disabled, forum enabled/disabled and email configured/unconfigured. Preserve offline/local-school behavior and avoid new external asset or API dependencies.

**Content, density and performance**

Use at least 150 representative sub-strands across subjects and grades, including long names and varied version/document counts. Verify compact row alignment, filters, collapsible groups and manageable scrolling. Search/filter changes should not introduce an application render or database round trip on every keypress. Confirm the added owner-scoped resume read is bounded in effect and does not introduce per-row queries.

Use full real lesson structure for at least one long plan with twelve or more lessons. Compare the complete rendered content and representative exports to the baseline; an unchanged generator alone does not prove the UI kept every section. Run existing fidelity gates when their relevant seams are touched, and avoid changing generator bytes.

**Repository and visual checks**

Run applicable existing unit, integration, HTTP and end-to-end coverage, plus lint, formatting, TypeScript and the normal build/gates required by the current repo. New or auth-affecting endpoints require the repository's wire-level authorization tests. Add focused tests for the behavior above; do not create tests that merely mirror CSS declarations.

Capture actual before/after screenshots for login, catalogue, lesson detail with disclosures open, and the account version footer. Include narrow-screen and empty/Grade-12 states, plus smoke checks of Manage, Messages, Discuss, Guide and the editor after shared-style changes. Record tested widths, roles, devices/browsers, commands/results and unresolved gaps. Passing static checks is not visual or functional-parity evidence.

## 8. Requested Claude review response

Before implementation, return:

1. Required corrections or risks, with current-source evidence and severity.
2. Any missing capability or condition in the action inventory.
3. The smallest implementation breakdown and files likely to change, with a clear statement on whether a migration/new endpoint is unnecessary.
4. The final behavior/phone test matrix, including any checks that cannot be performed in the available environment.
5. A concise recommendation: ready to implement, or the specific corrections needed first.

In particular, review the empty-Grade-12 URL parsing, exact-version favorites and forum links, owner-only resume projection, full document/disclosure structure, phone sticky navigation and existing deployment modes. The goal is the agreed clearer interface with no silent loss of functionality.
