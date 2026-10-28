# P059-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Read in full, as supplied inline (no tools run, no tests executed; findings are from reading only):
- `app/src/components/EditRecovery/protocol.ts:1-226`
- `app/src/components/EditRecovery/restoreDiff.ts:1-150`
- `app/src/components/EditRecovery/restoreGroups.ts:1-125`
- `app/src/components/EditRecovery/unsavedWarning.ts:1-83`

Not assessed: imports (`lib/editRecovery/kernel`, `projection`, `escapeHtml`, `deadline`, `proseFields`, `@payloadcms/ui` HtmlDiff engine), all callers, and runtime behaviour. The policy excerpts were used as context only. Security claims, including the HTML-injection safety argument in `restoreDiff.ts:21-26`, remain unreviewed until independent review.

## Purpose and invariants (as stated in the files)

- **protocol.ts:** classifies each capture response. 4xx (other than 409/413/429) is definite; 5xx and 200-without-token are indeterminate. `planSave` proceeds on definite and indeterminate, blocks on conflict, and sends no token after indeterminate.
- **restoreDiff.ts:** word-level unified diff of recovered prose, with escaping before the engine. `renderOf` chooses a diff, emptied, paragraphs, spacing, or plain rendering.
- **restoreGroups.ts:** groups changed fields by row id and orders them by live anchors.
- **unsavedWarning.ts:** builds the delete-confirmation sentence. It fails open within a 3 s bound.

## Candidates

**1. Low (confirmed by reading; engine output not executed)**
`restoreDiff.ts:149` decides "has a diff" with `html.includes('data-match-type')`. The input is escaped but not stripped, so a teacher's literal text containing `data-match-type` matches even when the engine annotated nothing. The invisible-change case the file exists to handle then renders as `kind: 'diff'` with an unannotated body, not as `spacing` or `paragraphs`.
- Precondition: saved and captured prose contain the literal string `data-match-type`, and the only change is spacing or paragraph boundaries.
- Expected: `{kind:'spacing'}`. Actual per reading: `{kind:'diff', html:'data-match-type'}`.
- Repro (unit): `expect(renderOf('data-match-type', 'data-match-type  ', false).kind).toBe('spacing')`
- Fix direction is for the implementer to choose. One option is checking for an annotation tag, not the attribute string.

**2. Lead (unverified; severity depends on unseen caller)**
`protocol.ts:60-82`: `classifyResponse` has no transport-failure branch. A thrown `fetch` (status 0, or no response) falls through to `definite/rejected`. The file's own header defines indeterminate as "request may have committed and the response been lost", which describes a dropped connection. If the hook passes a network failure through `classifyResponse(0, …)`, `planSave` (`protocol.ts:113`) keeps the held token. A committed-but-lost capture would then make the save 409.
- Repro (unit): `expect(classifyResponse(0, null).kind).toBe('indeterminate')`. Actual per reading: `'definite'`.
- Needs the caller to confirm whether network errors are mapped before classification.

**No defect found** in: Retry-After parsing (`protocol.ts:68-77`, including null, empty, and junk values), `planSave`, `fingerprint` (32-bit collisions cost one request, as documented), `offerKind`, `unsavedWarningText` (all four count combinations, including the caller-excluded case), and `undrawable` ordering (`restoreDiff.ts:132-135`).

## Unresolved questions

- Does `captureDiff` ever return a key with an empty field object? If so, `restoreGroups.ts:95-101` produces a heading-only group.
- Can `anchors` repeat a key? If so, `restoreGroups.ts:118` appends the same lines twice.
- Does the engine emit unannotated text verbatim? Candidate 1 depends on it.
- Does a network error reach `classifyResponse`? (Lead 2.)
- Is `escapeHtml` plus the engine output actually free of live elements? Unreviewed.
