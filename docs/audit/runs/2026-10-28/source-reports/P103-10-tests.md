# P103-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/e2e/combine.e2e.spec.ts:401-478`; `app/tests/e2e/discussions.e2e.spec.ts:1-371`; `app/tests/e2e/discussionsGuide.e2e.spec.ts:1-51`.
- **Read as policy:** the supplied policy excerpts (versioning, roles, combine, release, and the link/field-split rules).
- **Not assessed:** `combine.e2e.spec.ts:1-400`; helpers (`review`, `version`, `awaitCaptured`, `expandLessons`, `typeProse`, `restorePrompt`, `loginAs`, `setForumEnabled`, `setupRoleFixture`, `clearPostingCaps`, `drizzleOf`); Playwright config; all product server and UI code. No callers or runtime behaviour were checked.
- **Partial assessment:** coverage is limited to the ranges above. I make no claim that the audited suites are correct beyond them.

## Purpose and invariants (as asserted by the tests)

- **Combine (401-478):** a new combination applies even if the form-state request fails; restoring an earlier draft cancels a pending combination with an explanation; admin-only content and resource-link changes cannot share a starting version, and the refusal creates no version.
- **Discussions (1-371):** the unread dot clears only after the thread's mark-read POST; a reply whose response was lost is recovered by key rather than duplicated; an unknown-outcome topic stays locked through a refused retry; while the forum is off there is no page, nav item or entry point.
- **Guide (1-51):** Guide tasks follow the forum switch, and moderation instructions stay available to Site Admins.

## Candidates

No confirmed product defect. The policy excerpts contain nothing on Discussions or on the exact combine refusal wording, so the tests' expected behaviour cannot be checked against policy, and I have not inferred it from the implementation.

**L1 — Test validity, combine.e2e.spec.ts:415-423 (low, unverified).** The abort handler fires only when `req.postData()?.includes('form-state')` is true. If the form-state request carries that marker in a different encoding or location, the abort never runs. The test would then pass without exercising the behaviour its title claims.
- *Expected:* the handler aborts the form-state request in every run.
- *Actual:* not determinable from the range; the match depends on the request encoding.
- *Repro:* log `req.url()` and `req.postData()` for that request in a run; assert that the route callback fired and that the abort succeeded.

**L2 — Test validity, discussions.e2e.spec.ts:258 and :107/:168 (low, unverified).** Route globs `'**/api/discussion-replies'` (no trailing wildcard) and `'**/api/lesson-bundle-versions?**'` may not match the URLs the client actually calls. If they do not match, the "lost answer" test at 242-274 never loses an answer and still passes, because the reply lands normally and the redirect and count assertions hold.
- *Repro:* assert `route` fired at least once in each test (for example a counter in the handler), and assert that the POST was aborted.

**L3 — Hidden dependency, discussions.e2e.spec.ts:266 (low, unverified).** The assertion that reply 51 lands on `?page=2#reply-51` assumes a page size of 50. The page-size constant is outside the supplied range.
- *Repro:* read the discussion page-size constant; if it is not 50, the test is wrong or the constant is unexpected.

**L4 — Cross-file state, discussions.e2e.spec.ts:355-370 and discussionsGuide.e2e.spec.ts:7-14, 39 (low, unverified).** Both files toggle the global forum switch in a shared database. If Playwright runs them in parallel, one file can disable the forum while the other expects it on, producing spurious 404s or missing nav items.
- *Repro:* run both files with more than one worker against one database and watch for flakes at discussions:359-361 and Guide:41.

## Unresolved questions

1. Does Playwright run these files in parallel, and do they share a database? (Needs the config.)
2. What is the discussion page size? (Needs the discussion page code.)
3. Do the route globs in L1/L2 match the real request URLs? (Needs request logs from a run.)
4. What do `awaitCaptured`, `review`, and `restorePrompt` assert? (Needs the helpers.)
