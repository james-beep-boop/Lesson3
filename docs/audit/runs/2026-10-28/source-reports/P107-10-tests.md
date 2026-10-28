# P107-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Coverage**

I worked from the file text supplied in the request. I did not reopen the files from disk or compare the worktree to baseline `6e75a173`.

- `app/tests/e2e/editorValidation.e2e.spec.ts:1-119`: read in full
- `app/tests/e2e/insertLink.e2e.spec.ts:1-307`: read in full
- `app/tests/e2e/lessonDetails.e2e.spec.ts:1-72`: read in full
- Policy excerpts: used as reference only. The §8 excerpt ends mid-sentence ("The accurate title"), so that part is not assessed.

**Not assessed:** helpers (`../helpers/e2e`, `editRecoveryUi`, `editRecovery`, `fixtures`), `src/fields/phases`, the server save-as-new route, `hooks/fieldSplit.ts`, and all callers. Nothing was executed.

**Summary of supplied ranges**

- **editorValidation:** An incomplete sixth phase is refused by the server with path `lessons.0.framework.5.phase` and a label. The client blocks save before any request, reveals and focuses the row, and a chosen sixth phase saves a new version while the original keeps five phases.
- **insertLink:** Insert link is enabled only on the four framework columns. Links are inserted as `Label (URL)`, accepting http/https only. Labels containing web addresses or a leading `- `/`|` are refused. Late PDF-picker responses are ignored after close or insert.
- **lessonDetails:** Standard-mode provenance disclosure works for Teacher and Teacher with editing access. Author email is not rendered, and there is no horizontal overflow at 390px or 1280px.

**Candidates**

1. **Uncertain lead, Medium if unintended.** `app/tests/e2e/insertLink.e2e.spec.ts:94-107`. The title says a demo tracker address is "kept as copied", but the assertion expects `https://demo.aresedu.dev/tracker/local_launch.html?…` to become `(http://ares.local/tracker/local_launch.html?…)`. That rewrites the host and downgrades the scheme to http.
   - Expected by title: value unchanged. Actual by assertion: rewritten.
   - Locally confirmed: the title and assertion contradict each other.
   - Not established: whether the rewrite is a product defect. The supplied policy does not say how prose links should be normalized.
   - Reproduction: run this test as written. If it passes, the title is wrong or the rewrite is intended. Either way a policy decision is needed.

No other confirmed product defects in the supplied ranges. The tests match the excerpt on the phase dropdown, inline validation, server field paths and labels, the four-column prose restriction, and phase editing being Subject-Admin scope. Rejecting `javascript:` and markup in labels is consistent with the excerpt's safety intent, but I have not reviewed that independently.

**Test-harness assumptions (not product defects)**

- `editorValidation:13-16, 74, 118` assume `PHASE_VALUES.length === 5`. That module was not supplied.
- `editorValidation:78-79` clicks the row toggle. If the row is already expanded, the click collapses it.
- `lessonDetails:66-70` assumes the unversioned plan page shows a version with no author. That depends on an unseen fixture.
- Coverage gap: `editorValidation` checks the save request count but not recovery preparation or source-deletion consent, which the excerpt places before the request.

**Unresolved questions**

1. Is the demo-tracker host and scheme rewrite intended? This decides candidate 1.
2. Are the four-column Insert link restriction and URL normalization (e.g. `HTTP://ARES.LOCAL:8082` lowercased) policy or implementation choices? The excerpt does not specify link insertion.
3. Does `PHASE_VALUES` have exactly five entries, and does the lessonDetails fixture provide an author-less default version?
