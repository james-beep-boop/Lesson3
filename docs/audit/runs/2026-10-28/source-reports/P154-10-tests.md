# P154-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: `app/tests/int/reingest.int.spec.ts`

**Result:** No confirmed candidates. One uncertain lead and one test-integrity gap, both low severity.

### Coverage

- **Read:** `app/tests/int/reingest.int.spec.ts:1-400`, as supplied.
- **Not assessed:** the helpers (`fixtures.js`, `db.js`), `ingestItems`/`ingestUploadItems`, `toBundle.js`, the release-ancestry migration, the combine engine and ancestry lookup, and the projection module. I did not verify any behaviour of these, and I did not run the test suite.
- **Lines past 400:** not assessed.

### Purpose and invariants (as encoded by the test)

- A re-upload matching `(subjectGrade, substrand_id)` attaches as the next major version of the existing plan, not a duplicate plan.
- The Official pointer is not moved by the plain ingest path. It moves only on a confirmed upload.
- Predecessor selection (`sourceVersion`) uses the highest surviving ingested release. Teacher patches are never predecessors.
- Lineage is the ancestor chain, and the migration preserves recorded deleted ancestors.
- Ancestry is read once, inside a transaction, and not during the read-only preview.

### Candidates

**1. Uncertain lead (low): identical content is handled differently by the two entry points**

- **Evidence:** `:181` and `:341` run `ingestItems` on content identical to the latest release and expect a new major (`2.0.0`, `3.0.0`). `:338` runs `ingestUploadItems` on identical content and expects it to be skipped.
- **Policy:** "Without a manifest, compare only with the latest ARES release's fingerprint." Identical content would then normally be "already here". The policy also says the dev-only `scripts/ingest.ts` "retains its atomic revision behavior", which may be the exemption. The excerpt does not say whether `ingestItems` is that exemption, and the file header (`:8`) says it is also the upload endpoint's core.
- **Expected:** unresolved; depends on the answer to the question below.
- **Focused reproduction:** on a fresh sub-strand, call `ingestItems(raw)` twice with identical `raw`, then assert the version count. Repeat with `ingestUploadItems` on the second call. The two results should match if the policy applies to both paths.

**2. Test-integrity gap (not a product defect): migration assertions are incomplete**

- **Evidence:** `:394` reads `releaseBefore` and never uses it. `:396-400` check only `second.sourceVersion` and the teacher's lineage. Nothing checks that the second release's snapshot content is unchanged, which the policy requires ("Metadata-only SQL leaves snapshot content, semver, authors, timestamps and Official unchanged"). The second release's own lineage is also never asserted, even though its lineage rows are deleted at `:387`.
- **Focused reproduction:** after `:396`, assert that `read(second.id)` equals `releaseBefore` apart from `sourceVersion`, and that `read(second.id).lineage` equals `[first]`.

### Checked and not flagged

- The predecessor and lineage expectations at `:281-288`, `:328-351`, and `:258` match the policy's "teacher patches are not predecessors" rule.
- The Official move appears only in the confirmed path (`:259-261`), which matches "No existing Official moves without matching confirmation."
- The ancestry-read count and transaction assertions at `:211-265` match the policy's pre-flight and in-transaction selection rules.

### Unresolved questions

1. Is `ingestItems` used only by the dev CLI, or also by the upload endpoint? The file header says both, but the upload path calls `ingestUploadItems`.
2. Should identical content from the dev CLI be "already here", or is the atomic-revision carve-out meant to cover it?
3. The header (`:3`) says re-ingest "arrives Not Official", which is Phase 4 wording. Does the later Official-on-import rule change that? This is a documentation question, not a defect.
4. The migration's `releaseBefore` assertion gap (candidate 2): was it dropped deliberately or accidentally?
