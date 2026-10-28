# P108-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/e2e/lessonReleases.e2e.spec.ts:1-176` and `app/tests/e2e/liveRowLabels.e2e.spec.ts:1-162`, as supplied in the message.
- **Policy excerpts:** read through the start of §8 (the excerpt ends mid-sentence). Used only as the expectation source.
- **Not assessed:** the helpers these files import (`loginAs`, `setAdvancedTools`, `setupRoleFixture`, `withReleaseFingerprint`, `drizzleOf`, `openEditor`, `expandLessons`, `OVERVIEW`), the Playwright config, the product source behind these tests, and the referenced `docs/PLAN-editing-typing-speed-2026-10-23.md`. No tool calls were made, so no runtime behaviour was observed.
- **Security/integrity:** no claims. These are test files, and nothing here is independently reviewed.

## Purpose and invariants (as the tests encode them)

- **lessonReleases:** the header and version list show `semver · ARES release <date>`, or `ARES release: not stated` when a fingerprint has no date. Teacher versions get no label. The Official-updated note uses the Official's ARES date, the recorded change date, and the true previous Official (`officialChangedFrom`, not `sourceVersion`). The note is hidden for unstamped plans and for human (`officialChangedBy` set) changes. The Combine suggestion appears for an editing-access teacher with an older ARES ancestor, is dismissed in component state only, and opens `?combineWith=` without writing.
- **liveRowLabels:** row labels track typed titles, renumber on add/remove/move, and stay bound to their row. Prose typed without delay and saved immediately is stored exactly.

## Candidates

No confirmed product defect. One low-severity, uncertain item:

**C1 — Timezone-coupled expectation (low; uncertain, test-side).**
- Evidence: `lessonReleases.e2e.spec.ts:95` expects `…on 03 Dec 2026.` The fixture sets the recorded change to `2026-12-03T15:00:00Z` (`:79`).
- Policy: the note's change date uses "the reader's own day: `LocalDay`, the UTC day only before hydration."
- Local reasoning: 15:00Z is 4 Dec in any zone at or east of UTC+9. In such a zone a correct product shows `04 Dec 2026`, and the assertion fails. In zones west of about UTC−15 to UTC+8 it passes. The assertion therefore depends on the runner's timezone unless the Playwright config pins one (not supplied).
- Expected: reader-local day per policy. Actual expectation: UTC day.
- Reproduction: run the spec with `timezoneId: 'Australia/Sydney'` (or `TZ=Australia/Sydney`) and assert the same note text. Confirm whether the fixture or the product is at fault.

**Test-level observations (not product defects):**

- **T1 — Title overstates coverage.** `lessonReleases.e2e.spec.ts:152-155` is titled "…in either mode", but it only calls `setAdvancedTools(fx.payload, true)`. Standard mode is not exercised for this reader.
- **T2 — Hooks bypassed.** `:78-80` and `:166-172` set provenance with raw SQL, so these tests do not exercise the `beforeChange` stamping path. Absence of coverage, not a defect.
- **T3 — Shared-state ordering.** Test 3 (`:152`) depends on the Official-updated state that test 1 establishes through the fixture. Test 4 mutates the plan's provenance. The tests are not independent.
- **T4 — Timing flake risk.** `liveRowLabels.e2e.spec.ts:96, 102, 104, 131` use 1 s assertion timeouts for live label updates. This is a flake risk, not a correctness mismatch.
- **T5 — Expectation source unverified.** `liveRowLabels.e2e.spec.ts:102` expects a cleared title to show `Lesson 1`. The supplied policy does not state this rule, and the plan document it cites was not supplied. I cannot confirm it is the intended expectation.

## Unresolved questions

1. What timezone does the Playwright config use for these runs? This decides whether C1 is a live failure.
2. Does the Official-updated note use `LocalDay` the way §ARES-presentation describes? Settling C1 needs this.
3. What is the intended label for a cleared lesson title? The plan document would settle T5.
4. Do the unread helpers (`setAdvancedTools`, `withReleaseFingerprint`) behave as the test comments assume? Neither was read.
5. Should the Standard-mode reader case (T1) be added, so that the "either mode" title is true?
