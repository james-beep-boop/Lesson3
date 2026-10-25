# C5.14 migrations — current evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07 source). The migration index registers
the complete ordered set of **36 hand-authored migration modules** plus `index.ts`. Generated
`*.json` schema snapshots were intentionally excluded from manual review under the catalog rule;
their provenance is the corresponding TypeScript module and Payload migration registry.

The source review sampled every non-generated module and read the custom SQL in the migrations that
change enums, move data, or remove relationships. Specific checks included:

- retired lesson-bundle tables and job enum values are deleted before enum narrowing;
- the Official-version model and semver uniqueness changes preserve the one-pointer invariant;
- AReS resource-link cutover and child-row normalization use explicit data movement and an empty-
  corpus guard before destructive rollback;
- pending export-job deduplication is idempotent;
- discussions and message/recovery migrations drop foreign keys, indexes, and columns in dependency
  order;
- Combine lineage/draft context and release ancestry are metadata/backfill changes, with the
  release-ancestry `down` deliberately a no-op because ancestry is informational;
- worldwide IDs fill existing rows before adding `NOT NULL`/unique constraints, and fingerprint
  backfill is guarded;
- native lock-scope migration deletes transient lock rows first and uses `IF EXISTS` for partially
  migrated older copies.

The migration index was checked for registration order and matching `up`/`down` exports. The
full-stack restore/upgrade drill (`scripts/test-restore-db-stack.sh`) passed **104/104** checks
(private log hash `17cee9f8f3ae48c6224e7ae91365605a8e2515b9c19bf1f08e08a0c7e461c5e6`). That drill
started from an older schema, migrated the incoming database while leaving the live database
untouched, rendered DOCX/PDF in-server, checked schema/migration counts, interrupted after the
`checked` journal step, resumed and reversed cleanly, then completed an uninterrupted restore.
All rows and rendered artifacts in the drill were synthetic.

This provides strong evidence for the hand-edited migration paths and a representative upgrade,
but it does not prove every historical backup shape or a production deployment's network/storage
behavior. No migration finding is accepted; that qualified scope remains in C83.

**Exit:** hand-edited migration source and the representative older-schema upgrade drill were
reviewed; generated snapshots were excluded by rule; 104/104 restore checks passed.
