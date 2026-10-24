# C21 — Expected permission matrix (policy draft)

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. Expected policy is derived from the pinned SPEC and current
accepted decisions, not from C20's observed status codes or access-function names. **Draft:** endpoint
case expansion, policy questions and opposite-family challenge remain pending. No mismatch is a
confirmed finding merely because it differs from this draft.

## Sources and scope

- SPEC §2, §5, §6, §7, §8 (including the current D6a amendment), §9, §10, §11 and §13.
- `docs/DESIGN-user-model-language-2026-07-29.md` explains capability vs type; the current SPEC wins.
- `docs/DESIGN-who-manages-what-2026-08-29.md` is explicitly **unbuilt/back burner pending a SPEC
  amendment**. Its proposed teacher-visible administrator directory is not expected current behavior.
- USER_GUIDE supplies human-facing privacy/workflow context; ambiguous policy remains a question.

Columns concern a target in subject-grade **A**: Anonymous; Unverified (no valid session); Teacher
without editing access; Teacher with editing access in A; Teacher with editing access in B;
Subject Admin B; Subject Admin A; Mixed (Subject Admin B plus editing access in A); Site Admin.
These are scenario labels, not additional user types.

**Fixture mapping:** C01 has teachers with editing access in A/B and a pure Subject Admin B, plus
a Subject Admin A with editing access in B. For the mixed column, swap A/B in that actor's scenario.
Never mistake its editing capability in B for a pure out-of-scope Subject Admin refusal.

**Legend:** Y = permitted subject to normal validation/rate limits; N = no unauthorized effect or
disclosure; O = permitted only for the owner/author; C = conditional as stated. Denial need not be a
single status: filtered 200/empty, 401, 403 and concealed 404 may all preserve the policy. C22 must
assert returned data and database side effects, not just an expected HTTP code. Body fields that are
safely ignored do not constitute privilege escalation just because the request returns 200.

## Role/action matrix

| ID / action | Anon | Unverified | Teacher | Edit A | Edit B | SA B | SA A | Mixed | Site | Policy basis / condition |
|---|---|---|---|---|---|---|---|---|---|---|
| P01 — View retained lesson/version, including Not Official | N | N | Y | Y | Y | Y | Y | Y | Y | SPEC §1, §6, §9; authenticated global read, not per-subject teaching scope |
| P02 — View/export published current Official anonymously | C | C | C | C | C | C | C | C | C | SPEC §2/§9; only when public discovery and deliberate publication permit the exact surface; default disabled |
| P03 — Enter Payload admin for content work | N | N | N | Y | Y | Y | Y | Y | Y | SPEC §2; teacher baseline has no entry, editing capability or administrative role permits entry; page/field restrictions remain |
| P04 — Read the names-only user roster | N | N | Y | Y | Y | Y | Y | Y | Y | SPEC §8 user-directory amendment; teacher roster is names-only; administrative assignments projection is separate (Q04) |
| P05 — Read another user’s email via generic users REST/population | N | N | N | N | N | N | N | N | Y | SPEC §8; email is owner/Site-Admin only; Manage grant projection is separate |
| P06 — Use scoped Roles & Access email projection | N | N | N | N | N | N | C | N | Y | SPEC §8 carve-out; only a subject-grade the actor administers, excludes Site-Admin candidates |
| P07 — Request editing access | N | N | C | C | C | C | C | C | C | SPEC §8, workflow; authenticated request, no self-grant and no hidden recipient directory disclosure |
| P08 — Save a new version with teacher prose in target A | N | N | N | Y | N | N | Y | Y | Y | SPEC §5; editing capability in A or subject-admin A or Site Admin |
| P09 — Change structure, phase, durations, answer keys in A via new save | N | N | N | N | N | N | Y | N | Y | SPEC §5; subject-admin A / Site Admin only |
| P10 — Change META subject/grade/substrand identity via new save | N | N | N | N | N | N | N | N | Y | SPEC §5 corruption-repair fields; only Site Admin |
| P11 — Change system-owned resources/row numbering via user input | N | N | N | N | N | N | N | N | N | SPEC §3/§5; resources preserved, row numbering derived; Site Admin is not an input bypass |
| P12 — Change stored no-op fields via user input | N | N | N | N | N | N | N | N | N | SPEC §5; outputDir, lesson substrand/aresKeywords preserved |
| P13 — Mutate a saved version in place | N | N | N | N | N | N | N | N | N | SPEC §6; all authenticated roles save snapshots as new versions |
| P14 — Move an ingested plan to a different subjectGrade | N | N | N | N | N | N | N | N | N | SPEC §5 plan identity; delete/re-ingest correction, including Site Admin |
| P15 — Bypass ingest/save with direct blank version/plan create | N | N | N | N | N | N | N | N | N | Derived from SPEC §6/§7 atomic ingest/save model; confirm historical create-deny decision before classifying a mismatch |
| P16 — Make a retained version Official in A | N | N | N | N | N | N | Y | N | Y | SPEC §6/§8; pointer move under matching administration or Site Admin |
| P17 — Delete the current Official version directly | N | N | N | N | N | N | N | N | N | SPEC §5/§6 retention; whole-plan administrative cascade is a different operation |
| P18 — Delete a non-Official version in A | N | N | N | O | N | N | Y | O | Y | SPEC §5/§13; editing capability in A permits own-authored only, subject-admin A any candidate, Site Admin any candidate |
| P19 — Delete a whole plan and its versions | N | N | N | N | N | N | N | N | Y | SPEC §13 Manage cleanup; Site Admin only; preserve reference-unavailable semantics |
| P20 — Create/update/delete curriculum taxonomy | N | N | N | N | N | N | N | N | Y | SPEC §8/§13; subject-grade roles cannot curate taxonomy |
| P21 — Web upload/re-ingest, including approved missing taxonomy | N | N | N | N | N | N | N | N | Y | SPEC §7; Site Admin only, explicit bounded approval and atomic writes |
| P22 — Preview unsaved prose / Combine in target A | N | N | N | Y | N | N | Y | Y | Y | SPEC §5/§6; both parents readable/same plan for Combine; protected fields still split |
| P23 — Read/create/update/delete raw edit-recovery collection | N | N | N | N | N | N | N | N | N | SPEC §5; closed collection, including direct Site-Admin client requests |
| P24 — Use own prose capture/restore endpoints for A | N | N | N | C | N | N | C | C | C | SPEC §5; owner AND current editing authority; generation/revision/schema rules still apply |
| P25 — Read another user’s captured prose | N | N | N | N | N | N | N | N | N | SPEC §5; no Site-Admin content-read bypass |
| P26 — Administrative capture metadata/cleanup for another owner | N | N | N | N | N | N | N | N | C | SPEC §5; Site Admin content-free authorized repair, not raw row deletion or prose access |
| P27 — Read or change another person’s participation | N | N | N | N | N | N | N | N | N | SPEC §10 and discussion design §16.4; no Site-Admin exception for personal unread state |
| P28 — Manage own favorites | N | N | C | C | C | C | C | C | C | SPEC §10; snapshot pinned for edit rights in scope, follows Official otherwise; owner stamped server-side |
| P29 — Send message to another user | N | N | Y | Y | Y | Y | Y | Y | Y | SPEC §10; sender server-stamped, rate-capped, references server-authorized |
| P30 — Reply to / mark read a message addressed to someone else | N | N | N | N | N | N | N | N | N | SPEC §10 reply recipient rule; own-received messages only, no role bypass |
| P31 — Read/post discussions while enabled | N | N | Y | Y | Y | Y | Y | Y | Y | SPEC §10; signed-in users; posts immutable after create |
| P32 — Edit a published discussion post through ordinary update | N | N | N | N | N | N | N | N | N | SPEC §10; Site Admin uses narrow redaction, not ordinary editing |
| P33 — Pin, redact, or delete an entire thread | N | N | N | N | N | N | N | N | C | SPEC §10; Site Admin moderation; pin/post also forbidden while discussions off |
| P34 — Read discussions while disabled | N | N | N | N | N | N | N | N | Y | SPEC §10; only Site Admin reading/redaction/deletion remain |
| P35 — Grant/revoke editing access in target A | N | N | N | N | N | N | Y | N | Y | SPEC §8; matching Subject Admin or Site Admin, with assignment provenance |
| P36 — Hand administration of A to its existing editor | N | N | N | N | N | N | C | N | Y | SPEC §8 D6a amended 2026-08-19; SA A may hand over, actor demotes atomically; target already editor before write |
| P37 — Vacate/remove an administrator role in A | N | N | N | N | N | N | N | N | Y | SPEC §8 D6a; subject-admin cannot remove another holder or resign by row deletion |
| P38 — Grant global Site Admin / disable another account | N | N | N | N | N | N | N | N | Y | SPEC §8 user administration; last usable administrator protections still apply |
| P39 — Reveal administrator-issued password-reset link | N | N | N | N | N | N | N | N | Y | SPEC §8/§11 repair; secret-bearing response is narrowly administrative and rate-limited |
| P40 — Change system features/settings or read installation clock facts | N | N | N | N | N | N | N | N | Y | SPEC §11/§13; explicit setting confirmations/concurrency rules still apply |
| P41 — Read bounded other-user draft counts before deleting A | N | N | N | O | N | N | Y | O | Y | SPEC §5; must satisfy version-delete authority; counts only, no owners/times/prose |
| P42 — Support read/delete of another user’s favorites | N | N | N | N | N | N | N | N | Y | DECISIONS 2026-07-03 explicitly preserves favorites’ support exception; no create-on-behalf/update grant |
| P43 — Invoke native job run/queue/cancel controls | N | N | N | N | N | N | N | N | Y | DECISIONS 2026-06-23; trusted in-process queue/autoRun are separate |
| P44 — Create/update/delete native job collection rows via REST | N | N | N | N | N | N | N | N | N | DECISIONS 2026-06-23; prevents bypass of custom export validation/rates |
| P45 — Read native job rows and inputs | N | N | N | N | N | N | N | N | Y | DECISIONS 2026-06-23; native stats need separate Q02 assessment |
| P46 — Use resource-library list | N | N | Y | Y | Y | Y | Y | Y | Y | Existing resource-library design; configured directory required; public file opt-in does not publish listing |
| P47 — Use resource-library file link without sign-in | C | C | C | C | C | C | C | C | C | Explicit independent PDF_LIBRARY_PUBLIC opt-in, valid safe token/root; not inferred from public discovery |
| P48 — Read/update/delete own native preferences | N | N | O | O | O | O | O | O | O | Per-user framework contract; authenticated create stamps ownership, including Site Admin |
| P49 — Read curriculum taxonomy | N | N | Y | Y | Y | Y | Y | Y | Y | SPEC §2/§8 authenticated library; mutation remains P20 |
| P50 — Bypass settings save endpoint with native global POST | N | N | N | N | N | N | N | N | N | Accepted System Features design: password confirmation and freshness belong to custom save path |
| P51 — Replace system job statistics as a client | N | N | N | N | N | N | N | N | C | SPEC §8 baseline authority and DECISIONS 2026-06-23 job-control boundary; native system writes separate; Site-Admin/read policy remains Q02; candidate F-C22-001 |
| P52 — Claim another user as the holder of a content editing lock | N | N | N | N | N | N | N | N | C | Inferred owner/target-authority boundary from SPEC §2/§8; takeover binds the caller, not a forged holder; administrative repair scope requires review (Q01/F-C22-002) |

## Authentication flows are credential/state based

| Flow | Required outcome | Source |
|---|---|---|
| First administrator | Only an empty private installation; exactly one concurrent first-register caller; born verified/Site Admin; ordinary anonymous users create blocked while empty | SPEC §8 |
| Ordinary signup | Registration policy permits; initial account is Teacher; client roles/assignments/verification/provenance do not elevate it | SPEC §8 |
| Sign-in | Verified, enabled account and valid password; unverified/disabled/invalid credentials cannot establish a usable session | SPEC §8 |
| Verification | Possession of valid verification token or authorized Site-Admin repair; not arbitrary self-update of `_verified` | SPEC §8 |
| Public password reset | Uniform response for unknown/known address, rate-limited; no-email public request must not invalidate a hand-delivered administrator token | SPEC §8/§11 and accepted offline recovery decisions |
| Reset completion | Correct live token for the target account, expiration/single-use semantics, new password; no arbitrary user-id substitution | SPEC §8 |
| Logout/expiry | Shared-machine screen cleared under recovery/unsafe-work contract; server token/session behavior must match intended invalidation | SPEC §5/§8 |

## Collection-operation coverage map

| Collection | Expected read | Expected create/update/delete |
|---|---|---|
| lesson-plans | P01 / narrow public P02 | P15/P14/P16/P19; immutable identity, Official pointer and whole-plan deletion are distinct |
| lesson-bundle-versions | P01/P02 | P08–P18/P22; create only through ingest/save; native update never an editing path |
| subjects / subject-grades | Authenticated taxonomy reads | P20/P21; grade 1–12, compound uniqueness and guarded deletion |
| users | Names roster; owner/Site email; scoped trusted projection separate | §8 public signup vs Site administration; scoped assignments D6a; no privilege mass assignment |
| favorites | Own, plus Site-Admin support read/delete exception; version/Official semantics | P28/P42; server owner binding and lifecycle retarget/cascade |
| messages | Sender/recipient only, no Site-Admin exception (DECISIONS 2026-07-03) | P29/P30; sender/recipient/reference authorization; no unrelated mark-read |
| edit-recovery | No raw client collection reads | P23–P26; owner/scope custom endpoints; no administrative prose bypass |
| discussion-topics / discussion-replies | P31/P34 | P31–P33; immutable posts, narrow moderation, no unrelated direct delete |
| discussion-participation | Own state only | P27; server membership/read-marker paths, no cross-user state writes |
| payload-preferences | Per-user privacy expected; confirm framework contract | Framework-owned preference operations and explicitly authorized UI repair; no generic Site-role assumption |
| payload-kv / payload-locked-documents / payload-migrations | Q01: framework policy must be established | Q01; native descriptors alone are not legitimate client operation grants |
| payload-jobs | P43–P45: Site-Admin native job read/control, closed collection writes | DECISIONS 2026-06-23; custom export status is distinct from native jobs/stats |

## Field and relationship invariants

- Teacher editing access covers only SPEC §5's prose leaves, not array shape, phase, duration or keys.
  SUMMARY_TABLE lesson titles are administrator fields; lesson titles are teacher prose.
- `META.subject`, `META.grade`, `META.substrand_id` are Site-Admin correction fields; the plan's
  `subjectGrade` categorization is immutable for every role.
- Resource links, derived row numbers and stored no-op fields are preserved/derived rather than
  accepting user changes. Test omitted, null, reordered and forged row-id cases at the real save seam.
- Version/author/source lineage and assignment grant provenance are server-owned. Relationship depth,
  field selection and hidden-field filtering must not disclose data the caller could not read directly.
- Email projection for granting access is a deliberate scoped administrative surface. It does not
  repeal generic email-field privacy; its candidate roster is broad by the SPEC's explicit carve-out.
- Captures are owner-bound sparse prose; Site Admin may inspect other-owner metadata, never prose.
  Generation/revision fencing and schema checks still apply to permitted operations.
- Standard/Advanced tools and narrow-screen affordances affect UI visibility; they do not manufacture
  new server authority. Reconcile every handler's actual authorization separately.

## Policy questions to resolve before classifying mismatches

| ID | Question / required evidence | Treatment now |
|---|---|---|
| Q01 — narrowed | Native lock owner/target authority and administrative repair scope | KV CRUD refusal, disabled migrations and preference ownership now exercised. Broad lock writes and real forged-owner dialog are reproduced as F-C22-002; intended exceptions/impact need review |
| Q02 — narrowed | Native job-stats read/Site-Admin authority vs narrow export polling | System scheduling metadata confirmed; Teacher persistence reproduced as F-C22-001. Native job read/control gates pass; exact stats read and administrative repair scope remain open, distinct from unauthorized Teacher mutation |
| Q03 — resolved | Message-read scope | DECISIONS 2026-07-03: sender/recipient only, explicitly no Site-Admin exception; enforce in C22/C24 |
| Q04 | Self-role claims vs other-user role mapping and scoped administrative REST projections | Distinguish own authentication response from names-only roster and the approved Manage projection; an unbuilt directory is not permission |
| Q05 — resolved for assertions | Recovery metadata/count/cleanup and discard | SPEC §5 closes raw CRUD; owner endpoints require current editing authority, including discard. Cleanup is Site-Admin/content-free/revision-fenced; unsaved-count is deletion-authority scoped (P41). No Site-Admin prose bypass |

This policy draft precedes data-driven C22 attack assertions. C20 observations will be reconciled into
a separate implemented/actual matrix; ambiguous cells are not silently marked compliant or defective.
