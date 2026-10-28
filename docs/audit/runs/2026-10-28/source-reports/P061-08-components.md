# P061-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- Read as supplied: `app/src/components/EditRecovery/useEditRecovery.ts:401-800` and `:801-890`, `app/src/components/FavoriteToggle.tsx:1-120`, `app/src/components/FormField.tsx:1-30`.
- Not read: `useEditRecovery.ts:1-400`. Helpers used but not defined in my ranges: `enterPhase`, `entryUnresolved`, `planSave`, `statusForOutcome`, `offerKind`, `withDeadline`, `clearAllTimers`.
- Not checked: callers, server endpoints (`/recovery/*`, `/api/favorites`), and runtime behaviour. I did not run git, so I have not verified that the checkout matches baseline `6e75a173`.
- Coverage is partial. Findings below rest only on the supplied text.

## Purpose and invariants (as stated in the code)

- **Edit recovery:** a session takes server-side captures of unsaved work. Captures are fenced by a generation and revision. Discard retires the row, and `start` is the only path that reactivates it. Nothing dirty is treated as safe unless the last confirmed capture matches the screen (`isSafe`, 432-438). A failed lookup enters `unchecked`, not `clear`, and retries itself (543-598).
- **FavoriteToggle:** the star flips only after a 2xx response, and the server-rendered id is re-synced to avoid stale DELETE targets.
- **FormField:** the hint is linked via `aria-describedby`, separate from the label.

## Candidates

**C1. Failed DELETE status is overwritten by a successful restart (confirmed local reasoning; low-medium).**
- `useEditRecovery.ts:767` sets `unavailable/failed` when the DELETE returns a non-ok, non-409 response. Line 768 then calls `requestStart`, and its success path at `:529-530` calls `setStatus({kind:'idle'})`, which overwrites the failure.
- Expected: the indicator reports failure, as the comment at 770-771 requires ("the indicator says so rather than the failure being silent").
- Actual: `idle`, and the offer is dismissed (738).
- Consequence: the teacher believes the draft was discarded. The row may still hold it, so it can be offered again next session.
- Repro: stub `fetch` so `DELETE` returns 500 and `POST /start` returns 200 with a token. Call `discardOffer`. Assert the final status is `unavailable/failed`. Actual is `idle`.

**C2. A DELETE 409 means different things in the two discard paths (uncertain; low).**
- `discardOffer` (767) treats 409 as success and reports nothing.
- `discardDraft` (716) returns `res.ok`, so 409 reports "draft may remain".
- Which is correct depends on the server's meaning of 409, which is not in range.
- Repro: stub DELETE 409 and compare the status and return value of both paths.

**C3. A failed start is never retried in the supplied code (design lead; low).**
- Failed lookups retry (`unchecked`, 552-555). Failed starts go to `clear` (608, 615) and never call `requestStart` again. `ready` stays false, so no captures run for the session.
- The indicator shows `failed` or `atCapacity`, so the teacher is told. A capacity refusal is deliberate (511-513). The issue is only the transient-failure case.
- The code states no policy here. Callers outside range may retry.
- Repro: stub `POST /start` as 500 once, then 200. Edit and wait past the debounce. Assert whether any second `start` is attempted.

**C4. Favorite toggle state and error text (uncertain; low).**
- `FavoriteToggle.tsx:73`: a 2xx POST without `doc.id` sets `favoriteId` to `null`, so the star shows unfavorited while the server may have created the favorite. The next click POSTs again.
- `:71-74`: if `res.json()` throws after a 2xx, the user sees an error although the row was created.
- `:62, :80`: a 404 on DELETE (already removed elsewhere) shows "you may need to sign in again", which misattributes the cause.
- Whether a duplicate POST is harmful depends on server idempotency, which is not in range.
- Repro: stub POST returning 201 with `{}` and assert the star state. Stub DELETE returning 404 and assert the message.

No candidates in `FormField.tsx`.

## Unresolved questions

1. Does `start`'s `ON CONFLICT` path preserve the stored draft that `lookUp` offers (`:539-541`), or does it clear it?
2. What does a DELETE 409 mean on the server: a revision mismatch, or an already-retired row? This decides C2.
3. Do all callers of `discardDraft` leave edit mode when it returns `true` (`:683-692`)? A retired row that stays active 409s on every capture.
4. Is `POST /api/favorites` idempotent per user and version? This decides C4.
5. Do the unseen helpers (`enterPhase`, `entryUnresolved`, `planSave`, `statusForOutcome`) change any conclusion above?
