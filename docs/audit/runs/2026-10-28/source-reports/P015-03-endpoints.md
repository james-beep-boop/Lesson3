# P015-03-endpoints

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

- `app/src/endpoints/uploadBundles.ts:1-176`: read in full, from the supplied text.
- `app/src/endpoints/userAdminActions.ts:1-306`: read in full, from the supplied text.
- Not assessed: every imported module (`ingest/*`, `respond.ts`, `access.ts`, `hooks/*`, `lib/txDb`, `lib/rateLimit`), the tests, and callers or UI clients. No tools were run, so no runtime behaviour is claimed. This is a partial assessment of two files, not a completed coverage claim.

## Purpose and invariants (as stated in the files)

- **uploadBundles.ts:** Site-Admin-only multipart upload. Authorization runs before rate limiting and body parsing. JSON is parsed, never executed. Missing taxonomy returns 409 with nothing written. The `ok` flag drives 200 versus 422.
- **userAdminActions.ts:** Three Site-Admin actions (reset link, site-admin toggle, sign-in disable). Each takes the admin-count lock, then the row lock, checks freshness, then re-asserts the caller. Sign-in disable clears `sessions` atomically.

## Candidates

**C1: Unchanged-only upload may return 422 (lead; severity medium if confirmed)**
- Evidence: `uploadBundles.ts:131-132` sets `ok` from `report.bundles`, `report.skipped` and `inputs.waitingForProgram`. It does not count `report.alreadyHere` (line 142) or `olderNotImported`. The policy excerpt says an entirely unchanged upload returns 200.
- Confirmed locally: the `ok` expression excludes `alreadyHere`.
- Unverified: whether unchanged matches are also placed in `bundles` or `skipped` by `ingestUploadItems`, which is not in the supplied ranges.
- Expected: re-uploading a file identical to the current Official returns 200, `ok: true`, `alreadyHere` length 1.
- Actual: 422 with "No files were imported" if unchanged matches appear only in `alreadyHere`.
- Repro test: POST one JSON file byte-identical to the current Official, then assert status 200, `ok === true`, `count === 0`, and `alreadyHere.length === 1`.

**C2: `enabled` polarity on the sign-in-disabled body is inverted by name (lead; contract hazard)**
- Evidence: `userAdminActions.ts:268` writes `signInDisabled: enabled`. The same body key means "enable" for the site-admin action at line 263 and "disable" for sign-in at line 268.
- Confirmed locally: `{enabled: true}` on `/set-sign-in-disabled` disables the account and clears sessions.
- Not established: the policy's intended meaning, and whether the UI sends the right value. The file does not define the body contract, so this is not a demonstrated defect.
- Repro test: POST `/:id/set-sign-in-disabled` with `{enabled: true, expectedUpdatedAt}`. Assert the user's `signInDisabled` is true and `sessions` is empty. Pair with the UI client's request to confirm the mapping.

**C3: Route id parsing accepts non-canonical numbers (low)**
- Evidence: `userAdminActions.ts:109-110` uses `Number(req.routeParams?.id)` with `Number.isFinite`.
- Confirmed locally: `Number('0x1')` is 1, and `Number('1.5')` and `Number('1e0')` also pass the finite check.
- Unverified: whether `lockAndVerifyFresh` normalizes the id. The file's comment expects "Missing user id" to mean a bad id, so the intended handling is unclear.
- Repro test: POST `/api/users/0x1/set-site-admin` and `/api/users/1.5/set-site-admin`. Observe whether they target user 1 or fail, and whether the result matches the 400 intent of line 110.

**C4: `req.formData!()` non-null assertion (low)**
- Evidence: `uploadBundles.ts:64`. If `formData` is undefined, the call throws a `TypeError` that the surrounding `catch` at line 65 maps to 400, but only inside the `try`. The assertion is what makes the path reachable.
- Confirmed locally: the assertion exists.
- Unverified: whether `PayloadRequest.formData` can be undefined in practice.
- Repro test: send a request with no multipart body and a non-form content type; expect 400.

## Questions, not defects

- `userAdminActions.ts:136`: the admin reset-link budget is consumed before the freshness 409 and the disabled-account 409. Refused requests spend the admin's budget. The comment describes this ordering as intentional, so I cannot call it a bug without the intended policy.
- `userAdminActions.ts:221`: `expiresInMinutes: 60` is hard-coded and attributed to Payload's default. The Payload config is not in range.
- `userAdminActions.ts:216`: the token is interpolated into the URL without encoding. This is safe only if Payload tokens are URL-safe. Unverified.

## Unresolved

1. Where does `ingestUploadItems` place unchanged matches (`bundles`, `skipped`, or `alreadyHere`)? This decides C1.
2. Does `sendReleaseMessages` run only after a committed transaction?
3. Does `lockAndVerifyFresh` normalize or reject non-canonical ids (C3)?
4. Does the UI send `enabled` with the meaning the endpoint name implies (C2)?
