# P128-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope and coverage

**Read (as supplied, no tool calls):**
- `app/tests/http/endpoints.http.spec.ts:2401-2747`
- `app/tests/http/firstUserBootstrap.http.spec.ts:1-162`
- Policy excerpts (§7, §8, Combine, release ancestry, bootstrap)

**Not assessed:** all product source (`app/src/**`, including `rateLimit.ts`, the upload endpoint, `validateGeneratable`, `hooks/fieldSplit.ts`), test helpers (`jsonFile`, `post`, `clearRateLimitBuckets`, `httpWire.ts`, `deleteUserFixture`), the `MARK`/`RESOURCE_PHASE_KEYS` definitions, and the migration. No runtime behaviour was executed or checked.

**Coverage claim:** partial. I read the two ranges in full, but I cannot confirm that the implementation matches the policy or the tests' assumptions.

## Purpose and invariants (as the tests state them)

- Web upload is Site-Admin-only, with 401/403 before any work, and the rate limit applied after authorization.
- Upload is all-or-nothing for pre-flight; per-file rejections are reported; 200 vs 422 depends on whether anything was imported or unchanged.
- Missing taxonomy: a first round returns 409 and writes nothing; an approval list is a write instruction, and approvals the files don't need are refused with 400.
- Near-miss subject names (case-only) are rejected, not created.
- Bootstrap: an empty installation serves one-shot `first-register`; exactly one concurrent caller succeeds as a verified Site Admin; the endpoint closes afterwards.

## Candidates

No confirmed product defect is visible in the supplied ranges. These are test-adequacy findings or leads.

1. **Lead (low): ordering assertion may not discriminate.** `endpoints.http.spec.ts:2422-2440` claims a teacher's request proves the limiter sits after authorization. The test's own comment says the limiter keys per user, so a teacher's request would consume the teacher's budget, not the drained admin's. If the limiter were moved first, the teacher would still get 403 and the test would still pass. The unauthenticated key scheme is in unread `rateLimit.ts`.
   - *Test that would discriminate:* drain a key the unauthenticated request shares, or assert that an anonymous request leaves `upload:<siteAdminId>` unchanged.

2. **Lead (low): weak "refused on its merits" assertion.** `firstUserBootstrap.http.spec.ts:101` asserts only `not.toContain(429)`. A 403 from any other gate passes. The count check at 102-106 doesn't establish the cause either.
   - *Repro:* stub `first-register` to return 403 for every empty-table request; this test still passes. The race test would catch it, so this is localised.
   - *Fix direction:* assert the specific validation status (e.g. 400).

3. **Lead (test-hygiene, not product): cleanup can leak users.** `firstUserBootstrap.http.spec.ts:119-131`: if the status pair is not `[200, 403]`, or the `set-cookie`/token assertions at 126-129 fail, the created admin is never pushed to `userIds`. The next run then fails the `beforeAll` empty-database precondition at 43-44.

4. **Lead (medium adequacy): possibly vacuous counts.** `planCount` (`endpoints.http.spec.ts:2596-2600`) matches titles `${MARK}Upload 91.`. The `jsonFile` helper is unread. If its titles differ, the `toBe(0)` assertions at 2634 and 2660 hold trivially.

5. **Lead (low): near-miss rejection under-asserted.** `endpoints.http.spec.ts:2703-2710` checks only `toContain('only in capitals or spacing')`. Policy says the rejection names the existing subject to correct the file to. The test doesn't check that, and it doesn't cover whitespace-only variants, which the policy also names.

6. **Lead (low): drain count duplicates the default.** `endpoints.http.spec.ts:2434` uses `Number(env) || 50`. If the product default differs, the drain may not reach the budget. The test would then fail for the wrong reason.

7. **Coverage gap: post-fix verification incomplete.** `endpoints.http.spec.ts:2539` iterates the first report's bundles. The two files fixed in the corrected upload (`bad.json`, `invalid.json`) are never checked for semver or Official.

8. **Coverage gaps against stated policy (no test in these ranges):** similar-name prompt (e.g. `Maths`/`Mathematics`); upload size/entry limits; unreadable archives; `/signup` and normal sign-up after bootstrap closes; approval-list binding to the Official preview token.

## Unresolved questions

- How does `rateLimit.ts` key unauthenticated and `overrideAccess` requests? Candidates 1 and the bootstrap budget comment depend on it.
- What titles does `jsonFile` produce? Determines whether candidate 4 is real.
- Does the implementation match the policy's whole-request missing-taxonomy and similar-name rules? Needs the product source, not these ranges.
