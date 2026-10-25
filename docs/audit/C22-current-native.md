# C22 Native authorization and privacy probes

## Chunk contract

- Owner: sole auditor (Codex); baseline `bd5f07863a150cd51245b9c942502efa19d4014d`.
- Mandatory: execute expected role/action cells, verify protected fields and side effects, include
  native/bulk/history/generated surfaces, endpoint tampering and privacy controls; explain omissions.
- Artifacts: c22-private-fields.ts, c22-native-matrix.ts, c22-immutable-followup.mjs; sanitized results
  here, raw results privately. No product changes. Exclusions: none.
- Exit: full expected matrix and the catalog's named attacks reconciled. This report is a bounded
  opening batch, not complete C22 coverage.

## Executed checks

Runtime: production app on Node 24.22.1, Payload 3.92.0, PostgreSQL 16.15, current baseline. All
live operations held the target lock. Scenario set: anonymous, refused-unverified login, ordinary
teacher and peer, editing access in A and peer, editing access in B, administrator A with editing
access B, administrator B, Site Administrator. Unverified requests carry no valid authenticated session.

| Batch | Outcome | Scope |
|---|---|---|
| Private-field / GraphQL probe | 70 observations, no concerns, exit 0 | Other-user email projection; matching/nonmatching email equality, prefix and role filters; GraphQL GET and POST introspection |
| Native write / favorite matrix, valid payloads | 194 checks passed, exit 0 | Core native reads, direct plan/version create, two-scope immutable PATCH and Official deletion, native jobs/stats/lock writes, internal migrations, favorite owner stamping/privacy/cleanup |
| Immutability follow-up | Nine attempts, snapshots unchanged, exit 0 | Sparse/full/bulk PATCH for editing-access A, mixed actor's editing scope B and Site Admin |

Native hidden-field filters returned 400 for non-site-admin authenticated actors; both matching and
nonmatching addresses were refused. Ordinary roster/detail reads omitted another user's email.
Site-Admin controls returned 200 with the expected matching/nonmatching membership. Anonymous/no-session
reads returned 403. GraphQL returned 404 in all ten scenarios.

The native matrix used a complete valid snapshot with one prose change for PATCH, so authorized
form-render roles reached the immutable-write rejection. In-place writes, direct plan/version
creation, native jobs/statistics writes and lock creation were denied. Authorized delete callers
reached the Official-retention guard (409); callers without delete authority got 403. Internal
migration REST requests returned 501 without migration records. Favorites bound the session user
despite a forged owner, peers could not read them, and creators removed all eight test favorites.
Full retained-version and Official-plan fingerprints matched before and after.

## Harness corrections and counterevidence

The first native batch completed 194 checks, exit 1, because 18 status expectations were too narrow:
Official deletion is 409 for otherwise authorized callers; the disabled migrations API returns 501;
sparse title-only PATCH for editing-access actors fails validation with 400 before immutability.
No snapshots changed, and favorites were cleaned. Original results were retained, the completed
owner/process was reconciled, and only its own lock was released.

A complete valid prose snapshot then reached the exact immutable-version 403 message. Bulk valid
PATCH returned 400 with a per-row immutable-version error and unchanged content. Sparse validation
failure alone was not counted as proof that the immutability hook ran. The corrected full matrix
then passed all 194 checks. These corrections are not product findings.

## Remaining work

Expand C21 expectations to all collection/endpoint/field operations, including KV/preferences,
legitimate lock takeover, native bulk/duplicate/history paths and authority/session changes. Run
cross-owner social/recovery cases, assignment mass writes and last-admin controls. Existing wire
suites passed complementary cases but do not close the full catalog matrix or browser access checks.
