# P049-07-generator — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Reviewed from the text supplied in the request. I made no tool calls and no edits.

- `app/src/generator/exportArtifacts.ts:1-245`: full range read
- `app/src/generator/generateForVersion.ts:1-47`: full range read
- `app/src/generator/htmlDiffCache.ts:1-240`: full range read
- `app/src/generator/htmlSectionsCache.ts:1-98`: full range read

**Not assessed:** imported helpers (`artifactCache`, `cacheCodecs` including `decodeCachedJson`/`isStringRecord`, `bestEffortArtifact`, `lib/compareGroups`, `previewBundle`, `renderVersion`, `index`, `adapter`, `payload-types`, `HtmlDiff`), all callers, and runtime behaviour. The policy excerpts were treated as context only. Authorization claims in the module headers (`exportArtifacts.ts:12-14`, `generateForVersion.ts:10-12`, `htmlSectionsCache.ts:55-58`) depend on callers and remain unreviewed.

## Purpose and invariants (as read)

- Deliverable artifacts are cached by (scope, kind, doc). The manifest is written last and is the ready sentinel. Readers require the manifest and every deliverable it lists.
- The HTML-section and compare-diff caches are keyed by immutable version ids plus render/format versions, with single-flight coalescing per key.
- Compare groups derive `changed` from source HTML and state `presence` explicitly.

## Candidates

**1. Writer and reader disagree on manifest names (lead; conditional; medium, availability).**
- Writer: `exportArtifacts.ts:134-160` does not apply `safePrefix`. Names are built at `:104-105`.
- Reader: `exportArtifacts.ts:212` requires `^[A-Za-z0-9._-]+$`. `readManifest` at `:199-219` returns null when a name fails.
- Precondition: `produceArtifacts` receives a `prefix` containing a character outside that set, such as a space, `(`, or a non-ASCII letter.
- Expected, from the module's own sentinel contract (`:9-10`, `:154`): after `produceArtifacts`, `isExportReady` is true and `loadCachedExportZip` returns the zip.
- Actual, by local reasoning: the manifest is written (`:155-158`), but `readManifest` rejects it. `isExportReady` returns false, `loadCachedExportZip` returns null, and `loadCachedDeliverable` returns cold. Each request regenerates and rewrites the same manifest.
- Focused reproduction (not run): stub `generated` with three buffers and an identity `convert`, use prefix `"Maths Term 1"`, call `produceArtifacts`, then `expect(await isExportReady(spec)).toBe(true)`. Local reasoning predicts `false`.
- Whether production callers pass sanitized prefixes is unverified.
- Same class: `readManifest` requires a `lessonSequence` entry (`:219`), but `produceArtifacts` never checks for one. If `GeneratedDocx` can omit it, the same permanent-cold result follows. Unverified.

## Ruled out (local reasoning)

- `htmlDiffCache.ts:206-224`: the unchanged fast path is guarded by `from && to`. Presence derivation matches the stated contract.
- `htmlDiffCache.ts:117-132`: the decoder checks each union arm separately. I found no path where fields from both arms satisfy the guard.
- `htmlSectionsCache.ts:77-96`: the in-flight check and set have no `await` between them. A concurrent miss can render twice if it arrives after the cache write and before `finally`. That is duplicate work with identical bytes, so it is a performance note, not a correctness defect.

## Unresolved questions

- `generateForVersion.ts:39-43` uses `depth: 0`. If `bundleToAresData` reads any relationship field, it would receive IDs rather than objects. This range cannot settle it.
- `htmlDiffCache.ts:167-172` keys documents by label in `Map`s. A duplicate label within one version would silently drop a section. Whether labels are unique depends on `docxToSections`, which is out of range.
- Confidence: candidate 1 is a confirmed writer/reader inconsistency in local reasoning. Whether it occurs in production depends on callers I have not seen.
