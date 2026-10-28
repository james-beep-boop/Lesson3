# P113-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/e2e/manage.e2e.spec.ts:1601-1995`, `app/tests/e2e/messages.e2e.spec.ts:1-139`, `app/tests/e2e/offlineSignup.e2e.spec.ts:1-101`. The policy excerpts were read as context only.
- **Not assessed:** `manage.e2e.spec.ts:1-1600`, all application source, the `helpers/` modules these specs import (`loginAs`, `setupRoleFixture`, `deleteUserFixture`, `clearLoginTargetBudget`), and `hooks/fieldSplit.ts`. Nothing here checks what the app does at runtime. Each finding below is a local reading of the test code.
- **Partial assessment.** Token limits did not force this, but the scope is limited to the ranges above.

## Summary of the ranges

- **manage 1601-1995:** Subject-Admin handover picker visibility, Site-Admin access controls, the System panel (deployment facts and backup statements, with status colours and the Subject-Admin scrub), taxonomy grid guards (cascade warning, refusal text, grade-column picker), and the display-name round trip from the avatar menu.
- **messages 1-139:** compose and reply, whole-lesson versus version-specific links, retained "no longer available" labels after version deletion, and the explicit-missing-version explanation.
- **offlineSignup 1-101:** a no-SMTP sign-up that waits for Site-Admin approval. It checks the sign-up wording, the "waiting for approval" refusal (no "email" wording), the filtered queue, approval, and then sign-in. The whole spec is skipped when `SMTP_HOST` is set.

These assertions match the policy excerpts where the policy speaks: approval wording, the `awaiting` filter, the Approve action, and "Not yet tested" for Full recovery. I found no direct contradiction.

## Candidates

**C1 — Low (test assertion defect; confirmed by local reading)**
- **Path:** `app/tests/e2e/manage.e2e.spec.ts:1884`
- **Precondition:** The Biology grade column for Grade 12 is absent, so the "+ Grade" picker should offer it.
- **Expected:** Per the test's own comment at line 1874 ("Grade 1–12 columns not already shown"), every offered option matches the 1–12 range.
- **Actual:** The regex `^Grade ([1-9]|1[01])$` rejects "Grade 12", so the assertion fails in that state. It passes today only because the fixture always has a Grade 12 column (line 1875).
- **Reproduction:** Seed the fixture without a Biology Grade 12 column, open `?open=curriculum`, and run the assertion at lines 1882-1884. Expect "Grade 12" to be offered. The regex should be `1[0-2]`.
- **Scope note:** The expected range comes from this test's comment, not from the policy excerpts, which do not state a grade range.

**C2 — Low (test hygiene; lead, impact uncertain)**
- **Path:** `app/tests/e2e/manage.e2e.spec.ts:1964-1993`
- **Observation:** The display name is changed to `${MARK}renamed` and restored at 1984-1993 with no `try/finally`. If the assertion at 1981 or the save at 1989 fails, the seeded Teacher keeps the renamed value. Line 1983 says the rest of the file identifies fixtures by name, so later tests in the same run may be affected.
- **Reproduction:** Force the `toHaveValue(newName)` check at 1981 to fail, then query the fixture user's `name` after the run.
- **Unresolved:** Whether any other test or run reads this user's display name, and whether `setupRoleFixture` recreates users on each run.

## Unresolved questions

1. **manage 1603-1605:** The positive and negative email assertions assume the handover `<option>` text includes emails. If the labels show display names, the negative `not.toContain(teacher.email)` would pass vacuously. The positive assertion at 1604 should fail first in that case, but this is worth confirming against the picker's rendering.
2. **manage 1729-1731:** `fullRecovery` is pinned to `'Not yet tested'`, which is Phase-B-dependent. The comment at 1703 describes the test as pinning what is true on every host. Confirm that this assertion is meant to be updated when Phase B ships.
3. **manage 1755:** `not.toHaveURL(/system/)` matches any URL containing "system". It is probably fine given the fixture's URL shape, but the regex is broader than the id it is meant to catch.

No product defect is established from these ranges. The app code that these specs drive was not supplied, so the actual behaviour remains unverified.
