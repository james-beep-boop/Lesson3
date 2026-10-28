# P001-01-ingest

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

- Read in full, from the supplied text (no tool calls, so the baseline commit and the file contents were not re-verified):
  - `app/src/ingest/ares-contract.schema.json:1-244`
  - `app/src/ingest/contract.ts:1-149`
  - `app/src/ingest/errors.ts:1-15`
- Policy excerpts were used as context only, not as source.
- Not assessed: `ingestItems` (ingest/index.ts), `rawToBundle`, `extract.ts`, `extractAresJson`, the upload endpoint, and any callers. Nothing below claims behavior of those.
- Tests were not run. Reproductions are sketches.

## Purpose and invariants (as read)

- The schema is the contract for raw ARES data (`META`, `UNIT`, `LESSONS`, `FINAL_EXPLANATION`, `SUMMARY_TABLE`). Unknown keys are rejected, and the phase enum is closed.
- `contractDrift` is a hand-rolled walker. It supports only `$ref` (local), `type`, `required`, `properties`, `additionalProperties:false`, `items`, `minItems`, `minimum`, `enum`, and `pattern`. I checked the schema and found no other keywords, so none are silently ignored.
- Prototype keys are guarded by `Object.hasOwn` (contract.ts:132). Aliases and the `safetyNotes` corruption get hints.
- `errors.ts` defines `IngestError` with optional location detail.

## Candidates

**1. Lead, low to medium, uncertain: empty `META.subject` and unbounded `META.grade` pass the gate.**
- Location: `ares-contract.schema.json:21-22`; `contract.ts:145-149`.
- Precondition: a file with `META.subject` of `""` or `"   "`, and `META.grade` of `0` or `-3`.
- Confirmed locally: `contractDrift` returns `[]`. The schema has no `minLength` and no `minimum` on `grade`, and `walk` only checks the keywords listed above.
- Expected: not stated in the supplied policy. The policy says the created Subject name is "META.subject (trimmed)", which implies a blank name is a problem, but it does not say the contract must reject it. Downstream rejection may exist; `ingestItems` is unseen.
- Focused test sketch: `expect(contractDrift(bundleWith({ META: { ...meta, subject: '  ', grade: 0 } }))).not.toEqual([])`. This fails today. Whether it should pass is the open question.

**2. Lead, low, uncertain: lesson numbering is not checked for uniqueness, order, or agreement with the summary table.**
- Location: `ares-contract.schema.json:68` (`LESSONS[].number`, minimum 1 only) and `:183` (`SUMMARY_TABLE.lessons[].number`).
- Precondition: `LESSONS` numbers `[1, 1]`, or `[2, 1]`, or summary numbers that differ from the lesson numbers.
- Confirmed locally: `contractDrift` returns `[]` for each case. The schema cannot express uniqueness, and `walk` has no cross-field check.
- Expected: the policy says `LESSONS[].number` is "set by order", which suggests the system derives it. If `rawToBundle` uses the raw numbers, duplicates would produce a wrong order or a wrong summary row. Downstream behavior is unseen.
- Focused test sketch: `contractDrift(bundleWith({ LESSONS: [lesson(1), lesson(1)] }))` returns `[]`. This is a gap in the gate only if downstream uses the raw numbers.

No other candidates. The validator's type, enum, pattern, minimum, and `additionalProperties` handling matches the schema as read. The `IngestError` class is straightforward.

## Unresolved questions

- **Framework cardinality.** The policy requires "framework cardinality intact" on save, but the excerpts do not define it. The schema allows any number of framework rows and duplicate phases. I did not infer a rule.
- **`IngestError` and `instanceof`.** Without `Object.setPrototypeOf`, `instanceof IngestError` fails if the build targets ES5. The tsconfig target was not supplied, so this is unverified and probably not a live issue.
- **Gate enforcement.** Whether `contractDrift` results actually block writes depends on `ingestItems`, which was not assessed.
- **Baseline.** I did not confirm that these files match commit `6e75a173`.
