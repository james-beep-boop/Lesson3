# Original Haiku-author recheck

**Verdict: Confirm, with amendments.** The narrow Low presentation claim holds. I did not execute anything, and I used no tools.

**Trace from the source (`restoreDiff.ts`)**

- `renderOf("data-match-type", "data-match-type\n", false)` takes the writable path (line 146).
- `unifiedDiff` escapes both strings, which changes nothing here since neither contains `<`, `>`, `&`, or quotes. Sol's observed engine output is `data-match-type` with no annotation span.
- Line 149 is `html.includes('data-match-type')`. That is a substring test on the output, not a check for an annotation. The literal prose matches it, so the function returns `{ kind: 'diff', html: 'data-match-type' }`.
- The fallback would have been correct. `undrawable` (lines 132–135) does not take the emptied branch because `now.trim()` is non-empty. `lineShape` gives `["data-match-type"]` for `was` and `["data-match-type", ""]` for `now` (lines 111–112), so `sameShape` is false and the result is `{ kind: 'paragraphs' }`. That matches the audit test's expectation at `restore-marker.audit.spec.ts:4`, so the test should fail on current source. Sol's observed value confirms this, but I have not run it.

**Amendments**

1. **Mechanism:** the defect is the guard's test, not the engine. Line 149 checks for a substring of the HTML, not for the presence of an annotation. Any field whose prose contains the case-sensitive substring `data-match-type` takes the diff branch whenever the engine annotates nothing.
2. **Trigger is narrow:** it only misfires for a change the engine cannot draw (the invisible paragraph and spacing cases). For a visible change, the engine emits real annotations, so the guard is correct regardless of the prose.
3. **Consequence:** the panel shows the field as an unannotated diff. It has no label and no visible change marking. That is the same empty-presentation defect the file's comments at lines 51–55 describe as already fixed, now reached through literal text. The severity stays Low: it is cosmetic, needs the exact token typed into a recovered prose field, and does not alter stored content.

**Limits**

- Nothing was executed. The `getUnifiedContent()` output is Sol's observation, which I have not reproduced.
- I did not read `@payloadcms/ui/elements/HTMLDiff/diff`, `lib/escapeHtml`, the `htmlDiffContract.spec.ts` contract, or the vitest config that would pick up the audit spec.
- "No XSS" depends on `escapeHtml` escaping `<`, `>`, `&`, and `"`, as the file's comments state. I have not verified that. Even so, the guard only chooses between the diff branch and the fallback. It does not change what gets injected. The diff branch injects the same escaped text it would inject anyway.
- "No lost stored text" applies only to `renderOf`'s output. I did not read the restore write path (`captureDiff` or restore), so I make no claim about it.
- The guard's fix direction, if the owner wants one later, is to check for an actual annotation rather than a bare substring. I did not design or verify that fix.
