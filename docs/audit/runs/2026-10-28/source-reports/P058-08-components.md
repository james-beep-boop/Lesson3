# P058-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope and coverage

Supplied ranges read (provided inline in the request; no tool calls made):
- `app/src/components/EditRecovery/RestorePrompt.tsx:1-224`: fully read
- `app/src/components/EditRecovery/deadline.ts:1-51`: fully read
- `app/src/components/EditRecovery/flushRegistry.tsx:1-158`: fully read

Not assessed: `IdleLogout`, `useEditRecovery`, `restoreDiff` (`renderOf`, `RENDER_NOTE`), `restoreGroups` (`groupsOf`), `protocol.ts` (`offerKind`), `projection.ts`, `Modal`, and any callers or tests. No runtime behaviour was executed.

## Purpose and invariants (from in-file comments)

- **RestorePrompt.tsx:** Offers a saved draft but never applies it automatically. Stale or schema-mismatched captures are read-only, with no Restore control. "Exit edit mode" is the default for Escape and backdrop clicks.
- **deadline.ts:** Races work against a timeout and aborts it. The bound must cover the body read. The loser's rejection must not surface as unhandled.
- **flushRegistry.tsx:** Registers per-editor pre-expiry flushes and safety probes. `runAll` is single-flight, and `allSettled` is meant to stop one editor's failure from blocking another's flush. `allSafe` is the only input allowed to gate the screen clear. The default context is fail-closed.

## Candidates

**C1. Synchronous throw in one flush skips the other editors' flushes.** (Confirmed by local reasoning; low to medium severity)
- `flushRegistry.tsx:126`, with the invariant stated at lines 124-126.
- Precondition: a registered `flush` throws synchronously. The type `() => Promise<void>` does not enforce this.
- Expected (from the comment at line 125): one editor's failure cannot stop another's flush.
- Actual: the throw happens inside `.map`, before `Promise.allSettled` is called. Later entries are never invoked, `running` is never set, and `runAll` throws synchronously.
- Repro: register two entries. The first has `flush: () => { throw new Error() }`, the second has `flush: vi.fn(async () => {})`. Call `runAll()` inside a try block. Assert that the second `flush` is called. Actual: it is not.

**C2. Synchronous throw from `work` leaks the timer and causes a late unhandled rejection.** (Confirmed by local reasoning; low severity)
- `deadline.ts:41` runs outside the `try` at lines 44-50, so `clearTimeout` never runs.
- Precondition: `work` is a non-async function that throws synchronously. The signature `(signal) => Promise<T>` does not prevent this, and callers were not supplied.
- Expected: the timer is cleared and no rejection surfaces after the work has failed (line 42).
- Actual: `expired` rejects after `ms` with no handler attached, which produces an unhandled rejection. `giveUp.abort()` also runs.
- Repro: with fake timers, call `withDeadline(50, () => { throw e })`. Expect it to reject with `e`, advance 50 ms, and assert no unhandled rejection.

**C3. `allSafe()` returns true when zero editors are registered.** (Lead; the harm depends on uncaptured `IdleLogout` behaviour)
- `flushRegistry.tsx:134-142`, contrasted with the fail-closed default at lines 90-92.
- The default context returns `false` ("we have no idea… must not destroy a screenful of work"). A provider with an empty set returns `true` via `every`.
- Actual: `allSafe()` is `true` with no editors registered.
- Unresolved: whether an editor with unsaved state can be absent from the set (for example, before its effect runs). If so, the screen clear could act on uncaptured work. The file does not state the intended answer for zero registrations.

**C4. `runAll` resolves whether or not any flush succeeded.** (Lead)
- `flushRegistry.tsx:126-127`. `allSettled` followed by `.then(() => undefined)` discards outcomes.
- Comments at lines 6-7 and 65-68 describe this as the pre-expiry guarantee. A caller that treats resolution as "saved" would be wrong. Whether any caller does so is unknown.

**C5. A joined single-flight call may not cover editors registered mid-run.** (Lead)
- `flushRegistry.tsx:123`, returning `running.current`. The snapshot is taken at line 126, so an editor registered after that point is not covered by the joined promise.
- Whether this matters depends on whether such an editor can hold unsaved state during the window. Not determinable from this file.

**C6. Minor: the same entry object registered twice.** (Speculative; low)
- `flushRegistry.tsx:115-119`. The `Set` dedupes, so the first disposer removes the entry for both registrations. Only relevant if a caller reuses a registration object.

**Not a finding, but unverified:** `RestorePrompt.tsx:171-175` uses `dangerouslySetInnerHTML`. The comment says the prose is escaped by `unifiedDiff` before rendering. That escaping lives in `restoreDiff`, which was not supplied, so the XSS-safety claim is **unreviewed** and needs independent review.

## Unresolved questions

1. What does `IdleLogout` do with `runAll`'s resolution and `allSafe()`'s value, and is C3's zero-editor case reachable?
2. Should a provider with no registered editors report safe or unsafe? (C3)
3. Can `withDeadline`'s `work` be non-async in any caller? (C2)
4. Can an editor hold unsaved state before its registration effect runs? (C3, C5)
5. Is the `restoreDiff` escaping sound? (Unreviewed security claim)
