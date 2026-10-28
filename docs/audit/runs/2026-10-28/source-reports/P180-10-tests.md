# P180-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

No tool calls were made, and no tests were run. Findings come from reading the supplied text only. Callers, the implementations under test (`exportClient`, `generateVersionArtifact`, `exportArtifacts`, `extract.ts`, `FavoriteToggle`), and runtime behaviour were not reviewed.

**Read in full (supplied ranges):**
- `app/tests/unit/exportClient.spec.ts:1-298`
- `app/tests/unit/exportJobDedupe.spec.ts:1-37`
- `app/tests/unit/exportKind.spec.ts:1-20`
- `app/tests/unit/extract.spec.ts:1-197`
- `app/tests/unit/favoriteToggle.spec.tsx:1-35`

Policy excerpts (§7 ingest, §8 roles, release/Official rules) were read as reference only. No product source files were supplied.

## Invariants the tests pin

- **Export client:** a cold export polls to ready; HTTP status failures and network loss surface as visible errors, not timeouts; a blocked popup on either PDF twin raises an error and never resolves silently; the blob is revoked when both opens fail; the placeholder tab is replaced so Back cannot reveal it; DOCX delivery uses an anchor with a `download` attribute and starts no navigation.
- **Export job dedupe:** the pending-job lookup uses exact SQL; only the migration-backed unique conflict is recognised, including when wrapped.
- **Export kind:** only `docx` and `pdf` pass the job-boundary guard.
- **ARES extractor (`.js`):** pure data literals and `+` folding extract; calls, identifiers, member access, templates with expressions, spread, computed keys, getters, methods, regex, BigInt, sparse arrays and `__proto__` are rejected; inert top-level statements and unexported dynamic consts are not evaluated.
- **ARES extractor (`.json`):** non-object roots are rejected; missing required groups are rejected; `__proto__` is rejected at any depth.
- **FavoriteToggle:** the star reconciles to a changed `favoriteId` prop on the same instance.

## Candidates

**No confirmed product defects in the supplied ranges.**

## Leads (uncertain; implementation not supplied)

1. **Null JSON root may escape as a non-IngestError.** `app/tests/unit/extract.spec.ts:179-184` covers `[1, 2]` and `"string"` but not `null`. If the guard is only `typeof root !== 'object'`, `null` passes and a later property access throws a TypeError. Policy §7 says non-object roots are refused.
   - Repro: `expect(() => extractAresJson('null')).toThrow(IngestError)`
   - Severity: low, unverified.

## Unresolved questions

2. **Unary minus is accepted.** `extract.spec.ts:47` and `:61` pin `-2` as data. Policy §7 lists "non-`+` operator" among rejected constructs. The tests treat negative numbers as literals, which is plausible. Unary `-` on a string (`-'x'`) is untested. Policy needs to say which reading is intended.

3. **Mixed `+` semantics are unpinned.** `extract.spec.ts:41-48` and `:101-106` cover string-only folding and reject non-primitive operands. Mixed string/number folding (`'x' + 1`, `1 + 2`) is not pinned. The error text says "string or number literals", so number operands are allowed, but the result (`'x1'` vs `3`) is not stated.

4. **Last `module.exports` silently wins.** `extract.spec.ts:69-80` pins that an earlier export is discarded without any warning. Integrity question: an uploaded file's first export is ignored with no report. Policy is silent, so this needs an owner decision.

5. **Dedupe result is not checked against its input.** `exportJobDedupe.spec.ts:10-24` mocks one SQL row and a job with `taskSlug` but does not assert that the returned job matches `versionId` and `kind`. Correctness depends on SQL outside the supplied range.

6. **The "via fn" never-executes arm is vacuous.** `extract.spec.ts:140-157` declares `function pwn()` but never calls it, so that marker can never be set. The test still catches full evaluation via the other two markers, so this is a test-strength gap, not a product defect.

7. **Unseen dependencies.** Whether `validateGeneratable` or the export pipeline rejects non-object group values (for example `"META": null`) cannot be determined from these ranges.
