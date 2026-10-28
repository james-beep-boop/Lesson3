# P171-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read, in the supplied ranges:**
  - `app/tests/unit/currentSection.spec.ts:1-124` (complete)
  - `app/tests/unit/deliverables.spec.ts:1-59` (complete)
  - `app/tests/unit/discussionComposer.spec.ts:1-262` (complete)
  - Policy excerpts (not source). They were read through §8's "Canonical user model", which is truncated mid-sentence, so the excerpt is partial.
- **Not assessed:** every implementation file these specs import, including `components/LessonControls/currentSection.ts`, `src/generator/adapter.ts`, `src/generator/deliverables.ts`, `src/lib/discussionComposer.ts`, and `components/Discussions/submitPost.ts`. I made no tool calls and ran no tests, so nothing here shows the specs pass or that the implementations are correct.
- **Scope:** these are test files only. I checked them against the stated invariants and the policy text. I did not check callers or runtime behavior.

## Invariants the specs pin (as stated in the files)

- **currentSection:** the active jump-nav section is the last section whose header top is at or above the toolbar line. `crossingLine` takes the max of toolbar bottom and landing margin, so a jumped-to section counts as crossed.
- **deliverables:** the T2 strip lists exactly the documents `bundleToAresData` emits. The teacher key appears only with the student final explanation.
- **discussionComposer:** after an uncertain outcome the fields stay locked and the submission key is kept. Only a successful post issues a fresh key. A 409 means "earlier attempt", never a refusal. A 400 is resolved by key lookup before it is treated as a refusal.

## Candidates

**None confirmed.** Every assertion is consistent with the invariants stated in the spec comments and the policy excerpt. I found no concrete behavior mismatch from the test text alone.

**Uncertain leads (not confirmed):**

1. **`currentSection.spec.ts:122`, low.** `crossingLine(99, Number.NaN)` is expected to return `99`. A plain `Math.max(99, NaN)` returns `NaN`, so this passes only if the implementation guards NaN explicitly. The source is not in scope, so I cannot tell which. Reproduction: run this one assertion against the implementation. If it fails, the mobile or unmeasured fallback yields `NaN` as the crossing line and the indicator never lights.
2. **`deliverables.spec.ts:18, 24, 50`, low.** The summary-table and final-explanation fixtures use keys `focus`, `intro`, and `sections[].heading/body`. The policy names `SUMMARY_TABLE.lessons[].{observed, learned, explained}`. If the adapter keys on those real fields, the mirror test may pass on fixtures that never reach the emission branch with real content. Reproduction: add a case with real-shaped `observed`/`learned`/`explained` rows and check `summaryTable` against `data.SUMMARY_TABLE`.
3. **`discussionComposer.spec.ts:97-109`, low, coverage gap.** `classifyCreateStatus` is pinned only for 201, 400, 401, 403, 408, 409, 413, 429, 500, and 502. The behavior for 404, 422, 503, 504, and network errors without a status is not specified here. This is a gap in the spec, not a defect.
4. **`discussionComposer.spec.ts:81-91`, low, test isolation.** The test deletes `crypto.randomUUID` in `finally` and then asserts it is a function again. This holds only if the original was a prototype method, not an own property. Under a runtime that defines it as an own property, the final assertion would fail for environment reasons, not a product defect.

## Unresolved questions

- Do `currentSection.ts` and `discussionComposer.ts` handle NaN and unlisted statuses in the way the specs assume? Needs the source, and a test run.
- Does `adapter.ts` key the summary table on `observed/learned/explained`, or on `focus` as the fixtures suggest?
- Did the implementations' authors intend 404/422/503 to map to `uncertain` or `refused`? The policy does not say, so I have not invented a policy for it.

Partial assessment: three test files were read in full, but none of the code they test was read, and no tests were run.
