# P133-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

- **Read:** `app/tests/http/recovery.http.spec.ts:401-675` (supplied range only).
- **Not read:** lines 1-400. Helper definitions (`call`, `startAs`, `makeVersion`, `minimalBundleContent`, `drizzleOf`, `fx`), endpoint code, schema, migrations, and client code were not supplied.
- **Not run:** no tests were executed. Callers and runtime behaviour were not checked.
- **Coverage:** partial. This is a test-text review of the supplied range only.

## Purpose and invariants asserted

- **401-417 (meta view):** the operator metadata view must not expose captured prose, but must expose `revision` and `bytes`.
- **423-468 (S4 cleanup):** cleanup must carry the revision the operator read. A stale revision returns 409 and preserves the teacher's newer capture. The current revision returns 200 and removes the capture.
- **478-539 (S6 counts):** the unsaved-count endpoint returns exactly `{otherUsers, includesCaller}`. Site and subject admins and the author (editor) get 200. A plain Teacher gets 403.
- **541-626 (combine metadata):** combine context is owner-only. Owner restore returns a cross-plan `mergeParent`, while combine-preview refuses it. A deleted second parent still restores prose, and preview returns 404.
- **629-675 (budget):** restore does not consume the preview rate budget, and capture uses its own budget.

## Candidates

**No confirmed product defect from the supplied range.**

**L1 — Uncertain lead, low.** Inconsistent status for the "continue as ordinary draft" path.
- Evidence: cross-plan preview returns 400 (`:593-594`). Deleted second parent returns 404 (`:619`). The comment at `:615-616` says the 404 "is what tells the client to continue as an ordinary draft." The comment at `:583-585` says preview refuses the cross-plan id "so the client continues" without naming a status.
- Precondition: the owner's stored `combineContext` names a version in another plan. The test forces this via SQL at `:586-588`.
- Expected vs actual: the comments imply both cases produce the same client fallback. The test pins 400 for one and 404 for the other. If the client falls back only on 404, the cross-plan case would not fall back. The client is outside the range, so this is unverified.
- Reproduction: a client-level test that seeds `combine_context` with a foreign plan id, opens the editor, and asserts it opens as an ordinary draft with no error state.

**L2 — Test-specification mismatch, not a product defect, low.** The title at `:541` says restore "excludes a cross-plan second parent on restore." The assertions at `:589-590` and the comment at `:583-585` show restore returns `mergeParent: foreign.id`. The excerpts do not say whether restore should strip cross-plan ids, so intended behaviour is undetermined. The owner should decide and correct either the title or the assertion.

**L3 — Unresolved, uncertain.** Deleting the source version is checked only by the endpoint returning 404 (`:620-625`). The test does not show that the source's `edit_recovery` row is removed. Whether a foreign-key cascade exists is outside the range.
- Reproduction: after `:624`, query `edit_recovery` for `source_version_id = source`. The expected count depends on policy, which is not in the excerpts. If policy requires removal, the expected count is 0.

**Test-only notes (not candidates):**
- `:603-614` and `:670-674` clean up only some fixtures. Source and other versions leak if an assertion throws earlier.
- `:646-648` set the budget counter using a minute-aligned window. The assertion at `:649` expects 200 either way, so a window rollover weakens the test without causing a false failure.

## Unresolved questions

1. Should a cross-plan `combine-preview` return 400 or 404, and which status does the client branch on? Needs client code (L1).
2. Should owner restore strip a cross-plan `mergeParent` (title at `:541`) or return it (assertion at `:590`)? (L2)
3. Does deleting a version remove its `edit_recovery` row? Needs schema or migrations (L3).
4. Is disclosing `otherUsers` counts to version authors intended (`:525-528`)? The excerpts do not state this, so I have not inferred it.
