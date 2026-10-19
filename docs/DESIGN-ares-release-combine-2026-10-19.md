# ARES releases combine cleanly — implementation plan

Status: **operator approved existing `sourceVersion` and audited backfill**; implementation and
full-stack proof in progress. Separate from #409; based on fetched main `3472843`. Parent
brief: §8 of `DESIGN-modes-connectivity-network-2026-10-19.md`. No merge or deployment authorized.

## Approved release ancestry

Record the previous ingested release in the existing `sourceVersion` relationship.
Its “Based on version” label already fits; `stampVersionLineage` already follows it. A distinct
`previousRelease` would name the provenance more explicitly, but requires a relationship migration,
lineage/backfill support and exclusion from editable content equality. The predecessor must be a
same-plan ingested release, not Official or the latest teacher patch, selected without clock ordering.
Initial 1.0.0 stays a root; next majors stay Not Official and do not move Official.

Audit existing re-ingested majors and backfilling only unambiguous release chains,
then recomputing affected descendants' bounded lineage. Preserve content, version numbers, authors,
timestamps, Official and recorded deleted ancestors. Report ambiguous/missing history rather than
invent edges. Only trusted ingest creates whole-major versions; exclude authored and two-parent versions.
Backfill only consecutive surviving majors sharing a nonempty sub-strand identity; preserve existing
relationships and closures whose source was deleted, and report gaps or ambiguity. Detect cycles
before any write to a plan. Migration SQL changes metadata only; undo uses the pre-migration backup. Future-only ancestry avoids that
migration but leaves existing release forks on the old fallback. The operator approved sourceVersion and the audited backfill before data implementation.

## Engine work independent of that choice

Compare administrator fields separately from resource maps. With a usable ancestor, select the
sole changed resource side; distinct resource changes on both sides refuse, identical maps remain
safe, and unequal maps without an ancestor still refuse. Choose one starting parent satisfying
both administrator and system choices; incompatible choices refuse rather than letting a teacher
write protected fields. No new refusal wording.

Resource maps also participate in current lesson correspondence. Keep that strict match available.
For resource updates with a usable ancestor, allow the remaining upload keys (`substrand` and
`aresKeywords`) only when unique and unchanged in order. Do not use titles, lesson numbering or
positions alone. Repeated keys, reorders, renamed phases and ambiguous arrays stay refused; stable
row identity remains deferred. An unaligned ancestor provides no permission to merge resources.

## Tests and completion

Engine unit cases cover each changed side and retained teacher prose, two different updates, equal
updates, no/unaligned ancestor, matching administrator changes, incompatible protected-field
choices, ambiguous keys and reordered lessons. Five initial new cases fail on the old engine; all 43 current
engine cases pass with the prepared change. Types, lint, formatting and all 1,612 unit tests pass;
full stack and re-ingest proof are pending completion of the data portion.

Data proof: integration or wire coverage drives real re-ingest, checks the release
predecessor and unchanged Official, then combines a teacher edit with the next release through a
real common ancestor. Exercise the migration/classifier, descendant closure,
deleted-history preservation, caps, ambiguity and rerun safety. SPEC §7 records the approved ancestry rule;
§6 describes the prepared engine rule. Complete types/lint/format/build, unit, integration, wire
(including new preview behavior) and browser checks on lesson3-codex-probe, port 3103, before a ready
PR. The metadata-only migration is registered; final proof is pending. Then the separate Insert link tidy-up
PR; then phase 4 scope proposal before code.
