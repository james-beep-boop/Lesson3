# P169-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: partial assessment (test ranges only)

**Result: no confirmed defects in the supplied ranges.** I did not use tools. The ranges were supplied as text, and I could not verify them against baseline `6e75a173`. The code under test (`saveAsNewEndpoint`, `Controls`, `diffVersionGroupsCached`, `CompareFilter`) was not supplied, so I make no claim about its runtime behavior.

### Coverage

Read in full as supplied:
- `app/tests/unit/combineUnavailable.spec.ts:1-148`
- `app/tests/unit/combineVersionChoices.spec.tsx:1-72`
- `app/tests/unit/compareDiffGroups.spec.ts:1-292`
- `app/tests/unit/compareFilterDefault.spec.tsx:1-65`

Not assessed: all imported implementation files; any caller or runtime path; the policy excerpt after §8's truncated "accurate title" sentence; and anything outside these four ranges.

### Purpose and invariants (as pinned by the tests)

- **combineUnavailable**: Save-as-new denial handling. Source or second-parent read denial (403/404) returns the same endpoint-owned 404 with `unavailable` set to `source` or `secondParent`. Revoked editing access fails with 403 before any locked parent re-read. Database errors propagate and are not disguised as missing parents. Each failure path rolls back exactly once.
- **combineVersionChoices**: Combine controls. Version numbers are read only for callers who can combine, with `overrideAccess: false`. A Teacher with no assignments triggers no lookup. A suggestion failure leaves the normal controls intact.
- **compareDiffGroups**: Compare-page change detection. Identical versions report no changes. Changes are marked per area. Insertions and deletions annotate only their own pane. Paragraph splits and whitespace-only edits are flagged `structureOnly` rather than reported as identical. Added and removed lessons keep their document position.
- **compareFilterDefault**: The compare page opens in changes-only mode, with the toggle reflected in `aria-pressed`. Hiding is CSS-only and is not verified here.

### Candidates

None confirmed.

### Leads (uncertain; not defects on current evidence)

**L1. Descendant "common-history" suggestion (`combineVersionChoices.spec.tsx:48-72`, low, unresolved).** The test expects a newer same-plan version (`1.0.2`, `lineage: [1]`) to be offered as `kind: 'descendant'`. The policy excerpt defines the Combine suggestion only for a *surviving ARES ancestor older than the current Official*, and says missing or unproven ancestry yields *no* suggestion. A descendant suggestion is not covered by the excerpt. It may be a separate, approved feature, or it may be a divergence. I cannot tell from the excerpt. The access scoping (`overrideAccess: false`) is consistent with policy.

**L2. Ordinal cascade on middle insertion or removal (`compareDiffGroups.spec.ts:228-271`, low, accepted limitation).** Inserting a lesson mid-sequence renumbers later lessons, so lesson 3 shows as wholly new even though its content existed before. The test pins this as the expected Phase 1 behavior and comments that it should change once stable lesson identity lands. The policy excerpt does not address compare-key identity. This is a documented carve-out, not a defect, but a user would see unchanged content marked as changed.

### Test-quality notes (not product defects)

- `compareDiffGroups.spec.ts:273-291` is titled "marks every area changed" but asserts only the Summary Table keys.
- `combineUnavailable.spec.ts` covers no successful save-as-new or commit path in these ranges. The policy's requirement that Save still satisfy the field split and source-deletion permission is not exercised here. An absent test alone is not a product defect.
- `combineVersionChoices.spec.tsx` uses `mockResolvedValueOnce` with `vi.clearAllMocks()`, which does not clear queued once-values. No leak is visible because every queued value is consumed within its test.

### Unresolved questions

1. Is a descendant "common-history" suggestion (L1) an approved Combine feature? If so, what is its visibility rule for Teachers without editing access?
2. Is the ordinal compare cascade (L2) still the accepted Phase 1 behavior?
3. Do the field-split and source-deletion rechecks on save-as-new have tests in files outside these ranges?
4. Does the source at `6e75a173` match these test contents? I could not verify that.

Security and integrity claims in these ranges remain unreviewed until independent review.
