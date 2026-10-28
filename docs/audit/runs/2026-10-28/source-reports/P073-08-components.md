# P073-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Read from the supplied text only. I made no tool calls and did not open files on disk, so I have not verified the baseline commit `6e75a173`.

- `app/src/components/Manage/panelState.ts:1-305`: fully read.
- `app/src/components/Manage/readFeaturesSettings.ts:1-35`: fully read.
- `app/src/components/Manage/systemFeaturesState.ts:1-54`: fully read.
- `app/src/components/Manage/taxonomyActions.ts:1-114`: fully read.
- Policy excerpts: used as context only, not as source.

Not assessed: the server guards, `wireErrorMessage`, `apiBaseFrom`, the `system-settings` global, the Features and Subjects panels that call these modules, and any caller. Nothing below depends on those being correct.

## Purpose and invariants (summary)

- **panelState.ts**: closed URL vocabulary for accordion state. Invariants: unknown or role-inaccessible ids are dropped, nested ids keep their ancestors, output follows render order, `at` is one-shot and dropped on serialisation, and `plans.versions` maps to `plans.mine` only for callers who lack the old id.
- **readFeaturesSettings.ts**: reads the settings global as the caller and returns `null` on any failure, so the page degrades instead of rejecting.
- **systemFeaturesState.ts**: pending/saved reducer. `pendingChanges` returns only the diff, or `null`.
- **taxonomyActions.ts**: shared write hook. A failed write keeps the form values and surfaces the server message.

I found no confirmed defect. Ruled out after reading: ancestor filtering and orphan dropping in `parseOpen`; `serialiseOpen` preserving unrelated params; `initialOpen` precedence; `subjectGradeAnchor` output staying within `AT_PATTERN` for integer ids; and `MOVED_FOR_CALLERS_WITHOUT[id]` prototype keys such as `constructor`, which fall through harmlessly.

## Candidates

**C1. Client timeout can report failure for a write the server may have committed** (lead; severity low–medium, depends on unseen server behaviour)
- Evidence (confirmed locally): `taxonomyActions.ts:101` sets `AbortSignal.timeout(15_000)`. On a thrown error, `run` at lines 84–88 calls `setError` and `toast.error` and never calls `router.refresh()`. The list therefore stays stale after a write that may have succeeded server-side.
- Precondition: the server commits a create, rename or delete but the response takes more than 15 s.
- Expected: the UI reconciles the outcome, or says it is unknown. The policy excerpts do not specify this, so no expected behaviour is asserted here.
- Actual: "Could not create" or the timeout text (`caught.message` is used, so a raw browser message can appear), with the form values kept. A retry then hits a duplicate or 404 error.
- Repro: with fake timers, mock `fetch` to commit and resolve 201 after 16 s; assert the panel refreshes and does not show a failure for a committed write.

**C2. `pendingChanges` compares a trimmed name with an untrimmed saved name** (lead; severity low, depends on whether the server can store untrimmed names)
- Evidence (confirmed locally): `systemFeaturesState.ts:51-52` computes `name = pendingName.trim()` and compares it to `savedName` without trimming it.
- Precondition: `savedName` contains leading or trailing whitespace, for example from legacy data or a write outside this panel.
- Expected: with no edits, `pendingChanges` returns `null`.
- Actual: it returns `{ schoolName }`, so Save stays enabled and re-sends the name with no change.
- Repro: `pendingChanges({ saved: F, pending: F, savedName: ' Lincoln ', pendingName: ' Lincoln ', updatedAt: 'x' })` should be `null`; it returns `{ schoolName: 'Lincoln' }`.

**C3. The `busy` guard reads a stale closure** (lead; severity low)
- Evidence (confirmed locally): `taxonomyActions.ts:72` checks `if (busy)` against the render-time value, while `setBusy` at line 73 is asynchronous.
- Precondition: two calls to the same action from one render, before React re-renders, for example from programmatic or batched invocation.
- Expected: the second call returns `false` without a request.
- Actual: both pass the guard and send two requests.
- Repro: call `create` twice synchronously from one render with a mocked `fetch`; expect one request.

**C4. A call blocked by `busy` returns `false` with no message** (low; UX)
- Evidence: `taxonomyActions.ts:72` returns `false` without setting `error` or toasting. Callers treat `false` as a refused write and keep the typed values (line 56–58 comment).
- Actual: a silently ignored submit looks the same as a refused one, with no feedback.

## Unresolved questions

1. Does the server commit before responding, and does the Features Save send the `updatedAt` freshness token? `pendingChanges` does not include it, and the token's use is not visible in this range.
2. Can `savedName` ever be stored untrimmed (C2)?
3. What is the intended outcome policy for a timed-out write (C1)? This needs the operator's decision.
4. Does `wireErrorMessage` always return a server message for non-OK responses? Its behaviour is outside this range.

Security and integrity claims in this range remain unreviewed until independent review.
