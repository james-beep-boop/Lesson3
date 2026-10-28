# P115-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

Test-only ranges were supplied, so no product policy could be checked against them. Read in full, no "not assessed" items:

- `app/tests/e2e/versionUnavailable.e2e.spec.ts:1-130`
- `app/tests/e2e/welcomeDialog.e2e.spec.ts:1-66`
- `app/tests/fixtures/pdf-library/.gitattributes:1-1`
- `app/tests/fixtures/pdf-library/README.md:1-7`
- `app/tests/fixtures/pdf-library/public-wire.pdf:1-32`
- `app/tests/helpers/cssSelectors.ts:1-38`
- `app/tests/helpers/db.ts:1-58`
- `app/tests/helpers/dialogs.ts:1-61`
- `app/tests/helpers/discussions.ts:1-41`
- `app/tests/helpers/e2e.ts:1-73`

No tool calls were made and no tests were run. Claims below are from reading the supplied text.

## Purpose and invariants (summary)

- **versionUnavailable spec:** a URL naming a missing or malformed version must show a notice with no substituted document (`.doc-section` and `.compare-grid` absent). Negative assertions carry the weight.
- **welcomeDialog spec:** the Welcome dialog appears once per browser storage and stays closed after dismissal or navigation.
- **pdf-library fixture:** a one-page PDF whose exact bytes are used by a wire test, which is not supplied.
- **cssSelectors:** checks whether a class has a stylesheet rule, with a boundary so `.lp-manage` does not match `.lp-manage__num`.
- **db / e2e / discussions helpers:** raw SQL cleanup of rate-limit buckets, login budget clearing, welcome suppression, and topic creation.
- **dialogs:** geometry check for paired Cancel/action buttons.

## Candidates

No confirmed product defects. All are low severity.

**C1 — Fixture stream `/Length` is off by one (low, confirmed by local arithmetic).**
`app/tests/fixtures/pdf-library/public-wire.pdf:15` declares `/Length 63`. The stream content between `stream` and `endstream` is 62 bytes (`BT … ET`, word-length sum 49 plus 13 spaces). The 63 includes the EOL before `endstream`, which the PDF spec excludes. The xref offsets (9, 58, 115, 241, 311) and `startxref 423` all match my byte count.
- Expected: Length 62. Actual: 63.
- Repro: load the file with a strict parser (`qpdf --check` or pdf.js) and confirm there is no stream-length warning. Not run.
- Impact: fixture only; the wire test checks bytes, not PDF validity.

**C2 — `stylesheetHasRule` matches a class inside a negation (low).**
`app/tests/helpers/cssSelectors.ts:36-37` tests `\.className` anywhere in each selector. Its own doc at line 34 says "target exactly `className`".
- Repro: `stylesheetHasRule(['.other:not(.lp-manage)'], 'lp-manage')` returns `true`. Under the doc's contract it should be `false`.
- Impact depends on `classNameStyles.spec`, which was not supplied.

**C3 — `rowsOf` returns `[]` for unexpected result shapes (low, test integrity).**
`app/tests/helpers/db.ts:56-57`. Repro: `rowsOf({ rowCount: 1 })` returns `[]`. A "no rows remain" assertion built on it would pass vacuously. The file's own header notes the shape ambiguity.

**C4 — Bucket-key format is unverified (uncertain lead).**
`db.ts:42-43`, `discussions.ts:40`, and `e2e.ts:57` assume `login:%:<hash>`, `loginClient:local:<hash>`, and `discussionPost:<id>` exactly, and that email hashing matches the server. The source of truth (`src/lib/rateLimit.ts`, `hooks/authRateLimit.ts`) was not supplied. The `discussionPost` match is exact, so a key with a suffix would be silently skipped, which `db.ts:24-31` already warns about.

**C5 — Test title overclaims state (low, test quality).**
`versionUnavailable.e2e.spec.ts:96`. The title says "even with one version left", but no assertion checks that. The premise also depends on test order, since the test at line 113 creates `1.1.0`. The assertions at lines 104-109 would hold either way.

## Unresolved questions

1. Does `docker-compose.test.yml` (not supplied) keep the `pdf-library` override out of production, as `README.md:5-7` claims?
2. Is the "another plan's version" case (`versionUnavailable.e2e.spec.ts:5`) covered by any spec? None in this range covers it. This is an absent test, not a defect.
3. Does `src/lib/requestedVersion.ts`, which the header cites, return the notice for another plan's id?
4. Does `loginAs` land on `/` as its docstring says? That depends on `helpers/login.ts`, which was not supplied.
5. Is the fixture key `'editor'` a Teacher holding an editor assignment, consistent with the policy that "Editor" is not an account type? This is an identifier question, not a defect.

Security and integrity conclusions remain unreviewed until independent review.
