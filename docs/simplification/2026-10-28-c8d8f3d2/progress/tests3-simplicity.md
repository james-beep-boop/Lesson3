# SIMPLICITY review checkpoint — E2E and HTTP test packets

Baseline: immutable v1.10 checkout, `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91` at `/home/james/Documents/Codex/2026-10-26/ares-v110-review`. Read-only review; no repository changes or test execution.

## tests-e2e-01 — complete

Fully read all 16 assigned test files: `advancedTools.e2e.spec.ts`, `catalogue.e2e.spec.ts`, `combine.e2e.spec.ts`, `discussions.e2e.spec.ts`, `discussionsGuide.e2e.spec.ts`, `discussionsModeration.e2e.spec.ts`, `documentLocks.e2e.spec.ts`, `draftCombineShortcut.e2e.spec.ts`, `drafts.e2e.spec.ts`, `editRecovery.e2e.spec.ts`, `editRecoveryRestore.e2e.spec.ts`, `editorBackDarkMode.e2e.spec.ts`, `editorValidation.e2e.spec.ts`, `insertLink.e2e.spec.ts`, `lessonDetails.e2e.spec.ts`, and `lessonReleases.e2e.spec.ts`. `discussionsModeration.e2e.spec.ts` was re-read in full after an earlier combined display was truncated. No implementation, helper, or other context files read for this packet.

No concrete simplification candidate. Most apparent repetition pins separate browser routes, roles, modal actions, viewport sizes, recovery transitions, or independently observable outcomes. The parameterized activation, mismatch, width, and role cases preserve meaningful variants and should remain distinct. In particular, the recovery tests' sequential database/UI observations pin intermediate-vs-final states, and the forum tests' superficially similar Back navigations exercise different client-cache paths.

Rejected: merging the insert-link keyboard activation cases or recovery provenance cases would make isolated interaction contracts less clear; removing repeated assertions in the moderation suite would drop separate user-visible or persisted outcomes. No concrete maintenance win outweighs loss of diagnostic locality.

## Remaining

## tests-e2e-02 — complete

Fully read all 10 assigned files: `liveRowLabels.e2e.spec.ts`, `manage.e2e.spec.ts`, `messages.e2e.spec.ts`, `offlineSignup.e2e.spec.ts`, `publicLibraryDisabled.e2e.spec.ts`, `saveSnapshot.e2e.spec.ts`, `schoolName.e2e.spec.ts`, `uploadBundles.e2e.spec.ts`, `versionUnavailable.e2e.spec.ts`, and `welcomeDialog.e2e.spec.ts`. The large Manage test was read in contiguous line ranges through its end; the clipped combined display of several files was followed by individual full reads of the affected message and upload specs. No implementation or helper files were read for context.

No concrete simplification candidate. Manage's local helpers are used to express repeated UI operations and fixture-owned identity checks; its large size reflects distinct role, route, selection, history, confirmation, and responsive contracts. The repetitions across save-snapshot role/failure combinations, upload outcomes, and Manage navigation/read states preserve separate outcomes and useful failure localization. No line-count-only reduction has a clear maintenance benefit.

Rejected: combining Manage assertions across roles or combining UI states that share a fixture risks coupling independent role scopes and endpoint outcomes; reducing repeated upload count/report checks would weaken the import result contract. `loginAs`'s local wrapper removes the fixture argument from many call sites, and `acceptConfirmation` returns the browser-native prompt text each caller independently checks; neither is an unnecessary wrapper.

## Remaining

`tests-http-01`, `tests-http-02`, `tests-http-03`, `tests-http-04` remain. Next: read all tests-http-01 files and checkpoint this report.

## tests-http-01 — complete

Fully read all five assigned files: `apiErrorMessages.http.spec.ts`, `authFavorites.http.spec.ts`, `combinePreview.http.spec.ts`, `combineSave.http.spec.ts`, and `discussions.http.spec.ts`. Read only the assigned test sources; no implementation/helper files read for context.

No concrete simplification candidate. These suites pin independent HTTP status/body/storage contracts, role gates, error precedence, and plan/topic-lock interleavings. Their small shared helpers (`call`, `preview`, `form`, `whileRowLocked` wrappers) remove repeated mechanics while retaining individually named scenarios. The parameterized cases still assert distinct roles or mutations, and the retry/lock assertions preserve behavior that ordinary sequential requests cannot prove.

Rejected: collapsing role loops or save/delete outcomes into generic assertions would weaken authorization and response-contract coverage; reducing separate parent/source deletion races would lose error precedence evidence. No maintainability improvement justifies the resulting coupling.

Next: read all tests-http-02 files and checkpoint this report.

## tests-http-02 — complete

Fully read all four assigned files: `endpoints.http.spec.ts` (all 2,747 lines in consecutive ranges), `firstUserBootstrap.http.spec.ts`, `jobStatsGlobal.http.spec.ts`, and `lessonReleases.http.spec.ts`. No implementation/helper files read for context.

No concrete simplification candidate. `endpoints.http.spec.ts` is broad but exercises many independent deployed HTTP surfaces: export/cache readiness, create and ingest boundaries, rate-limit ordering, authorization, transaction rollback, and response content. Its shared request/build helpers keep those contracts legible. The other files preserve one-shot bootstrap races, live scheduler metadata constraints, and release-token staleness as distinct operational behaviors.

Rejected: splitting or consolidating cases solely based on their long source file would not reduce repeated logic and could obscure the shared real-app fixture. The grouped status and persisted-state assertions are not redundant: HTTP status alone does not prove no partial write or no private field leak.

Next: read all tests-http-03 files and checkpoint this report.

## tests-http-03 — complete

Fully read all 11 assigned files: `lockedDocuments.http.spec.ts`, `loginProtection.http.spec.ts`, `messageReferences.http.spec.ts`, `nativeVersionAuthority.http.spec.ts`, `nullResources.http.spec.ts`, `pendingAuthority.http.spec.ts`, `recovery.http.spec.ts` (all 675 lines in consecutive ranges), `saveAsNewRecovery.http.spec.ts` (all 655 lines in consecutive ranges), `serverTime.http.spec.ts`, `subjectGrades.http.spec.ts`, and `systemSettings.http.spec.ts` (all 539 lines in consecutive ranges). `loginProtection` was re-read in full after the combined display clipped it. No implementation/helper files read for context.

No concrete simplification candidate. The several long suites capture independent wire-level invariants: lock ownership and the positive take-over paths, permission revocation during actual lock waits, malformed recovery inputs retaining prior data, rollback under real database faults, and settings Save freshness/session behavior. The repeated transaction barriers and state reads are direct evidence for distinct interleavings and outcomes. The shared helpers within these tests keep common plumbing small while exposing the meaningful state transitions.

Rejected: collapsing recovery/save token sequences or role-specific revocation combinations would lose coverage of generation/revision changes, rollback, or caller authority. The repeated verification of HTTP response and stored rows is purposeful because response success/failure alone cannot establish transaction behavior.

Next: read all tests-http-04 files and checkpoint this report.

## tests-http-04 — complete

Fully read all five assigned files: `teacherKey.http.spec.ts`, `userAdminActions.http.spec.ts` (all 390 lines, including a separate full read after truncation), `userAssignments.http.spec.ts` (all 546 lines in consecutive ranges), `userSearch.http.spec.ts`, and `worldwideIds.http.spec.ts`. No implementation/helper files read for context.

No concrete simplification candidate. The repeated action/status combinations prove distinct route gates and the two role-assignment paths; the sequence inside the assignment test isolates target eligibility from actor authority. User-search rows test separate query filters and their interaction. The teacher-key tests reuse a single prepared DOCX export via a lazy promise, which already avoids redundant expensive work while retaining independently readable assertions.

Rejected: consolidating role matrices or user-action flows would couple response and persisted-state outcomes; shortening the generic-PATCH assignment proof would lose its same-request/same-caller comparison. No unnecessary setup or dead helpers found.

All six assigned packets in this batch are complete. The next parent-assigned batch will be integration tests; no unfinished work remains in this batch.
