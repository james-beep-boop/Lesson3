# P170-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read (supplied content only; no tool calls, so I did not confirm these match baseline 6e75a173):**
  - `app/tests/unit/compareGroups.spec.ts:1-483` (supplied as 1-400 and 401-483)
  - `app/tests/unit/corpusCheck.spec.ts:1-60`
- **Not assessed:** the production modules and helpers these tests exercise (`src/lib/compareGroups.ts`, `src/lib/lessonAnchors.ts`, `generator/previewBundle`, `../helpers/generatorHtml`, `../helpers/nullResourceLinks`, `scripts/corpus-check.ts`). I make no claim about their behaviour.
- **Policy excerpts:** read as context only. They do not bear directly on these test files.

## Purpose and invariants (as the tests state them)

- `splitDocumentGroups` assigns every top-level node to exactly one group (TOTALITY), keeps keys unique per document (UNIQUENESS), and classifies sections by table structure, not title text.
- `groupAnchorId` yields document-scoped ids; `changeSummary` reports area and lesson counts separately; `mergeGroupKeys` preserves order without dropping or duplicating keys.
- `corpusCheck` fails closed: malformed JSON, an empty folder, or a manifest-only folder exits 1.

The assertions I checked are consistent with these stated invariants. I found no confirmed product defect in the supplied material.

## Candidates

**1. Uncertain lead, medium: a valid-JSON file with a bundle-like shape may be skipped silently.**
- Location: `app/tests/unit/corpusCheck.spec.ts:47-53` (behaviour asserted, implementation not supplied).
- Precondition: a corpus folder contains a real bundle that fails the bundle classifier but is valid JSON, alongside valid bundles.
- Observed by the test: any valid non-bundle JSON is counted as "skipped as not a bundle", and the run fails only when zero bundles are checked.
- Expected: unknown to me. The supplied material does not state the classification rule. If the policy is that every non-manifest file must be checked, this is a fail-open gap, and the run can go green with unchecked bundles.
- Reproduction (to run once the policy is confirmed): in a temp corpus, place one valid bundle and `wrong-shape.json` containing `{"META": {}}`. Assert the exit status and whether the skip count is reported.
- Status: unresolved. Needs `scripts/corpus-check.ts` and the skip policy.

**2. Test gap, low: the prose-link case asserts nothing about the link.**
- Location: `app/tests/unit/compareGroups.spec.ts:452-482`.
- The title says "plus a link", and the comment says the table "must still render". The assertions check group keys and `not.toContain('| A |')`. They do not check for the URL `https://example.com/evidence` or for a rendered `<table>`.
- Not a product defect on its own. A regression that drops the link would pass.

**3. Test quality, low (not product defects):**
- `compareGroups.spec.ts:215-216` uses `toContain('A')` and `toContain('NEW')`, which are weak substring checks.
- `compareGroups.spec.ts:358` casts the bundle with `as never`, which hides shape errors in the fixture.
- `compareGroups.spec.ts:374` and `:408` use non-null assertions that would fail with a `TypeError` rather than a clear message if a label is missing.
- `corpusCheck.spec.ts:14-21` shells out to `npx tsx`, which can fetch packages and make the suite slow or environment-dependent.

## Unresolved questions

1. What rule decides "not a bundle" in `corpus-check.ts`, and is skipping unknown valid JSON intended? (Lead 1.)
2. Should the prose-link test assert the rendered link and table directly? (Gap 2.)
3. Does `STORED_NULL_LINKS` match the current `resourceLinks` contract? The fixtures depend on it, and I could not read it.
