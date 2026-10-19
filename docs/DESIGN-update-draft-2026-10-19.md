# Update your draft — deferred design

**Status: deferred until teacher use justifies it. Not approved for implementation.**

Operator reaffirmed this decision on 2026-10-19 and closed #412 without merging. Keep Save →
Combine; its small hint is widened for the newer ARES-release case. The unapproved
[phase 4 scope](DESIGN-phase4-scope-2026-10-19.md) is preserved as deferred too.

This preserves the direct-update proposal discussed on 2026-10-18. The filename follows the
operator's requested 2026-10-19 design date. Revisit when teachers frequently combine work from
older drafts and the intermediate numbered versions cause confusion. Until then, use Save as
new version followed by Combine versions. Versions are immutable: a draft remains restorable on
its original version after newer versions are saved.

The small alternative is a restore-prompt notice and an action after saving that opens the existing
Combine review. It needs no migration, new endpoint, frozen input or state-machine rewrite. The
operator approved the small alternative and its three strings on 2026-10-18. Implementation starts
after #405 merged. The 2026-10-19 approved widening below follows #410; the full design remains deferred.

## Approved small alternative

- For a restorable ordinary draft, find a newer readable same-plan version sharing a surviving,
  readable common ancestor with its source. Prefer the highest numeric newer ingested release;
  otherwise choose the highest numeric newer descendant of the draft's version; never a sibling
  teacher version. Require current editing access. A higher
  version number alone is not ancestry. Keep the existing stale-source and schema-mismatch copy-only rules.
- Add this restore-prompt notice: "Version {newer} shares version history with version {source}. To bring your changes
  together, save your draft as a version, then combine it with {newer}."
- After a successful Save as new version, offer "Combine with {newer}" on the newly saved version.
  Clicking it uses the existing `?combineWith=` handoff. That handoff already opens the comparison
  review directly; it does not save a combination. The initial numbered save does not open it.
- Carry version ids only through the handoff, never draft text or recovery tokens. Treat URL ids as
  untrusted hints. Use the existing authorization, same-plan checks, refusals and error messages.
  Failure to find a suggestion must not prevent ordinary restoration or saving.
- The saved intermediate version is Not Official. Official does not change. Do not automatically
  delete it; ordinary deletion permissions and Official guards still apply.
- Exclude unfinished Combine drafts from this hint; preserve their current second-parent workflow.
- Proposed Guide wording: "To bring a draft together with a newer version, save the draft as a
  version, then use Combine versions."
- Prove common-history and release selection, access and owner gating, restoration without a suggestion, the
  post-save action, version/URL handoff, deleted targets, existing conflict choices and unchanged
  Official status. Run the required checks on lesson3-codex-probe, port 3103.

## Deferred full proposal

### Scope and teacher flow

Call the feature **Update your draft**. Offer it only when an ordinary draft is normally
restorable and a newer, readable descendant of its starting version exists. The caller must still
have editing access. New numbered versions do not make an immutable source stale; actual source
mtime or schema mismatches remain copy-only. Do not update an unfinished Combine directly, since
that would introduce a third parent.

1. Open the draft through Continue editing. Keep the current restore actions and add an explicit
   update action when eligible.
2. Choose an eligible newer descendant, newest numeric version first, with Official labelled.
   Preselect the highest version number but require confirmation. Another branch with a higher
   version number is insufficient.
3. Review automatic changes and conflicts between Your draft and Version {target}.
4. Continue in editor first persists a safe target-based draft, then switches the editor and URL
   to the target. It never creates a numbered version automatically.
5. Resolve conflicts with changeable choices: Use my draft's text, Use {target}'s text, or Write
   my own. Custom text starts with the teacher's draft text.
6. Save as new version is blocked until every conflict has a choice. Save as draft remains available.

Compare original saved source S, draft D (S with the owner's stored prose overlay applied), and
chosen target T through the existing Combine engine: base S, side A T, side B D. Require proof that
T descends from S. T supplies structure and administrator-controlled content. Preserve existing
row-correspondence, system-upload and size refusals. Record T as source and S as second parent on
numbered save. The result is Not Official and Official stays unchanged.

### Atomic transfer and failure handling

Preview leaves the original draft untouched. Continue in editor atomically writes the target draft
and retires the original, checking current editing access, both versions and the draft's generation
and revision after the plan lock. Do not overwrite a non-empty target draft: offer to open it or
return. A changed draft, failed write or lost access rolls back the transfer.

Use an operation id to recover a lost response without transferring twice or overwriting later
work. The retry protocol must distinguish an unchanged completed operation from a target draft
that another tab has since edited.

Before transfer, original-source deletion removes its draft. After transfer, T is the editing
source and its deletion removes the updated draft. S is then the second parent, whose disappearance
uses the existing ordinary-draft fallback. Temporary failures retain provenance and offer retry.
No browser persistence of prose or tokens.

### Storage and migration originally proposed

Resumption needs the original draft text used in the comparison: after choices change working
prose, current content plus the second-parent id and resolved-key list cannot reconstruct it.

The original proposal adds nullable `draftUpdateInput` JSON to edit-recovery, holding a frozen,
server-projected prose overlay only. This is a new bounded transient-overlay exception requiring
explicit approval in SPEC. No full bundle, administrator content or exported content belongs here.

- Frozen input: at most 512 KiB, matching the current prose capture limit.
- Working prose: existing 512 KiB limit.
- Metadata: existing 64 KiB limit, extended with an update discriminator and operation id.
- Server creates frozen input during transfer; automatic captures cannot replace it.
- Autosave writes prose and bounded resolved choices without rerunning the comparison. Invalid
  optional choices cannot prevent prose backup or silently erase server-owned provenance.
- Retirement, expiry and deletion clear the frozen input too.
- Migration adds a nullable field; existing drafts need no backfill and keep their current formats.

**Review refinement to investigate if revived:** freeze only the original conflicting fields rather
than the complete draft projection. Prove that this is enough to reconstruct the relevant choices
when comparisons or engine behavior change; do not silently lose other original prose. The 512 KiB
full-input proposal is retained here as a blueprint, not an approved storage choice.

### Server operations originally proposed

- POST /:id/recovery/update-preview checks the owner's draft revision, authorizes a target and
  computes a read-only comparison using stored input, not arbitrary submitted private draft ids.
- POST /:id/recovery/update revalidates inputs and atomically transfers the draft.
- Resume previews use frozen input and current choices under the shared preview rate limit.
  Temporary errors preserve update state and offer retry.
- Wire-test authentication, editing access, owner isolation, cross-plan and non-descendant targets,
  missing versions, stale tokens, existing target drafts, limits, rollback, lost-response retries,
  and deletion/revocation during lock waits. Keep explicit endpoint-owned error responses.

### State machine originally proposed

As the first implementation step of the full feature, replace the five independent Combine state
variables with one typed reducer designed for current Combine and draft updates together. States
cover choosing, comparing, reviewing, transferring, applying, resolving, ready to save, retryable
failure and unavailable source. Operation identities fence late responses after cancel or version
switch. Derive save eligibility and remaining choices from state. Payload form fields own working
prose; the reducer must not duplicate the document. Recovery continues to own capture tokens and
backup. Do not undertake this as a standalone refactor while the full feature is deferred.

### Original wording proposal (unapproved, to simplify if revived)

The review recommends "Update to version {target}" in place of "Update onto a newer version", and
fewer failure sentences. Preserve this original list for future design review, not as approved UI.

| Context | Original proposal |
| --- | --- |
| Restore notice | A newer version builds on version {source}. You can bring your draft's changes onto it. |
| Action | Update onto a newer version |
| Dialog | Update your draft |
| Picker | Choose a newer version |
| Explanation | Only versions that build on version {source} are listed. |
| Review action | Review update |
| Review explanation | Compare your draft with version {target}. Nothing changes until you continue in the editor. |
| Conflict labels | Your draft / Version {target} |
| Choices | Use my draft's text / Use {target}'s text / Write my own |
| Custom-text explanation | Start with your draft's text and change it as needed. |
| Continue action | Continue in editor |
| Continue explanation | Your updated draft will be based on version {target}. No numbered version will be saved. |
| Back | Back to my draft |
| Count | Fields needing your choice: {count} |
| Save tooltip | Choose text for every conflicting field before saving a new version. |
| Existing target draft | You already have a draft based on version {target}. Open it or go back; neither draft has been changed. |
| Existing-draft action | Open existing draft |
| Changed input | Your draft changed in another tab. Reopen it before reviewing this update. |
| Preview failure | Could not compare your draft with this version. Your draft has not changed. Try again. |
| Transfer failure | Could not move your draft to this version. Reopen your draft to check its saved state before trying again. |
| Resume failure | Could not reload this update's comparison. Your text is still on screen. Retry the comparison. |
| Retry | Retry update |
| Existing Combine | Finish or save this combination as a version before updating it onto a newer version. |
| Identical result | Your draft's text is already included in version {target}. You can open that version or return to your draft. |
| Guide | When a newer version builds on your draft's starting version, choose Update onto a newer version. Review the changes, continue in the newer version's editor, and settle any conflicting text before saving. |

### Proof and delivery if the full feature is revived

Design approval before coding. Separate reviewable commits for the state machine, storage/server
support, and screen/documentation changes in a feature PR. No merge or deployment without instruction.

Test reducer transitions and late responses, merge/projection behavior, atomic transfer/retirement,
and browser choices, reload/resume, retries, target drafts, version/URL switching, deletion, discard,
Not Official output and unchanged Official status. Run types, lint, format, unit, integration, wire
and browser suites on the isolated lesson3-codex-probe stack, port 3103.
