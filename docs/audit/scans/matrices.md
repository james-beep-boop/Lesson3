# C80 cross-cutting reconciliation matrices

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. This file reconciles the current audit
reports; it is not a claim that every cell has equal depth.

## Custom endpoint → tests

The complete `tests/http/endpoints.http.spec.ts` is the broad 122/124 current wire gate. The focused
files below add deeper role, race, persistence, and failure checks; a blank focused cell means the
endpoint is covered only by the broad gate or source review.

| Endpoint module | Focused current evidence |
|---|---|
| `aresExport` | `C54-export-endpoint`, JSON/per-document export selections |
| `combinePreview` | `combinePreview.http`, 18/18 |
| `discussionActions`, `discussionNavState`, `discussionThreadDelete` | `discussions.http` 30/30; discussions integration 23/23 |
| `emailVersion` | full endpoints; no-SMTP 503 complement |
| `exportAuth`, `exportVersion` | full endpoints; C54 job/export selections |
| `forgotPassword`, `verifyEmail` | full endpoints; admin reset-link and no-SMTP reset-token checks |
| `markMessagesRead`, `respond` | full endpoints; message-reference and messaging integration |
| `moderate` | full endpoints; source review and guide-access role checks |
| `parseFormat`, `previewParse`, `uploadBundles` | ingest contract, null-resources, body-limit, preview/PDF and taxonomy suites |
| `previewShared`, `previewVersion` | Preview 5/5 and Preview-as-PDF 7/7 |
| `recovery`, `recoveryParse` | recovery HTTP 35/35; recovery integration 76/76 |
| `requestEditing` | request-editing selection 5/5 |
| `resourceLibrary` | full endpoints; public-library units |
| `serverTime` | server-time 5/5 |
| `systemSettingsSave` | system-settings 26/26 |
| `userAdminActions` | user-admin-actions 36/36 |
| `userAssignments` | user-assignments 22/22; handover 3/3 |
| `userSearch` | user-search 10/10 |
| `versionEdit` | save, pending-authority, native authority, Combine and deletion suites |

The broad gate's two skipped cases were the explicitly SMTP-disabled branches; both passed in the
replacement no-SMTP app. Every endpoint has at least an authentication/role gate in the broad or
focused suite, but a formal per-method 401/403/404/happy-path table for every variant remains a
maintenance item rather than a new finding.

## Role/action reconciliation

| Role | Read library/lesson | Edit prose | Edit structure | Manage assignments | Promote Official | Delete candidate |
|---|---|---|---|---|---|---|
| anonymous/unverified | refused or public-library only | no | no | no | no | no |
| Teacher | yes when signed in | only with scoped editor grant | no | no | no | no |
| Teacher + editing access | yes | scoped prose | no | no | no; save-as-new only | own authored candidate in scope |
| Subject Administrator | yes | scoped | scoped | scoped subject-grade | scoped | any candidate in scope |
| Site Administrator | yes | all | all | all | all | all candidates; Official retention guard still applies |

The observed matrix matches `C21` expectations for the tested actions. F-C23 rate-limit and
enumeration findings are authentication controls, not role-scope mismatches. Deployment proxy
identity and untested field permutations remain qualified gaps.

## Invariant → test evidence

| Invariant | Current evidence |
|---|---|
| Authenticated version updates never mutate a saved row | C5.1 26 integration + immutability wiring 6 unit |
| Official pointer has one target and is retained on refusal | C31 native authority, pointer-lock, deletion ledger |
| Uploaded JavaScript is parsed as AST and never executed | C40/C41 extractor 29 cases and sink checks |
| Editable grammar is plain prose with controlled phase | C5.12 112 focused assertions |
| Resource rows and lesson numbers are system-owned | C5.12 field tests; null-resource wire suite |
| User email/role/assignment privacy | C22 native matrix; auth/favorites and user-search suites |
| Subject-grade assignment provenance is server-stamped | assignment-provenance 3/3 |
| Recovery capture is owner-only, fenced and retired | recovery HTTP 35/35; kernel integration 76/76 |
| Restore migration preserves data and can reverse before confirmation | full-stack restore 104/104 |
| Cache deletion failure is surfaced | C70 fault run reproduces the masked failure; accepted F-C70-001 |
| Guide/env/backup path documentation stays in parity | C71 103/103 |

## Environment coverage

| Environment | Evidence |
|---|---|
| pinned Node 24 dependency container | lint/types/format, unit, integration, HTTP and focused slices |
| disposable production-style Compose target + Mailpit | current HTTP, C23/C31/C40/C41/C54/C70 probes |
| same target with SMTP disabled | two no-SMTP complements, Manage 38/38, offline signup 1/1 |
| Chromium CI-equivalent image | full functional and visual/a11y matrices |
| private WebKit image/volume | 11/11 functional subset |
| older-schema isolated restore target | 104/104 upgrade/interrupt/restore drill |
| shared/deployed edge | not independently confirmed; C70/C83 gap |

## Known-bad-test resilience

The strongest tripwires are the immutability wiring unit (fails if the hook is removed), the persisted
Official/deletion fingerprints, the AST execution sentinels, the no-SMTP replacement run, and the
restore interruption/resume assertions. Broad UI snapshots and style-variant counts would still pass
some visual regressions; they are measurement evidence rather than mutation-proof tests. No mutation
was applied to the audit checkout, and no new candidate was created from this reconciliation.

**Exit:** endpoint, role/action, invariant/test, environment, and known-bad-test matrices are
published; remaining cells are explicit qualified coverage gaps, not hidden assumptions.
