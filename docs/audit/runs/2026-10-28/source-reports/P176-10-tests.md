# P176-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: partial, zero candidates

**Scope:** The supplied ranges are test files only. Their implementation modules were not supplied, so no product behavior was assessed. Nothing below claims that any source file, caller, or runtime path was checked.

### Ranges read (all fully)
- `app/tests/unit/editRecoveryProtocol.spec.ts:1-194`
- `app/tests/unit/editRecoveryTtlProvenance.spec.ts:1-53`
- `app/tests/unit/editingViewport.spec.ts:1-29`
- `app/tests/unit/editorPlainLanguage.spec.ts:1-88`
- `app/tests/unit/editorValidation.spec.ts:1-106`
- `app/tests/unit/emailAddress.spec.ts:1-80`
- `app/tests/unit/emailFormat.spec.tsx:1-70`

### Not assessed
- Implementations under test: `components/EditRecovery/protocol.ts`, `lib/editRecovery/ttl.ts`, `lib/editRecovery/provenance.ts`, `lib/editingViewport.ts`, `fields/lessonContent`, the `LessonBundleVersions`, `LessonPlans`, `Subject`, `SubjectGrade` and `Users` collections, `components/LessonControls/validation.ts`, `ingest/validateGeneratable.ts`, `lib/emailAddress.ts`, and `EmailModal`.
- `app/tests/helpers/fieldTree` (imported by `editorPlainLanguage.spec.ts`).
- The policy excerpts were used only as context for comparison.

### Purpose and invariants pinned by the tests
- **Edit-recovery protocol:** HTTP status maps to outcome. 4xx is definite, 5xx is indeterminate, and a 200 without a token is indeterminate. A 429 `Retry-After` falls back to a positive finite delay. An indeterminate capture saves with no token. A conflict stops the save. A failed capture never blocks the version save.
- **Retention:** the TTL and expiry cutoff agree. Provenance reports stale when the source moved and mismatch when the schema differs.
- **Viewport:** editing is unavailable at or below 640px and available above it. This matches the policy's "at or below 640px" rule.
- **Editor copy and validation:** teacher-facing labels, hidden system numbering, and phase-6 errors reported by path and position. Nested server reasons are shown, and malformed bodies fall back to the generic message.
- **Email recipient and headers:** the validator rejects whitespace, CR/LF, multiple recipients, malformed domains and over-length addresses. Header sanitization strips control and Unicode line separators.
- **Email format:** the request carries the format the menu chose, and the copy names that format.

### Candidates
None. Each test asserts behavior the policy excerpts describe or that the test file itself documents, and I found no contradiction between a test and the policy text. Where a policy point is not in the excerpts (for example, the edit-recovery state machine, which the policy only references as SPEC §5), I did not infer an expected behavior from the tests.

### Lower-confidence observations (not defects)
- `emailFormat.spec.tsx`: the send assertion relies on a single `await Promise.resolve()` and on the fetch call being synchronous. A future async change in the submit handler could make the test fail for timing reasons rather than real behavior. This is test fragility, not a product defect.

### Unresolved questions
1. Do the implementations of `classifyResponse`, `planSave` and `statusForOutcome` match these tests? Verifying this requires `components/EditRecovery/protocol.ts`.
2. Does the server-side 5xx path actually preserve the "may have committed" semantics the protocol test relies on? That needs the endpoint source and its transaction handling, which were not supplied.
3. Does the email endpoint use `parseRecipientEmail` as its only 400 gate, and does it sanitize every stored title before the Subject header? That needs the route handler, which was not supplied.

Security and integrity claims in this report remain unreviewed until independent review of the implementation files.
