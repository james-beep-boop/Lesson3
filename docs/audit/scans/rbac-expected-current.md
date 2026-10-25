# Current permission expectations and coverage

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. Expectations below come from current SPEC
§5, §6 and §8 and the 2026-10-24 generated-surface decisions. Status codes are implementation evidence;
the intended boundary is returned data and persisted effects. Historical matrix premises are not
silently carried forward.

Columns target scope A. The mixed actor administers A and holds editing access in B. Same-role peers
are separate fixtures for privacy/ownership checks, with the same capability expectations.

| Action | Anonymous / no verified session | Teacher | Edit A | Edit B | Admin A + Edit B | Admin B | Site admin |
|---|---|---|---|---|---|---|---|
| Read retained lessons, versions, taxonomy, names roster | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Read another user's email through native users REST | No | No | No | No | No | No | Yes |
| Filter native users by another hidden email/roles field | No | No | No | No | No | No | Yes |
| Create a plan/version directly through native REST | No | No | No | No | No | No | No |
| Modify a retained version in place | No | No | No | No | No | No | No |
| Directly delete current Official version | No | No | No | No | No | No | No |
| Save new prose version in A | No | No | Yes | No | Yes | No | Yes |
| Change duration/structure in A through new save | No | No | No | No | Yes | No | Yes |
| Change META subject/grade/substrand identity in A | No | No | No | No | No | No | Yes |
| Supply resource links, row numbering, author, UID, semver, source scope | No trusted caller-supplied override | No | No | No | No | No | No |
| Move Official pointer by saving a new candidate | No | No | No | No | No | No | No |
| Read native jobs/statistics | No | No | No | No | No | No | Yes |
| Create native jobs or write job statistics over REST | No | No | No | No | No | No | No |
| Create editing locks over REST | No | No | No | No | No | No | No |
| Create own favorite; server binds owner | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Read another person's favorite | No | No | No | No | No | No | Yes, support exception |
| GraphQL / introspection | Unreachable | Unreachable | Unreachable | Unreachable | Unreachable | Unreachable | Unreachable |

The source-version field split uses the stored target scope, including when the submitted scope is
forged to one the actor administers. Teacher prose cannot change array membership/order. Subject
administrators cannot repair META identity; Site Administrators can. System-owned resource links
remain preserved for all authenticated roles. Numbering is derived, provenance is generated/stamped,
and candidate saves preserve the original snapshot and Official pointer.

Current wire probes cover the rows above with the limitations in C22-current-native.md and
C30-current-save.md. The Site-Admin favorite-support exception and legitimately created editing-lock
takeover/refresh are not fully covered by those new probes; existing suites give complementary
evidence, not a substitute for their assigned expanded matrix.

Remaining expansion includes every other collection/custom endpoint and field, native bulk/duplicate/
restore paths, population/select/query combinations, public-library on/off, assignments and handover,
last-admin protection, sessions revoked/unverified while in flight, messages/discussions/recovery and
preferences/key-value framework surfaces. The historical D6a asymmetry remains canonical: a scoped
administrator can hand over to an existing editing-access holder and cannot remove an administrator.

Policy question retained for C21/C40: SPEC describes three stored no-op fields as never editable by
anyone, while `storedNotEdited` explicitly describes presentation-only hiding and the server whitelist
preserves them for teachers. Confirm the administrator API contract before treating their mutability
as a defect. No finding is accepted against that ambiguous premise.
