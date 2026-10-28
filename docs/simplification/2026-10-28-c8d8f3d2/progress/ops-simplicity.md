# SIMPLICITY review — runtime operations and app scripts

Baseline: immutable v1.10 snapshot `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`; review is read-only. No live operations or tests executed.

## Packet operations-01

### Result

No concrete simplification candidate found. The backup script's state machine and per-destination subprocesses are justified by independent outcomes, failure recording, lock ownership, and destination verification. Upgrade/migration record logic is necessarily separate from current record writing. Dev/deploy shell paths preserve distinct local-vs-operator environment and rebuild/transaction constraints; no helper consolidation appears to reduce maintenance without erasing those boundaries.

### Full assigned-file reads

- `scripts/backup-db.sh`
- `scripts/build-local-deploy-bundle.sh`
- `scripts/create-env.sh`
- `scripts/deploy.sh`
- `scripts/dev-seed.sh`
- `scripts/dev-server.sh`
- `scripts/heartbeat.sh`
- `scripts/in-deps.sh`
- `scripts/lib.sh`
- `scripts/lib/backup-password.sh`
- `scripts/lib/dev-env.sh`
- `scripts/lib/release-images.sh`
- `scripts/lib/restore-probe-tools.Dockerfile`
- `scripts/lib/setup-school-backups-probe.mjs`
- `scripts/merge-release-images.sh`
- `scripts/prune-db.sh`
- `scripts/publish-release-bundle.sh`

### Context reads

- `scripts/lib/backup-common.sh` — sourced backup configuration/JSON helpers.
- `scripts/lib/backup-destinations.sh` — sourced destination checks and write guards.

No partial assigned files; packet complete.

### Deliberate complexity retained

- Keep one worker/record per backup destination and distinguish skipped disconnected USB, actual destination failures, and partial success. A flattened result would change independent backup outcomes and heartbeat behavior.
- Keep backup record migration separate from new-format serialization; it upgrades historical records without replacing established success/history fields.
- Keep both dev environment and ops preludes: they deliberately differ in cwd, PATH, and environment handling.
- Keep `in-deps.sh`'s argument parser and file-only mounts. Its flags-vs-command distinction and repo-relative paths support current call patterns and guard the workspace boundary.
- Keep restart/resume setup state and recovery-probe checkpoints; simplifying those paths risks journal resumption and operator recovery semantics.

### Next

Proceed to `operations-02` and checkpoint it before continuing.

## Packet operations-02

### Result

No concrete simplification candidate found. The restore state machine is repetitive in places, but each branch corresponds to a persisted journal state, separate operator intent (complete vs reverse/undo), or uncertainty about a committed database rename. Collapsing these transitions would increase recovery ambiguity. The harnesses retain deliberately independent power-cut, partial-outcome, and filesystem/destination contract cases; no setup appears redundant enough to remove.

### Full assigned-file reads

- `scripts/restore-db.sh`
- `scripts/setup-school-backups.sh`
- `scripts/test-backup-status.sh`
- `scripts/test-deploy-sidecar.sh`
- `scripts/test-local-deploy-bundle.sh`
- `scripts/test-merge-release-images.sh`

### Context reads

- `scripts/lib/backup-common.sh`, `scripts/lib/backup-destinations.sh`, `scripts/lib/backup-password.sh`, `scripts/lib.sh` — setup/restore helper dependencies.
- `scripts/lib/setup-school-backups-probe.mjs` — full harness source read in packet operations-01; it is the real-stack/power-cut setup probe context.
- `scripts/build-local-deploy-bundle.sh`, `scripts/deploy.sh`, `scripts/lib/release-images.sh` — harness targets read in packet operations-01.

No partial assigned files; packet complete. No execution performed.

### Deliberate complexity retained

- Keep the restore journal's explicit state machine, append-only event log, catalog-based swap detection, and distinct forward/undo/confirm/discard transitions. They recover differently depending on whether the swap committed and whether the operator approved.
- Keep setup checkpoints and locked-key staging/copy/resume behavior. Repeated destination and key checks guard distinct retry stages; no line-only factoring benefit is clear.
- Keep path parity, restore, and backup harnesses' separate simulated destinations and failure points. Their generated stubs expose the exact branch tested and avoid touching the live stack.
- Keep exact original/ciphertext, before/after database, and no-overwrite assertions in harnesses; these ensure recovery paths preserve the old database and restore artifact fidelity.

### Next

Proceed to `operations-03`; checkpoint before app-scripts packets.

## Packet operations-03

### Result

No concrete simplification candidate found. The real-stack restore harness repeats checks across persisted interruption points, forward/undo recovery, cache repair, and startup failure; those assert separate recovery contracts and are not disposable duplicate assertions. The vendor sync helper deliberately validates revisions before replacement, checks byte copies, and enforces the sole attribution deviation. The vendor harness independently tests same-revision and split-revision operation plus pre-mutation failure behavior.

### Full assigned-file reads

- `scripts/test-online-update.sh`
- `scripts/test-publish-release-bundle.sh`
- `scripts/test-restore-db-stack.sh`
- `scripts/test-restore-db.sh`
- `scripts/test-vendor-generator.sh`
- `scripts/vendor-generator.sh`
- `scripts/verify-release-bundle-images.sh`

### Context reads

- `scripts/lib/release-images.sh` — sourced by release bundle image verification; full read in operations-01.
- `scripts/lib/setup-school-backups-probe.mjs`, `scripts/restore-db.sh`, `scripts/setup-school-backups.sh`, `scripts/lib.sh` — stack harness target and setup/recovery context fully read in prior packets.

All assigned files fully read; no commands/tests executed. Packet complete.

### Deliberate complexity retained

- Retain stack harness scenario-specific checks for held writers, atomic swap, external interruptions, cache deletion faults, typed confirmations, undo, and startup failure. They validate different durable states and operator choices.
- Retain separate script validation for vendor source/config revisions and byte fidelity; generator output is fidelity-gated and the only sanctioned source deviation is fixed attribution year.
- Retain bundle image parsing and digest/platform checks as separate conditions; the published bundle must carry the requested version and resolve to its immutable dual-architecture image pins.

### Next

Proceed to app-scripts-01; checkpoint before app-scripts-02.

## Packet app-scripts-01

### Result

No concrete simplification candidate found. The apparently repeated fixture setup across adapter/fidelity/corpus gates serves different proof boundaries: selected-strand DOCX fidelity, Payload row-ID adapter fidelity, broad whole-corpus render/group checks, and replacement corpus contract/resource-link roundtrip. `docxDiff`'s package-level and semantic comparisons measure distinct output properties. DB bootstrapping scripts are separated from importable pure helpers because they execute at module load; this keeps tests able to reach the real transform/write logic. No duplicate logic found whose extraction would reduce upkeep without widening coupling or weakening fidelity/guard checks.

### Full assigned-file reads

- `app/scripts/adapter-fidelity.ts`
- `app/scripts/bench-typing.mjs`
- `app/scripts/check-approuter.mjs`
- `app/scripts/clear-editor-collapse-prefs.ts`
- `app/scripts/contract-check.ts`
- `app/scripts/contract-drift.ts`
- `app/scripts/corpus-check.ts`
- `app/scripts/corpus-resource-check.ts`
- `app/scripts/fidelity-spike.ts`
- `app/scripts/import-lessons.ts`
- `app/scripts/ingest-extract-check.ts`
- `app/scripts/ingest.ts`
- `app/scripts/lib/docxDiff.ts`
- `app/scripts/lib/fidelityFixture.ts`
- `app/scripts/lib/localDbGuard.ts`
- `app/scripts/lib/payloadRowIds.ts`
- `app/scripts/lib/preferences.ts`
- `app/scripts/lib/stripCollapsed.ts`
- `app/scripts/login-client.mjs`
- `app/scripts/patch-payload-ui.mjs`
- `app/scripts/recover-site-admin.ts`
- `app/scripts/reset-installation-id.ts`

### Context reads

- `app/src/generator/adapter`, `index`, `previewBundle`, `proseLinks`; `app/src/ingest/contract`, `extract`, `resourceLinks`, `toBundle`, `validateGeneratable`; `app/src/lib/compareGroups` — script proof boundaries and imported behavior.
- `app/src/payload-types` — compile-time stored bundle shape used by fidelity gates.
- `app/.` package config not read; no call-site audit required beyond script entry points and documented invocations.

All assigned source files fully read; imported implementation reads are context only. No scripts/tests/live actions run. Packet complete.

### Deliberate complexity retained

- Keep separate fidelity proofs and byte/content/package checks. They assert distinct upstream equivalence conditions and are bounded by the selected fixture contract.
- Keep `patch-payload-ui`'s exact occurrence/state checks and partial-patch refusal; minified vendor substitutions must fail closed on version drift.
- Keep `clear-editor-collapse-prefs` split into importable transform/write helpers and module-scope operator script; it preserves unrelated preference state and uses dry-run by default.
- Keep `localDbGuard` isolated from the side-effectful seed entrypoint; URI parsing and loopback variants are covered by the associated spec.
- Keep the import CLI distinct from lower-level `ingestPaths`: it handles confirmation, argv, Payload lifecycle, and exit semantics.

### Next

Proceed to app-scripts-02 and checkpoint final coverage.

## Packet app-scripts-02

### Result

One concrete, behavior-preserving reduction: `app/scripts/verify-stage2-export.ts:53-57` (`run`, DOCX/PDF loop) calls `generateForVersion(payload, officialId)` once for each `kind`, although it generates the same immutable version into the same DOCX buffers twice and `produceArtifacts` only varies conversion/cache kind. Generate once before the loop and pass that snapshot to both `produceArtifacts` calls. This avoids repeating the expensive DOCX generation while preserving independent DOCX/PDF conversion, cache readiness and ZIP checks. `generateForVersion` delegates to `generateFromVersionSnapshot` and reads a version by ID; versions are immutable snapshots. `produceArtifacts` accepts generated DOCX separately from `spec.kind` and only the PDF branch calls the converter. No other concrete candidate found.

### Full assigned-file reads

- `app/scripts/restore-check.ts`
- `app/scripts/roundtrip-regression.ts`
- `app/scripts/seed-local-dev.ts`
- `app/scripts/seed-users.ts`
- `app/scripts/set-school-name.ts`
- `app/scripts/verify-edit-recovery-cascade.ts`
- `app/scripts/verify-rbac.ts`
- `app/scripts/verify-stage2-export.ts`
- `app/scripts/verify-stage2-reads.ts`
- `app/scripts/verify-stage2b-preview.ts`

### Context reads

- `app/src/generator/generateForVersion.ts` — verified ID helper resolves the immutable snapshot and generates it.
- `app/src/generator/exportArtifacts.ts` (`produceArtifacts`) — verified both artifact kinds take the same generated DOCX shape; only PDF conversion differs.
- `app/src/lib/relId.ts`, `app/src/lib/stripIds.ts`, `app/src/hooks/bundleVersion.ts`, `app/src/access/index.ts` — relevant helper contracts for the assigned scripts.
- `app/tests/helpers/fixtures.ts`, `app/src/lib/offlineAdminRecovery.ts`, `app/src/lib/identity/installationId.ts`, `app/src/lib/schoolName.ts`, `app/src/lib/setSchoolName.ts`, `app/src/lib/txDb.ts` — imported API/context as needed; these are not assigned files.

All assigned source files fully read; no tests, scripts, or live actions executed. Packet complete; no unfinished assigned files.

### Deliberate complexity retained / rejected reductions

- Retain roundtrip regression's cleanup bookkeeping and clearing Official pointer before reverse-order deletion: version immutability protects the official version and created subject/taxonomy records may pre-exist.
- Retain the recovery cascade probe's separate read-only schema checks and opt-in seeded write drill; merely observing query success cannot prove that a matching capture is deleted by Payload hooks.
- Retain separate seed tools: local browser seed owns fixed known-password accounts and one plan behind a local-only database guard; operator `seed-users` uses env-provided/random passwords and skips existing identities.
- Retain distinct stage-2 export/read/preview scripts; they exercise independent system contracts, not redundant wrappers around one endpoint.
- Do not consolidate similar fixture/role setup helpers across seed and verification tools absent common ownership/lifecycle. The local seed deliberately imports test fixture creation behavior; the operator scripts have different trust and cleanup semantics.

### Verification

No tests/scripts executed by assignment. The candidate's behavior preservation is established from source signatures: one immutable DOCX result is reusable for both `ArtifactSpec.kind` values, and `produceArtifacts` performs PDF conversion only for the PDF spec. If implemented, verify the manual stage-2 export probe still reports separate ready non-empty DOCX and PDF ZIPs.
