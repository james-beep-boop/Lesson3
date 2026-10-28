# Migration registration and custom-logic review

Coordinator review at fixed v1.10 `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`.

## Completed boundary checks

All 39 migration TypeScript modules have exactly one import and one entry in `migrations/index.ts`.
Names are unique, ordered chronologically and match tracked filenames. All 36 schema sidecar JSON
files parse and have a matching module. The restore-stack probe's `LATEST_MIGRATION` names the last
registered migration, `20261026_195602_school_name`; `ONE_MIGRATION_BEHIND` removes its column and row.
CI's stack-up runs migrations before HTTP checks, and the separate integration database deliberately
uses schema push. Production HTTP checks therefore remain necessary: integration success alone does
not demonstrate a complete migration chain.

These checks account for all 76 files. They do **not** claim manual reading of every generated schema
or DDL line. The manifest records `boundary-checked`, not full source review, for this packet.

## Custom logic fully read

- `20261012_012355_add_message_version_labels.ts`: keyset batches of 500; shared live label formatter;
  surviving references only, guarded updates, no hooks. Keep the backfill at the migration boundary.
- `20261018_072213_combine_lineage.ts`: shared pure backfill, one plan at a time, preserve closures,
  direct metadata-only child-row replacement. Do not genericize into ordinary version writes.
- `20261019_120000_release_ancestry.ts`: transaction-owned row locks and shared ancestry audit;
  existing parents preserved, skipped history reported, unchanged closure writes avoided. The linear
  `rows.find` inside its loop is a one-off migration lead, not a measured recurring performance issue.
- `20261019_211325_worldwide_ids.ts`: IDs filled before NOT NULL constraints, null-only writes,
  explicit historical field selection, bounded Payload pagination with the migration request, shared
  release classification/fingerprint. Keep unfiltered pagination: filtering on fields being filled
  would shift subsequent pages. Do not reimplement the shared identity rules inside this migration.
- `20260706_175339_favorites_per_version.ts`: deliberate asymmetric down migration; nullable-first
  mapping, refusal for missing Official references, deduplication only when collapsing back to plans.
- `20260812_180000_dedupe_pending_export_jobs.ts`: oldest pending duplicate retained, exact partial
  uniqueness predicate. Keep migration index names and live error classification consistent.
- `20260822_011614_drop_outbound_email_flag.ts`, `20261009_082909_add_forum_enabled.ts`,
  `20261024_094011_native_lock_scope.ts`, `20261026_103510_lesson_releases_1a.ts`: fully read,
  including provenance removal, singleton insertion, transient lock cleanup and additive release fields.
- `20260624_221905_official_version_model.ts` and `index.ts` fully read as additional context.

Other TypeScript modules received boundary searches for imports, execution wrappers and data writes;
generated schema sidecars received JSON/filename checks. Additional full dependencies: pure
`lib/combine/backfill.ts` and `ingest/releaseAncestry.ts`. Partial context: live migration configuration,
CI stack/probe wiring and shared adapter utilities. No migration was changed or executed in this pass.

## Disposition

No useful cleanup PR identified. Preserve applied migration names/history and the small, explicit
backfill owners. Existing clean-install and older-schema restore CI checks provide behavioral evidence;
the static checks above do not replace them. Future native lesson-field additions still require a
clean-install run because older migrations can read present-day field configuration.
