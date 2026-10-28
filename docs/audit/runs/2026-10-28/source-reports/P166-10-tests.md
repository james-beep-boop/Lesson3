# P166-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: supplied test ranges

**Scope:** Read-only review of the supplied text. I ran no tools, executed no tests, and read no implementation modules.

### Coverage

Read as supplied:
- `app/tests/unit/candidateListActions.spec.tsx:1-152` (full)
- `app/tests/unit/canonicalJson.spec.ts:1-43` (full)
- `app/tests/unit/captureDiffAgreement.spec.ts:1-187` (full)
- `app/tests/unit/classNameStyles.spec.ts:1-138` (full)
- `app/tests/unit/clockCheck.spec.tsx:1-84` (full)
- `app/tests/unit/clockSkew.spec.ts:1-44` (full)

Policy excerpts were read for context only.

**Not assessed:** the modules these tests exercise (`CandidateList`, `lib/canonicalJson`, `lib/editRecovery/projection`, `lib/clockSkew`, `components/Manage/ClockCheck`, `helpers/cssSelectors`, `lib/personalVersions`). Callers and runtime behaviour were not checked.

**Result:** no confirmed product defect from these ranges. The candidates below are test-side leads or unresolved expectations.

### Purpose and invariants

- **candidateListActions:** per-row actions follow the server's decision. Compare is shown only with an Official baseline. Delete and edit intent depend on `canDelete` and `canEdit`.
- **canonicalJson:** key order is not a difference, array order is, and nulls are kept distinct from absent keys.
- **captureDiffAgreement:** the restore preview must be a superset of what `applyCapture` actually writes. Orphan keys stay visible. Malformed leaves are ignored.
- **classNameStyles:** literal `className` tokens in `src/components` must have a stylesheet selector.
- **clockCheck:** a warning appears only for one fresh, usable reading that disagrees with the device clock.
- **clockSkew:** same instant in different zones is not a disagreement. Tolerance is symmetric. Non-finite readings never flag. Readings past the round-trip limit are rejected.

### Candidates

**C1. Negative assertions can pass before the check settles.** Severity: low. Test validity, not a product defect. Confirmed by reading.
- Evidence: `app/tests/unit/clockCheck.spec.tsx:36-41`, `43-48`, and `62-64`. The `waitFor` only waits for the fetch call. The alert, if one appears, comes after response parsing. The `setTimeout(0)` at line 63 is a single tick.
- Expected: absence of an alert is asserted after the component has decided.
- Actual: the absence check can run first and pass vacuously.
- Repro (predicted, not run): stub a component that shows the alert after a 10 ms delay. Tests at lines 36 and 50 would still pass.

**C2. Preview's "was" value for a system-owned field.** Severity: low to medium. Lead; the expected behaviour is not in the policy.
- Evidence: `app/tests/unit/captureDiffAgreement.spec.ts:177-182`. The fixture stores `resourceLinks = 'system-owned'`. The test expects `was: ''`, and `now: 'preview-only'`. Lines 183-185 show the restore writes nothing.
- The carve-out comment at lines 171-173 justifies over-reporting the change. It does not justify the `was` value, which does not match the stored `'system-owned'`.
- Question: should `was` show the currently stored value for fields the preview lists but the restore does not apply?

**C3. Official-row fixture may not match a reachable state.** Severity: low. Lead.
- Evidence: `app/tests/unit/candidateListActions.spec.tsx:115-123`. The row has `isOfficial: true` and `officialVersionId: null`. The comment at lines 63-68 says `null` means a plan with no Official pointer. An Official row implies its plan has a pointer, which should be this row's id (12).
- Gap: the case where `officialVersionId === id` is not tested. That case would render a self-comparison (`from=12&to=12`) if the component does not guard against it.
- Repro: render with `isOfficial: true, officialVersionId: 12` and assert no Compare link. Result unknown without the component.

**C4. Class-name test title overclaims coverage.** Severity: low. Coverage gap.
- Evidence: `app/tests/unit/classNameStyles.spec.ts:129-137`, titled "gives every app-owned static component class a stylesheet rule". `lines 81-85` read only literal `className` initialisers.
- Confirmed by reading: `const c = 'dead-class'; <div className={c} />` is not scanned. An identifier returns no literals (`lines 52-53`, `83-85`).
- Possible false alarm: `CLASS_TOKEN` (line 24) accepts a leading `-`. A tail such as `-primary` from `btn-${size}-primary` (lines 62-63) could be reported as a missing class.

### Unresolved questions

1. Is `was` meant to show stored values for non-applied fields (C2)?
2. Can an Official row ever have `officialVersionId: null` in production (C3)?
3. Does `canonicalJson` also match a REST round-trip for `NaN`, `Infinity`, and `undefined` inside arrays? The header claims it does (`canonicalJson.spec.ts:2-5`), but only key order, `Date`, nested `undefined`, and `null` are tested.
4. `captureDiffAgreement` checks only two prose keys on one lesson (`captureDiffAgreement.spec.ts:55-63`), yet its header claims the preview "never misses". Is a broader check intended?

No security or integrity claims are made here. Those remain unreviewed until independent review.
