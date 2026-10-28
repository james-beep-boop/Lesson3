# P132-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Coverage**
- **Read:** `app/tests/http/recovery.http.spec.ts:1-400`, the full supplied range.
- **Not assessed:** the endpoint handlers, `helpers/fixtures.js`, `recoveryParse.spec.ts`, access rules, `endpoints.http.spec.ts`, and anything past line 400 (the S2 remainder, S4–S6). No tests were run. I did not check any callers or runtime behaviour.

**Purpose and invariants asserted (1-400)**
- A wire-level matrix over seven operations (111-207): 401 when unauthenticated, the wrong-role status, and 404 for a nonexistent version.
- Happy paths for start, capture, GET and discard (209-302), a 400 for a malformed `generation` type (304-313), and a 409 for a stale token that does not name the failing precondition (270-288).
- A timestamp contract: `capturedAt` equals `token.updatedAt`, and is not earlier than `baseUpdatedAt` (259-267).
- S5 (323-353): a malformed `document` returns 400, and the prior capture and revision are unchanged.
- S1/S3 (362-390): two users with captures on the same version see only their own.

**Candidates**
None confirmed. Every assertion I could check against the supplied text is internally consistent, and the file contains no product logic. The items below are test-validity or coverage concerns, not product defects.

**Leads (uncertain, not confirmed)**
1. **Op-7 premise, 178-182 (low, test validity).** The comment says `sharedVersionId` has no author, so the editing-access holder cannot delete it, and that the 403 therefore proves the gate is the delete rule. That depends on fixture data and access functions outside this range. If `fx.users.editor` is the author, or the delete rule admits editors, the assertion would pass or fail for the wrong reason. Reproduction: confirm the author field of `sharedVersionId` and call the delete access function as `editor`.
2. **Malformed-document coverage, 316-321 and 336-338 (low, coverage).** The comment says every malformed shape fails at one guard, and that the pre-fix code projected to `{}` and succeeded. Only `document: null` is sent over the wire. Non-null malformed shapes such as a string or an array have no wire case here. Reproduction: POST `document: "x"` and `document: []` with a valid token, then assert 400 and that "work worth keeping" still comes back on GET. The historical claim cannot be checked from this range.
3. **Unasserted setup captures, 366-370 and 373-377 (low, diagnostic).** The capture POSTs in S1/S3 are not status-checked. A refused capture would make the later assertions fail, so this is weaker diagnostics, not a false pass.
4. **Matrix roles, 117-122 and 162-164 (not a defect).** Each operation lists one allowed role. `subjectAdmin` runs ops 1–4 at 372-377 without appearing in the matrix. The matrix does not claim to be exhaustive.

**Unresolved questions**
- Does `setupRoleFixture` make `fx.users.editor` a non-author of `sharedVersionId`? `makeVersion` (78-88) sets no author.
- Does the handler return 404 for a Teacher on ops 1–4 (131) and 404 for a wrong role on op 7 (183)? The table asserts these; I cannot confirm them from here.
- Is `content` keyed as `lesson:<id>` in the handler (246, 350)?
