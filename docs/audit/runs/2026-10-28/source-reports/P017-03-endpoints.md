# P017-03-endpoints

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Correctness audit: `app/src/endpoints/versionEdit.ts`

**Ranges read:** `app/src/endpoints/versionEdit.ts:1-400` and `:401-487`, both supplied in full. No other file was read, and no tools were run.

**Purpose and invariants (as stated in the file):**
- `save-as-new` creates a candidate version from the caller's submitted content. It applies the field split against the source, requires an editor for the subject-grade, rejects stale bases, rejects non-generatable or unchanged content, and in one transaction creates the candidate, optionally retires a recovery draft, and optionally deletes the source. Authority is rechecked after the lock waits and before commit.
- `make-official` moves the plan's Official pointer as an admin action. It can also delete the previous Official, gated by `expectedPreviousOfficialId`. Authority is rechecked before commit.
- Unhandled exceptions roll back the transaction. Semver conflicts retry. Recovery conflicts never retry.

**Not assessed:** imported helpers, including `applyEditorFieldSplit`, `canDeleteVersionDoc`, `retire`, `refreshCaller`, `lockRows`, `comparableContent`, `DROP_KEYS`, `findReadableVersion`, `nextSemverForPlan`, `isOfficialVersion`, and the Official hooks. Any claim about their behaviour below is conditional. Nothing was run, so no runtime behaviour is confirmed.

## Candidates

**C1. Stale-consent guard in `make-official` reads the pointer without a lock. Severity: low–medium. Status: confirmed local reasoning, with the isolation level assumed.**
- Evidence: `versionEdit.ts:430-436` reads `officialVersion` with no row lock. `:441-446` compares the caller's expected id against that read. The pointer is written at `:449-456` and the previous version is deleted at `:466-472`. Any plan lock taken by the later update hook arrives after the read.
- Precondition: two admins act concurrently. Official is V1. Admin A sends `make-official?deletePrevious=true&expectedPreviousOfficialId=V1` for V2. Admin B commits make-official for V3 between A's read and A's update. This assumes Postgres READ COMMITTED, which is not verified here.
- Expected (per the comment at `:401-405`): 409 when the pointer moved after the page loaded.
- Actual, in the traced interleaving: the guard passes on the stale read. V2 becomes Official, which silently overwrites B's V3 promotion. V1 is deleted, which A consented to. The response reports `previousOfficialId: V1`, but the outgoing Official was V3. I did not trace other interleavings, so the deletion-consent property is not established beyond this one.
- Repro test: an integration test with a pause hook between `:430` and `:449`. Commit B's promotion inside the pause, then assert A receives 409 and V3 remains Official.

**C2. Stale-source guard is skipped silently if `source.updatedAt` cannot be parsed. Severity: low. Status: lead; probably unreachable.**
- Evidence: `versionEdit.ts:183-190`. The base timestamp is strictly required (400), but the source check is guarded by `Number.isFinite(srcMs) &&`, so an unparseable source timestamp bypasses the 409.
- Expected: the same strictness on both sides.
- Repro test: a handler unit test with a source whose `updatedAt` is null, asserting a rejection rather than a pass through to the no-op guard.

**C3. Structural edits by a teacher are refused after the editor has done the work. Severity: medium. Status: documented by the file itself; server-side refusal not verified here.**
- Evidence: `versionEdit.ts:110-115` says the file's own author treats this as a defect. The throw comes from `applyEditorFieldSplit` at `:195-201` and `:353-359`. Both calls are outside the transactional `try`, so no database writes occur, but the editor surface has already accepted the edit.
- Expected (policy §13 excerpt): "a role sees only the controls it can use." A teacher should not be offered Add, Duplicate or Remove.
- Actual: the request is refused by `fieldSplit.ts`, which is not in range. The exact status and message are unverified.
- Repro test: a teacher with editing access posts a bundle with one extra lesson. Assert the refusal arrives before any write and names the rejected structural change.

## Unresolved questions

1. **Combine integrity.** The server validates that `mergeParent` is readable, is in the same plan, and is editable (`:272-277`). It does not check that the submitted content derives from that parent, so `mergedFrom` records lineage that the content may not reflect. Is server-side merge verification required by policy?
2. **No-op guard with `mergeParent`.** `:224-230` ignores `mergeParent`. If a combine produces content identical to the source, it returns 400 "No changes" even though a combine was requested. Is that intended?
3. **Recovery token on no-op.** A tokened save that is refused as a no-op (`:225-230`) leaves the recovery draft unretired. Is that the intended behaviour?
4. **Delete-authority consistency.** `mayDeleteSource` (`:248-250`) and `canDeleteVersionDoc` (`:362`) are separate predicates. A stale `mayDeleteSource` can cause a whole-save 403 at `:362`. Policy §8 says a save must satisfy source-deletion permission and roll back on failure, so this matches policy. Are the two predicates guaranteed equivalent?
5. **Timestamp precision.** The base-equality check at `:188` assumes millisecond round-trip. If the database stores more precision, every save would return 409. This depends on the schema, which is not in range.
