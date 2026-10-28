# P048-07-generator — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: generator adapter, cache, attribution, and PDF seam

**Scope:** Local reading of the supplied text only. No tool calls, no runtime checks, and no callers, `lib/env`, `toAresResourceLinks`, `exportArtifacts`, or renderer code were examined.

### Coverage

- `app/src/generator/adapter.ts:1-110`: read in full.
- `app/src/generator/artifactCache.ts:1-230`: read in full.
- `app/src/generator/cacheCodecs.ts:1-18`: read in full.
- `app/src/generator/config/attribution.yaml:1-69`: read in full.
- `app/src/generator/deliverables.ts:1-26`: read in full.
- `app/src/generator/docxToPdf.ts:1-80`: read in full.
- Policy excerpts: read for context only. They were not assessed as code.

This is a complete local reading of the supplied ranges, not a coverage claim for their callers or runtime behavior.

### Purpose and invariants (summary)

- **adapter.ts:** Maps the stored camelCase bundle to the generator's UPPERCASE data object. It strips row `id`s, converts `null` to `''`, and omits optional deliverable groups. `versionDeliverables` must agree exactly with `bundleToAresData` about which deliverables exist.
- **artifactCache.ts:** Content-addressed cache with atomic temp-then-rename writes, oldest-first eviction over `.bin` files, and once-per-operation warnings for cache faults.
- **cacheCodecs.ts:** Validates decoded JSON against a runtime shape guard.
- **attribution.yaml:** Single source for attribution and licence text.
- **deliverables.ts:** Shared primary/secondary deliverable split and labels.
- **docxToPdf.ts:** Single seam to the Gotenberg conversion sidecar, with a timeout.

### Candidates

**1. Body-read timeout escapes the `PdfConversionError` wrapper.** Confidence: confirmed by local reasoning. Severity: low to medium, depending on callers (not checked).
- Evidence: `docxToPdf.ts:60-70` wraps only the `fetch` call in a try/catch that converts failures to `PdfConversionError`. The `AbortSignal.timeout` remains active during body consumption, but `await res.arrayBuffer()` at `docxToPdf.ts:79` sits outside that try block.
- Expected: a timeout during the response body yields `PdfConversionError`, as the message at lines 67-69 ("unreachable or timed out") implies.
- Actual: the raw `DOMException` (`TimeoutError`/`AbortError`) propagates unwrapped. Any caller that checks `instanceof PdfConversionError` would misclassify it.
- Repro: stub `fetch` to resolve with `{ ok: true, arrayBuffer: () => Promise.reject(new DOMException('t', 'TimeoutError')) }`, set `GOTENBERG_TIMEOUT_MS` low, and assert `docxToPdf` rejects with `PdfConversionError`. Also test a real stalled body.

**2. Copyright year source is contradictory within `attribution.yaml`.** Confidence: uncertain lead. Severity: low now, rising in 2027.
- Evidence: `attribution.yaml:5-6` says `{YEAR}` is replaced "with the current calendar year … at render time". Line 8 says `year: 2026` is a "fixed configured copyright year".
- Expected: per the header's stated decision, footers reflect the generation year.
- Actual: the file hard-codes 2026. Whether the renderer reads `year` or the clock cannot be determined from this range.
- Repro: freeze the clock to 2027-01-01, render a lesson footer, and check whether it prints "© 2027" or "© 2026".

**3. `clean` drops `id` at every depth, not only on array rows.** Confidence: uncertain lead. Severity: low.
- Evidence: the header at `adapter.ts:11` and `:46-47` describes stripping row `id`s. `clean` at `adapter.ts:56` skips any object key named `id` at any nesting level.
- Precondition: some non-row object in the ARES contract carries a real data field named `id`. None was visible in the supplied ranges.

**4. `null` → `''` also applies to non-string fields.** Confidence: uncertain lead. Severity: low.
- Evidence: `adapter.ts:50-52` does not distinguish field types. If a numeric field such as `duration` is stored as `null`, it becomes `''`.
- Precondition: the field's schema type is numeric and Payload returns `null`. Schema types were not supplied.

**5. Parity gap between `versionDeliverables` and `bundleToAresData` for malformed array fields.** Confidence: confirmed locally, but low practical likelihood.
- Evidence: `adapter.ts:78` tests `hasContent(clean(group))` before array normalization. `adapter.ts:97-98` and `:101` coerce non-array values to `[]`. A non-array string in `sections`, `rubric`, or `lessons` would count as content for `versionDeliverables` but would be discarded by `bundleToAresData`.
- Precondition: Payload returns a non-array for an array field. This is unlikely, and it is not verified.

### Not candidates

- `artifactCache.ts`: atomic write, eviction counting, and warn-once behavior are internally consistent. `getArtifact` does not verify content hashes; this is noted as an integrity observation, not a defect, because writes are atomic and cache files are local.
- `cacheCodecs.ts`: no defect found.
- `deliverables.ts`: no defect found.

### Unresolved questions

- Do callers of `docxToPdf` branch on `PdfConversionError`? This determines the severity of candidate 1.
- Which source governs the copyright year, `attribution.yaml:6` or `:8`, and does the renderer read `year` or the clock?
- Do any ARES objects contain a real `id` key, or any numeric fields that can be `null`?
- Do cache scope strings ever contain `::`, which would collide under `artifactKey`?
- Should `docxToPdf` validate that the response bytes begin with `%PDF`? A 200 response with non-PDF content would currently be returned as a PDF.

No security or integrity claim in this report has had independent review.
