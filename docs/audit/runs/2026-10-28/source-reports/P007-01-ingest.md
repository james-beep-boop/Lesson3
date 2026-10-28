# P007-01-ingest

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

**Coverage (supplied ranges only, read in full)**
- `app/src/ingest/uploadFiles.ts:1-313`: read in full.
- `app/src/ingest/validateGeneratable.ts:1-157`: read in full.
- Not assessed: `extractAresJson`, `classifyLessonSetEntry`, `checksumWarning`, `missingFromManifest`, `waitingMessage`, `parseLessonManifest`, `isObject`, `validateResourceLinks`, `isPhase`, `IngestError`, and all callers. I did not check how JSZip 3.10 behaves at runtime. Behavior claims below rest on reading the code and its comments.

**Purpose and invariants**
- `uploadFiles.ts` turns uploaded `.json`/`.zip` files into in-memory ingest items. It enforces per-file, per-archive, entry-count and shared expanded-byte limits. It parses the root `LESSONS.json` manifest, routes entries as lesson-plan, waiting or skipped, and reads each archive once so it can be released.
- `validateGeneratable.ts` is the pre-save completeness gate. It requires `meta`, at least one lesson, and per lesson an `slo` object, a `summaryTablePrompt` object, a valid `resourceLinks` map and at least one framework phase with a vocabulary phase. It also returns non-blocking deliverable warnings.

**Candidates**

1. **Duplicate entry names inside one archive are silently collapsed (lead, low to medium, unconfirmed).**
   - Evidence: `uploadFiles.ts:247` builds `entries` from `Object.values(zip.files)`. The comment at `:56-60` says JSZip keys entries by normalized name, so duplicates collapse. Nothing rejects or warns on that collapse, and the record count at `:224` is never compared with the surviving entries.
   - Precondition: an archive whose central directory holds two records with the same path.
   - Expected, if the policy's "duplicate files in a batch are rejected" covers in-archive duplicates: rejection or a warning.
   - Actual, per the code: one record is imported, the other is dropped without a trace, and the checksum applies only to the survivor.
   - Repro: byte-patch a ZIP so two central-directory records share `a/x.json`. Assert the upload reports a duplicate rejection. Confirm first which record JSZip keeps.

2. **Manifest and archive matching use raw names, not JSZip's normalized keys (lead, low, unconfirmed).**
   - Evidence: `uploadFiles.ts:250`, `:259` and `:265` use `unsafeOriginalName ?? name`, while `zip.files` is keyed by the normalized `name`.
   - Precondition: a manifest entry or archive path that normalizes differently, such as a `./` prefix or backslash separators.
   - Expected: a manifest-listed file is matched to its archive entry and its checksum is verified.
   - Actual: possible spurious "missing from set" warnings, or a checksum that is skipped. Both depend on JSZip normalization, which I did not verify.
   - Repro: a manifest listing `./a.json` or `d\a.json` against an archive holding that entry.

3. **Gate depth is shallower than the policy's "complete" wording (unresolved question, low).**
   - Evidence: `validateGeneratable.ts:76` and `:83` check only that `slo` and `summaryTablePrompt` are objects. `:105-114` checks only `framework[].phase`. The header at `:9-13` names `lesson.slo.purpose` and `summaryTablePrompt.observed` as dereferences, but only group presence is enforced.
   - Whether this is a defect depends on whether the generator dereferences inner fields that are absent from an empty object. That is in `vendor/lib/sections.js`, which I did not read.
   - Expected: a sub-field-level gate, if the generator crashes on missing inner fields.
   - Actual: an empty `{}` passes the gate.
   - Repro: a generatable-check test with `slo: {}` and `framework: [{phase: 'X-valid'}]`, followed by a generator run.

**Unresolved questions**
- Does JSZip keep the first or last of two same-named records? This decides whether candidate 1 drops content or drops a duplicate.
- Is the ZIP64 extra-bytes arithmetic at `uploadFiles.ts:111` and `:114` exactly JSZip's offset? Only a test against JSZip's own reader can settle this.
- Do rejected per-file bytes count against the shared expanded budget at `:145` and `:206`? The code charges them, which is conservative. Policy wording does not settle whether that is intended.
