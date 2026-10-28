# UI2 ALTITUDE checkpoint

Read-only fixed v1.10 c8d8f3d22c432061c8bff27e8357dd9f2d4feb91, /home/james/Documents/Codex/2026-10-26/ares-v110-review. Only own sanitized checkpoints written. No repo/git/live/test actions, agents, merges, security audit or other UI reports. UI1 completed separately (ui1-altitude.md). UI2 scope components05..07, frontend01..03, admin-wiring01..02:15,632 lines/74 files.

## components-05 — complete (2,142 lines / 10 files)

New findings: none. Manage panels keep native/server permissions authoritative, with UI-owned confirmation/lifecycle and reused vocabulary (personLabel/grantRoleLabel/gradeLevels/assignmentCounts/clockSkew/wireError). RolesAccess keeps display capability separate from private roster projection; incumbent legacy lists, directional handover eligibility and consequences intentionally differ from Site Admin appointment/vacate, so no generic role-action dialog engine. Shared act handles actual wire request; server hook enforces eligibility. Server-projected data drives own drafts/expiry/warnings rather than new client policy.

UsersPanel is the deliberate lazy exception to bounded server-rendered panels: keep typing debounce separate from page/type/status transitions, last-page correction, current abort controller identity and row disclosure across refreshed updatedAt. Reset-link lifetime is ephemeral local state, not persistent browser storage; post actions retain freshness token and profile PATCH remains ordinary native path. Do not wrap different mutation/refusal/uncertain flows in generic account CRUD.

SystemFeatures uses pure reducer/diff + exact saveable flags and refuses retry after stale/uncertain state until reload; settings endpoint owns password/lock/authority ceremony. Backup/SystemFacts present precomputed statements; no status or probing policy moved into UI. ClockCheck is per-appearance fresh advisory read with midpoint usability gate. LocalTime/LocalDay keep explicit UTC SSR/hydration followed by local display; do not merge instant/local-day/calendar-day semantics into one formatter. PersonIdentity is a real shared semantic presentation primitive.

Full assigned source under app/src/components/Manage: BackupStatusPanel.tsx, ClockCheck.tsx, LocalTime.tsx, PersonIdentity.tsx, RolesAccessPanel.tsx(1-285,286-EOF), SubjectsAndGradesPanel.tsx, SystemFactsPanel.tsx, SystemFeaturesPanel.tsx, UnsavedWorkList.tsx, UsersPanel.tsx(1-210,211-410,411-EOF). No truncated output counted. Prior own full lib role projection/user contract/clockSkew/backup/systemFlags/TTL and service endpoints retained; helpers systemFeaturesState/readFeaturesSettings/taxonomyActions/accordion history are next assigned packet. No new exhaustive tests claimed/run.

Exact resume: components-06/Manage/panelState.ts. Remaining components06/07,frontend01..03,admin-wiring01/02.

## components-06 — complete (2,339 lines / 24 files)

New findings: none. Manage panelState/useOpenPanels correctly own URL vocabulary, ancestor/default selection and current availability gating; Guide disclosure has different URL/history semantics, so no unification. Preserve semantic location keys, deferred history replacement after Next instrumentation, at-focus consumption and back navigation. Feature settings server projection is UI-specific and logged-null fallback; enforcement remains systemFlags/settings endpoint. taxonomyActions already shares request lifecycle without inventing generic field policy.

Modal is the existing focus/scroll/portal primitive; preserve actual shared admin skin after body portal and caller-owned busy veto. Native Phase/Subject fields keep shared vocabulary and intentional legacy subject options. RowLabel subscribes one form field because provider is stale; pure formatter is already separate. PageBackLink crosses root layouts intentionally; NewTabLink, PasswordInput, SchoolName and PageHeader are useful semantic primitives, not wrappers to flatten.

UploadBundles presents authoritative server previews and tokens, retains identical files through 409, and independently owns confirmation answers; do not move release/taxonomy policy into it or genericize it with unrelated writes. UserMenu is shared by both roots, receives projected type/scope/unread, and DisplayNameForm owns short-lived draft state by mounting only while open. Native PATCH enforces permissions; full reload deliberately refreshes both roots. No new account endpoint or global form-state abstraction warranted.

Full assigned source: Manage/{panelState.ts,readFeaturesSettings.ts,systemFeaturesState.ts,taxonomyActions.ts,useOpenPanels.ts}; Modal/index.tsx; NewTabLink.tsx; NewerAresPrompt.tsx; OfficialUpdateNotice.tsx; PageBackLink.tsx; PageHeader.tsx; PasswordInput.tsx; PhaseSelectField/index.tsx; RedirectToManage/index.tsx; RequestEditingButton.tsx; RowLabel/{formatRowLabel.ts,index.tsx}; SchoolName.tsx; SubjectSelectField/{index.tsx,options.ts}; UploadBundles/{OfficialPreviewList.tsx,index.tsx}; UserMenu/{DisplayNameForm.tsx,index.tsx}. No truncation counted. Prior full access/native hooks/upload endpoint/releaseDecision/lib vocabulary retained as dependencies; no new tests claimed/run.

## components-07 — complete (764 lines / 4 files)

New findings: none. VersionTimestamps uses primitive form selectors and deterministic UTC hydration; compact Manage LocalTime is a different display contract, so extracting generic date formatting is not a substantial ownership improvement. VersionsChip already uses Modal, FavoriteToggle, release presentation and shared Official-first sort; server decides visibility and native REST read access remains authoritative. Reopening intentionally refreshes favorite ids instead of caching first-open state.

WelcomeDialog role selects onboarding prose, not access authority; dismissal is per-account advisory browser preference. exportClient is appropriate browser transport/presentation boundary shared by both roots: POST prepare versus GET status/download, shared popup-blocker checked delivery and temporary viewport notice, file buffering prevents iOS current-history navigation. Do not move browser choreography to server generator or genericize distinct prepared/generated paths; maintain error state, popup cleanup and blob lifetime. Its private message fallback differs from generic wireError precedence/clone handling, so blind substitution rejected.

Full assigned source: VersionTimestamps/index.tsx (63), VersionsChip.tsx (193), WelcomeDialog/index.tsx (168), exportClient.ts (340). Combined initial output truncated WelcomeDialog middle; entire 168-line file re-read explicitly. All exportClient lines visible and read. Prior full DocButtons/LessonControls/export/job/generator boundaries retained as dependency coverage. No tests run or exhaustive tests claimed.

Exact resume: frontend-01/LibraryBrowser.tsx. Remaining frontend01..03,admin-wiring01/02.

## frontend-01 — complete (2,284 lines / 10 files)

New findings: none. LibraryBrowser owns synchronous in-memory criteria and debounced shareable URL writes; pure curriculum grouping/order/filter/context already belongs to lib/substrand. Popstate cancels pending URL writes. Discussion pages compose shared loaders/paging/session and native readable-version projection, keeping server query/permissions outside client composers; read markers cover only actually shown ranges, and missing prefills are explicit. Plain GET discussion search differs intentionally from full in-memory catalogue.

Guide's 1,160 lines are mostly task prose and composition of existing availability/panel helpers. No policy-engine extraction or prose-to-data redesign justified by size. It imports canonical linkable field vocabulary rather than repeating it. Explore calls shared public-library guard rather than trusting layout visibility. Frontend layout owns root CSS, authenticated chrome and dynamic rendering; auth transitions require full navigation because cached layout shape changes. EditActions deliberately owns advisory warning/confirmation and carries exact previous-Official consent id; server owns atomic promotion, access and 409 semantics. Shared width vocabulary/Modal already used. ForgotPassword has intentionally uniform responses except requester rate cap; generic request/error handler would change its contract.

Full assigned source: LibraryBrowser.tsx(380); discuss/[id]/page.tsx(122); discuss/new/page.tsx(56); discuss/page.tsx(194); explore/page.tsx(42); forgot-password/{ForgotPasswordForm.tsx(105),page.tsx(25)}; guide/page.tsx(1-300,301-585,586-875,876-1160); layout.tsx(60); lessons/[id]/EditActions.tsx(140). Initial combined output truncated EditActions beginning; entire 140-line source re-read. No missing assigned ranges. Prior full lib/substrand, discussion loaders/text/paging/session/publicLibrary and UI controls retained as dependencies; no tests run/exhaustive coverage claimed.

Exact resume: frontend-02/lessons/[id]/EmailModal.tsx. Remaining frontend02/03,admin-wiring01/02.

## frontend-02 — complete (2,314 lines / 17 files)

New findings: none beyond prior own service S02, now confirmed by full LoginForm/ResetPasswordForm: their pure machine-code imports come from server APIError module; proposal remains moving only pure wire exports into existing dependency-free lib/wireError owner, preserving server class/repair and exact error precedence/body consumption. No additional UI redesign.

Lesson/compare pages correctly compose shared access-gated readBundle, requestedVersion, generator caches and pure label/anchors/summary helpers. Explicit unavailable ids are resolved before default/minimum checks; preserve permission proof before cached system fetch and propagate real read failures. Per-page default compare selection and server-rendered pane grouping stay in page; CompareFilter receives children, avoiding serializing HTML twice. Native snapshot details and personal favorites already separate. Share owns disclosure/download status, EmailModal owns compose state and async-queue language; shared deliverable split prevents duplication and mode is display only.

Messages server page owns inbox view-window queries and viewer-scoped reference projection. Existing resolveVersionReferences carries version authority; no Official fallback when a stored label survives FK deletion. Unread-first split is intentional DB-independent ordering; mark only shown ids on POST, not GET. Composer/ReplyBox share sendMessage transport and keep differing UX state; replyTo server owns inherited reference/recipient. Do not introduce generic composer with forum uncertainty protocol. Browse's page-specific batched projection/buildRow remains appropriate, with shared versionDeliverables/access/labels/counts; existing documented narrow-projection perf issue is not a new ALTITUDE candidate. Auth forms use native operations and password primitive; preserve bootstrap transaction, full-document auth transition, reset token URL scrub, disabled versus unverified semantics.

Full assigned source: lessons/[id]/{EmailModal.tsx(117),ShareMenu.tsx(237),page.tsx(298),compare/{CompareFilter.tsx(39),ComparePickers.tsx(54),page.tsx(233)}}; login/{FirstUserForm.tsx(114),LoginForm.tsx(112),page.tsx(79)}; messages/{Composer.tsx(158),MarkShownRead.tsx(31),ReplyBox.tsx(99),page.tsx(311),sendMessage.ts(41)}; page.tsx(251); reset-password/{ResetPasswordForm.tsx(109),page.tsx(31)}. All full, no output truncation. Prior full readBundle/requestedVersion/generator caches/personalFavorites/references/native hooks/error module retained. No tests run or exhaustive test claim.

Exact resume: frontend-03/signup/SignupForm.tsx. Remaining frontend03,admin-wiring01/02.

## frontend-03 — complete (2,302 lines / 5 files)

New findings: none. Signup/verification use native server operations, UI-specific explanatory outcomes and shared PasswordInput. Preserve approval-without-email, no login until verified, first-install redirect and single-use verification effect guard. Repeated SMTP presence check is a literal deployment fact; no substantial new ownership abstraction warranted.

Frontend styles own frontend-only view/layout and adapt shared app-* tokens, chrome and dialog foundations. Button appearance separate from container layout, scoped favorite variant rules avoid collisions, phone word visibility intentionally width-based for Windows tablets, and generated tables retain scrolling only where needed. Compare data-changed filter owns presentation, not diff classification. Existing spacing/type/diff tokens are correct common owner; do not lift view-specific selectors into global tokens merely to shorten this file. No broad button/CSS rewrite recommended without browser evidence.

Full assigned source: signup/{SignupForm.tsx(126),page.tsx(32)}, verify-email/{VerifyEmail.tsx(44),page.tsx(31)}, styles.css(1-500,501-1020,1021-1540,1541-2069). No truncated output. Prior full native user hooks/access retained; cross-surface style owners next. No tests/browser actions run.

Exact resume: admin-wiring-01/(payload)/custom.scss. Remaining admin-wiring01/02.

## admin-wiring-01 — complete (2,912 lines / 1 file)

New findings: none. custom.scss is the integration adapter for Payload's variables, layers, native class ancestry and our admin components. Common values already come from app-tokens; common chrome/dialog rules are imported. Do not relocate Payload-specific radius aliases, native chrome visibility or variable palettes to frontend shared tokens. The admin button adapter consumes native Button custom properties, while frontend buttons need direct properties; same values do not imply interchangeable selector/mechanism ownership. Portal dialog scope, opt-in Manage class and native-editor scope each express actual ownership.

Preserve hidden-panel rules despite display containers, role affordance versus server field enforcement, default-hidden sidebar before effect, textarea wrapper native rhythm, CSS-owned scroll margins read by EditJumpNav, size-neutral active-section styles, exact phone specificity, desktop versus phone toolbar/navigation and read-only resize behavior. Restore and compare share annotation palette but adjacent unified diff needs extra padding. Repeated JSX/CSS or file size alone does not justify extraction; no broad redesign or dead-comment tidy-up proposed.

Full assigned custom.scss:1-585,586-1060,1061-1530,1531-1995,1996-2460,2461-2912. First output truncated a small top-level accordion region; explicitly re-read232-256 and255-300, so no skipped lines count as read. All remaining chunks untruncated. Components/schema wiring read earlier as full assigned source; shared style owners next. No browser/live/test actions.

Exact resume: admin-wiring-02/app-chrome.scss. Remaining admin-wiring02 only.

## admin-wiring-02 — complete (575 lines / 3 files)

New findings: none. app-chrome owns identical AppNav/UserMenu markup, badge/dot geometry, school label and responsive menu targets. Headers remain respective-root shell owners; nothing shared reaches native Payload elements. app-dialog owns only Modal vocabulary and semantic plain/pair modifiers; surface-specific adapter/buttons and per-dialog content remain local. app-tokens owns cross-surface dimensions, role palette and semantic diff colors; px and fixed button palette are intentional stable contracts, not values to alias opportunistically into runtime Payload theme colors.

Full assigned source: app/src/app/{app-chrome.scss(271),app-dialog.scss(123),app-tokens.scss(181)}, all untruncated. Import consumers verified frontend/layout.tsx9-12, payload/custom.scss4-6, payload/layout.tsx10; Modal full read in components06, AppNav/UserMenu full read in UI1/components06. Representative tests read partially only: tests/unit/buttonSystem.spec.ts1-100, accountDisabledContract.spec.ts1-85, exportClient.spec.ts1-80. One targeted search used wrong guideCompareVisual .ts suffix (actual .tsx); no source/test coverage claimed for it here. No tests/browser/live actions.

## Final status

UI2 complete: all 74 assigned source files / 15,632 lines, no partial assigned source. UI1 separately complete:57files/9,196lines. Combined UI scope131files/24,828lines. No new independent ALTITUDE findings; prior own prose-vocabulary and service mixed-runtime AccountDisabled findings confirmed only, not counted again. Concrete rejections/invariants recorded per packet. Dependencies traced using earlier full own access/lib/hooks/service coverage and the complete UI source; representative test reads explicitly partial, exhaustive tests delegated by task. No repo edits, git mutations, builds/tests, live/browser actions, spawns or other UI reports. Only own checkpoints written. Remaining UI source review work: none. Any implemented cleanup still needs independent Claude/CI/browser review under merge hold.
