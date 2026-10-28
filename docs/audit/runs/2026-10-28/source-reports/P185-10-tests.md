# P185-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Audit: correctness, supplied ranges only

**Coverage**
- Read: `app/tests/unit/guideParity.spec.ts:1-415` and `app/tests/unit/htmlDiffCacheWiring.spec.ts:1-167`, both as supplied inline.
- Not assessed: `USER_GUIDE.md`, `app/src/app/(frontend)/guide/page.tsx`, `htmlDiffCache.ts`, `artifactCache.ts`, `htmlSectionsCache.ts`, and every source file the policy excerpts describe. The policy excerpts were used as context only, not checked against code.
- I ran no tests and checked no callers or runtime behaviour. The findings below come from reading the test text.

**Purpose and invariants**
- `guideParity.spec.ts`: every pinned load-bearing claim must appear, after flattening, in both the guide markdown and the `/guide` page. The page must use no HTML entities except `&amp;`. Neither surface may publish an incomplete restore command. Both organisations' donation links must be present. Retired phrases must be absent.
- `htmlDiffCacheWiring.spec.ts`: cache read and write faults must not break the diff and must be reported through `warn`. Misses and hits must behave as specified. Format-1 and format-2 entries must be treated as misses.

**Candidates**

1. **Low, confirmed by regex reading.** `guideParity.spec.ts:360` uses `/AGE_IDENTITY=.*restore-db\.sh/`. It does not match if the two tokens are on different lines (`.` excludes newlines, no `s` flag) or if `restore-db.sh` comes before `AGE_IDENTITY=`. Expected: the guard fails on an incomplete command in either shape. Actual: it passes. Whether either shape exists in the guide files is unverified.
   - Repro: assert `/AGE_IDENTITY=.*restore-db\.sh/` matches `"AGE_IDENTITY=k \\\n scripts/restore-db.sh"` and `"scripts/restore-db.sh --x AGE_IDENTITY=k"`. The second and first should both be flagged.

2. **Low, confirmed by regex reading.** `guideParity.spec.ts:387` uses `/&[a-zA-Z]+;/g`, which misses numeric and hex character references such as `&#8217;` and `&#x2019;`. The header at lines 370–384 says the toolchain defect fires for any entity inside a text run, so these bypass the guard while still triggering the defect. Whether the page contains one is unverified because the page was not supplied.
   - Repro: a page fixture containing `Hello&#8217;s` and `Hello&#x2019;s` should fail; with the current regex it passes.

3. **Low, test weakness.** `htmlDiffCacheWiring.spec.ts:149` and `:165` use `out.every(...)`, which is vacuously true for `[]`. The format-2 test (`:152-166`) therefore passes on empty output as long as the render mock was called. Expected: the test fails if the cache path returns no areas. Actual: it does not.
   - Fix to pin: add `expect(out.length).toBeGreaterThan(0)` before the `every` checks.

4. **Uncertain lead.** `htmlDiffCacheWiring.spec.ts:130-132` asserts `getArtifact` was called with exactly one argument, a key containing `::f<N>::`. If the real call passes an extra argument (options, bucket) or a differently shaped key, this fails even when the format version is correct. `htmlDiffCache.ts` was not supplied, so this is unverified.

5. **Uncertain lead.** `htmlDiffCacheWiring.spec.ts:91-98` checks `warn` immediately after `await diffVersionGroupsCached`. If the implementation fires `putArtifact` without awaiting it, the warning may not have happened yet and the test could fail intermittently. Unverified without the implementation.

6. **Low, possible false failures.** `guideParity.spec.ts:58-69` strips `<…>` runs, which can swallow prose that uses angle brackets. It also does not remove Markdown list or blockquote prefixes (`- `, `> `), so a claim wrapped across a list line would fail even when the wording is correct. Both only matter if the source contains such text; unverified.

**Policy excerpts versus guide claims**
I found no contradiction between the excerpts and the pinned claims: approve-on-no-email, Official as trust marker rather than access boundary, handover and removal rules, and the Site-administrator-only email change all line up. Nothing here is a confirmed product defect.

**Unresolved questions**
- Do `USER_GUIDE.md` or the `/guide` page contain a multi-line or reordered restore command, or any numeric entity? Either answer would settle candidates 1 and 2.
- Does `diffVersionGroupsCached` call `getArtifact` with a single argument? (Candidate 4.)
- Does the write path `await putArtifact`? (Candidate 5.)
- Do any claim strings with curly quotes (`’`) match the source's typography, or is there a straight-quote variant that would silently fail?
