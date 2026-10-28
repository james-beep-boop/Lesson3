# P050-07-generator — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read (supplied ranges only):** `app/src/generator/index.ts:1-148`, `app/src/generator/previewBundle.ts:1-71`, `app/src/generator/proseLinks.ts:1-279`, `app/src/generator/renderVersion.ts:1-28`.
- **Not assessed:** everything else, including `vendor/lib/build_docs.js`, `lib/proseLinkTokens`, `lib/sanitizeHtml`, `adapter.ts`, all callers, tests, and the policy excerpts (treated as context, not source).
- **Baseline:** I did not verify that the worktree matches `6e75a173`. No tool calls were allowed.
- **Caller behaviour:** not checked. Findings below are local reasoning only.

## Purpose and invariants (as stated in the files)

- `index.ts`: wraps the pinned CJS generator to return in-memory DOCX Buffers; per-deliverable builders are keyed by `GeneratedDocx`.
- `proseLinks.ts`: only strings containing `(http(s)://…)` change shape. Table-capable fields are never linkified, and `lessonSequenceProseHyperlinkTargets` must mirror the linkified fields (comment, lines 77–78, 190–196).
- `previewBundle.ts`: HTML-only preview derived from generator output, sanitized at one seam.
- `renderVersion.ts`: cache-identity constant (currently 10).

## Candidates

**C1 — Unvalidated deliverable tag can hit inherited object members (lead; severity low–medium, caller-dependent)**
- Evidence: `index.ts:127-147`. `DELIVERABLE_BUILDERS[tag]` is a bracket lookup with no own-key check. The `keyof` type is compile-time only.
- Precondition: `tag` reaches `generateDeliverableDocx` from untrusted input without a caller-side allowlist (caller unseen).
- Expected: a non-deliverable tag returns `null` or rejects.
- Actual (local reasoning): `'toString'` returns `Object.prototype.toString(data)`, a string, which `await` passes through as a "Buffer". `'constructor'` returns a non-Promise object. `'__proto__'` throws synchronously, because `Object.prototype` is not callable.
- Test: `expect(await generateDeliverableDocx(fixture, 'toString' as never)).toBeNull()`, and separately `expect(() => generateDeliverableDocx(fixture, '__proto__' as never))` not throwing synchronously.

**C2 — `linkifyKeys` turns absent or non-object containers into objects (lead; severity low, generator effect unverified)**
- Evidence: `proseLinks.ts:124-133`, used at lines 227, 231, 235, 266, 274. `record()` returns `{}` for non-objects, and `linkifyKeys` then writes every listed key, so the result has own keys set to `undefined`.
- Precondition: a lesson's `slo`, a framework phase, `summaryTablePrompt`, a `SUMMARY_TABLE.lessons[]` entry, or `UNIT` is absent, `null` or non-object.
- Expected: per the file's stated invariant (lines 77–78), only linkable strings change shape, so the absent value should stay absent.
- Actual: `withParenthesizedProseLinks({META:{}, UNIT:{}, LESSONS:[{}]}).LESSONS[0].slo` yields `{purpose: undefined, …}` instead of `undefined`.
- Whether DOCX output changes depends on `build_docs.js`, which was not read. Upstream checks such as `if (lesson.slo)` would be affected.
- Test: assert `LESSONS[0].slo` and `UNIT` stay `undefined` when absent.

**C3 — Hyperlink-target walk and linkify walk differ on non-array `LESSONS` (lead; severity low)**
- Evidence: `proseLinks.ts:199` uses `for (const value of data.LESSONS)`, which throws on non-arrays. `withParenthesizedProseLinks` (line 222) tolerates them.
- Precondition: `LESSONS` is not an array. Whether this can happen depends on upstream validation, which was not read.
- Expected: the fidelity expectation list is derived without throwing, or the two walks agree.
- Actual: the target walk throws where the linkify walk passes the value through.
- Parity also depends on `hasParenthesizedUrl` agreeing with tokenizer `link` tokens in `proseLinkTokens` (not supplied). That is unresolved.

**Not defects (documented carve-outs):** titles not linkified (lines 216–220); table-capable fields not linkified (lines 109–117); `ATTRIBUTION_YAML ??=` and its cwd dependence (lines 14–29).

**Unreviewed security claims:** `previewBundle.ts:10-13` says the preview "carries no executable markup" because mammoth escapes text and `sanitizePreviewHtml` runs. Neither `mammoth` output nor `lib/sanitizeHtml` was supplied, and hyperlink `href` values come from the unseen tokenizer. This claim remains unreviewed until independent review.

## Unresolved questions

1. Does the export or preview caller validate `tag` against the deliverable set before C1?
2. Does `build_docs.js` treat absent `slo`/`UNIT` differently from `{}` (C2)?
3. Do `hasParenthesizedUrl` and the tokenizer agree on every input (C3)?
4. Is `LESSONS` guaranteed to be an array before these functions run (C3)?
5. Does the preview endpoint enforce READ access before calling `renderBundlePreview`, as its comment says?
