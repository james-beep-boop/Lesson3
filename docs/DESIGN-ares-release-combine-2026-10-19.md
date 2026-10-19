# ARES releases combine cleanly — implementation plan

Status: **operator approved existing `sourceVersion` and audited backfill**; implementation and
all isolated proof complete; ready for review. Separate from #409; based on fetched main `3472843`. Parent
brief: §8 of `DESIGN-modes-connectivity-network-2026-10-19.md`. No merge or deployment authorized.

## Approved release ancestry

Record the previous ingested release in the existing `sourceVersion` relationship.
Its “Based on version” label already fits; `stampVersionLineage` already follows it. A distinct
`previousRelease` would name the provenance more explicitly, but requires a relationship migration,
lineage/backfill support and exclusion from editable content equality. The predecessor must be a
same-plan ingested release, not Official or the latest teacher patch, selected without clock ordering.
Initial 1.0.0 stays a root; next majors stay Not Official and do not move Official.

Audit existing re-ingested majors and backfill only unambiguous release chains,
then recompute affected descendants' bounded lineage. Preserve content, version numbers, authors,
timestamps, Official and recorded deleted ancestors. Report ambiguous/missing history rather than
invent edges. The immutable save-as-new path has allocated patches since its introduction (`db1a8c6`);
the earlier in-place bundle bump selector predates this version model. A future bump chooser must
introduce explicit ingest provenance first. Only trusted ingest currently creates whole-major versions;
exclude authored and two-parent versions.
Backfill only consecutive surviving majors sharing a nonempty sub-strand identity; preserve existing
relationships and closures whose source was deleted, and report gaps or ambiguity. Detect cycles
before any write to a plan. Migration SQL changes metadata only; undo uses the pre-migration backup. Future-only ancestry would leave existing release forks on the old fallback. The operator
approved sourceVersion and the audited backfill before data implementation.

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

## Proof and completion

Types, lint, formatting, production build, **1,616 unit**, **316 integration**, **398 wire**
(+4 existing SMTP skips) and **122 browser** tests without retries pass on `lesson3-codex-probe`,
port 3103. The production migration runner also applies the new migration successfully. Tracked
test configuration was restored. No dependency, workflow, generator or endpoint change.

Engine cases cover each changed side with retained teacher prose, distinct updates, equal updates,
no/unaligned ancestor, matching administrator changes, incompatible protected-field requirements,
ambiguous keys and reordered lessons. Five initial cases failed on the old engine. All 43 engine
cases pass. Audit cases cover numeric ordering, missing/ambiguous history, existing relationships,
deleted-id preservation, descendant closure, caps, cycles and rerun safety.

Real re-ingest tests select the release past teacher patches, preserve unchanged-upload behavior
and Official, perform an authorized common-ancestor lookup and combine teacher prose with new
release prose/resources. The real migration is exercised against simulated legacy rows, preserves
snapshots/timestamps and deleted ancestor ids, repairs descendant closure and is safe to rerun.
The built preview endpoint also proves the teacher/new-release comparison starts from the new
release and carries the teacher's prose.

SPEC §6/§7 record the approved rules. Next: the separate Insert link tidy-up PR, then a phase 4
scope proposal before any phase 4 code. No merge or deployment authorized.
