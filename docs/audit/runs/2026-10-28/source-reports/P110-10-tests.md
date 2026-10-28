# P110-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope read:** `app/tests/e2e/manage.e2e.spec.ts:401-800`, as supplied in the message. I made no tool calls, so I did not verify the baseline commit `6e75a173…` or any file on disk. The policy excerpts were read as the expected-behavior reference only. Not assessed: the helpers the range calls (`saveAs`, `keepDraft`, `createUserVerified`, `createVersionFixture`, `loginScoped`, `panelRegion`, `openPanel`, `openDeletePanel`, `deleteUserFixture`), the `RedirectToManage` and Manage UI sources, the `SEP`/`BASE`/`POINTERLESS_TITLE`/`MARK` constants, and all callers. I have no runtime evidence for any behavior below.

**Purpose and invariants (as read):** This block covers the Site Administrator and scoped-administrator Manage view. It checks:
- Per-row actions for the three versions a scoped user owns: edit intent, Official not deletable, and access-lost rows read-only.
- Draft isolation between users.
- Delete refreshing counts and drafts (`:522-547`).
- Accordion URL and deep-link state (`:549-582`).
- Redirects from retired routes (`:585-609`).
- Layout invariants for panel boxes and spacing (`:672-749`).
- Officials excluded from the delete list (`:762-773`) and display lookups (`:779-799`).

**Confirmed product defects:** None found from this range.

**Checked and ruled out:** `:637` asserts `toBeHidden()` on a `getByRole` locator that excludes hidden subtrees, which resembles the vacuity the file warns about at `:621-626`. The absent-element direction is caught by the `toBeVisible()` at `:639`, which runs after the same panel opens. The hidden-to-visible direction fails `:637` directly. So this is not a defect.

**Leads (uncertain, low to medium):**

1. **Access-lost fixture may not reflect a real access path.** `app/tests/e2e/manage.e2e.spec.ts:406-414` creates the scoped user with assignments only for `sgB` (subjectAdmin) and `sgA` (editor). Yet `:435` calls `saveAs(scoped.id, planC, sgC, '3.0.0')`, and row C at `:505-511` is described as "access lost." Either `saveAs` bypasses access, or a grant-then-revoke step exists outside this range. If it bypasses access, row C tests a state no real save path produced.
   - Test to settle it: assert that `saveAs` as the scoped user onto `sgC` is refused by the access rules, and that the fixture's revocation path (if any) is what removes the row's edit intent.

2. **Canonical-URL encoding is inconsistent.** `:580` expects the literal `open=plans%2Cplans\.mine`, while `:602` builds its regex from `SEP`. If the page writes commas unencoded, `:580` fails. If it writes `%2C`, `SEP` should be unified with it.
   - Test to settle it: load `?open=plans,plans.mine` and record the final address-bar string.

3. **Back/Forward assertions depend on history behavior not visible here.** `:566-570` assume that the page's open-set mirroring replaces history entries rather than pushing them. If it pushes, `goBack()` at `:566` lands on an intermediate state.
   - Test to settle it: after each step, record `history.length` and the URL to see whether mirroring pushes entries.

4. **Title is broader than the assertion.** The test at `:611` is titled "lists plans missing an Official version," but `:670` only asserts that `POINTERLESS_TITLE` is visible. It does not check that plans with an Official are excluded. This is a coverage gap, not a product defect.

5. **Subject Administrator panel expectation.** `:469-474` expects a `Users` box for the scoped user, a Subject Administrator. Policy §8 gives that role "grant and revoke editing access within that subject-grade," which suggests a Users panel, but the excerpt does not state it. I did not treat this as a mismatch.

**Unresolved questions:**
- Does `saveAs` go through Payload access or bypass it? (Lead 1 depends on this.)
- Does a revocation step exist outside `:401-414`?
- Do Subject Administrators see the Users box, per the Manage design?
- Does the mirroring code replace or push history entries? (Lead 3.)

No tests were run. This is a partial assessment: the supplied range was read in full, but helper and caller behavior was not checked, so no coverage claim is made beyond that range.
