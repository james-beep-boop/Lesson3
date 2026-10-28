# P124-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/http/endpoints.http.spec.ts:801-1200`, as supplied in the request. The test starting at line 1180 continues past line 1200, so its assertions beyond that point are **not assessed**.
- **Not assessed:** the fixtures and helpers the range depends on (`fx`, `auth`, `url`, `MARK`, `stripIds`, `HttpVersion`). No product source (endpoints, hooks, `fieldSplit.ts`, recovery logic) was supplied or read. I have not checked callers or runtime behavior.

## Purpose and invariants under test

This block tests HTTP-level authorization and integrity for lesson-plan creation, plan identity, and `save-as-new`:

- Plan creation over REST is denied for Subject Admin and Site Admin (`:811-845`).
- `officialVersion` cannot be set on create or cleared by PATCH, and `subjectGrade` cannot be changed (`:847-911`).
- Save-as-new returns field-path errors for incomplete phases and writes nothing on failure (`:948-974`).
- Editing-access saves preserve the Official pointer and source snapshot (`:976-1023`).
- Empty arrays posted as counts are handled (`:1025-1071`).
- Field split: prose is editable, structure and `resourceLinks` are protected, and Site-Admin-only META repair fields are preserved for Subject Admin (`:1108-1200`).

These expectations are consistent with the policy excerpts for plan identity immutability, the prose/admin/system field split, and `META.subject`/`grade`/`substrand_id` being Site-Admin-only.

## Candidates

**No confirmed product-defect candidates** in this range. The expectations I could check against policy match it.

**Test-precision leads (low severity; not product defects, and uncertain as to impact):**

1. **Teacher save-as-new denial cannot distinguish its cause** (`:1073-1081`). The request sends no recovery token and accepts any status from 400 to 499. A 4xx from the token guard or a validation error would pass exactly as a role denial would. The file already notes this risk at `:827-829` and `:920-921`.
   - Repro: send the same teacher request with a valid recovery token and assert `403`. If the response is not 403, the test is hiding a different denial path.

2. **Unpinned 4xx on the structural and forged-resource cases** (`:1108-1118`, `:1159-1178`). Both use `>=400 && <500`. The forged-link test at `:1159` could pass on any unrelated validation error, so it does not prove that invented `resourceLinks` are refused.
   - Repro: assert the specific status and a field-path error for `resourceLinks` in each case.

3. **Cleanup runs after assertions** (`:1018`, `:1066`, `:1152`). If an `expect` fails first, the created version row is left behind. This is test hygiene only.

## Unresolved questions

- **Subject-grade move (`:895`, expects 400):** the policy says plan identity is immutable, but it does not specify a status code. Confirming that 400 comes from the immutability gate and not from a generic validation failure requires the hook source, which was not supplied.
- **No-op save returns 400 (`:1083-1106`):** the policy does not define a no-op rule. The test cites a "2026-07-17 guard," but I cannot confirm that 400 is the intended policy outcome rather than an implementation choice. This needs an owner decision.
- **Plain Teacher save-as-new:** the policy does not pin a status code for a user without editing access. Whether 403 is intended should be confirmed before lead 1 is treated as a finding.
- **Test at `:1180`:** its full assertions, past line 1200, are not assessed.
