# P129-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- `app/tests/http/jobStatsGlobal.http.spec.ts:1-157`: read as supplied (157 lines).
- `app/tests/http/lessonReleases.http.spec.ts:1-203`: read as supplied.
- `app/tests/http/lockedDocuments.http.spec.ts:1-283`: read as supplied.
- Policy excerpts (release/Official rules, §8 roles, prose-links table): read. §8 is truncated mid-sentence, so the read rules for job statistics and document locks are not in the excerpt.
- **Not assessed:** the implementation these tests exercise (`access/generatedSurfaces.ts`, `access/lockedDocuments.ts`, the upload endpoint, `lib/wireError.ts`, `helpers/fixtures.ts`, `helpers/httpWire.ts`). No tests were run, and I did not confirm that they pass at baseline `6e75a173`. Everything below is judged from the test text alone.

## Purpose and invariants (as asserted)

- **jobStatsGlobal:** nobody can write the generated stats global through the API (Site Administrator, other roles, or anonymous). Reads are asserted Site-Administrator-only.
- **lessonReleases:** upload is refused before any write for anonymous and non-Site-Administrator callers, even with a forged token. A forged or stale confirmation token returns 409 and writes nothing. A confirmed upload writes and sends exactly one message. Missing taxonomy and Official changes share one 409 round. Message bodies are capped at 5,000 characters.
- **lockedDocuments:** no API lock creation. Any signed-in user can read locks. Take-over is allowed only to oneself, only where the caller can edit, and not by moving the lock to another document. Only the holder can delete their own lock. Deleting a locked version returns 423 and succeeds after the lock is released.

## Candidates

**None confirmed.** Each assertion I could compare against the supplied policy is consistent with it. Test text alone does not establish a product defect.

Test-quality notes (not product defects):

1. `lessonReleases.http.spec.ts:178`: the setup upload's status is not asserted. If it fails, lines 183–193 run against unexpected state. Fix: assert `200` at line 178.
2. `lessonReleases.http.spec.ts:195-202`: the title says the 5,000-character limit is retained, but only 5,001 characters is tested. A lower limit would also pass. Add an accept control at 5,000.
3. `lessonReleases.http.spec.ts:54-63`: every archive uses release date `2026-11-14`, so the older-date refusal and the equal-date rule are never exercised. There is also no coverage for same-id/different-content refusal, the "Looks damaged" checksum warning, the 422 response, or the `1.0.0` label on first import.
4. `lessonReleases.http.spec.ts:95-102`: "authorizes before any import write" counts only `lesson-bundle-versions`. It does not check `lesson-plans`, taxonomy, or messages.
5. `lockedDocuments.http.spec.ts:139,149,159`: the assertions count the entire locks table. This is correct only on a disposable database with no concurrent lock writers.

## Unresolved questions

- Is Site-Administrator-only read of job statistics (`jobStatsGlobal.http.spec.ts:143-156`) the documented policy? The supplied §8 excerpt is truncated before this point.
- Should a Site Administrator be able to clear a stale document lock? The test (`lockedDocuments.http.spec.ts:242-250`) forbids it, but the excerpt does not state the policy, and the cited DECISIONS 2026-10-24 entry is unseen. Operationally, a lock left by an absent holder blocks version deletion (lines 254–282) with no administrator override.
- `lockedDocuments.http.spec.ts:267-268` asserts that the App's three delete buttons map 423 to `DOCUMENT_LOCKED_MESSAGE`. That cannot be verified from these ranges.
- `jobStatsGlobal.http.spec.ts:6-14` cites F-C22-001, operator decision D2, and "confirmed at runtime". None of this is verifiable here.
- `lessonReleases.http.spec.ts:98-100` expects 401 for anonymous and 403 for other roles, which assumes authorization runs before form parsing. Unverified.
- `lockedDocuments.http.spec.ts:258` generates `semver: 61.N.0` with a per-process counter. Whether this collides across reruns on a non-disposable database is unknown.

Security and integrity claims in these files remain unreviewed until independent review.
