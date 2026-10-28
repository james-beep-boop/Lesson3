# P006-01-ingest

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Scope

- **Read in full:** `app/src/ingest/resourceLinks.ts:1-224`, `app/src/ingest/taxonomy.ts:1-144`, `app/src/ingest/toBundle.ts:1-54`. I used the contents supplied in the prompt and made no tool calls, so nothing was executed.
- **Not assessed:** everything else, including `lib/gradeLevels`, `extract.ts`, `validateGeneratable`, `ingest/index.ts`, `hooks/fieldSplit.ts`, the generator's `safeHttpUrl` copy, the schema, the Payload field definitions, and the tests. Callers and runtime behaviour were not checked.

## Purpose and invariants

- **`resourceLinks.ts`:** converts the ARES phase-keyed resource map to five stored rows and back. Invariants: exactly five phases, no duplicates, no unknown keys, an absent resource is an empty group or null, and non-empty records need a safe http(s) URL and typed fields.
- **`taxonomy.ts`:** classifies missing `(subject, grade)` pairs as blocked, similar, or plain offers. Invariants: no case/whitespace near-duplicates, no mapping onto an existing subject, and grades limited to the valid range.
- **`toBundle.ts`:** renames the top-level groups and converts each lesson's `resourceLinks` to rows. Invariants: inner keys are passed through verbatim.

## Candidates

**C1. Low; uncertain downstream effect.** `resourceLinks.ts:60-68`, used at `:90-92` and `:162-163`.
- **Precondition:** an uploaded resource URL contains an embedded newline or tab, or leading/trailing whitespace.
- **Expected:** rejected, or stored in normalised form.
- **Actual:** `new URL()` strips ASCII tab/newline and leading/trailing C0/space before parsing. The validator therefore accepts the value, and the raw string with the control character is what gets stored.
- **Confirmed locally:** `isSafeHttpUrl("https://exa\nmple.com/")` returns `true`.
- **Not verified:** whether the generator or DOCX output then produces a broken hyperlink. The generator copy is outside scope.
- **Repro:** `expect(isSafeHttpUrl("https://exa\nmple.com/")).toBe(false)`. This currently fails.
- **Security note:** I found no scheme bypass. The protocol is checked on the normalised form, so `"java\tscript:…"` is rejected.

**C2. Low; policy unstated.** `toBundle.ts:32-33`.
- **Precondition:** `META.titleDoc` is whitespace-only, for example `"   "`.
- **Expected:** unclear. The comment says the title falls back to the substrand name, but no trimming rule is stated.
- **Actual:** `asString` returns `"   "`, which is truthy, so the blank title is used and the fallback does not run.
- **Confirmed locally:** `rawToBundle({META:{titleDoc:"   "}}).title === "   "`.
- **Repro:** `expect(rawToBundle(raw).title).not.toBe("   ")`. Whether this is a defect depends on a policy I cannot see, so treat it as a lead only.

**C3. Uncertain lead; needs pre-flight.** `taxonomy.ts:81-112`.
- `classifyMissingTaxonomy` does not reject an empty or whitespace-only `subject`. If pre-flight also lets it through, an empty Subject could be offered for creation.
- I could not confirm this, because pre-flight is out of scope.

**Checked by reading, no defect found:**
- `editDistance` is a correct Levenshtein recurrence.
- `taxonomyKey` cannot collide, because the grade is numeric and contains no `::`.
- Near-miss blocking covers both existing subjects and spellings within the same upload.
- In `resourceLinks.ts`, `isEmptyResourceGroup` keeps `tier: 0` and `has_transcript: true` as non-empty.

No confirmed product defect in the supplied ranges.

## Unresolved questions

1. **Round-trip fidelity** (`resourceLinks.ts:188-194`). Does Payload store `''` as `''` or as `null`? If it becomes `null`, `toAresResourceLinks` changes the exact ARES shape that the comment claims to restore.
2. **Pre-flight ordering.** Does pre-flight run `validateResourceLinks` on the output of `aresResourceLinksToRows`? Does the contract-drift gate reject a raw `{}` resource (`resourceLinks.ts:79-81`), as the comment says?
3. **Grade check.** Does `isGradeLevel` reject non-integer grades such as `5.5`? The offered path depends on it (`taxonomy.ts:98`).
4. **URL agreement.** Does the generator's CommonJS `safeHttpUrl` use the same WHATWG normalisation as `resourceLinks.ts:60-68`? The comment requires the two to agree.
