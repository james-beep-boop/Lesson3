# C31 — Immutability attack run (cloud repro, deterministic part)

## Chunk contract

- **Owner:** author-a (Claude); baseline `d3714a5`; 2026-10-24.
- **Environment:** disposable cloud stack — baseline production build, Node 24.22.1, Payload 3.91.0,
  PostgreSQL 16.15, all services loopback-only, nine synthetic accounts, two Official plans (one per
  subject-grade scope), torn down with the session. **Locally reproduced**, not deployment-reproduced.
- **Mandatory checks (this part):** content fingerprints of every version table before/after; every
  deterministic write path from C30 attempted as every role (anonymous, Teacher, editing-access
  A/B, Subject Admin A/B, Site Admin); the Official-not-deletable guard; the one-Official-pointer
  guard; the unique `(lessonPlan, semver)` index.
- **Exclusions:** the **race/concurrency** half (C30 rows 4–6, request-editing lock stealing) is
  **not** done here — it needs the `tests/helpers/rowLocks.ts` barrier wired into the audit harness,
  and the plan marks C31 exclusive. Recorded as the resume point. User/version deletion cascades
  (C30 rows 11–13) not exercised.
- **Exit:** deterministic matrix green (every write refused, fingerprints identical) or a finding.

## Outcome

**No defects. Deterministic immutability holds.** Fingerprints of all eight version tables were
**identical before and after** the whole matrix (`contentUnchanged: true`, `changedTables: []`).

| Attempt (every role unless noted) | Result |
|---|---|
| `POST /api/lesson-bundle-versions` (direct create) | 403 for all roles incl. Site Admin and anonymous |
| `PATCH /api/lesson-bundle-versions/:id` (in-place edit) | Refused for all: Teacher/editing-B/Subject-Admin-B/anon get 403 at access; Subject-Admin-A and Site Admin reach the hook and get 403 "Versions are immutable — save your changes as a new version". Editing-access-A hit a 400 field-validation before the hook (the known pre-hook caveat) — still no write |
| `PATCH` scope-A version as editing-access-B | 403 (out of scope) |
| `DELETE` the Official version | Refused for all: out-of-scope roles 403; Subject-Admin-A and Site Admin get 409 "This version is Official and cannot be deleted. Make another version Official first." |
| `PATCH /api/lesson-plans/:id` `officialVersion:null` (Site Admin) | 400 "field is invalid: officialVersion" (pointer cannot be cleared) |
| `PATCH` plan `officialVersion` → another plan's version (Site Admin) | 400 "field is invalid: officialVersion" (must belong to this plan) |
| Bulk `PATCH ?where[id][greater_than]=0` (Site Admin) | 400 "Versions are immutable…" — bulk path refused too |
| DB index | `lessonPlan_semver_idx` UNIQUE on `(lesson_plan_id, semver)` present |

## Resume point

The exclusive race half on an approved target (or here with the barrier helper): two concurrent
`save-as-new` on one plan (monotonic semver, no lost update); delete-vs-promote on the Official
pointer (C30 row 4/6, the load-bearing plan-row lock); request-editing lock stealing and stale locks;
then user/version deletion cascades (C30 rows 11–13) with the `author`/`sourceVersion` columns
excluded or logged as permitted changes.
