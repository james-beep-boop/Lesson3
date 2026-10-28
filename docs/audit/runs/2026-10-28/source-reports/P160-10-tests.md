# P160-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

I read the six supplied ranges as text in this prompt. I made no tool calls and opened no other files.

- `app/tests/style-snapshot/menu-states.spec.ts:1-113`: read
- `app/tests/style-snapshot/pages.spec.ts:1-101`: read
- `app/tests/unit/accessScopes.spec.ts:1-210`: read
- `app/tests/unit/accordionPanelCount.spec.tsx:1-48`: read
- `app/tests/unit/accountDisabledContract.spec.ts:1-130`: read
- `app/tests/unit/accountDisabledWiring.spec.ts:1-41`: read

Not assessed: the implementations these tests exercise (`src/lib/accessScopes`, `src/errors/AccountDisabled`, `src/collections/Users`, `hooks/userRoles.ts`), the reset endpoint, `AppNav`, `./kit`, `../helpers/*`, and the installed Payload package. Where a comment or test claims behaviour in those files, I have not checked it.

## Purpose and invariants (summary)

- **Style snapshots:** dump computed styles for menu states and pages. They record values and assert nothing.
- **accessScopes:** resolves a user's subject-grade grants into a type label and scope lines. Editing access is shown as a capability, not a user type. Stale grants are dropped.
- **accordionPanelCount:** shows a count in the accessible name when non-zero, and nothing for zero.
- **accountDisabled\*:** the `ACCOUNT_DISABLED` 403 code must survive `formatErrors` and the production wire, and must not be attached to unrelated 403s.

## Candidates

**1. Low, confirmed local reasoning (audit-evidence integrity).** `app/tests/style-snapshot/menu-states.spec.ts:103-107`
- Precondition: the dropdown stays mounted after Escape.
- `closedAfterEscape` is `locator.count() === 0`. The wait before it swallows its failure (`.catch(() => {})`, line 106). So the flag measures DOM presence, not closure.
- Expected: the flag reflects whether the menu is closed. Actual: a mounted but hidden menu records `false`. `read` also returns `null` for missing elements (line 49), and nothing asserts on either.
- Whether the app unmounts or hides the menu is unchecked.
- Repro: after Escape, `await expect(page.locator('.user-menu__dropdown')).toBeHidden()` with no catch.

**2. Low, lead (test-intent mismatch; reachability unconfirmed).** `app/tests/unit/accessScopes.spec.ts:108-123`
- The title says "enforced disjointness", but the fixture is a same-subject-grade admin+editor pair, which the title says should not exist.
- The comment's reachability claim (a subjectAdmin row rewritten to editor beside an existing editor row) would produce two editor rows, not this fixture.
- So this test asserts only the resolver's display for an overlapping state. It does not test that the write path prevents overlap.
- Repro: a DB-backed test that runs the demote path and asserts no same-subject-grade admin+editor pair remains. Requires reading `hooks/userRoles.ts`.

**3. Unresolved security question.** `app/tests/unit/accountDisabledContract.spec.ts:1-8, 91-98` and `accountDisabledWiring.spec.ts:35-40`
- The reset path returns a disabled-account 403 carrying `ACCOUNT_DISABLED_CODE`. An invalid token returns a 403 with no code.
- If the disabled check runs before, or independently of, token validation, an unauthenticated caller could learn account status. Not confirmed; the reset implementation was not supplied.
- Repro: submit a reset with an invalid token for a disabled account and check whether the response carries the code.

## Unresolved questions

- `accessScopes.spec.ts:157-164` says "callers own the fallback — see AppNav". I did not read `AppNav`, so I cannot say whether a caller handles the rejection.
- `accessScopes.spec.ts:169-177` hides a site admin's assignment rows. Policy says a site admin is global, which this does not contradict, but the tests do not show whether a subject-grade administrator whose grant points at a deleted subject-grade keeps the type label "Subject-grade administrator" with no scope line. The source of `typeLabel` is not visible in this range.
- The `formatErrors` behaviour described at `accountDisabledContract.spec.ts:110-115` is taken from comments, not verified.

## Not candidates

- The snapshot specs have no assertions (`menu-states.spec.ts:56-113`, `pages.spec.ts:49-101`). This is test design, not a product defect.
- `pages.spec.ts:52` and `:82` never close their pages. Test hygiene only.
- `process.env.STYLE_OUT!` (`menu-states.spec.ts:112`, `pages.spec.ts:100`) assumes the variable is set. Test hygiene only.
- `accordionPanelCount.spec.tsx`, `accountDisabledWiring.spec.ts`, and the remaining `accountDisabledContract` cases match their titles. I found no mismatch within the supplied ranges.

Security and integrity claims here remain unreviewed until independent review.
