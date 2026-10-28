# P011-03-endpoints

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## AUTHOR RESPONSE (F-C40-001): RETAIN, amended scope

**Source path (read, not run):**
- `app/src/ingest/index.ts:112` trims `META.substrand_id` for identity, and `:130` queries with that trimmed value.
- `app/src/ingest/toBundle.ts:30,48` stores `raw.META` unchanged, so the padded value is persisted.
- `app/src/fields/lessonContent.ts:218-223` has no normalisation on the Site Administrator edit path.

The lookup and the stored value use different strings, so a padded row can never be matched by any ingest lookup. I have not rerun the reproduction. I rely on the coordinator's report, which is consistent with this source.

**Amendments:**
1. The consequence is recurring, not a single missed match. Per the report, two padded uploads produced plans 110 and 111. Each padded re-upload creates a new plan.
2. Second entry path: a Site Administrator edit of `substrand_id` can store padded text that ingest can never match. Not reproduced by me; treat as an unreproduced lead under the same finding.
3. Release ancestry and the migration both key on the same identity (policy §7 and "nonempty sub-strand identity"). Impact there is plausible but unverified and should be assessed separately.

**Reasons:** The code's own comments define identity as trimmed (`index.ts:109,119`). Whether that is the intended spec policy is not confirmed, since SPEC §7 was not supplied. I have not invented that policy.

## Normal source review

**Read (as supplied):** `app/src/ingest/index.ts:109-161`; `app/src/ingest/toBundle.ts:1-55`; `app/src/fields/lessonContent.ts:218-224`; `app/src/endpoints/exportVersion.ts:1-199`; `app/src/endpoints/forgotPassword.ts:1-178`; `app/src/endpoints/login.ts:1-61`; `app/src/endpoints/markMessagesRead.ts:1-97`; `app/src/endpoints/moderate.ts:1-110`.

**Not assessed:** `extract.ts`, `hooks/fieldSplit.ts`, `authorizeVersionExportRequest`, `loadCachedDeliverable`, `lockRows`/`txDb`, and the SPEC. Policy excerpts were used only as context.

**Invariants observed:** Ingest identity is `(subjectGrade, substrand_id)`. Export and moderation are transactional and access-checked. Forgot-password returns uniform responses by design.

**Candidates:**

- **C2 (Low, locally reasoned, not run).** `toBundle.ts:32-36`. A whitespace-only `titleDoc` (for example `"  "`) is truthy, so the `||` fallback chain does not apply and the title is blank. Expected: fallback to `substrand_name`, as the comment at `:31` describes. Actual: `"  "`. Repro: `rawToBundle({META:{titleDoc:"  "}}).title`. Whether whitespace should count as empty is a policy question.
- **C3 (Low, uncertain).** `login.ts:28-29` rejects whitespace-only passwords, while `:38` passes the password through. If signup accepts such passwords, a user cannot sign in with one. Signup rules were not supplied.
- **C4 (Info).** `markMessagesRead.ts:50` uses `Number(v)`, so `true`, `[7]` and `"7.0"` are accepted as ids. Contract is `number[]`. Impact is limited to the caller's own messages (`:86`).

**Intentional carve-outs, not reported:** the status endpoint's version-scoped readiness (`exportVersion.ts:162-170`); the swallowed delivery error (`forgotPassword.ts:142-153`); the SMTP-absent branch; and `moderate.ts` lock order.

**No candidate:** `findExistingPlan` (beyond F-C40-001), and the moderation flow as read.

## Unresolved questions

1. Does any upstream step trim `META` before `rawToBundle`? Not in the supplied ranges. A trim there would weaken F-C40-001.
2. Is SPEC §7 explicit about whitespace in `substrand_id`?
3. `exportVersion.ts:99` interpolates `doc.filename` into `Content-Disposition` with no visible escaping. Whether `loadCachedDeliverable` sanitises it is unknown, so header injection cannot be assessed.
4. Is `lessonContent.ts:218` inside an open array? If so, field-level access may null the value rather than retain it, as policy describes for other hidden fields.
5. `forgotPassword.ts:92` checks `SMTP_HOST` only. Confirm it matches the mailer's actual configuration.

Security and integrity claims above remain unreviewed until independent review.
