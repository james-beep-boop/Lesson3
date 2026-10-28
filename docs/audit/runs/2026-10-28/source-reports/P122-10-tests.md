# P122-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read (as supplied in this session, not re-opened):** `app/tests/http/endpoints.http.spec.ts:1-400`. Line 400 ends mid-test, so the "Teacher GET → 200 script-free HTML" test is **partially assessed**. Its assertions after line 400 are not assessed.
- **Not assessed:** imported helpers and modules (`../helpers/fixtures.js`, `../helpers/db.js`, `../../src/lib/rateLimit.js`, `../../src/ingest/resourceLinks.js`, `../../src/lib/stripIds.js`), the fixture file `../fixtures/pdf-library/public-wire.pdf`, the app's endpoints and `next.config.ts`/proxy, and everything after line 400. I did not run the suite. Security and integrity claims here are unreviewed until independent review.

## Purpose and invariants (as stated in the file)

- GraphQL routes return 404.
- Resource-library listing requires auth. Public PDF opens only where the publication opt-in is set. Malformed or traversal tokens return 404 and never expose a filesystem path.
- Export is read-gated with no Official or published gate. Cold GET returns 409, POST prepares (202 or 200), and a warm GET returns a zip with the `PK` magic.
- Document CSP uses a per-request nonce that matches every `<script>` tag. API routes carry no proxy CSP. Baseline headers come from `next.config.ts`, and HSTS is absent over plain HTTP.

These match the policy's export model ("Official is not an export permission boundary") and the carve-out for test-stack public fixtures.

## Candidates

**No confirmed product defect** in lines 1-400.

1. **Lead, low, uncertain (test-state, not product):** `exportZip` (142-162) asserts a cold GET returns 409 (150-151). That holds only if the version was never prepared earlier in the run. `fx.version` is shared across the suite (392). Callers beyond line 400 are not assessed.
   - Repro: `prepareExport(fx.version.id,'teacher','docx')`, then `exportZip(fx.version.id,'teacher','docx')`. The cold-GET assertion would then see 200, not 409.
   - Severity: test-integrity only. Confirm once callers are read.

2. **Lead, low (diagnostic):** `pollExportReady` (106-122) does not fail fast on a non-ok status without a `state` field. It polls for the full 150 s and reports `last: undefined`.
   - Severity: none to the product. It only makes failures slower and harder to read.

3. **Test-strength note, not a defect:** the test at 213 is titled "the configured library" but asserts only that `configured` is boolean. A misconfigured stack returning `configured: false` would pass. Line 251 and the test at 225 do assert `true`.

4. **Not a defect:** `ROLES` (49) uses the key `'editor'`. The policy says editing is a capability, not a user type, and this is a fixture key. The stored value is retained, so this is naming only.

## Unresolved questions

- Do later tests call `exportZip` or `prepareExport` on `fx.version.id` before the cold-GET assertion? (Lead 1)
- Does `setupRoleFixture` leave `fx.version` already prepared?
- Several imports (`consumeRateLimit`, `clearRateLimitBuckets`, `RESOURCE_PHASE_KEYS`, `stripIds`, `enqueuedKindsFor`, `setAdvancedTools`, `minimalResourceLinks`, `Where`, `HttpVersion`, `HttpLesson`) do not appear in lines 1-400. They may be used after line 400.
- Does the truncated preview test (399-400 onward) assert script-free output and the READ gate fully?
- Does the fixture `public-wire.pdf` match what the byte-equality assertions (238, 258) expect?
