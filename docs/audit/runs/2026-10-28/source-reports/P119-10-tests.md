# P119-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: `app/tests/http/combinePreview.http.spec.ts`

**Result:** No confirmed product defects. The findings below are uncertain leads about what the test asserts, not defects in the endpoint.

### Coverage

- **Read (as supplied in the prompt, not via tool):** `app/tests/http/combinePreview.http.spec.ts:1-378`, the full range.
- **Not read, so nothing here is checked against them:** `app/tests/helpers/fixtures.js` (`minimalBundleContent`, `setupRoleFixture`, `MARK`), the `combine-preview` endpoint, the combine engine, `tests/unit/combineEngine.spec.ts`, and access hooks.
- **Not run:** no tests were executed. All statements below are local reasoning from the file text.

### Purpose and asserted invariants

- **Gate (`:112-152`):** 401 when unauthenticated; 400 for missing, malformed, out-of-range, or identical `with`; 404 for a missing version; 400 for cross-plan pairs; 403 for a Teacher, with no `plan` in the body.
- **Happy paths (`:154-364`):** three-way merge with `start` side and overlay keyed by lesson row ids; parent resolved via `sourceVersion`; admin-versus-resource refusal text; same-field edits become conflicts carrying base/a/b; structure refusal; two-way merge with no ancestor; tolerance of regenerated resource-link row ids; a budget-exhaustion case.
- **Standalone (`:366-378`):** `alreadyIncluded` is `'b'` for ancestor-versus-descendant.

### Candidates

1. **Low, lead — 403 body not checked for leaks (`:146-151`).** The test asserts only `not.toHaveProperty('plan')`. It does not assert that `a`, `b`, `base`, or the overview/reflection text is absent. If the endpoint returns version content on refusal, this test would still pass.
   - *Repro:* as `teacher`, call preview on `siblingA`/`siblingB`; assert the body contains none of `'Overview edited by A.'`, `'Reflection edited by B.'`, or keys `a`, `b`, `base`.
   - *Unverified:* whether the endpoint leaks. Security claims remain unreviewed until independent review.

2. **Low, lead — budget test may pin unexplained classification (`:335-363`).** Each of the three lessons has `overview` and `teacherReflection` edited on both sides (`:337-350`), giving six both-edited fields. The test expects 2 `changes` and 4 `conflicts`, with `ok: true` (`:360-362`). The excerpt does not state how fields split under budget exhaustion or whether `ok: true` is valid alongside conflicts. H2 (`:228-243`) says same-field differing edits are conflicts, which would make the two "changes" questionable. The spec does not settle this, so I cannot call it a defect.
   - *Repro:* assert that every both-edited field appears in `conflicts`, or document the merge granularity that justifies the split.

3. **Low, lead — `alreadyIncluded` label (`:366-378`).** The title says "identifies an already included ancestor", but the ancestor is the first argument (`a`) and the assertion expects `'b'`, the descendant. Either the title or the expected value could be wrong, depending on the endpoint's contract, which is not in the excerpt.

4. **Informational — H4 assertion is weaker than its title (`:254-267`).** The title says "every difference is a choice". The test checks only `conflicts.map(reason) === ['no-ancestor']` and never checks that `a`'s overview edit is surfaced.

5. **Informational — hard-coded fixture text (`:237`).** `'A minimal generatable lesson.'` comes from the unread fixture. A fixture change would fail this test without any product change.

### Unresolved questions

- Does `plan.ok` mean "structurally mergeable" regardless of conflicts, or does it mean "clean"? This decides whether candidate 2 is a defect.
- What is the merge granularity (field, paragraph, or line)? Non-overlapping paragraph edits in `:340-342` might be expected to merge cleanly.
- What does `alreadyIncluded` denote, and is it intended to name the descendant?
- Does the endpoint return content on 403, or on the cross-plan 400?
- The header (`:6`) says gate order is pinned, but no test checks precedence, such as unauthenticated with a missing `with`. This is a coverage gap, not a defect.
