# P173-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope read

I read these six files in full from the text supplied in this message. I made no tool calls and did not run the tests.

- `app/tests/unit/discussionText.spec.ts:1-71`
- `app/tests/unit/discussionThreadDelete.spec.ts:1-60`
- `app/tests/unit/discussions.spec.ts:1-238`
- `app/tests/unit/displayNameForm.spec.tsx:1-53`
- `app/tests/unit/displayTitle.spec.ts:1-33`
- `app/tests/unit/draftCombineSuggestion.spec.ts:1-83`

**Not assessed:** every production module these tests import, including `src/lib/discussionText.ts`, `src/lib/discussions.ts`, `src/hooks/discussions.ts`, `src/endpoints/discussionThreadDelete.ts`, `src/endpoints/discussionActions.ts`, `src/lib/txDb.ts`, `src/lib/displayTitle.ts`, `src/components/UserMenu/DisplayNameForm.tsx`, and `src/lib/editRecovery/draftCombineSuggestion.ts`. I also did not check callers, database behaviour, or the §16.5 gate table or D5/D6a rules, which were not supplied. The policy excerpts were used only as the reference for intended behaviour.

## Purpose and invariants

- **discussionText:** only http(s) becomes a link, sentence punctuation stays outside the link, and the text reassembles to the original line.
- **discussionThreadDelete:** the caller's permissions are re-read after the lock is acquired. A demoted, disabled, or deleted caller is refused with no delete, no log, and a killed transaction.
- **discussions:** the forum gates (posting, reading, participation), client input validators, the content-immutability guard, and title-search escaping and bounds.
- **displayNameForm:** cancel discards the draft and error, and a timeout restores the controls with usable copy.
- **displayTitle:** casing rules for all-caps titles, with mixed-case input passed through.
- **draftCombineSuggestion:** which newer version to suggest for a Combine, based on lineage, authorship, and whole-major provenance.

## Confirmed product defects

None. The supplied ranges are tests. Their assertions are consistent with their own headers, and I found no failing assertion by reading. The items below are leads, gaps, or questions.

## Candidates and leads

**1. Uncertain lead, medium if confirmed.** `app/tests/unit/draftCombineSuggestion.spec.ts:18-36`
The policy says the suggested Combine uses the current ARES Official as the other parent. A teacher or absent Official stays in place when a newer release arrives. The fixtures pick the highest numeric release (`10.0.0`, lines 31–35) and take no Official input.
- *Precondition:* release `10.0.0` exists while Official is `2.0.0` or a teacher version.
- *Expected (policy):* suggestion targets the current Official, or nothing.
- *Actual per fixtures:* suggestion targets `10.0.0`.
- *Repro:* add an `official` input and assert the target is the Official.
- Whether the caller filters by Official is unknown.

**2. Uncertain lead, low to medium.** `draftCombineSuggestion.spec.ts:18-61`
Release identity is inferred from the absence of `author` and `mergedFrom`. No fixture carries `aresReleaseId`. The policy requires explicit ingest provenance so that a teacher-chosen whole major is never mistaken for an ARES release.
- *Repro:* `{ id: 3, semver: '2.0.0', lineage: [1] }` with no author and no `aresReleaseId` should not be suggested if provenance is required. The current tests cannot distinguish this case.

**3. Coverage gap, low.** `draftCombineSuggestion.spec.ts:13, 73-82`
The mocked `find` returns the same documents for any query, so query filters (`lessonPlan`, `subjectGrade`) are never exercised. The only access test uses empty assignments. There is no case where the caller has editing access for a different subject-grade than the source (`subjectGrade: 5`), which the policy requires to be refused.

**4. Uncertain lead, low.** `discussions.spec.ts:234-237`
The only length test uses `'x'.repeat(500)`. If truncation to 200 happens after escaping, the cut can leave a dangling backslash.
- *Repro:* `titleSearchWhere('x'.repeat(199) + '%')` should never produce a `like` value ending in an unpaired `\`.

**5. Question, low.** `discussionText.spec.ts:5-6, 36, 53`
The header and test title say markup stays text. Line 53 asserts that a URL inside `<a href="https://evil.test">` becomes a link. This may be intended, but the supplied policy does not settle it.

**6. Coverage gap, low.** `discussionThreadDelete.spec.ts:24-28`
The policy names unverified accounts and revoked sessions as refusal cases. The table covers demoted, disabled, and deleted only. A case `{ id: 7, roles: ['siteAdmin'], _verified: false }` is missing.

**7. Coverage gap.** `displayNameForm.spec.tsx:16-52`
There is no success-path test: no check of the PATCH body or the success state.

**8. Question.** `draftCombineSuggestion.spec.ts:37-45`
The `descendant` suggestion kind is not described in the supplied policy. Confirm it is intended.

## Unresolved questions

- Does the caller of `findDraftCombineSuggestion` restrict results to the current Official and the caller's subject-grade?
- Is the `descendant` suggestion intended?
- Should all-caps acronyms such as `DNA` be preserved by `displayTitle`? No test covers this, and the D5 rule was not supplied.
- Does the "markup stays text" rule cover linkifying URLs inside markup (item 5)?
