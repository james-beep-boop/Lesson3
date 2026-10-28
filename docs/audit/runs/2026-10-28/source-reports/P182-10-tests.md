# P182-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Result: no confirmed candidates

I found no concrete correctness, integrity, security, or user-visible defect in the supplied ranges. The tests are consistent with their own comments and with the policy excerpts I was given. I did not run them.

## Ranges read

- `app/tests/unit/generatedSurfaces.spec.ts:1-167`: fully read.
- `app/tests/unit/generatorGrade.spec.ts:1-69`: fully read.
- `app/tests/unit/generatorUpgrade.spec.ts:1-400`: read. Line 400 cuts off mid-object, so the last `richCell` block is only partly visible.
- `app/tests/unit/generatorUpgrade.spec.ts:401-end`: **not assessed**.
- The policy excerpts were used only as context. They are not source.

## Purpose and invariants (as asserted by the tests)

- **generatedSurfaces.spec.ts**: the job-statistics global is readable only by Site Administrators and refuses all API writes. The lock collection refuses API creates and lets any signed-in user read locks. Exactly the four admin-edited collections are lockable, and `system-settings` is not. `applyGeneratedSurfacePolicy` fails closed when required collections are missing and is idempotent.
- **generatorGrade.spec.ts**: both assessment DOCX outputs print `META.grade` in the heading, and generation throws when `META.grade` is missing.
- **generatorUpgrade.spec.ts**: the student document omits exemplars and the teacher key includes them. Markdown tables render as tables, including when a link shares the field. Attribution appears in every deliverable with a fixed copyright year. Each lesson gets its own stored resource links, and null slots print the fallback wording. Lessons without `resourceLinks` are refused.

## Candidates

None meet the bar for a reportable defect.

## Test-quality observations (not product defects)

- `generatedSurfaces.spec.ts:141-143` wraps `lockRead` in `Boolean(...)`, so a truthy non-boolean return would pass. This weakens the assertion but does not show a product bug.
- `generatorUpgrade.spec.ts:315-317` assumes `DB_PATH` does not exist on the machine running the tests. A developer who has an ARES database at that path would see a false failure.
- `generatorUpgrade.spec.ts:307-310` checks a path suffix with forward slashes, so it is platform-specific.

## Unresolved questions

1. Do `siteAdminOnly`, `noApiWrites`, and `lockRead` return strict `false` for the anonymous (`null`) user? `generatedSurfaces.spec.ts:68` and `:76` use `toBe(false)`, so a `null` or `undefined` return would fail there. I did not check their definitions, which are outside the supplied ranges.
2. Does `RESOURCE_PHASE_KEYS` have exactly five keys, with `predict` first? `generatorUpgrade.spec.ts:323`, `:327`, and `:352` depend on this.
3. Does the generator emit exactly two `SUMMARY TABLE: … GRADE n` headings per document? `generatorGrade.spec.ts:54-56` depends on this.
4. Does the upgrade-spec generator use a module-level bridge with shared state? The concurrency test at `generatorUpgrade.spec.ts:333-343` only proves isolation if it does not.

Confirming questions 1–3 needs the definitions in `access/*`, `fields/phases`, `ingest/resourceLinks`, and the vendored generator, or a test run. Those were outside the supplied ranges, so I have not checked them.
