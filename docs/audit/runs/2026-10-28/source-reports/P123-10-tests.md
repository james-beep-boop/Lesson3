# P123-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read (as supplied):** `app/tests/http/endpoints.http.spec.ts:401-800`.
- **Partial range:** The range starts mid-test (lines 401-402 are assertions from an `it` opened before 401). The duplicate test at 792 continues past 800, so its later assertions are not assessed.
- **Not assessed:** the helpers `fx`, `url`, `auth`, `setAdvancedTools`, `makeColdVersion`, `prepareExport`, `exportZip`, `enqueuedKindsFor`, `minimalBundleContent`, `MARK`, and `HttpVersion`; any `beforeEach`/`afterAll`; lines 1-400 and 801 onward; the server handlers, generator, Gotenberg/LibreOffice output, and autoRun cron behaviour. No tool calls or test runs were made.
- **Coverage status:** partial.

## Purpose and invariants asserted

The file contains HTTP contract tests for:
- unsaved-edit HTML preview: 401, 404 for teachers, 200 for editing access, 422 for structural change, plus CSP and viewport headers;
- PDF preview: 400, 404, 422, 200, and a check that the unsaved edit reaches the output;
- export prepare/status: 401, kind-scoped jobId binding, and dedupe;
- JSON export read gate;
- per-document export: 409 when cold, inline PDF vs attachment DOCX, 404 for an absent deliverable;
- make-official pre-warming both kinds;
- REST create and duplicate denial.

## Candidates

**Confirmed product defect:** none. The assertions in this range are internally consistent with their comments. Any real product mismatch would need the unseen handlers.

**Leads (uncertain, not run):**

1. **Low, test soundness, `:518-532`.** The comment says the check proves LibreOffice wrote a real URI annotation. The assertion is `toContain(link)` on raw bytes, and the overlay text itself contains the URL. It can pass from visible text alone and can fail if the annotation sits in a compressed object stream. *Repro:* parse the PDF for an uncompressed `/Annots` entry with `/URI`, and run the assertion against a PDF where the hyperlink is stripped but the URL remains as text.

2. **Low, flake risk, `:620-640`.** `a.state === 'preparing'` depends on the job not being picked up between two sequential requests (the comment cites a 3s autoRun). *Repro:* reduce the cron interval or slow the worker tick, then check whether the second call sees a different state.

3. **Low, test isolation, `:657-658`.** `setAdvancedTools(fx.payload, false)` is never restored in this range. Later tests that assume Advanced tools become order-dependent unless a `beforeEach` resets it, which is unverified. *Repro:* run this test before one that assumes Advanced tools.

4. **Low, cleanup not in `finally`, `:580-595, 597-618, 620-640, 691-702, 742-762`.** A failed assertion skips the delete. At 742-762, a failure at 748 or 749 leaves the cold version Official and the fixture demoted. *Repro:* force 749 to fail and inspect the fixture's official pointer in the next test.

5. **Coverage overclaim, `:484-491`.** The title says "missing/invalid ?doc → 400", but only the missing case is sent. No invalid `?doc` value is tested.

6. **Open question, possible product issue, `:580-589` and `:597-618`.** The comment at 580-583 says a warm version returns `{ready}` for any jobId "by design". The kind-binding invariant at 598-599 says a mismatched `as` must 404 rather than echo the other kind's state. That invariant is tested only on cold versions. *Repro:* warm the DOCX kind, leave PDF cold, then poll the DOCX jobId with `as=pdf`. The range does not assert the result.

**Not reported:** the 404 (rather than 403) for teachers on edit-gated preview (`:430`, `:499`) matches the "EDIT-gated" comments. Whether 404 is the intended policy is not verified.

## Unresolved questions

- Is 404 rather than 403 the intended response for insufficient edit capability?
- For lead 6, is a mismatched jobId on a warm kind meant to 404?
- Does a `beforeEach` reset `setAdvancedTools` state?

Security and authorization claims remain unreviewed. The 401/404 read-gate assertions here check only the cases shown, and nothing in this range verifies the handlers behind them.
