# P127-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read (as supplied in the request):** `app/tests/http/endpoints.http.spec.ts:2001-2400`. This is a partial assessment. Line 2400 ends mid-test, so the `401 without auth` upload case is only partly visible.
- **Not assessed:** helpers and fixtures defined outside the range (`MARK`, `auth`, `url`, `fx`, `minimalResourceLinks`, `drizzle`, `RoleKey`); the endpoint implementations (`request-editing`, `resolveRecipients`, `mark-read`, `endpoints/forgotPassword.ts`, the upload handler); lines 2401 onward. I did not run the spec, and I did not check callers or runtime behavior.

## Purpose and invariants (as the tests state them)

- **request-editing (2001-2092):** 401 without auth, 404 for an unknown plan, 409 for existing editors, one message per recipient (every Site Admin plus the subject-grade Subject Admins, minus the requester), and a 429 on repeat same-day requests.
- **mark-read (2094-2159):** a state-changing POST scoped to the caller's own messages; foreign IDs are ignored.
- **forgot-password (2167-2344):** identical status and body for registered and unknown addresses; a response-time floor; case-insensitive lookup; the per-address throttle still applies; with SMTP absent, an admin-issued reset token is not rotated.
- **upload (2346-2400):** the server-side Site-Admin gate, tested at the wire.

## Candidates

**No confirmed product defect in this range.** Everything below is either a test-side defect or an unresolved lead that needs the endpoint code.

1. **Timing-floor test may contradict the no-SMTP branch (lead, medium).** `2231-2256` is not gated on `smtpConfigured`, but the comment at `2174-2175` says the no-SMTP path "returns the uniform response immediately." Either that path also pads (and the comment is loose), or this test fails in no-SMTP environments. Repro: run the spec with `SMTP_HOST` unset and read `unknownMs`/`knownMs`.

2. **Unbounded `messages` query (test defect, low-medium).** `2073-2079` calls `find` with no `limit`. Payload's default page size is commonly 10, so `toHaveLength(expected.size)` fails once more than 10 recipients exist. The comment at `2034-2037` fixed the same problem for users (`limit: 1000`) but not here. The `users` query at `2040-2053` also silently truncates past 1000. Repro: fixture with 11 Site Admins.

3. **Security claim overstated (test/claim, low).** The comment at `2095-2097` and the title at `2120` say a cross-site POST is blocked by SameSite. The test only sends an unauthenticated request with no cookie and checks for 401. It exercises no SameSite behavior and no Origin check. The CSRF claim is unverified.

4. **Recipient derivation vs. endpoint filters (unresolved, low).** `2038-2063` derives expected recipients from `roles`/`assignments` only. It does not mirror any filtering for disabled or unverified accounts. If `resolveRecipients` filters them, the test will fail on a fixture that includes such an account; if it does not, the test is silently incomplete.

5. **Test isolation (lead, low).** The forgot-password block clears its rate-limit buckets (`2186-2191`). The request-editing block (`2033-2071`) does not clear its own bucket. A same-day rerun could return 429 at `2068` and fail `2033`. Setup outside this range would settle it.

6. **Env parsing and cleanup hygiene (low).** `2243` uses `Number(env ?? 400)`: an empty string yields 0 and disables the floor silently; a non-numeric value yields NaN. The sentinel cleanup at `2336-2341` runs outside a `finally`, so a failed assertion leaves the sentinel token in place, and it sets the token to NULL even if one existed before.

## Unresolved questions

- Does the no-SMTP path pad its response time (item 1)?
- Does `resolveRecipients` exclude disabled or unverified admins? The policy excerpts do not say, so I have not assumed a rule.
- Is the 429 keyed per plan (the path) or per subject-grade (the test title at `2087`)?
- Is `'Predict Phase'` (`2377`) in the controlled vocabulary? The fixture assumes it is.
- What happens in lines 2401+ and the setup outside this range?
