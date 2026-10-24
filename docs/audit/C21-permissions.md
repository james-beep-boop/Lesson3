# C21 — Expected permissions and implemented guards

## Chunk contract

- **Owner:** coordinator (Codex); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`.
- **Mandatory checks:** independently derive intended policy, map collection/field/endpoint gates,
  preserve mixed-scope and ownership conditions, and record ambiguity before classifying mismatches.
- **Artifacts:** `scans/rbac-expected.md`, `scans/rbac-implemented.md`, C20's observed read matrix,
  and subsequent data-driven C22 results.
- **Exclusions:** source guard names and passing status codes cannot define intended policy.
- **Exit:** every surface has an expected action/credential rule or explicit policy question,
  implementation is independently mapped, and C22 can execute the expanded cases without guessing.

## Progress — 2026-10-24

The policy draft has **52 action rows × nine role scenarios**, plus credential-based authentication
rules, all-collection operation coverage and field/relationship invariants. Two scopes, peer actors
and the mixed fixture are explicit; test scenarios swap A/B where required rather than confusing the
mixed actor's editing grant with pure out-of-scope administration. C20 separately records the actual
read statuses and source gates, including all 42 application custom descriptors.

Current SPEC and accepted decisions govern the expectations. The older **Who manages what** design
explicitly remains unbuilt/back burner pending a privacy amendment; its proposed teacher-facing
administrator directory is not a current entitlement or a missing-feature finding.

Two historical decisions materially sharpen the draft: DECISIONS 2026-07-03 makes messages private to
sender/recipient, explicitly without Site-Admin read, while preserving favorites' Site-Admin support
exception. DECISIONS 2026-06-23 locks down native job rows/control separately from trusted export work.
SPEC §5 supplies exact metadata/cleanup/count/discard boundaries for recovery. These refinements happen
before interpreting a differing response as a defect.

## Endpoint expectation expansion

| Custom family | Policy/action cases to expand in C22 |
|---|---|
| Upload / request editing | P21 / P07; scope, consent, taxonomy, fresh transaction and recipient privacy |
| Recovery start/capture/read/discard | P23–P25; own row AND current editing authority, source/generation/revision/schema conditions |
| Recovery metadata/cleanup/count | P26/P41; content-free administrative cleanup vs deletion-scoped counts |
| Saved export/preview/ARES export, prepare/status/email | P01 plus SPEC §9 export/recipient/rate rules; saved reads are distinct from unsaved editing |
| Unsaved preview/PDF and Combine | P22 and field invariants; readable/same-plan parents, editing authority, no writes |
| Save / Make Official | P08–P18; field split, immutable source, fresh authority, lineage and pointer/deletion preconditions |
| Account search and repair actions | P38/P39, authentication table; Site-Admin-only projection/secret and last-admin/freshness rules |
| Assignment actions | P35–P37; amended asymmetric D6a handover/vacating, generic PATCH is another path |
| Forgot/verify and native auth | Credential-flow table; token/verification/session semantics and hook/dispatcher coverage |
| Message read markers | P29/P30 and accepted sender/recipient privacy; recipient binding despite foreign IDs |
| Forum navigation/read markers/moderation | P27/P31–P34; own participation, enabled/off posture, narrow Site-Admin exceptions |
| Settings save / server time | P40/P50; password/freshness/custom save vs closed native update |
| Resource-library list/file | P46/P47; configured root, safe token and independent public-file opt-in |

**Still in progress:** expand the policy IDs into a machine-readable per-method/per-operation case
registry, map all field-selection/filter/population cases, and resolve Q01/Q02/Q04 where policy is
unclear. Internal locks, native stats and administrative assignment-read scope are not silently
declared safe or defective. Opposite-family challenge remains pending; this draft is not a reviewed
security conclusion. C22's unambiguous core checks can proceed without waiting for those questions.


## Framework follow-up

C22 now exercises native job/KV/migration gates and eight-user preference ownership. Q01/Q02 are
narrowed by real lock/UI and statistics-write candidates, with expected actions P51/P52 added explicitly
and still subject to policy challenge. Keep administrative repair/read exceptions distinct from the
reproduced baseline-Teacher effects. See `C22-framework.md` and `findings/C22-rbac.md`; no candidate
is counted as accepted, and Q04 remains unresolved.
