# Architecture and simplification assessment — working proposals

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. C84 is **in progress**. This file separates
improvement/keep proposals from defect candidates; none has completed opposite-family review or
entered an accepted implementation roadmap. No product refactor has been made.

## Chunk contract

- **Owner:** coordinator (Codex).
- **Required scope:** major boundaries, responsibility ownership, repeated authorization/validation/
  transaction logic, dependency direction, client lifecycle/state, cache/queue failures and testability.
  Each proposal needs code/evidence, alternatives, tradeoffs, preserved invariants, migration risk,
  PR-sized scope, validation and review status. Record justified keep decisions too.
- **Current evidence:** C20/C21 surface/guard maps; C22 native/API/browser probes; installed Payload
  3.91.0 configuration/scheduling/lock/preference source; version immutability code and existing tests.
- **Coverage limit:** this opening pass does not replace the 44 source units, C12/C13/C72 or C81's
  vertical flows. Whole-system architecture conclusions remain pending those inputs.
- **Exit:** all major boundaries have improve/keep/defer outcomes supported by evidence, required
  challenge/author responses, and an ordered implementation roadmap; unreviewed work stays labelled.

## I-C84-001 — Make generated framework permissions an explicit application boundary

**Disposition:** improve, draft/unreviewed. Security/integrity: full review cycle and author response
required. Related candidate: F-C22-001; native-lock lead/candidate must retain its own impact assessment.

**Current code and cost.** `payload.config.ts` explicitly locks down the native jobs collection and
run/queue/cancel predicates. Payload sanitization subsequently adds framework state, including the
`payload-jobs-stats` global and lock/preference collections. The source's application collection/global
list is therefore smaller than the actual API boundary. C20 resolved 16 collections/two globals;
C22 reproduced a Teacher write to system statistics despite the existing job-row lockdown. A review
that reads only application declarations can miss a framework addition after an upgrade.

**Before → after.** Keep feature policy in its existing access/hooks modules. Add a small, named,
pure configuration boundary for the framework-generated state, applied after configuration resolution
and before application initialization. Each known infrastructure surface has an explicit decision
(system-only writes, own-user state, or target-editing authority), and a compact executable contract
exercises real identities, foreign rows and permitted system/UI controls. A new generated surface or
changed default should produce a CI review signal rather than silently inheriting authority.

**Alternatives.** A minimal patch that closes only statistics updates is the lowest-risk immediate
remediation if F-C22-001 is accepted. Retaining separate inline decisions is reasonable while the
framework set stays small, but still needs an effective-configuration/wire contract. A generic policy
engine that invents permissions from slug patterns would add abstraction and hide row-level rules;
do not build that. Keep explicit predicates and a short table of expected surfaces.

**Supported seam / uncertainty.** Installed `payload/dist/config/build.js` returns sanitized config;
the scheduling global is added by `config/sanitize.js`. The installed job configuration offers a
collection override but no equivalent statistics-global override in the inspected path. An explicit
post-resolution transform is a plausible seam; verify its consumption by both runtime/codegen/build
before adopting it. Do not mutate permissions late in `onInit` and assume all compiled consumers
share that object. The exact production fix has not been implemented or validated by this audit.

**Benefit and tradeoffs.** This gives framework state one visible review boundary and catches the
class of omission actually observed, without replacing Payload access control or duplicating feature
policy. It adds a framework-coupled contract that must be checked on upgrades. Native lock lifecycle
and key-based preferences have different semantics; grouping them for review does not mean assigning
them the same access predicate.

**Invariants / migration risk.** Preserve native content, immutable versions, caller-scoped feature
authorization, scheduled 30-day expiry, background job writes, permitted document takeover and private
preferences. Framework system writes often use the database directly; a safe API restriction must
leave that path working. No schema migration should be needed for a permission-only change, but
runtime/codegen parity and a real scheduled-task test must prove that assumption.

**PR-sized sequence / validation.** First remediate and wire-test the accepted statistics issue in a
small change. Then add the effective-surface contract with owner/foreign-row/system positive controls.
Handle lock ownership/target scope in its own reviewed change if its candidate is accepted. Required
tests include red-before/green-after HTTP repros, real scheduler enqueue/run, browser editing/takeover,
preference isolation, types/lint, build and the relevant existing suites. Do not widen into a general
authorization rewrite. No measured performance benefit is claimed.

## I-C84-002 — Keep the paired native-form grant and immutable-write rejection

**Disposition:** keep, draft/unreviewed; security/integrity challenge required. This is a justified
keep proposal, not a recommendation to delete code because two predicates look inconsistent.

**Current code and reason.** `access/versionImmutability.ts` deliberately pairs
`versionUpdateGrantForFormRenderOnly` with `enforceVersionImmutable`; the collection wires them at
`LessonBundleVersions.ts:89` and `:104`. The form needs a scoped update grant to remain typeable, while
saved content is persisted only by save-as-new. The hook rejects authenticated in-place updates.
Existing unit wiring tests, integration behavior and C22's bounded wire/state evidence cover different
parts of this boundary; some native validation failures occur before the hook and must stay qualified.

**Alternatives and costs.** Setting native `update` to false and deleting the hook simplifies the
permission diagram but, by the project's documented Payload form contract, makes the editing form
read-only. Replacing that form with an application-owned editor could remove the paired grant, but
would require another native-content serializer/validator, array/row identity handling, recovery and
field-visibility lifecycle, plus typing/accessibility/fidelity validation. That larger migration has
not demonstrated a benefit sufficient to justify its risk.

**Recommendation / scope.** Keep the colocated, clearly named pair and its independent wiring and
real-network guards. Any future simplification must preserve editable authorized forms, immutable
surviving snapshots, field-split/save-as-new behavior and trusted migrations. A small accepted test-gap
change may strengthen valid-content guard coverage; it should not become an editor rewrite. The full
write-path/race sweep in C30/C31 remains necessary. No production refactor or new product decision.

## Remaining architectural work

Review ingest transaction/taxonomy ownership, generator/adapter/vendor boundaries, cache/queue failure
semantics, recovery/Combine lifecycle coupling, client state duplication, operations/configuration and
test-suite quality using their source units and vertical flows. Repeated upfront authorization and
post-lock reauthorization are not interchangeable merely because they call the same predicate.
Do not count these two opening proposals as a complete architecture audit.
