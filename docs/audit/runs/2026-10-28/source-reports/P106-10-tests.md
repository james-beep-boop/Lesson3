# P106-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read in full:** `app/tests/e2e/editRecoveryRestore.e2e.spec.ts:1-494` (both supplied ranges) and `app/tests/e2e/editorBackDarkMode.e2e.spec.ts:1-56`.
- **Not assessed:** imported helpers (`helpers/e2e`, `editRecovery`, `editRecoveryUi`, `fixtures`, `login`), `fx.teardown`, the `/recovery` and `/recovery/start` endpoints, `hooks/fieldSplit.ts`, editor components, and the `admin.theme` config. No runtime behavior was run or verified.
- **Policy excerpts:** read as context only. The excerpt is truncated mid-section ("The accurate title…"), so it is not a complete policy source.
- **Security/integrity claims** (cross-user isolation, revoked-access refusal) remain unreviewed until independent review.

## Purpose and invariants

The specs check edit recovery on restore: (5) another user on the same browser sees no captured text; (4) a same-user capture is offered, never auto-applied, and restored work is dirty; (barrier) the offer modal blocks the form; (6) logout keeps the capture; (8) discard clears content and reactivates the row; (9/10) stale or old-schema captures are read/discard-only with no Restore control; (12) revoked editing access yields no offer and the endpoints return 404. The dark-mode spec checks that the admin is light and that Back's text contrast is at least 4.5:1.

## Candidates

**1. Medium — contrast check can false-pass (confirmed local reasoning; runtime impact is a lead).**
`editorBackDarkMode.e2e.spec.ts:31, 49–55`. `luminance` takes the first three numbers of the computed colour and discards alpha. A transparent background (`rgba(0, 0, 0, 0)`) is therefore treated as opaque black.
- *Precondition:* Back's computed `background-color` has alpha 0.
- *Expected:* contrast computed against the rendered surface, failing when there is no opaque fill.
- *Actual:* contrast computed against black, so light ink on a transparent button passes.
- *Repro:* stub the Back link with `background: transparent; color: #f5f5f5` on the light admin page and assert the spec fails. Whether production ever yields a transparent background is unverified.

**2. Low — lock release is global (lead; depends on unseen Playwright config).**
`editRecoveryRestore.e2e.spec.ts:103–109` (called at line 88). `releaseDocumentLocks` deletes every `payload-locked-documents` row (`id exists`), not only this spec's documents.
- *Precondition:* specs run in parallel against one database.
- *Expected:* only this spec's locks are cleared.
- *Actual:* one spec can clear another spec's lock state, which could cause flakes or hide lock behavior.

**3. Low — diagnostic only, not a product defect.**
- `:329`: `retired: row?.retired_at !== null` evaluates to `true` when the row is absent, so a missing row produces a poll timeout instead of a clear "row missing" failure.
- `:195`: `Date.parse(String(null))` yields `NaN`, and the failure message is unclear.

## Non-candidates

- Case 5's comment says the client persists nothing (no `localStorage`/`sessionStorage`), but the test only checks the rendered body. This is a coverage gap, not a defect.

## Unresolved questions

- `:479` and `:492` pin HTTP **404** for lost editing access. The supplied policy does not state a status code, so 404 versus 403 is not sourced from policy. Which is intended?
- `:447–462`: a Teacher navigating to the admin URL may be redirected. The "no prompt" assertion passes whether or not the page renders. Should the spec assert the redirect explicitly?
- `:437–444`: `createUserVerified` users are created without visible cleanup here. Whether they are removed depends on `fx.teardown`, which was not supplied.
- `:226–271`: the barrier test relies on the `.modal-backdrop` class and Payload DOM structure, which I could not verify.
