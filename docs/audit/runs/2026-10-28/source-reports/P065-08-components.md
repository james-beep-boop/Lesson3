# P065-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope:** I reviewed `app/src/components/LessonControls/index.tsx:401-800` as supplied, from the text in this conversation. I made no tool calls and did not verify callers, `recovery` hook internals, or runtime behaviour. Not assessed: the `recovery` hook, `validateForm`, `saveInFlight` reset, `busy`/`combineBlocked`, and the `onSave` tail after line 800.

**Purpose and invariants in range**
- `401-418`: `setDisabled` gates submission only. The comment correctly states that it does not make fields read-only.
- `422-468`: applies a pending Combine overlay once the draft gate is clear.
- `470-574`: resolve conflicts, restore a capture (re-checks `readOnly` so a stale capture is never applied), and retry the comparison.
- `583-607`: fetches the Official pointer and fails closed (unknown pointer means no delete offer).
- `645-727`: delete offer gating, edit entry, leave-edit, and discard with confirmation.
- `742-771`: keep-for-later, which clears the screen only after the server confirms the capture.

**Candidates**

**C1. Discard and keep-for-later can leave the editor locked (medium, lead).**
- Evidence: `app/src/components/LessonControls/index.tsx:705-721` awaits `recovery.discardDraft()` at `:717`. `:742-770` awaits `recovery.keepForLater()` at `:761`. Neither has a `try/finally`. The processing and discarding/keeping flags are set at `:714-715` and `:756-757`.
- Precondition: either awaited promise rejects instead of resolving to a result.
- Expected: flags clear, the form stays usable, and an error message appears.
- Actual, per visible code: `setProcessing(true)` stays set. Line 779 says processing disables native fields and array controls, so the editor stays locked until reload.
- Confirmed locally: there is no catch in range. Unconfirmed: whether the hook can reject, since it may catch internally.
- Repro: stub `discardDraft` to reject, click "Discard changes" on a modified form, and assert `processing`/`discarding` are false afterward.

**C2. Failed restore mutates combine state before the fallible step (low).**
- Evidence: `:508-510` clear `pendingCombine`, clear `comparison`, and set `combineContext` to the offer's `mergeParent`. Only then does `:511-512` call `applyCapture` and `reset(doc)`. The catch at `:541` shows the raw `e.message`.
- Precondition: `applyCapture` or `reset` throws, so `proseRestored` stays false.
- Expected: a failed restore leaves combine state consistent with the unchanged form.
- Actual: the in-flight comparison is dropped and `combineContext` points at the offer's parent while the form still holds pre-restore content.
- Confirmed locally: the ordering. Runtime impact unverified.
- Repro: stub `reset` to reject for an offer with `combineContext`, then assert `comparison` and `combineContext` are unchanged.

**C3. Stale Official pointer can offer a delete the server will refuse (low, lead).**
- Evidence: the pointer is fetched once per `[id, planId]` (`:589-607`). `canDelete` at `:645-650` uses it.
- Precondition: the version becomes Official after the editor loaded, for example through another session.
- Expected: no delete-source offer for a now-Official version.
- Actual: the offer appears. The comment at `:641` says the server re-checks, so the user would see a refused action rather than data loss.
- Unverified: the server guard and whether Make Official can run in this session.

**Non-candidates:** `401-418` and `422-468` showed no confirmed defect. The `cancelled` branch at `:453-454` skips `setProcessing(false)`, but in practice the chain is microtask-only, so I did not report it.

**Unresolved questions**
1. Does the `onSave` validation-failure path reset `saveInFlight.current`? That code is outside the range.
2. Does `issues[].message` include lesson/phase position, which the policy requires? Not visible here.
3. `leaveEditMode` (`:687`) calls `reset(...)` with `void`. If it rejects, the rejection is unhandled. Low severity, and it depends on Payload's `reset` contract, which I did not check.
