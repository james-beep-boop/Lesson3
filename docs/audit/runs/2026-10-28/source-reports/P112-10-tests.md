# P112-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read in full:** `app/tests/e2e/manage.e2e.spec.ts:1201-1600`. The range ends mid-comment at 1600, so the D6a pool assertion that begins there is only partly visible.
- **Policy excerpts:** read as reference for expected behavior. They are not source.
- **Not assessed:** every other path or range. Helper definitions used by the range were not supplied and were not checked: `loginAs`, `openPanel`, `panelRegion`, `accessGroups`, `openUser`, `acceptConfirmation`, `fx` fixtures, `BASE`, `SEP`, `MARK`, and the `MANAGE_*`/`UNVERIFIED_*`/`DELETE_*` constants. I have not checked any server endpoint, hook, or runtime behavior. The range was read only, with no runtime checks.

## Purpose and invariants (as asserted by the range)

The range is Playwright e2e coverage for the Manage admin UI:

1. **Delete-versions search (1202-1225):** filtering narrows rows, and a no-match query shows "No saved versions match", not the instructional empty state.
2. **Compact identity layout (1229-1337):** names and emails render identically in the Accounts and Roles & Access rows across widths, with no horizontal overflow. The fixture is restored in `finally`.
3. **Lazy loading and disclosure state (1339-1419):** `/api/users/search` is not called until the Accounts panel opens. Drafts survive row collapse. Mobile actions are at least 44px tall. The row shows "Teacher" and "Editing access · …", never "Editor ·".
4. **Account actions (1421-1498):** the profile save, reset-link reveal, grant and revoke Site Administrator, disable and enable sign-in, approve unverified accounts, and delete account each show the expected confirmation copy and resulting state.
5. **Grant jump history (1500-1530):** the jump adds exactly one history entry and is reversible.
6. **D6a (1548-1600):** a Subject Administrator sees the hand-over control and not the remove or appoint controls.

## Candidates

**None.** I found no concrete product correctness, integrity, security, or user-visible mismatch supported by the supplied range and policy.

## Leads (uncertain, not reported as defects)

- **Line 1311 length claim (test assumption, low):** the comment says `longEmail` is inside user search's 120-character limit. Its length is about 94 plus the fixture id length. That holds only if the id is 26 characters or fewer. The id format is not in the range. Repro: run the test with a fixture id of 27 or more characters and check whether the search still returns the row.
- **Fixed waits as negative checks (1356, 1364; test quality):** 300 ms pauses are used to prove that no fetch happened. That can miss a late request. This is a flakiness and test-design issue, not a product defect.
- **Label wording (1480):** the test expects summary meta "Awaiting approval" and an "Approve" action. The policy names "waiting for approval" for sign-in and "Approve" for Manage, but does not specify the Manage meta label. Without a policy line naming it, I cannot call this a mismatch.

## Unresolved questions

1. Lines 1593-1600 are cut off. Does the Subject Administrator hand-over pool match the policy rule (existing editing-access holders of that subject-grade)? The rest of the assertion is needed to check this.
2. The delete prompt copy at 1492-1496 ("authored 0 versions…", "Messages, favorites and edit-recovery rows are deleted") is asserted but not compared with the implementation. The policy's deletion consequences are not fully stated in the excerpt.
3. Do the helpers in the Helper list above match the behavior the assertions assume? Not checked.

Security and integrity claims remain unreviewed until independent review.
