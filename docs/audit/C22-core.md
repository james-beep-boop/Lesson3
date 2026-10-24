# C22 — First bounded native-write and privacy probes

## Chunk contract

- **Owner:** coordinator (Codex); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`.
- **Mandatory checks for this part:** all ten C20 actor contexts, both subject-grade scopes, native
  version PATCH/current-Official DELETE, closed direct plan/version/recovery creation, raw recovery
  listing, closed native settings update, generic user-field privacy and own-email positive control.
- **Artifacts:** `app/tests/audit/rbac-core.audit.spec.ts`, its dedicated Playwright configuration,
  private per-actor request/status output and before/after fingerprints; C21 policy/source maps.
- **Exclusions:** this bounded part is not the entire C22 matrix. No claim of full immutability,
  CSRF/session, concurrent-write, source-deletion, raw recovery update/delete or every endpoint coverage.
- **Exit:** bounded assertions satisfy expected policy and fingerprinted state is identical; preserve
  every initial stop/follow-up and explicitly carry omitted cases into subsequent parts.

## Outcome — 2026-10-24

**Bounded part complete across ten actor scenarios, using qualified original/follow-up evidence.**
There are **115 recorded probes**, including **80 attempted native writes**. Complete depth-zero native
version/plan API documents (nested content included), Official pointers, document counts and system
settings hash identically before and after every run. This is evidence for these attempted requests;
C31 still requires database-level surviving-row fingerprints and every write path/race.

Environment is C01's disposable ARM64 production stack at the pinned SHA, Node 24.22.1 and
Playwright 1.64.1. One API worker, no retries, stop on first failed case, four CPUs / 8 GiB;
cached Chromium cookies are rechecked through `/api/users/me`. SMTP remains internal, public library
disabled, discussions enabled. Each live run holds the target lock.

| Probe family | Recorded outcome / limitation |
|---|---|
| Native version PATCH, both scopes | Refused for all actors; 403 or native field-validation 400. Some editing-capability requests fail phase validation before the immutable hook; those requests do not prove the hook ran. Stored content is independently unchanged |
| Direct DELETE of current Official, both scopes | Refused for all actors: ungranted actors 403; matching administrators 409 with the Official-retention message. Pointers/content remain unchanged |
| Direct plan/version POST | 403 for all actors, including Site Admin; no extra plan/version appears |
| Raw recovery GET/POST | 403 for all actors, including Site Admin. Existing foreign-row update/delete and custom owner endpoints require later cases |
| Native system-settings POST | 403 for all actors, including Site Admin; settings unchanged. Custom password/freshness save is a separate surface |
| Populated user privacy targets | Teachers with/without editing access receive no other-user email or non-empty role/assignment values, even with explicit select/depth. Generic other-user email/global-role privacy also checked for Subject Admins; their assignment-read scope remains C21 Q04 |
| Positive control | Verified actors read their own email; Site Admin reads the other-account email. Anonymous/unverified generic user reads are refused |

## Preserved harness stops and scoped follow-ups

This is **not one green full-suite run**. The original ran two unauthenticated cases successfully,
then stopped on the plain teacher's empty default `assignments:[]`: the harness incorrectly required
the key to be absent. The corrected privacy probes use accounts with actual global/per-scope grants,
assert no protected values rather than no empty array, and preserve the administrative exception.

The first follow-up passed both baseline teacher cases, then stopped because the harness did not
include native validation's 400 refusal for a teacher with editing access. Its private response says
“The following field is invalid: Lesson 1, phase 1”; `beforeValidate` precedes `beforeChange`.
The second follow-up passed all three editing-capability cases, then stopped on a matching
administrator's intended 409 Official-retention response, also omitted from the harness status list.
Source `hooks/bundleVersion.ts` confirms that refusal. The last three administrator cases passed
after accepting that response and asserting its Official message. Every stop had equal fingerprints;
owner processes were dead and runners absent before exact-token lock reconciliation. All earlier
logs, failed specs and traces remain private and intact. No uncertain successful mutation was retried.

## Remaining C22 work

- Expand all C21 rows into per-method/operation assertions and expected-vs-actual output; custom
  endpoints × roles, wrong/nonexistent/foreign IDs, native bulk/count/versions/default handlers.
- Use fully valid content and non-Official authored fixtures to reach each write guard deliberately;
  separate allowed candidate deletion from forbidden historical mutation and Official deletion.
- Mass-assignment/signup/self-update, changed/disabled/revoked authority, D6a handover/vacating,
  last administrator, user deletion/provenance and post-wait authorization.
- Real foreign rows for ownership/IDOR; depth/population/select/hidden-field filter oracles;
  user/message/forum/favorites/recovery relationships and both mixed-scope directions.
- Native locks/preferences/job rows/control/statistics, Q01/Q02/Q04, CSRF/public postures and
  transactional side effects. C23/C24/C30/C31 provide their separate flow/race coverage.
- Preserve fresh-session C82 independence before finding validation; opposite-family review and the
  bounded author/reviewer pilot are still pending. No defect candidate is accepted by these results.

Product code, existing tests, dependencies and vendor content remain unchanged. C22 overall remains
**in progress**; broader architecture/simplification work remains required under C84.
