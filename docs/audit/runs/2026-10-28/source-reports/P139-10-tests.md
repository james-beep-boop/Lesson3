# P139-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read (as supplied in the request, no tool calls):** `app/tests/http/userSearch.http.spec.ts:1-198` (whole file) and `app/tests/http/worldwideIds.http.spec.ts:1-152` (whole file).
- **Not assessed:** the imported helpers (`helpers/fixtures`, `helpers/httpWire`, `helpers/db`), `src/lib/userSearchContract.ts`, and the access hooks, endpoints, and migrations the tests exercise. Claims about setup and product behavior below rest only on the test code.
- **Baseline:** I did not verify that the working tree matches source baseline `6e75a173e822e4c4be42821b0a4af48ca457bd36`.

## Purpose and invariants (from the test text)

- **userSearch:** Site-Admin-only `GET /api/users/search`. Expected behavior: 401 unauthenticated, 403 for non-Site-Admins, search by name or email, server-side pagination, computed `type` filter (Teachers with editing access stay Teachers), `status=awaiting` filter with 400 for unknown values, and grant labels. The asserted response keys exclude `uid` and all auth secrets.
- **worldwideIds:** DB-level NOT NULL and UNIQUE on `uid`; `uid` readable only by self and Site Admins for users; readable by anyone who can read a version; no API write changes a `uid`; a teacher's save-as-new from an ARES release gets a fresh `uid` and a null `releaseFingerprint`.

Both files match the policy invariants they cite. I found no confirmed product defect within these ranges.

## Candidates

**None confirmed.**

**Lead L1 (uncertain, severity unassessed; would be medium if confirmed).** `userSearch.http.spec.ts:51-55` creates a second `subjectAdmin` assignment on `fx.subjectGrade` through `createUserVerified`, using the fixture's subject-grade. Policy §8 says a subject-grade has *at most one* Subject Administrator. Two outcomes are possible:
- If the fixture's `fx.users.subjectAdmin` already administers `fx.subjectGrade`, the test either throws in `beforeAll` (a test-setup failure) or shows that the at-most-one invariant is not enforced on this write path.
- Whether the write path enforces the invariant cannot be determined from the supplied text.
- Expected: the write is refused, or the invariant is enforced by a hook or validation.
- Actual: unknown.
- Reproduction: with the fixture's subject admin already on `fx.subjectGrade`, attempt `payload.create` on `users` with `overrideAccess: true` and a second `subjectAdmin` assignment on the same subject-grade, then check whether it is accepted.
- Needed to resolve: `helpers/fixtures.ts` and the assignment validation hook.

## Non-findings (recorded so they are not re-raised)

- `userSearch.http.spec.ts:112-126` omits `uid` from the search response keys. This is consistent with the policy's self-or-Site-Admin read rule. The absence alone is not a defect.
- `worldwideIds.http.spec.ts:87-109` asserts only `status < 500` for the Site-Admin PATCH attempt. It still asserts the uid is unchanged, so a silently ignored write passes, which matches "no API write can set or change a uid". This is a weak assertion, not a product defect.
- `userSearch.http.spec.ts:158-163` asserts `totalDocs === docs.length` with `limit: 50`. This breaks if more than 50 unverified accounts match `MARK`. Test fragility only.
- `worldwideIds.http.spec.ts:141-144` derives the saved id from `adminUrl.split('/').pop()`. A trailing slash would yield `0`. Test fragility only.
- `userSearch.http.spec.ts:100` and `:177-183` deny the directory to Subject Admins. This matches the Site-Admin-only status filter in the tests.

## Unresolved questions

1. **L1 above:** does the assignment write path enforce one Subject Administrator per subject-grade, and does `fx.users.subjectAdmin` already hold that seat?
2. **Grant workflow:** policy §8 says Subject Administrators grant and revoke editing access within their subject-grade, but this directory is Site-Admin-only (403 for `subjectAdmin`). If grants are made through this directory, the policy and the access rule disagree. If grants use another surface, this is not a gap. The supplied text does not say which.
3. **Coverage gap, not a defect:** the uid-immutability test covers only Site-Admin PATCH on `users`. Version-level Local API updates and Make Official are not exercised here.
