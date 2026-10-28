# P013-03-endpoints

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

- **Read in full:** `app/src/endpoints/recovery.ts:1-359`, `app/src/endpoints/recoveryParse.ts:1-149`, `app/src/endpoints/requestEditing.ts:1-142`.
- **Not assessed:** every imported dependency (`access`, `access/versioning`, `lib/readBundle`, `lib/combine/draft`, `lib/rateLimit`, `lib/editRecovery/kernel`, `lib/editRecovery/provenance`, `lib/relId`, `lib/substrand`, `endpoints/respond`), the kernel's CAS and projection logic, tests, and callers. No runtime behaviour was observed. This is a partial assessment of the supplied ranges only, not a coverage claim beyond them.

## Purpose and invariants (as stated in the source)

- `recovery.ts` exposes seven edit-recovery operations. Ops 1–4 are owner-only, keyed on `req.user.id`, and return 404 to non-editors. Ops 5–6 are Site-Admin-only. Op 7 returns counts only, to callers who may delete the version.
- `recoveryParse.ts` holds wire guards: declared-length body cap, positive-safe-integer counters, plain-object document, and the all-or-nothing multipart token.
- `requestEditing.ts` notifies the subject-grade's Subject Admin and all Site Admins, once per user per subject-grade per day.

## Candidates

**C1 — Low to medium (confirmed local ordering; user-visible effect partly unverified).**
`requestEditing.ts:91-97` consumes the `editRequest` throttle before any message is written. The transaction at `:123-138` rolls back on failure, but nothing releases the throttle. The 409 text at `:95` tells the user "an administrator will be in touch."
- *Precondition:* a `messages.create` fails mid-loop (the comment at `:121-122` names the sender's daily message cap), or the 503 at `:112-115` fires.
- *Expected:* a failed request either does not consume the daily budget, or does not later report that an administrator was contacted. The source does not state which, so this is a policy question.
- *Actual (per reading):* no message persists, but the next attempt the same day gets the "already requested" response.
- *Uncertainty:* whether `enforceSharedRateLimit` increments on check is not in the supplied range.
- *Focused test:* exhaust the sender's message cap; POST and expect failure. Raise the cap; POST again and expect `sent > 0`. The reading predicts a throttle refusal.

**C2 — Low (lead; scale unverified).**
`requestEditing.ts:43-60` caps both lookups at `limit: 200` with no pagination. The in-memory Subject-Admin filter at `:61-65` runs only on the capped set. Beyond 200 Site Admins, or beyond 200 assignment-holders on that subject-grade, recipients are silently dropped, while the response still reports `sent: recipients.length` at `:140`.
- *Test:* seed 201 Site Admins (or 201 holders with the Subject Admin last); assert every admin receives a message.

**C3 — Low (confirmed by reading; documentation only).**
`recovery.ts:2-10` says "Six Payload `Endpoint` configurations" and "Four distinct URL paths." The code defines seven `Endpoint` objects (`:149-349`, array at `:351-359`) and five distinct paths. The header's own opening line says "SEVEN operations across FIVE URL paths," so the enumeration contradicts it. Because the header says the wire-authz rule is "written in" these counts, a reader enumerating from them could miss an operation.

**C4 — Lead, unverified.**
`recoveryParse.ts:58-59` says an absent body is `{}` rather than an error. `readRecoveryBody` at `:61-72` yields `{}` only when `req.json?.()` returns nullish. If Payload throws on an empty body, a bodyless DELETE or POST returns "Invalid JSON body" (`:70`) rather than the field-level message. Status is 400 either way, so only the message differs. Payload's `req.json` behaviour is not in the supplied range.

## Questions and non-candidates

- `recoveryParse.ts:74-76` says counters are "Rejected rather than coerced," but `:84` coerces strings with `Number()`. Strings such as `" 2 "`, `"0x2"`, and `"2e0"` pass. The stated rationale concerns booleans, so this may be intentional. Is string acceptance for JSON bodies intended, given the multipart path needs it?
- `recovery.ts:203` passes `payload.combineContext` into `capture()` unvalidated. Whether the kernel validates it cannot be determined from the supplied ranges.
- `recovery.ts:52` claims every operation "owns wire-level 401/403/404 coverage in `tests/http`." The tests were not supplied, so this claim is unchecked.
- Security and integrity claims in these files, including the cross-user guarantee at `recovery.ts:32-36`, remain unreviewed until independent review.
