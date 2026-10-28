# UI batch 2 simplicity review

Source: immutable v1.10 c8d8f3d22c432061c8bff27e8357dd9f2d4feb91 checkout `ares-v110-review`.

## components-05 — complete
Fully read all 10 files: Manage/BackupStatusPanel.tsx, ClockCheck.tsx, LocalTime.tsx, PersonIdentity.tsx, RolesAccessPanel.tsx, SubjectsAndGradesPanel.tsx, SystemFactsPanel.tsx, SystemFeaturesPanel.tsx, UnsavedWorkList.tsx, UsersPanel.tsx. Dependencies observed: Accordion panel state/jump, taxonomyActions, systemFeaturesState, assignmentCounts, wireError, userSearchContract and editRecovery; not yet fully read. No material candidate established. Minor repeated toPeopleSafe calls in RolesAccessPanel (325-328, 347) could be cached locally, but benefit too small to recommend alone. Keep distinct user search/debounce states (UsersPanel 404-409, 456-472), refresh reconciliation (69-81), and settings in-flight guard/error reload handling (SystemFeaturesPanel 55, 71-140): these serve distinct behaviors.

Remaining: components-06, components-07, frontend-01, frontend-02, frontend-03, admin-wiring-01, admin-wiring-02; all files pending.

## components-06 — complete
Fully read all 24 packet files in order: Manage/panelState.ts, readFeaturesSettings.ts, systemFeaturesState.ts, taxonomyActions.ts, useOpenPanels.ts; Modal/index.tsx, NewTabLink.tsx, NewerAresPrompt.tsx, OfficialUpdateNotice.tsx, PageBackLink.tsx, PageHeader.tsx, PasswordInput.tsx, PhaseSelectField/index.tsx, RedirectToManage/index.tsx, RequestEditingButton.tsx, RowLabel/formatRowLabel.ts, RowLabel/index.tsx, SchoolName.tsx, SubjectSelectField/index.tsx, SubjectSelectField/options.ts, UploadBundles/OfficialPreviewList.tsx, UploadBundles/index.tsx, UserMenu/DisplayNameForm.tsx, UserMenu/index.tsx. Test dependencies identified by search: tests/unit/uploadBundles.spec.tsx, officialPreviewList.spec.tsx and tests/e2e/uploadBundles.e2e.spec.ts; not fully read.

Candidate: UploadBundles/index.tsx 79-89, 119-123, 136-137 and 386-400 duplicates the same response bundles in `results` state and `report.bundles`. Derive results from completed report (default empty), eliminating paired setters and synchronization risk. Preserve no results during confirmation, clear when picker opens/cancels, 200/422 mixed reports and unchanged visible output; unit uploadBundles and e2e cover representative reports. `missing` also duplicates a response field but its null sentinel controls confirmation, including an empty list, so do not simplify without preserving that distinction.

Rejected as unsafe/superficial: accordion URL reconciliation, focus and microtask deferral (useOpenPanels 90-132, 187-243), modal portal/hydration and focus trap (Modal 32-137), and live row-label subscription (RowLabel 16-20, 34-37) each have stated distinct purposes.

Remaining packets: components-07, frontend-01, frontend-02, frontend-03, admin-wiring-01, admin-wiring-02; all pending.

## components-07 — complete
Fully read VersionTimestamps/index.tsx, VersionsChip.tsx, WelcomeDialog/index.tsx, exportClient.ts. Dependencies: shared Modal, FavoriteToggle, aresReleasePresentation, versionsOrder, welcomeDismissal, export endpoints; not fully read. No material candidate: similar prepared document/ZIP download paths have distinct fallback names/messages, and preview paths must preserve synchronous popup, error cleanup, and iOS handling. Keep two-pass local timestamps to avoid hydration/timezone mismatch (VersionTimestamps 12-20, 40-48) and VersionsChip re-fetch on every open (106-115).

Remaining: frontend-01, frontend-02, frontend-03, admin-wiring-01, admin-wiring-02, all pending.

## frontend-01 — complete
Fully read LibraryBrowser.tsx, discuss/[id]/page.tsx, discuss/new/page.tsx, discuss/page.tsx, explore/page.tsx, forgot-password/ForgotPasswordForm.tsx, forgot-password/page.tsx, guide/page.tsx (all 1160 lines), layout.tsx, lessons/[id]/EditActions.tsx. Dependencies include substrand filtering/order, Guide accordion availability/state, discussionPages, session and shared modal; not fully read here.

Candidate: LibraryBrowser.tsx 152-164 invokes its private SearchResults only when `filtered` or `filteredPinned` is nonempty, and supplies their concatenation. Its own empty branch at 301-303 is unreachable and differs from the actual outer empty message. Remove that branch and now-unused `query` prop, retaining the existing outer empty text and list. Verify search including pinned-only, no results and filters; no visual or access change. This is modest, but removes misleading dead behavior.

Retain debounced URL timer cancellation and browser-history handling (LibraryBrowser 61-90), phone-width check at click (EditActions 50-60), and role/feature gates in Guide. Guide content corrections are handled by separate guidance work; not findings for this presentation pass.

Remaining: frontend-02, frontend-03, admin-wiring-01, admin-wiring-02 pending.

## frontend-02 — complete
Fully read lessons/[id]/EmailModal.tsx, ShareMenu.tsx, compare/CompareFilter.tsx, ComparePickers.tsx, compare/page.tsx, lessons/[id]/page.tsx, login/FirstUserForm.tsx, LoginForm.tsx, login/page.tsx, messages/Composer.tsx, MarkShownRead.tsx, ReplyBox.tsx, page.tsx, sendMessage.ts, (frontend)/page.tsx, reset-password/ResetPasswordForm.tsx and reset-password/page.tsx. Dependencies include exportClient, shared Modal, lesson read/permissions, discussion and reference loaders. No material simplicity candidate established. Keep distinct download/email states, server-access gates, unread-first fetch, and message/reference fallbacks; render and input differences make a forced form abstraction unhelpful. Baseline login tagline is intentionally outside scope.

Remaining: frontend-03, admin-wiring-01, admin-wiring-02 pending.

## frontend-03 — complete
Fully read signup/SignupForm.tsx, signup/page.tsx, styles.css lines 1-2069, verify-email/VerifyEmail.tsx and verify-email/page.tsx. Stylesheet consumers inspected in prior packets: LibraryBrowser, ShareMenu, compare pages, message/discussion pages, Guide, WelcomeDialog and shared Modal; stylesheet cascade also depends on shared app-dialog/app-chrome/app-tokens and Payload styles, pending below. No selector declared unused based on search. No material candidate established: responsive restatements for 44px touch targets, scoped Word hiding, desktop chip reserve, and wide-table fallback are intentional; preserve their specificity and respective phone/desktop behavior. Signup/verification state and error branches are distinct.

Remaining: admin-wiring-01 and admin-wiring-02 pending.

## admin-wiring-01 — complete
Fully read (payload)/custom.scss lines 1-2912. Concrete consumers reviewed include Manage SubjectsAndGradesPanel, UsersPanel, RolesAccessPanel, SystemFactsPanel, UploadBundles, shared Modal, VersionTimestamps, and frontend styles; CSS also depends on Payload-generated DOM and installed Payload layered rules. No deletion candidate proven: the retired taxonomy-panel block at 1118-1204 looks potentially obsolete after the matrix replacement, but only `.lp-taxonomy__field` is visibly emitted by the matrix (SubjectsAndGradesPanel 272-281); source search alone does not prove that other selectors cannot match dynamically generated markup. Further audit of all admin render/config entry points and browser cascade would be needed. Keep hidden guards, specificity-dependent button states, phone overrides and Payload-specific scoping.

Remaining: admin-wiring-02 (app-chrome.scss, app-dialog.scss, app-tokens.scss) pending.

## admin-wiring-02 — complete
Fully read app-chrome.scss (1-271), app-dialog.scss (1-123), app-tokens.scss (1-181). Consumers checked: UserMenu and DisplayNameForm; frontend layout and custom.scss both import these shared files; shared Modal portal and its modifiers were read in components-06 and frontend/admin styles. No additional material candidate established. Retain distinct admin/frontend button adapters and phone touch geometry; token palette intentionally fixes button ink across themes.

## Coverage and follow-up
All eight assigned packets fully read, including both complete large stylesheets; no partial assigned files. Relevant tests were located for UploadBundles but not fully read or run (read-only review). Two source simplifications are candidates, both with invariants above. The old taxonomy selectors remain an unverified lead, not a finding. No code, repository, git, or live-system changes were made.
