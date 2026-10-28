# SIMPLICITY review — UI batch 1

Baseline: immutable v1.10 snapshot `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91` at `/home/james/Documents/Codex/2026-10-26/ares-v110-review`. Read-only. No tests run and no repository changes.

## components-01 — complete (14 source files, 2,359 lines)

No material simplicity finding. The Manage page's parallel data reads and projected follow-up reads are intentional: they avoid over-population, preserve caller access, and reuse Site Admin data between panels. Role/data-derived panel lists mirror the rendered accordion for deep-link state. The deletion panel's selected IDs, removed-ID tracking, and in-flight attempt index represent distinct selection, partial completion, and progress state. Navigation freshness distinguishes traversal from ordinary navigation, bounds both response and body-read time, and treats unknown as changed. Combine state preserves chosen-vs-custom text and saved draft recovery semantics.

Deliberate complexity/rejections:
- Retain independent `AppNav` reads: `countUnread` is the Messages menu badge; `hasUnread` is the discussion dot, is gated by forum state, and uses a participation query. These report different products and failure policies.
- Do not merge the role gate for the System accordion with its repeated feature child gate: leaf conditions mirror `availablePanels`, whose effective gates are a deliberate server-side deep-link contract.
- Do not collapse `DeletePlansPanel`'s `removed`, `attempt`, `busy`, and `confirming` state: one records committed IDs for retry after partial success, one reports the current per-plan request, one blocks concurrent mutation, and one controls confirmation.
- Keep `CollapseOnEntry`'s per-document ref and entry-phase test; the phase coordinates effects across lazy fields, while the ref prevents re-closing after the first deliberate toggle.
- Keep Combine picker/manual request errors separate from conflict-form choices and context. `custom` distinguishes a user-written value from a value that happens to equal either parent, and the `combineWith` full navigation intentionally avoids persisting teacher text.
- CandidateList's row-level server-provided action flags and separate empty-list/no-search-match copy reflect distinct permissions and states.

Context read (not exhaustive test review): traced dashboard registration (`payload.config.ts`), AppNav frontend/admin callers, `CollapseOnEntry` field registration, and Combine usage in `LessonControls`; inspected `hasUnread` to distinguish it from the Messages badge query; searched relevant CandidateList, manage, combine, navigation freshness, collapse, and overlay tests. Tests were contextual only, not exhaustively read or run.

Files fully read: `app/src/components/AdminDashboard/CandidateList.tsx`, `DeletePlansPanel.tsx`, `index.tsx`; `AdminHeaderMenu/index.tsx`; `AdminUnauthorizedRedirect/index.tsx`; `AppNav/NavigationFreshness.tsx`, `AppNav/index.tsx`; `AppVersion.tsx`; `Brand/Icon.tsx`; `CollapseOnEntry/index.tsx`; `CombineVersions/applyOverlay.ts`, `comparisonError.ts`, `index.tsx`; `CompareToOfficialLink.tsx`.

Resume point: components-02 (not started).

## components-02 — complete (21 source files, 2,337 lines)

Candidate:
- `app/src/components/DocButtons.tsx:61-71`, `downloadWord`: both the success and catch paths call `setBusy(null)`. This duplicates cleanup and makes every added exit path responsible for remembering the unlock. Minimal behavior-preserving fix: use the same `finally { setBusy(null) }` shape as `openPdf`, while keeping the catch's existing error message. The Word control remains busy until its download promise settles on both success and failure; errors still render inline. Verify with the existing button/export component coverage and TypeScript (not run in this review).

Purposeful complexity/rejections:
- Keep discussion `ReferencePicker`'s found-query tag and live flag: together they prevent stale search results from appearing or overwriting newer results; pending reference state stays active until explicit selection/cancel.
- Keep composer `lastSent` and the three-way posted/refused/uncertain outcome. A retry must resend the exact content under the same submission key, since a timeout may follow a committed post.
- Moderation's `action`, `uncertain`, and in-flight guard preserve action-specific payloads and prevent retries after an outcome that may have committed; 404 and 409 take distinct refresh/navigation paths.
- Recovery's shared `withDeadline` aborts and races across the whole response body read; its callers include capture/entry reads, combine preview, and advisory delete warnings. `flushRegistry` joins simultaneous triggers and probes current safety instead of caching a stale flush verdict.
- Preserve restore's `readOnly` rendering as plain copyable captured text, its paragraph/spacing/empty distinctions, and row-ID grouping. Similar-looking branches encode whether an overlay may be applied or whether captured prose needs to remain intact when copied.
- `DocStrip`'s condensed/full paths receive different caller-selected tag sets; retain the primary/secondary split rather than infer or duplicate it.

Context read (not exhaustive test review): traced topic/reply composer callers, thread page moderation/read markers, DocButtons library/lesson/share callers, RestorePrompt and flush registry callers; searched relevant discussion moderation, restore prompt, unsaved warning, indicator, button-system, and recovery tests. Tests were contextual only, not exhaustively read or run.

Files fully read: `app/src/components/Discussions/ComposerParts.tsx`, `MarkThreadRead.tsx`, `ModerationControls.tsx`, `Pager.tsx`, `PostText.tsx`, `ReferencePicker.tsx`, `ReplyComposer.tsx`, `TopicComposer.tsx`, `referencePickerQueries.ts`, `submitPost.ts`, `useComposer.ts`; `DocButtons.tsx`, `DocStrip.tsx`; `EditRecovery/Indicator.tsx`, `RestorePrompt.tsx`, `deadline.ts`, `flushRegistry.tsx`, `protocol.ts`, `restoreDiff.ts`, `restoreGroups.ts`, `unsavedWarning.ts`.

Resume point: components-03 (not started).

## components-03 — complete (11 source files, 2,179 lines)

No material simplicity candidate. `useEditRecovery` is a protocol/state machine whose grouped session ref, entry-phase ref plus state, per-request epoch, captured-content signal, independent retry timers, and single-flight promise protect separate lifecycle and concurrency invariants. Its branches preserve the distinctions between unresolved/unchecked/clear offers, definite vs indeterminate writes, and advisory saves vs durable drafts. `IdleLogout`'s repeated in-window flushes and current safety probe are intentionally independent of the expiry action. Jump navigation separately tracks focus and scroll position, and its retry loop waits for Payload's lazy layout while only opening the target's own disclosure.

Purposeful complexity/rejections:
- Keep session state in `useEditRecovery` grouped under one reset point, with transport/timer state separate. Epoch checks discard old responses; `capturedSignal` records only confirmed request content; rate-limit deadlines are checked through every capture path; entry unresolved state prevents replacing unread work.
- Do not collapse `start`/lookup, capture, save, save-as-draft, discard, and offer-dismiss paths: they have distinct uncertainty, retirement, and screen-clearing contracts.
- Keep `entryPhase` document-scoped and close it on first input or explicit jump. The two mechanisms cover different reveal paths (real input vs programmatic click), and the panels may mount after the initial render.
- Keep `EditJumpNav`'s joined section key/ref and separate focus/position signals. They avoid rebuilding a dependency identity every render and let keyboard focus take priority without mistaking a toolbar focus for a section.
- Retain Guide's known ID vocabulary and role-conditioned leaves; `withAncestors` is the common source for deep-link and available panel parents.
- `FavoriteToggle` prop synchronization is deliberate because multiple instances for the same version may refresh independently; local state follows the server prop before paint.

Context read (not exhaustive test review): read `LessonControls` around entry-phase lifecycle, `useEditRecovery` wiring, draft discard/keep, and Combine apply paths; traced `IdleLogout` registry hosting and the hook's unit/e2e test references. Searched tests for guide panel state/access, MoreMenu, FavoriteToggle, jump navigation, idle logout, and edit recovery. Tests were contextual only, not exhaustively read or run.

Files fully read: `app/src/components/EditRecovery/useEditRecovery.ts`; `FavoriteToggle.tsx`; `FormField.tsx`; `Guide/Accordion.tsx`, `Guide/availability.ts`, `Guide/panelState.ts`; `IdleLogout/index.tsx`; `LessonControls/EditJumpNav.tsx`, `MoreMenu.tsx`, `currentSection.ts`, `entryPhase.ts`.

Resume point: components-04 (not started).

## components-04 — complete (11 source files, 2,321 lines)

No material simplicity finding. `LessonControls` coordinates several consequential flows, and its separate state follows actual distinctions: edit intent vs authorized editing, server-known Official pointer vs unknown, current/confirmed draft state, save vs save-as-draft vs discard, preview busy vs picker state, and Combine apply/restore retry. The server wrapper's dependent reads follow version/plan resolution. LinkedTextarea keeps dialog and cursor operations with the field that owns Payload's `setValue`; its event handlers update cursor state after keyboard, mouse and select changes. The two accordion systems serve different page state/deep-link behavior and should remain separate.

Purposeful complexity/rejections:
- Retain `LessonControls`' sync ref alongside rendered busy state: it closes the same-render double-submit window. Do not merge edit intent with actual access, or a null/unknown Official pointer with a pointerless plan; those distinctions gate destructive actions.
- Keep the save, keep-as-draft, discard, and recovery offer paths separate: each has different server confirmation and screen-clearing requirements. Preserve `processing` locks around snapshot/recovery work and tokenless save behavior after indeterminate writes.
- `initialCollapseActions` distinguishes form-not-ready (`null`) from ready/already-collapsed (`[]`); validation's row reveal and focus retry handle fields inside collapsed/lazy Payload rows.
- LinkedTextarea cursor memory, active field identity, address normalization and insertion helpers each hold a different part of the insertion contract. Its repeated focus/key/mouse/select handlers are necessary to track cursor placement across those input methods.
- Keep `LessonDetails` native `<details>` separate from stateful Manage accordions; `Manage/Accordion` preserves mounted child state and its panel IDs are also a URL/deep-link vocabulary.
- `LessonControlsServer` first resolves the readable source and then conditionally loads same-plan choices and draft-combine advice; those later reads depend on that result and remain best-effort where advisory.

Context read (not exhaustive test review): traced `LessonControlsServer` and `LessonControls` interactions for entry phases, recovery, save/discard, Combine and validation; checked `bundleFields.ts` registration for LinkedTextarea, frontend lesson-page `LessonDetails` usage, message/discussion `LessonReference` usage, Manage `Accordion` consumers, and searched the relevant link insertion/address, validation, initial-collapse, guide/access, reference, and accordion tests. Tests were contextual only, not exhaustively read or run.

Files fully read: `app/src/components/LessonControls/index.tsx`, `initialCollapse.ts`, `server.tsx`, `validation.ts`; `LessonDetails.tsx`; `LessonReference.tsx`; `LinkedTextarea/activeTarget.ts`, `aresAddress.ts`, `index.tsx`, `insertLink.ts`; `Manage/Accordion.tsx`.

All four assigned packets are complete. No tests were run, no repository or git state was changed, and there is no unfinished review work.
