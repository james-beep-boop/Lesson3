# P151-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: `app/tests` integration specs (partial)

**Scope:** Read-only review of the pasted text. I did not check it against baseline `6e75a173` or the working tree, run any tests, or read any imported code. No callers or runtime behavior were checked.

### Coverage

**Read as supplied:**
- `app/tests/int/messageReferenceMigration.int.spec.ts:1-73`
- `app/tests/int/messages.int.spec.ts:1-312`
- `app/tests/int/nullResources.int.spec.ts:1-145`

**Not assessed:**
- Imported modules: `helpers/fixtures`, `helpers/db`, `src/migrations/20261012_012355_add_message_version_labels`, `src/lib/relId`, `src/lib/rateLimit`, `src/ingest/*` (including `validateGeneratable`, `resourceLinks`), and the messages collection hooks.
- Generator/export code.
- Policy §8 onward. The excerpt ends mid-section and contains no policy on messages or the backfill migration.

### Purpose and invariants pinned by the tests

- **messages:** sender is stamped from the session; rows are readable only by sender and recipient; no update or delete path; ping only when the recipient has zero unread; ping budget and daily send cap; ping failure does not fail the create; user deletion cascades; a message's version must belong to its linked plan; roster exposes names only.
- **migration:** backfills `version_label` from `meta.substrand_name` plus semver; whole-lesson and version-less rows stay NULL; batches beyond 500 rows are fully labelled.
- **nullResources:** null ARES resource slots are stored as empty groups and exported back to null; stored rows pass `validateGeneratable`; re-ingest attaches a new version and keeps the nulls.

### Candidates

**No confirmed product defect.** The supplied files are tests; they pin behavior and cannot show that the implementation is wrong. Everything below is a lead or a test-quality note.

1. **Lead, medium-low, uncertain.** `nullResources.int.spec.ts:62-63` and `:124-127`. The fixture ingests `SUMMARY_TABLE: null` and `FINAL_EXPLANATION: null`, and the test asserts `validateGeneratable` returns `[]`. The §7 gate list does not mention these groups, yet the same excerpt says the generator dereferences groups the schema leaves optional. If the generator reads `SUMMARY_TABLE.lessons` or `FINAL_EXPLANATION` unguarded, a version the gate accepts could fail export. Not verified; the generator was not supplied.
   - Repro: export the version from `rawBundle('96.2')` and check that document generation does not throw.
   - Expected behavior: not stated in the excerpts; needs an owner decision.

2. **Lead, low, expected behavior unclear.** `nullResources.int.spec.ts:130-144`. Re-ingesting byte-identical content with no manifest returns `revised` and creates a second identical version (`docs` length 2). §7 says unchanged content is reported as "already here" or "unchanged", and that the dev CLI keeps its "atomic revision behavior". The excerpts do not say what `ingestItems` should do for identical content, so the test may be correct.
   - Repro: ingest the same `rawBundle('96.3')` twice and count versions.

3. **Test gap, low.** `messageReferenceMigration.int.spec.ts:53-55`. The title promises "supports rollback", but the test runs `down()` and then `up()` with no assertion in between. Nothing checks the state after `down()`.
   - Repro: after `down(args)`, assert that `version_label` is cleared or the column is gone.

4. **Test fragility, low.** `messages.int.spec.ts:66-76`. `pingJobsFor` applies `limit: 100` on `taskSlug` only and filters by `messageId` client-side. A backlog of more than 100 retained `messagePing` jobs could make the `toHaveLength(1)` checks fail or pass for the wrong reason. Only matters if the DB is not disposed between runs.

5. **Weak assertion, low.** `messages.int.spec.ts:108-123`. `rejects.toThrow()` has no message match, and the test never re-reads the row to confirm `readAt` and the other fields are unchanged. A rejection for an unrelated reason would still pass.

6. **Order coupling, low.** `messages.int.spec.ts:104-105`. The assertion that `subjectAdmin` and `siteAdmin` see zero messages holds only because the ping tests, which message `subjectAdmin`, run later in the file.

### Unresolved questions

- Is `ingestItems` the same path as the web upload, and does it apply the no-manifest "already here" rule?
- Does the generator tolerate null `SUMMARY_TABLE` and `FINAL_EXPLANATION`?
- Does the migration's `down()` clear labels or drop the column? The §7 "no-op down" rule covers release links, not this migration.
- The privacy decision in `messages.int.spec.ts:99-105` cites DECISIONS 2026-07-02, which was not supplied. I treated it as an intentional carve-out.
