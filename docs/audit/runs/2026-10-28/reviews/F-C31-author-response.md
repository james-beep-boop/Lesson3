# Original Sonnet-author recheck

## Verdicts

- **F1: confirm, severity Medium.** Source reading agrees with Sol's reproduction.
- **F2: amend, severity Low.** The code behavior is confirmed, but it is better framed as a SPEC-versus-implementation divergence than as a vulnerability, unless the owner says the SPEC means enforcement.

I have not run anything. This is source reading plus your reported results.

## F1: omitting `unit` drops it for a teacher with editing access

**Mechanism.** The blanket restore in step 2 iterates the submitted keys:

- `fieldSplit.ts:308-311` is `for (const key of Object.keys(d)) { if (editorTopLevelKeys.has(key)) continue; d[key] = orig[key] }`.
- A key absent from `data` is never visited, so an omitted `unit` is never restored.
- `unit` is not in `VERSION_EDITOR_KEYS` (`bundleVersion.ts:20-25`), and `versionEdit.ts:281-296` creates from the merged content.
- The comments claim the opposite: `fieldSplit.ts:14-19` and `305-307` say a new or unwired field "is reset to the original automatically".
- `lessonContent.ts:245-247` says the hook "preserves the whole `unit` group wholesale". That is true only when the key is present.

**Same class as a bug already fixed here.** `fieldSplit.ts:336-350` documents that omitting `finalExplanation` or `summaryTable` escaped both the guard and the restore. `rebuildGroup` fixed those two keys only. The generic loop kept the same hole.

**Why it is not caught.**
- `meta` and `lessons` are likely caught by `validateGeneratable`, since the 336-350 comment says a missing `lessons` is refused. Only `lessons` is confirmed; the `meta` case is unverified.
- `unit` evidently has no such gate, because the response was 200 with null content.
- The re-run at `versionEdit.ts:353-364` calls the same function on the same input, so it agrees with the first pass and cannot catch this.

**Scope limits from source.**
- By reading, `unit: null` and `unit: {tampered}` are both restored, because the key is present. Only absence escapes. Worth a control test.
- A Subject Admin omitting `unit` is within their own authority, so F1 applies only to the teacher branch.

**Why Medium.** It is a confirmed bypass of the exact boundary this hook exists to enforce, by a scoped low-privilege user, and a regression of a known class.

**Counterarguments.**
- The ordinary form submits `unit`.
- The source is immutable and the result is a non-Official working copy.
- Promotion is not automatic.
- The harm is recoverable.

**Limits.**
- Reproduction shows only `UNIT.content` going null, since the fixture seeds only that field.
- I cannot see how the generator renders a null UNIT.
- I cannot see `DROP_KEYS`, so I can't enumerate which other top-level keys share the hole. Recommend F1 be reworded as "any omitted non-editor top-level key", with `unit` as the demonstrated instance.

## F2: admins can change `outputDir`, `substrand` and `aresKeywords`

**Mechanism.**
- Subject Admins return at `fieldSplit.ts:240-248` after restoring only `META_IDENTITY_KEYS`.
- Site Admins and system calls return at `fieldSplit.ts:235`.
- The three fields are not in `META_IDENTITY_KEYS` (`fieldSplit.ts:116`), so nothing restores them.
- Your result that all three changed is consistent with this.

**Documentation that overstates.**
- `SPEC.md:307` says the whitelist "is the write-time authority, and it is secure by default". The whitelist applies only to the teacher branch.
- `fieldSplit.ts:7-8` states that Subject Admins are unrestricted apart from META identity, so the code is internally honest.
- `lessonContent.ts:166-168` says "by a teacher with editing access", which is accurate.

**SPEC "never editable": presentation or restriction?** The text supports both readings.

*Restriction:*
- The bullet is titled "never editable by anyone" (`SPEC.md:307`).
- `SPEC.md:304` carves "the no-op fields in *System*" out of the Subject Admin META grant.
- The "System (never editable)" fields, `resourceLinks` and `number`, are enforced across all roles (`fieldSplit.ts:225`).
- The META-identity precedent (`SPEC.md:305`) pairs read-only rendering with a hook restore for Subject Admins.

*Presentation:*
- The stated rationale is removing a control the system does not honour (`lessonContent.ts:150-156`).
- The mechanism is called "PRESENTATION ONLY" (`lessonContent.ts:158`) and "Hidden and read-only" (`SPEC.md:307`).
- Ingest legitimately writes these fields, so "never" cannot mean never writable.

My read is that the SPEC is internally inconsistent. I would not call it a code bug without owner confirmation. The SPEC sentence about the whitelist being the authority is wrong for admins either way. Read as enforcement, the divergence also covers Site Admin, which your finding does not mention.

**Why Low.** The actor is an in-scope admin, there is no escalation, and the SPEC itself says these edits change nothing observable.

**The July workaround.** This finding does not touch it. The gap is the hook's role fork, not the absence of field-level `access`.

## Later hooks

- Within the files you gave me, nothing restores `unit` or the three fields.
- On `payload.create`, the operation is `'create'`, so `applyEditorFieldSplit` returns at `fieldSplit.ts:222`. The only split on this path is the explicit call in `versionEdit.ts`.
- System identities are safe: `lessonPlan`, `subjectGrade`, `semver`, `sourceVersion`, `mergedFrom` and `author` are placed after `...content` at `versionEdit.ts:284-292`, and `number` is set by `numberBundleVersionRows`.
- Sol's empirical results (null `UNIT.content` persisted, three changed fields persisted) are the stronger evidence that no later hook interferes. I have not seen the full collection hook list.

## Recommendations only

**F1.**
- Restore from the stored document for every non-editor top-level key the original holds, not just the submitted ones. Do not invent empty containers where the original has none, per `fieldSplit.ts:352-357`.
- Add tests for omission, null and tampered values on each such key.
- Correct the comments at 14-19 and 305-307.

**F2.**
- Get the owner's decision on semantics first.
- If enforcement: restore the fields by row id in the admin branches, with an explicit policy for Site Admin and for duplicated or new lesson rows, and add a drift test like `metaIdentitySplit.spec.ts`.
- If presentation only: amend `SPEC.md:307` and the `fieldSplit.ts` header to say the whitelist covers teachers only.

## Not examined

- `DROP_KEYS`
- `validateGeneratable`
- `comparableContent`
- the generator's null-UNIT behavior
- the remaining collection hooks
