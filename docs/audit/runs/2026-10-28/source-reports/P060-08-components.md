# P060-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

**Read (complete for the supplied range):** `app/src/components/EditRecovery/useEditRecovery.ts:1-400`. The range ends mid-function, so `captureOnce` continues past line 400 and that remainder was **not assessed**. Nothing outside the range was read. Imports (`./deadline`, `./flushRegistry`, `../../lib/editRecovery/projection`, `./protocol`) and tests were not reviewed, so caller behaviour, `classifyResponse`, `fingerprint`, `withDeadline`, and the rest of the hook's API (`start`, `prepareForSave`, `keepForLater`, `discardDraft`, etc.) are unverified.

## Purpose and invariants (as stated in the code)

Client half of unsaved-edit recovery. It owns a single-session token and:
- Starts only on actual unlock, never on the Edit click (`:10-13`).
- Persists nothing in the browser (`:15-19`).
- Runs at most one capture in flight (`:21-23`, `:274`).
- Blocks all capture while an entry offer is unresolved (`:251-267`, `:331-340`).
- Promotes `capturedSignal` only on a server-confirmed `ok` (`:300-307`, `:383-388`).
- Discards results from a superseded session via `epoch` (`:281-289`, `:381-382`).
- Honours a 429 `Retry-After` as protocol state (`:221-231`, `:344-347`, `:393-395`).
- Caps repeated 413 retries by fingerprint (`:359-367`, `:390-392`).

## Candidates

**C1 — Low severity. Confirmed by local reading; user-visible impact not confirmed.**
- **Location:** `useEditRecovery.ts:319-320` (doc comment: "Returns the classified outcome; never throws.") versus `:349-365` and `:369-400`.
- **Mismatch:** `getDocument()` (`:349`), `getCombineContext?.()` (`:355`), `JSON.stringify(...)` (`:352-357`) and `fingerprint(body)` (`:365`) all run **outside** the `try` that begins at `:369`. The `catch` at `:397-399` only covers the network step.
- **Precondition:** `getDocument` or `getCombineContext` returns a value `JSON.stringify` rejects, such as a cyclic object or one containing a `BigInt`.
- **Expected:** a classified outcome (for example `indeterminate` or `definite`), per the documented contract.
- **Actual:** `captureOnce` rejects. Whether this surfaces to the teacher depends on callers in `prepareForSave`, `keepForLater`, the debounce and the blur/expiry flushes, none of which were reviewed. A rejection in `prepareForSave` could also leave `inFlight` holding a rejected promise.
- **Reproduction test:** in the hook's unit spec (not reviewed), mount with `active: true`, `modified: true`, and `getDocument` returning an object whose property points to itself. Call `prepareForSave()` and assert it resolves to a `SavePlan` rather than rejecting. Also run a variant with the debounce timer firing.
- **Fix direction (not applied):** move the serialisation and fingerprint inside the guarded region, or widen the outer `try`.

## Uncertain leads (not candidates)

- **Epoch-superseded success (`:382`).** An `ok` response from an old epoch is discarded, so the server may hold a capture the client never adopts. The comments say this is intended. Whether a later `start` reads the stored row correctly cannot be verified from this range.
- **`retryNotBefore` lifetime.** It lives in the `session` ref. Whether `endSession` resets it on a version switch is in unread code (`:401+`). A stale backoff could carry across sessions if it is not reset.

## Unresolved questions

1. Do `prepareForSave` and the debounce catch a rejection from `captureOnce`, or is C1 user-visible?
2. Does `endSession` (not in range) reset `session.current.retryNotBefore` and `oversized`?
3. Does `classifyResponse` treat a 200 with no `token` as `ok`, `definite` or `indeterminate`? That matters for `:383-388`.
4. Does `withDeadline` reject or resolve on timeout? The `catch` at `:397` assumes rejection.
