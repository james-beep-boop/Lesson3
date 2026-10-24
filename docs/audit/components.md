# Component map — initial scaffold

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`.
Derived from the specification, project layout and tracked-file inventory. These are intended
boundaries to verify, not claims that the implementation already satisfies them. Chunk reports will
add entry points, observed guards, file/range coverage and test evidence.

| Component / owner | Purpose and dependencies | Intended invariant / evidence still needed |
|---|---|---|
| Access / C5.1, C21–C22 | Payload collection/operation/field guards and custom endpoints | Current SPEC permission matrix, including mixed scopes; independent wire evidence |
| Users/auth / C5.3, C23 | Bootstrap, verification, sessions, reset, assignment lifecycle | Identity/privacy and authorization across lifecycle changes; mail and wire proofs |
| Ingest / C5.2, C40–C41 | JSON/ZIP web input, literal-only JS CLI, contract/taxonomy validation | Never execute input; bounded parsing and transactional explicit taxonomy creation |
| Versions / C5.6, C30–C31 | Immutable snapshots, semver, Official pointer, hooks and transactions | No authenticated historical mutation; correct retention, conflict and race outcomes |
| Drafts/Combine / C5.5, C5.9, C24/C81 | Owner-only recovery, ancestry, preview, conflict overlay | No private-data disclosure or weaker save authorization; sound source/version binding |
| Generator / C5.8, C42 | Native data adapter, pristine vendor, DOCX and local office PDF | Provenance and grammar fidelity; one document-rendering path; version-scoped caches |
| Jobs / C5.7 | Bounded generation and email tasks | Durable transaction boundaries, authorization at entry, accurate delivery/retry outcomes |
| Discussion/messages/favorites / C5.5, C24 | User text, moderation, version references and preferences | Recipient/owner scope, immutable provenance, safe rendering and deletion cascades |
| Frontend/admin / C5.10–C5.12, C60–C63 | Server reads and client editing/management tools | Server authorization independent of visibility; real browser behavior and accessibility |
| Payload bundle patch / C5.13, C63/C72 | Exact-shape postinstall patch and live row-label subscriptions | Reproducible install; selector correctness, label updates and saved text under real input |
| Migrations/ops / C5.14, C70 | Production schema, install/update, backup/status, staged restore | Fresh/upgrade/restore data integrity; truthful status; deferred whole-machine acceptance |
| Tests/config/docs / C00, C11–C15, C71–C72 | Pinned runtime/dependencies, harnesses, CI and runbooks | Reproducible baseline; tests detect invariant failure; docs agree with observed behavior |

Coverage starts pending throughout. `manifest.md` is the file-level inventory; the cycle names
newer-feature assignments and hardware-dependent exclusions.

## First-wave evidence added 2026-10-24

C20 now supplies the resolved page/API/job inventory, role-specific Chromium/WebKit route and Manage
observations (`scans/surface.md`, `scans/crawl.md`). C21 separately maps intended permissions and actual
guards (`scans/rbac-expected.md`, `scans/rbac-implemented.md`). These establish entry points and trust
boundaries for access/users/versions/social/admin/jobs; they do not close manual source ranges in the
manifest or establish all operations secure. C22's bounded native-write/privacy probes are separate
from the broader C5.1/C23/C24/C30/C31 work.


C22 framework probes add native job/KV/migration gates, owner-bound preferences and two reproduced
statistics/lock candidates (`C22-framework.md`, `findings/C22-rbac.md`). The scheduler's JSON state
is an infrastructure authorization boundary; a lock modal is a workflow affordance, separate from
immutable snapshot integrity. C84's first drafts propose making generated-surface policy explicit and
keeping the native-form/immutability pair; whole-system assessment/review remains pending.
