# P010-03-endpoints

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

Read from the supplied text only. No tool calls, no files opened, no callers or runtime behavior checked.

- `app/src/endpoints/aresExport.ts:1-62`: read
- `app/src/endpoints/combinePreview.ts:1-83`: read
- `app/src/endpoints/discussionActions.ts:1-194`: read
- `app/src/endpoints/discussionNavState.ts:1-37`: read
- `app/src/endpoints/discussionThreadDelete.ts:1-65`: read
- `app/src/endpoints/emailVersion.ts:1-110`: read
- `app/src/endpoints/exportAuth.ts:1-35`: read

**Not assessed:** every callee these files depend on (`findReadableVersion`, `advanceReadMarker`, `moderate`, `isEditorFor`, `planCombine`, `bundleToAresData`, `safePrefix`, rate limiters, `parseRecipientEmail`, `parseExportKind`, `isForumEnabled`, `hasUnread`, the email job, `respond` helpers). Coverage is partial, so the leads below depend on unseen code.

## Purpose and invariants (as stated in comments)

- **Export/preview:** ARES JSON export and combine preview are read-only. Export needs READ access; combine preview needs editing access on the subject-grade.
- **Discussions:** mark-read needs sign-in and forum on. Pin, redact and delete are Site Administrator only; deletion is logged after commit.
- **Email:** authorize, then apply caps, then the SMTP gate, then queue. The request never sends mail itself.

## Candidates

**C1 — low, confirmed by local reading.** `app/src/endpoints/emailVersion.ts:72-91`
- Precondition: a valid, authorized request, and `SMTP_HOST` unset.
- Actual: the `emailRecipient` and `emailGlobal` daily caps are incremented, then the handler returns 503 and queues nothing.
- Expected: not defined by the policy excerpts. Lines 67-71 say caps are spent once a request is authorized. Whether they should be spent only when mail can go out is an owner decision.
- Repro: unit test with `SMTP_HOST` unset and the shared limiter stubbed to cap 1. One valid POST returns 503. Then set `SMTP_HOST` and send a second valid POST. Expected 202; actual 429, with no mail ever sent.

**L1 — uncertain.** `app/src/endpoints/discussionActions.ts:66-71`
- The comment at line 67 says a forged `throughSeq` writes nothing. But the check runs after `advanceReadMarker` returns. If that function persists `throughSeq` before returning `lastSeq`, a forged value is stored and the response is still 400.
- Repro: mark read with `throughSeq = lastSeq + 1`. Expect 400 and an unchanged stored marker.

**L2 — uncertain.** `app/src/endpoints/exportAuth.ts:26-27`; `aresExport.ts:27-30`
- The route id goes straight to `findReadableVersion` with no `relId` check. `combinePreview.ts:52-54` says that check exists so out-of-range ids return 400 rather than a database error.
- Repro: signed-in GET of `/api/lesson-bundle-versions/99999999999999999999/ares-export`. Expect 400 or 404; watch for 500.

**L3 — uncertain.** `app/src/endpoints/combinePreview.ts:64-70`
- Editing access is checked only on `a.subjectGrade`. `b` is checked only for sharing the plan. This is safe only if version `subjectGrade` always matches the plan's, which is not verified here.

**L4 — uncertain.** `app/src/endpoints/aresExport.ts:42-49`
- `schemaVersion` is hard-coded to `'1.0.0'` and `LESSONS` is passed through unchanged. The policy says the 1.0.0 contract requires `LESSONS[].resourceLinks`. Whether the adapter always emits it is unseen. The comment's claim that the output "round-trips" is not checked here.
- Repro: export a version without `resourceLinks` and run ingest pre-flight. Expect rejection, or a successful round-trip if the adapter guarantees the field.

**L5 — unverified.** `app/src/endpoints/aresExport.ts:51-58`
- `safePrefix` output is placed in a quoted `Content-Disposition` header. If it allows `"`, CR or LF, the header breaks. `safePrefix` is not in range.

**L6 — unresolved.** `app/src/endpoints/emailVersion.ts:103-106`
- The queued job records `requestedByUserId`, but nothing in range re-checks READ access at send time. The policy does not say whether revocation before send should stop delivery. This needs an owner decision and the job source.

**L7 — unverified.** `app/src/endpoints/discussionThreadDelete.ts:60-61`
- `replyCount` is taken from `lastSeq`, which the comment asserts equals the reply count. Not checked.

## Unresolved questions

- Should `authorizeVersionExportRequest` authenticate on its own? It does not check `req.user`. Its visible callers do, but the download, prepare and status handlers are out of range.
- Is spending the caps on a 503 (C1) intended?
- Does the email job re-authorize before sending (L6)?
