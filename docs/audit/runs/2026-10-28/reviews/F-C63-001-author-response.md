# Original-author response — source-only

## Verdict on P030 C1: retain as Low, with the scope amended

This is from reading the source only. I have not run the test or any reproduction. Sol's real-Postgres result is the evidence for the runtime behavior.

**Trace through the provided source:**

1. **Human promotion records the actor.** `stamp` sets `officialChangedBy` to `req.user?.id` when the Official pointer changes (`app/src/fields/officialChange.ts:14-17`).
2. **Before deletion, the notice is correctly suppressed.** `officialUpdateNotice` returns `null` when `officialChangedBy != null` (`app/src/lib/aresReleasePresentation.ts:31`).
3. **FK SET NULL clears only the actor.** It runs at the database level, so no `beforeChange` hook fires. `officialChangedAt` survives, and `Date.parse` still succeeds (`aresReleasePresentation.ts:33`).
4. **After deletion the guard passes.** `officialChangedBy` is now null, so the function returns a notice whenever the current Official has a `releaseFingerprint` (`aresReleasePresentation.ts:31`). The notice then reads as a change to an ARES release, though a person made it.

The root cause is a sentinel collision. The consumer treats `officialChangedBy == null` as "system change," but FK SET NULL also produces null. The producer's docblock (`officialChange.ts:5-8`) says deletion clears the references, and it is accurate. The gap is that nothing records the assumption the consumer makes about null.

**Amended scope:**

- The notice appears only when the current Official is an ARES-release version. Teacher saves have a null `releaseFingerprint` (`aresReleasePresentation.ts:11-13`), so they are not affected.
- The release date and `changedAt` are true values (`aresReleasePresentation.ts:35-36`). `previousSemver` still comes from `officialChangedFrom`, which deletion does not touch.

**Amended claim:**

> After a recorded human actor is deleted, a plan whose current Official is an ARES-release version shows an "Official updated to the ARES release of … on …" notice for a change a person made. The date and release are correct, and the notice persists until the Official changes again.

**Why Low holds:** the wrong statement is about provenance, not about data. Nothing in the source shows that the misattribution leads anyone to take a harmful action, and the finding does not claim that it does.

**Limits of what I can confirm:**

- The renderer that displays this notice is not in the provided files. I can confirm the function produces the notice, but not that it is shown to users without the caller I haven't seen. The "user-facing" part rests on Sol's reproduction and the function's own docblock, not on a render site I can read.
- `app/tests/audit/notice-actor-deletion.ts:26` asserts the correct behavior, `notice === null` after deletion. On this source it should fail there, which is the expected red result. I haven't run it, so that is a prediction, not an observation.

**Related points outside this finding:**

- `stamp` also returns null when `req.user` is absent (`officialChange.ts:17`), so a write without a user is recorded the same way as a deleted actor. These files don't show whether any such write path exists, so I'm not claiming one.
- Erasing the actor id on deletion is a separate matter. `Users.ts:264-268` says disabling is the default precisely because deletion destroys attribution. That is by design and out of scope here.

**Suggested fix direction (not implemented):** have the `stamp` hook write a non-relational provenance marker, such as a boolean or a source enum, that FK SET NULL cannot clear. Gate `officialUpdateNotice` on that marker instead of on `officialChangedBy` nullness. This needs a schema addition and a migration. Alternatively, the finding can stay Low and be documented as a known limitation in `method-limitations.md`.
