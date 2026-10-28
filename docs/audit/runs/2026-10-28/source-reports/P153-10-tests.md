# P153-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

Both ranges were read from the supplied text. I did not reopen them from disk, and nothing was executed.

- `app/tests/int/publicPublication.int.spec.ts:1-358`: whole range.
- `app/tests/int/rateLimit.int.spec.ts:1-103`: whole range.
- Policy excerpts: read. None specifies publication, slug, or rate-limit behaviour, so no expectation below comes from policy.
- Not assessed: `src/lib/publicPlan.ts`, `src/hooks/lessonPlan.ts`, `src/lib/rateLimit.ts`, `tests/helpers/*`, `docs/DESIGN-public-library.md`, `CLAUDE.md`, `tests/int/access.int.spec.ts`. Any statement about what these do is unverified.

## Purpose and invariants (as the tests state them)

- **Publication:** opt-in by default; slug frozen while published; the resolver serves only the current Official version; four gates run in order (feature flag, plan exists, deliberately public, Official pointer). Publishing is Site-Admin-only, per the docblock at lines 189–191. That rule is not in the policy excerpts.
- **Rate limiter:** per-user and shared-key budgets, 429 with `Retry-After`, 401 for unauthenticated callers.

## Candidates

No confirmed product defect in the supplied ranges. The items below are test-integrity or documentation mismatches, reasoned from the text alone.

1. **Low, test integrity.** `publicPublication.int.spec.ts:228` uses `attemptPublish(...).catch(() => undefined)` for all three roles. Expected: the test separates denial by access from other failures, as the comment at lines 207–217 describes. Actual: any rejection passes as long as the plan reads back `private`, including a validation error or a broken fixture. Precondition: the write fails for a non-access reason. Reproduction: add a field that fails validation to the teacher-case payload and confirm the test still passes. Then assert that the refusal is access-based.

2. **Low, documentation overclaim.** `rateLimit.int.spec.ts:1-4` says the suite proves enforcement "across processes" and fixes the old in-memory behaviour. Every case runs sequentially in one process, and there is no concurrent, multi-process, or window-expiry case. Expected: the header describes what is tested. Actual: a non-atomic counter that over-admits under concurrency would pass this file. Reproduction: for a fresh user, run `Promise.all` over `EXPORT_MAX + 5` calls to `enforceUserRateLimit`, then expect exactly `EXPORT_MAX` `null` results and 429 for the rest. Whether the store is atomic is unverified because `src/lib/rateLimit.ts` was not read.

3. **Lead, severity unknown, user-visible.** The comment at `publicPublication.int.spec.ts:209–216` says Payload resolves a Subject Admin's publish write while silently stripping `visibility`, so the caller sees success and nothing changes. This is unverified here. No supplied policy says whether a denied field should return a visible error. It becomes a defect only if a UI exposes publishing to Subject Admins, or if policy requires a visible refusal.

4. **Low, maintainability lead.** `rateLimit.int.spec.ts:21` and `:63` re-derive budgets with `Number(env) || 20` at module load. If the limiter parses or defaults differently (for example, `RATE_LIMIT_EXPORT_MAX=0` gives 20 here), the test asserts a budget the code does not enforce. Most such mismatches would fail rather than pass. This cannot be settled without `src/lib/rateLimit.ts`.

5. **Lead, fixture coupling.** `publicPublication.int.spec.ts:108` asserts `toContain('grade')`, which depends on a subject-grade fixture name that was not supplied. No policy excerpt specifies slug format. Similarly, the cleanup at `rateLimit.int.spec.ts:35–37` depends on the `rate_limit_counters.bucket_key` schema and the `${bucket}:${key}` format, neither of which was supplied. If the format differs, cleanup removes nothing.

## Unresolved questions

- Is the denial shape for unauthorized publish (silent resolve vs. thrown error) specified anywhere? This decides whether candidate 3 is a defect.
- Does `resolvePublicPlanBySlug` check the feature flag before any row read? The tests assert outcomes only.
- Does the shared limiter increment atomically? This decides whether candidate 2's reproduction exposes a product defect.
- What is the key format in the rate-limit store, and what is the `rate_limit_counters` schema?
- The `CLAUDE.md` rule and the `access.int.spec.ts` docblock cited at lines 6–10 and 186–187 were not read.

Security and integrity claims here are unreviewed until independent review.
