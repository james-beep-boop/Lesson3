# P111-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/e2e/manage.e2e.spec.ts:801-1200`, as supplied. No tool calls were made.
- **Not assessed:** lines outside 801-1200 in that file. Also not assessed are the helpers and fixtures the range depends on (`loginAs`, `openDeletePanel`, `sgPick`, `strandPick`, `expectPairedAtBothWidths`, `fx`, `GROUP_*`, `STATE_PLAN`, `DELETABLE_TITLE`, `SEP`, `BASE`, `candidateVersionId`), the seed data, and the Manage page implementation under test. No runtime behavior was verified.

## Purpose and invariants

This range is Playwright e2e code for the `/admin` Manage page. It covers three areas:

- **Version editor shell (801-877):** the back link, hidden Payload chrome, the native Save button hidden, and collapse-on-entry for top-level disclosures across a reload.
- **Delete panel (882-1026):** search flattening that removes group checkboxes, indeterminate parent state, group fan-out, confirmation copy, and destructive deletes.
- **Accordion mechanics (1033-1200):** `aria-expanded` defaults, URL state via `replaceState` (no history entries), deep links, unknown-id scrubbing, keyboard operation, and state surviving close and reopen.

## Candidates

No product-behavior defect is confirmed. The range contains test code only, so I found no product path that is shown to be wrong. The items below are test-integrity findings.

1. **Vacuous `toBeHidden` checks (Low–Medium, test integrity).** `app/tests/e2e/manage.e2e.spec.ts:820-821` and `:823` assert `toBeHidden()` on `.template-default .nav`, `.app-header`, and `.doc-controls .form-submit`. Playwright's `toBeHidden` also passes when the selector matches nothing. The comment at `:804-805` says this smoke test exists to catch an upstream Payload class rename. A rename would therefore make these assertions pass.
   - *Reproduction:* before each `toBeHidden`, add `toHaveCount(1)`, then run against a build with one class renamed. The test should fail at the count check.

2. **Destructive tests on a fixture the file says must not be deleted (Medium if fixtures are not reseeded; unverified).** The comment at `:926-929` says this subject-grade holds the shared fixture, including "the strand-77 pair", and that a real delete would "strip the world" other tests depend on. The test at `:994-1026` then deletes `GROUP_PLAN_A` and `GROUP_PLAN_B`, which are that pair. The test at `:965-992` deletes `DELETABLE_TITLE`.
   - Both tests are non-idempotent. A Playwright retry would fail at `:999-1000` or `:975` because the plans are already gone.
   - Whether this is safe depends on fixture reseeding and ordering, which are outside the range.

3. **Test titles overclaim their assertions (Low).**
   - `:1040-1048` is titled "has their only section expanded", but it asserts only that "Your saved versions" is expanded. It never checks that other sections are collapsed.
   - `:1050-1079` is titled "starts fully collapsed", but it checks four top-level boxes and Upload. It does not check "Roles & Access", "Delete individual versions", or other nested panels.

4. **Selector does not match the claim (Low, uncertain).** `:824-825` says "a prose textarea is editable", but the selector is `page.locator('textarea').first()`. Per the policy excerpts, META fields are Subject-Admin-only, so the first textarea on the page may not be a prose field for a Teacher. This is a lead, not a confirmed defect.

5. **Non-exact role match (Low, uncertain).** `:1145` uses `getByRole('heading', { name: 'Manage' })` without `exact: true`. The earlier comments at `:892-893` show that substring matching has already caused strict-mode failures in this file.

## Unresolved questions

- Are fixtures reseeded per test or per run? This determines whether candidates 2 and 3 cause failures.
- What do `loginAs`, `openDeletePanel`, `sgPick`, and `strandPick` open and click? Does `openDeletePanel` open the exact ancestor chain assumed at `:1196`?
- Does the `SEP` separator and the URL format in `:1151` match the implementation?
- For a Teacher with editing access, is the first `textarea` on the version page a prose field?
- Are the "before the fix" statements in comments at `:857-863` true? They describe history and cannot be checked from this range.
