# P167-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Partial assessment.** I reviewed only the four test ranges supplied in the request. I did not run tests, make tool calls, or read the implementation modules they import (`CollapseOnEntry`, `entryPhase`, `lib/combine/engine`, `diff3`, `draft`, the `LessonBundleVersions` collection). Nothing below is a claim about runtime behavior.

## Scope read

- `app/tests/unit/collapseOnEntry.spec.tsx:1-109`: read in full.
- `app/tests/unit/collapsedPanelEntryRule.spec.ts:1-72`: read in full.
- `app/tests/unit/combineDraft.spec.ts:1-22`: read in full.
- `app/tests/unit/combineEngine.spec.ts:1-400`: read. The file continues past line 400, which was not assessed.

## Purpose and invariants (as the tests state them)

- **collapseOnEntry**: a panel that starts expanded (from a stored preference) is collapsed once per document visit. A panel the reader opens during the visit is not re-collapsed. A jump that ends the entry phase disarms the rule only for that document. An unsettled state does not consume the visit.
- **collapsedPanelEntryRule**: every `initCollapsed` panel carries the entry rule, and array rows do not. The walk is intended to be recursive.
- **combineDraft**: parsing keeps one parent id and unique resolved keys, and rejects snapshots, invalid ids, and oversized key lists. Validation appears to run before deduplication.
- **combineEngine**: `merge3` paragraph merge rules, `planCombine` start-side selection, conflicts, admin-only content refusal, structure refusal, and system-data refusal.

## Candidates

**No confirmed product defect in the assessed ranges.** Everything below is a lead or a test-quality issue, not a product mismatch.

1. **Low, uncertain: budget test does not show what its title claims.** `combineEngine.spec.ts:122-128` is titled "shares a finite work allowance across fields", but the fixture is plain three-line text with no tables, and the comment cites "two 4-by-4 tables". The refusal may come from some other path. The test does not show that a shared budget is consumed across fields. *Would settle it:* a two-field case, one with tables and one with text, with the budget exhausted only by the combined total.

2. **Low, uncertain: ambiguity title versus fixture.** `combineEngine.spec.ts:338-351` is titled "does not use an ancestor whose row correspondence is ambiguous". The base is reversed, but its lessons have distinct `aresKeywords`, so the fixture does not show ambiguity. The result is `two-way`. Either the title is wrong, or the engine discards reordered ancestors for a reason other than ambiguity. Without `engine.ts` I cannot tell which.

3. **Low, test-guard gap: walk ignores `tabs` and `blocks`.** `collapsedPanelEntryRule.spec.ts:29-41` recurses only through `field.fields`. Payload stores `tabs` children under `tabs[].fields` and `blocks` children under `blocks[].fields`. If the collection uses either, panels or arrays inside them go unchecked. The `≥3` and `≥6` floors would not catch partial omission. I cannot see the collection to confirm.

4. **Informational: title says "differently" but changes differ by field.** `combineEngine.spec.ts:284-291` changes `duration` on one side and `exemplar` on the other, then expects `admin-both`. The policy excerpt says "both → refused", so the behavior is consistent. The title is imprecise.

## Unresolved questions

- `combineEngine.spec.ts:293-298` treats the version `title` as administrator content. The supplied policy excerpts do not list the version title as admin-only. I cannot confirm this is intended, so I did not infer policy from it.
- The ranges do not cover several policy-classified fields: `framework[].phase` (admin-only), `SUMMARY_TABLE.lessons[].title` (admin-only), `sections[].prompt` (teacher prose), and lesson `title` (teacher prose). This is coverage, not a defect.
- `collapseOnEntry.spec.tsx` passes string ids to `beginEntryPhase`/`endEntryPhase` while the mocked `documentInfo.id` is a number. The tests only pass if the component normalizes keys. I did not check this.
- Behavior for `documentInfo.id === undefined` (a create view) is not exercised in these ranges.
- Security and integrity are not assessed here. These are test files, and no review of the upload, parsing, or authorization paths has been done.
